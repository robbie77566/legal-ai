import crypto from 'crypto';
import type { Organisation, OrganisationKind, Prisma as PrismaNs } from '@prisma/client';
import prisma, { withTenant, appendCaseEvent, Prisma } from '@hg/database';
import {
  quoteForRecord,
  issuePackCredits,
  resolvePrice,
  DEFAULT_PRICE_BOOK,
  FIRST_REVIEW_FREE_MONTH_CAP,
  BUCKET_BOUNDARIES,
  RECORD_BUCKETS,
  RUNGS,
  type Audience,
  type AllowanceLedger,
  type Credit as PureCredit,
  type PriceBook,
  type PriceBookRow,
  type QuoteDecision,
  type RecordBucket,
  type Rung,
  type Sku,
} from '@hg/case-lifecycle';
import { getStripe } from './payments.service';

/**
 * Counsel pricing — the persistence half of workstream B (persona rollout
 * plan §4, §5 B). Every decision is made by the pure functions in
 * packages/case-lifecycle/pricing; this file only loads what they need
 * (the stored price book, the organisation's allowance, the tenant's credits,
 * the attorney's promo standing), calls `quoteForRecord`, and persists what
 * was decided: a `Credit` spent, an `AllowanceEntry` written, a `$0` or a
 * Stripe `Payment`, a `QuoteRequest` for a Long record. The family path
 * (`PRICES_CENTS`, `POST /checkout/session`, `fulfillCheckoutSession`) is not
 * touched by anything here; counsel Stripe sessions are told apart by their
 * metadata `kind` (`counsel_review` | `counsel_pack`).
 *
 * The case moves AWAITING_DOCS → DOCS_COMPLETE → QUOTED → DIGITIZING: the
 * quote is issued at QUOTED (never stored — it is recomputed on every read,
 * so a pack bought meanwhile shows up), and the acceptance is the
 * `quote.accepted` event plus the row that proves it. Analysis start reads
 * that event back (`assertQuoteSettled`) and refuses a counsel case without
 * one; families never enter QUOTED and are never asked.
 */

export type QuoteMethod = 'CARD' | 'CREDIT' | 'ALLOWANCE' | 'FREE';
export const QUOTE_METHODS: readonly QuoteMethod[] = ['CARD', 'CREDIT', 'ALLOWANCE', 'FREE'];

/** Stripe metadata kinds that belong to this service, never to the family fulfilment. */
export const COUNSEL_SESSION_KINDS = ['counsel_review', 'counsel_pack'] as const;
export type CounselSessionKind = (typeof COUNSEL_SESSION_KINDS)[number];
export const isCounselSessionKind = (k: unknown): k is CounselSessionKind =>
  typeof k === 'string' && (COUNSEL_SESSION_KINDS as readonly string[]).includes(k);

/** The $0 first review is attributed in the ledger under this code (the SKU name). */
export const FIRST_REVIEW_FREE_CODE = 'FIRST_REVIEW_FREE';

export interface Actor {
  userId: string;
  tenantId: string;
}

const origin = () => (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
const OPEN_ENDED = '9999-12-31T00:00:00.000Z';

// ── Audience, book, bucket ───────────────────────────────────────────────────

export function audienceForOrganisation(kind: OrganisationKind | null | undefined): Audience {
  switch (kind) {
    case 'FIRM':
      return 'ATTORNEY';
    case 'PD_OFFICE':
      return 'OFFICE';
    case 'CLINIC':
      return 'CLINIC';
    default:
      return 'FAMILY';
  }
}

/** Env var holding the Stripe Price id for a sold SKU (pricing/price-book.ts stripePriceEnv). */
export const stripePriceEnvFor = (sku: Sku): string | undefined =>
  /^(COUNSEL_(SHORT|STANDARD|EXTENDED)|PACK_(SHORT|STANDARD|EXTENDED))$/.test(sku) ? `STRIPE_PRICE_${sku}` : undefined;

export interface StoredPriceBook extends PriceBook {
  /** sku → the stored Stripe Price id (null when the row has none). */
  stripePriceIds: Map<string, string | null>;
}

/**
 * The price book from the table (seeded by the migration from
 * DEFAULT_PRICE_BOOK). An empty table — a development database that skipped
 * the seed — falls back to the defaults so nothing is ever priced from nothing.
 */
export async function loadPriceBook(): Promise<StoredPriceBook> {
  const rows = await prisma.priceBookRow.findMany({ orderBy: [{ audience: 'asc' }, { sku: 'asc' }, { effectiveFrom: 'asc' }] });
  if (rows.length === 0) return { rows: DEFAULT_PRICE_BOOK.rows, stripePriceIds: new Map() };
  const stripePriceIds = new Map<string, string | null>();
  const pure: PriceBookRow[] = rows.map((r) => {
    stripePriceIds.set(`${r.audience}:${r.sku}`, r.stripePriceId);
    return {
      audience: r.audience as Audience,
      sku: r.sku as Sku,
      cents: r.cents,
      currency: 'usd',
      effectiveFrom: r.effectiveFrom.toISOString(),
      ...(r.effectiveTo ? { effectiveTo: r.effectiveTo.toISOString() } : {}),
      label: r.label,
      purchasable: r.purchasable,
      ...(r.terms ? { terms: r.terms as PriceBookRow['terms'] } : {}),
      ...(stripePriceEnvFor(r.sku as Sku) ? { stripePriceEnv: stripePriceEnvFor(r.sku as Sku) } : {}),
    };
  });
  return { rows: pure, stripePriceIds };
}

/** The Stripe Price id to charge a row with: the stored id, else the env the row names, else null (price_data). */
export function stripePriceIdFor(book: StoredPriceBook, row: PriceBookRow): string | null {
  const stored = book.stripePriceIds.get(`${row.audience}:${row.sku}`);
  if (stored) return stored;
  const env = row.stripePriceEnv ?? stripePriceEnvFor(row.sku);
  const fromEnv = env ? process.env[env] : undefined;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : null;
}

const isBucket = (b: unknown): b is RecordBucket => typeof b === 'string' && (RECORD_BUCKETS as readonly string[]).includes(b);
const isRung = (r: unknown): r is Rung => typeof r === 'string' && (RUNGS as readonly string[]).includes(r);

/**
 * The record's bucket. `Case.recordBucket` (workstream D, the page meter)
 * wins when stored; until then the caller may name it — the counsel web
 * surface passes what its uploader metered. Null = not metered yet.
 */
export function bucketOfCase(kase: object, requested?: unknown): RecordBucket | null {
  const stored = (kase as Record<string, unknown>).recordBucket;
  if (isBucket(stored)) return stored;
  return isBucket(requested) ? requested : null;
}

export interface MeteredPages {
  reporter: number;
  clerk: number;
  exhibit: number;
  total: number;
}

/** `Case.meteredPages` (workstream D) when stored; else the billable page count, else the bucket's ceiling. */
export async function meteredPagesOfCase(tx: PrismaNs.TransactionClient, kase: { id: string }, bucket: RecordBucket): Promise<MeteredPages> {
  const stored = (kase as Record<string, unknown>).meteredPages as Partial<MeteredPages> | null | undefined;
  if (stored && typeof stored === 'object' && typeof stored.reporter === 'number') {
    const reporter = stored.reporter;
    const clerk = stored.clerk ?? 0;
    const exhibit = stored.exhibit ?? 0;
    return { reporter, clerk, exhibit, total: stored.total ?? reporter + clerk + exhibit };
  }
  const billable = await tx.documentPage.count({ where: { document: { caseId: kase.id }, billable: true } });
  if (billable > 0) return { reporter: billable, clerk: 0, exhibit: 0, total: billable };
  const ceiling = BUCKET_BOUNDARIES[bucket].max ?? BUCKET_BOUNDARIES[bucket].min;
  return { reporter: ceiling, clerk: 0, exhibit: 0, total: ceiling };
}

// ── Allowance ledger from the organisation + its entries ─────────────────────

export function allowanceKindFor(org: Pick<Organisation, 'kind' | 'pilot'>): 'PILOT' | 'PUBLIC_INTEREST' | 'OFFICE' {
  if (org.pilot) return 'PILOT';
  return org.kind === 'CLINIC' ? 'PUBLIC_INTEREST' : 'OFFICE';
}

/**
 * The organisation's grant (Organisation.allowanceRecords / allowanceResetsAt
 * / pilot / pilotEndsAt, workstream A) as the pure ledger, with `used` = the
 * AllowanceEntry count. No grant → undefined (the quote skips the step).
 */
export function allowanceLedgerFor(org: Organisation, used: number): AllowanceLedger | undefined {
  if (org.allowanceRecords <= 0) return undefined;
  const kind = allowanceKindFor(org);
  const resetsAt = (org.pilot ? org.pilotEndsAt : null) ?? org.allowanceResetsAt;
  return {
    kind,
    granted: org.allowanceRecords,
    used,
    startsAt: org.createdAt.toISOString(),
    resetsAt: resetsAt ? resetsAt.toISOString() : OPEN_ENDED,
    renews: !org.pilot,
  };
}

export interface AllowanceView {
  kind: 'PILOT' | 'PUBLIC_INTEREST' | 'OFFICE';
  granted: number;
  used: number;
  remaining: number;
  startsAt: string;
  resetsAt: string | null;
  pilot: boolean;
}

export async function allowanceView(tx: PrismaNs.TransactionClient, org: Organisation): Promise<AllowanceView | null> {
  const used = await tx.allowanceEntry.count({ where: { organisationId: org.id } });
  const ledger = allowanceLedgerFor(org, used);
  if (!ledger) return null;
  return {
    kind: ledger.kind,
    granted: ledger.granted,
    used: ledger.used,
    remaining: Math.max(0, ledger.granted - ledger.used),
    startsAt: ledger.startsAt,
    resetsAt: ledger.resetsAt === OPEN_ENDED ? null : ledger.resetsAt,
    pilot: org.pilot,
  };
}

// ── Credits ──────────────────────────────────────────────────────────────────

const toPureCredit = (c: { id: string; rung: string; issuedAt: Date; expiresAt: Date; consumedAt: Date | null; packId: string }): PureCredit => ({
  id: c.id,
  rung: c.rung as Rung,
  issuedAt: c.issuedAt.toISOString(),
  expiresAt: c.expiresAt.toISOString(),
  consumedAt: c.consumedAt ? c.consumedAt.toISOString() : null,
  packId: c.packId,
});

/**
 * Every credit the tenant has ever held — spent, live and expired alike. The
 * pure rule tells them apart, and it needs the spent ones to say
 * PACK_EXHAUSTED (the sixth record on a five-pack) rather than nothing.
 */
async function tenantCredits(tx: PrismaNs.TransactionClient): Promise<PureCredit[]> {
  const rows = await tx.credit.findMany({ orderBy: [{ expiresAt: 'asc' }, { issuedAt: 'asc' }, { id: 'asc' }] });
  return rows.map(toPureCredit);
}

export interface CreditView {
  id: string;
  packId: string;
  rung: Rung;
  issuedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedCaseId: string | null;
  state: 'LIVE' | 'EXPIRED' | 'CONSUMED';
}

export async function listCredits(actor: Actor, now = new Date()): Promise<{ credits: CreditView[]; live: number }> {
  const rows = await withTenant(actor.tenantId, (tx) => tx.credit.findMany({ orderBy: [{ consumedAt: 'asc' }, { expiresAt: 'asc' }, { id: 'asc' }] }));
  const credits = rows.map<CreditView>((c) => ({
    id: c.id,
    packId: c.packId,
    rung: c.rung as Rung,
    issuedAt: c.issuedAt.toISOString(),
    expiresAt: c.expiresAt.toISOString(),
    consumedAt: c.consumedAt ? c.consumedAt.toISOString() : null,
    consumedCaseId: c.consumedCaseId,
    state: c.consumedAt ? 'CONSUMED' : c.expiresAt <= now ? 'EXPIRED' : 'LIVE',
  }));
  return { credits, live: credits.filter((c) => c.state === 'LIVE').length };
}

// ── Promotions (attorneys only) ──────────────────────────────────────────────

/**
 * The monthly cap on free first reviews: a `PromoCode` row named
 * FIRST_REVIEW_FREE overrides the README default (10) and can switch the
 * offer off (`active: false`); without a row the default applies.
 */
export async function firstReviewFreeTerms(): Promise<{ offered: boolean; monthCap: number }> {
  const row = await prisma.promoCode.findUnique({ where: { code: FIRST_REVIEW_FREE_CODE } });
  if (!row) return { offered: true, monthCap: FIRST_REVIEW_FREE_MONTH_CAP };
  if (!row.active || (row.expiresAt && row.expiresAt < new Date())) return { offered: false, monthCap: 0 };
  return { offered: true, monthCap: row.maxRedemptionsPerMonth ?? FIRST_REVIEW_FREE_MONTH_CAP };
}

interface PromoStanding {
  input: NonNullable<Parameters<typeof quoteForRecord>[0]['promo']>;
  /** Why a partner code handed in was not applied (internal reason, surfaced to counsel as a sentence). */
  promoRefused?: string;
  partnerCode?: string;
}

async function promoStanding(actor: Actor, meteredPages: number, promoCode: string | undefined): Promise<PromoStanding> {
  const { checkPromoCode, normalizeCode, monthRedemptions } = await import('./promo.service');
  const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { barVerifiedAt: true } });
  const [priorPaidReviews, priorFreeReviews, terms, redemptions] = await Promise.all([
    prisma.payment.count({ where: { userId: actor.userId, kind: 'REVIEW', status: 'SUCCEEDED', amountCents: { gt: 0 } } }),
    prisma.payment.count({ where: { userId: actor.userId, promoCode: FIRST_REVIEW_FREE_CODE, status: 'SUCCEEDED' } }),
    firstReviewFreeTerms(),
    monthRedemptions(FIRST_REVIEW_FREE_CODE),
  ]);
  const standing: PromoStanding = {
    input: {
      ...(terms.offered
        ? {
            firstReview: {
              barVerifiedAt: user?.barVerifiedAt ? user.barVerifiedAt.toISOString() : null,
              meteredPages,
              priorPaidReviews,
              priorFreeReviews,
              monthRedemptions: redemptions,
              monthCap: terms.monthCap,
            },
          }
        : {}),
      isFirstPaid: priorPaidReviews === 0,
    },
  };
  if (promoCode) {
    // A bar-partner code is any code the promo engine accepts for the
    // ATTORNEY audience; the discount itself is the pure rule (15% off the
    // first paid review). A family code is refused by its audience.
    const check = await checkPromoCode(promoCode, 'ATTORNEY');
    if (check.valid) {
      standing.partnerCode = normalizeCode(promoCode);
      standing.input.partnerCode = standing.partnerCode;
    } else {
      standing.promoRefused = check.reason;
    }
  }
  return standing;
}

// ── The quote ────────────────────────────────────────────────────────────────

export type QuoteError =
  | { error: 'NOT_FOUND' }
  | { error: 'NOT_METERED' }
  | { error: 'NOT_READY'; caseStatus: string }
  | { error: 'ALREADY_SETTLED'; caseStatus: string; settled: SettledQuote };

export interface QuoteView {
  caseId: string;
  status: string;
  audience: Audience;
  bucket: RecordBucket;
  meteredPages: MeteredPages;
  at: string;
  decision: QuoteDecision;
  /** Every method the caller could accept right now, in precedence order. */
  methods: QuoteMethod[];
  allowance: AllowanceView | null;
  credits: { live: number; unspent: number };
  promoRefused?: string;
  /** A Long record already waiting on an admin. */
  quoteRequest?: { id: string; status: string; quotedCents: number | null; createdAt: string };
}

export interface SettledQuote {
  method: QuoteMethod;
  sku: string;
  rung: string;
  paymentId?: string;
  creditId?: string;
  allowanceEntryId?: string;
  at: string;
}

const QUOTABLE = ['DOCS_COMPLETE', 'QUOTED'];

/** The latest `quote.accepted` event for a case, if any. */
export async function settledQuote(tx: PrismaNs.TransactionClient, caseId: string): Promise<SettledQuote | null> {
  const ev = await tx.caseEvent.findFirst({ where: { caseId, type: 'quote.accepted' }, orderBy: { id: 'desc' } });
  if (!ev) return null;
  const p = ev.payload as Record<string, string>;
  return {
    method: p.method as QuoteMethod,
    sku: p.sku,
    rung: p.rung,
    ...(p.paymentId ? { paymentId: p.paymentId } : {}),
    ...(p.creditId ? { creditId: p.creditId } : {}),
    ...(p.allowanceEntryId ? { allowanceEntryId: p.allowanceEntryId } : {}),
    at: ev.createdAt.toISOString(),
  };
}

function methodsFor(decision: QuoteDecision): QuoteMethod[] {
  switch (decision.kind) {
    case 'ALLOWANCE':
      return ['ALLOWANCE'];
    case 'CREDIT':
      return ['CREDIT'];
    case 'FREE':
      return ['FREE'];
    case 'PAY':
      return ['CARD'];
    default:
      return [];
  }
}

interface QuoteContext {
  kase: { id: string; status: string; tenantId: string };
  org: Organisation | null;
  audience: Audience;
  bucket: RecordBucket;
  meteredPages: MeteredPages;
  book: StoredPriceBook;
  decision: QuoteDecision;
  allowance: AllowanceView | null;
  credits: PureCredit[];
  promo: PromoStanding | null;
  at: string;
}

async function quoteContext(
  tx: PrismaNs.TransactionClient,
  caseId: string,
  actor: Actor,
  opts: { bucket?: unknown; promoCode?: string; at?: Date }
): Promise<QuoteContext | QuoteError> {
  const kase = await tx.case.findUnique({ where: { id: caseId } });
  if (!kase) return { error: 'NOT_FOUND' };
  if (!QUOTABLE.includes(kase.status)) {
    const settled = await settledQuote(tx, caseId);
    if (settled) return { error: 'ALREADY_SETTLED', caseStatus: kase.status, settled };
    return { error: 'NOT_READY', caseStatus: kase.status };
  }
  const bucket = bucketOfCase(kase, opts.bucket);
  if (!bucket) return { error: 'NOT_METERED' };
  const org = await tx.organisation.findUnique({ where: { tenantId: actor.tenantId } });
  const audience = audienceForOrganisation(org?.kind);
  const now = opts.at ?? new Date();
  const at = now.toISOString();
  const meteredPages = await meteredPagesOfCase(tx, kase, bucket);
  const book = await loadPriceBook();
  const [allowance, credits] = await Promise.all([org ? allowanceView(tx, org) : null, tenantCredits(tx)]);
  const ledger = org ? allowanceLedgerFor(org, allowance?.used ?? 0) : undefined;
  const promo = audience === 'ATTORNEY' ? await promoStanding(actor, meteredPages.reporter, opts.promoCode) : null;
  const decision = quoteForRecord({
    book,
    audience,
    bucket,
    at,
    ...(credits.length ? { credits } : {}),
    ...(ledger ? { allowance: ledger } : {}),
    ...(promo ? { promo: promo.input } : {}),
  });
  return { kase, org, audience, bucket, meteredPages, book, decision, allowance, credits, promo, at };
}

const isQuoteError = (x: unknown): x is QuoteError => typeof x === 'object' && x !== null && 'error' in x;

async function viewOf(tx: PrismaNs.TransactionClient, ctx: QuoteContext): Promise<QuoteView> {
  const open = await tx.quoteRequest.findFirst({ where: { caseId: ctx.kase.id }, orderBy: { createdAt: 'desc' } });
  return {
    caseId: ctx.kase.id,
    status: ctx.kase.status,
    audience: ctx.audience,
    bucket: ctx.bucket,
    meteredPages: ctx.meteredPages,
    at: ctx.at,
    decision: ctx.decision,
    methods: methodsFor(ctx.decision),
    allowance: ctx.allowance,
    credits: {
      live: ctx.credits.filter((c) => c.consumedAt === null && Date.parse(c.expiresAt) > Date.parse(ctx.at) && Date.parse(c.issuedAt) <= Date.parse(ctx.at)).length,
      unspent: ctx.credits.filter((c) => c.consumedAt === null).length,
    },
    ...(ctx.promo?.promoRefused ? { promoRefused: ctx.promo.promoRefused } : {}),
    ...(open ? { quoteRequest: { id: open.id, status: open.status, quotedCents: open.quotedCents, createdAt: open.createdAt.toISOString() } } : {}),
  };
}

/** The decision for a case, right now. Persists nothing. */
export async function quoteCase(caseId: string, actor: Actor, opts: { bucket?: unknown; promoCode?: string } = {}): Promise<QuoteView | QuoteError> {
  return withTenant(actor.tenantId, async (tx) => {
    const ctx = await quoteContext(tx, caseId, actor, opts);
    if (isQuoteError(ctx)) return ctx;
    return viewOf(tx, ctx);
  });
}

// ── Acceptance ───────────────────────────────────────────────────────────────

export type AcceptResult =
  | { ok: true; method: 'CARD'; url: string; cents: number; sku: Sku; rung: RecordBucket }
  | { ok: true; method: 'CREDIT'; creditId: string; sku: Sku; rung: RecordBucket; idempotent?: true }
  | { ok: true; method: 'ALLOWANCE'; allowanceEntryId: string; remaining: number; sku: Sku; rung: RecordBucket; idempotent?: true }
  | { ok: true; method: 'FREE'; paymentId: string; sku: Sku; rung: RecordBucket; idempotent?: true }
  | ({ ok: false; status: number } & (
      | QuoteError
      | { error: 'METHOD_NOT_AVAILABLE'; method: QuoteMethod; decision: QuoteDecision; methods: QuoteMethod[] }
      | { error: 'PAYMENTS_NOT_CONFIGURED' }
      | { error: 'CREDIT_RACE' }
    ));

/** DOCS_COMPLETE → QUOTED, once. A case already at QUOTED is left alone. */
async function enterQuoted(tx: PrismaNs.TransactionClient, kase: { id: string; status: string; tenantId: string }, actor: string) {
  if (kase.status !== 'DOCS_COMPLETE') return;
  await appendCaseEvent(tx, { caseId: kase.id, tenantId: kase.tenantId, type: 'stage.entered', payload: { status: 'QUOTED' }, actor, transition: 'QUOTED' });
  kase.status = 'QUOTED';
}

/** Redis-down is tolerated: the case sits at QUOTED with its acceptance recorded, and the ops resume path picks it up. */
async function startAnalysis(caseId: string, tenantId: string) {
  try {
    const { enqueueAnalysis } = await import('./queue');
    await enqueueAnalysis(caseId, tenantId);
  } catch (e) {
    console.error(`[quote] analysis enqueue failed for ${caseId} — accepted quote recorded, case parked at QUOTED:`, (e as Error).message);
  }
}

export async function acceptQuote(
  caseId: string,
  actor: Actor,
  opts: { method: QuoteMethod; bucket?: unknown; promoCode?: string }
): Promise<AcceptResult> {
  const result = await withTenant(actor.tenantId, async (tx): Promise<AcceptResult> => {
    // Retry of a settled case: the same answer, nothing written twice.
    const prior = await settledQuote(tx, caseId);
    if (prior) {
      const kase = await tx.case.findUnique({ where: { id: caseId }, select: { status: true } });
      if (prior.method === opts.method) {
        const base = { ok: true as const, sku: prior.sku as Sku, rung: prior.rung as RecordBucket, idempotent: true as const };
        if (prior.method === 'ALLOWANCE') return { ...base, method: 'ALLOWANCE', allowanceEntryId: prior.allowanceEntryId!, remaining: -1 };
        if (prior.method === 'CREDIT') return { ...base, method: 'CREDIT', creditId: prior.creditId! };
        if (prior.method === 'FREE') return { ...base, method: 'FREE', paymentId: prior.paymentId! };
      }
      return { ok: false, status: 409, error: 'ALREADY_SETTLED', caseStatus: kase?.status ?? 'UNKNOWN', settled: prior };
    }

    const ctx = await quoteContext(tx, caseId, actor, opts);
    if (isQuoteError(ctx)) return { ok: false, status: ctx.error === 'NOT_FOUND' ? 404 : 409, ...ctx };
    const { decision, kase } = ctx;
    const methods = methodsFor(decision);
    if (!methods.includes(opts.method)) {
      return { ok: false, status: 409, error: 'METHOD_NOT_AVAILABLE', method: opts.method, decision, methods };
    }

    switch (decision.kind) {
      case 'ALLOWANCE': {
        const org = ctx.org!;
        // Unique per case: a retry can never double-count the allowance.
        const existing = await tx.allowanceEntry.findUnique({ where: { caseId } });
        const entry =
          existing ??
          (await tx.allowanceEntry.create({
            data: { tenantId: actor.tenantId, organisationId: org.id, caseId, kind: allowanceKindFor(org), consumedBy: actor.userId },
          }));
        await enterQuoted(tx, kase, actor.userId);
        await appendCaseEvent(tx, {
          caseId, tenantId: actor.tenantId, type: 'quote.accepted', actor: actor.userId,
          payload: { method: 'ALLOWANCE', sku: decision.sku, rung: decision.rung as Rung, allowanceEntryId: entry.id },
        });
        return { ok: true, method: 'ALLOWANCE', allowanceEntryId: entry.id, remaining: decision.remaining, sku: decision.sku, rung: decision.rung, ...(existing ? { idempotent: true as const } : {}) };
      }
      case 'CREDIT': {
        // Spend exactly the credit the pure rule chose; a concurrent spend of
        // the same row updates nothing and is refused rather than doubled.
        const spent = await tx.credit.updateMany({
          where: { id: decision.creditId, consumedAt: null },
          data: { consumedAt: new Date(ctx.at), consumedCaseId: caseId },
        });
        if (spent.count !== 1) return { ok: false, status: 409, error: 'CREDIT_RACE' };
        await enterQuoted(tx, kase, actor.userId);
        await appendCaseEvent(tx, {
          caseId, tenantId: actor.tenantId, type: 'quote.accepted', actor: actor.userId,
          payload: { method: 'CREDIT', sku: decision.sku, rung: decision.rung as Rung, creditId: decision.creditId },
        });
        return { ok: true, method: 'CREDIT', creditId: decision.creditId, sku: decision.sku, rung: decision.rung };
      }
      case 'FREE': {
        // The same shape the family promo path writes: a $0 SUCCEEDED row
        // with a synthetic id, so the ledger and the monthly cap both see it.
        const payment = await tx.payment.create({
          data: {
            stripeId: `free_${FIRST_REVIEW_FREE_CODE}_${crypto.randomUUID()}`,
            caseId, userId: actor.userId, tenantId: actor.tenantId,
            kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 0,
            promoCode: FIRST_REVIEW_FREE_CODE, sku: decision.sku, rung: decision.rung,
          },
        });
        await enterQuoted(tx, kase, actor.userId);
        await appendCaseEvent(tx, {
          caseId, tenantId: actor.tenantId, type: 'quote.accepted', actor: actor.userId,
          payload: { method: 'FREE', sku: decision.sku, rung: decision.rung as Rung, paymentId: payment.id },
        });
        return { ok: true, method: 'FREE', paymentId: payment.id, sku: decision.sku, rung: decision.rung };
      }
      case 'PAY': {
        const stripe = getStripe();
        if (!stripe) return { ok: false, status: 503, error: 'PAYMENTS_NOT_CONFIGURED' };
        const row = resolvePrice(ctx.book, { audience: ctx.audience, sku: decision.sku, at: ctx.at });
        const priceId = row && decision.cents === row.cents ? stripePriceIdFor(ctx.book, row) : null;
        await enterQuoted(tx, kase, actor.userId);
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: [
            priceId
              ? { quantity: 1, price: priceId }
              : {
                  quantity: 1,
                  price_data: {
                    currency: 'usd',
                    unit_amount: decision.cents,
                    product_data: { tax_code: process.env.STRIPE_TAX_CODE ?? 'txcd_20030000', name: row?.label ?? `Counsel Review (${decision.rung})` },
                  },
                },
          ],
          success_url: `${origin()}/counsel/matters/${caseId}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin()}/counsel/matters/${caseId}?canceled=1`,
          ...({ managed_payments: { enabled: false } } as object),
          ...(process.env.STRIPE_AUTOMATIC_TAX === '1' ? { automatic_tax: { enabled: true } } : {}),
          metadata: {
            kind: 'counsel_review',
            userId: actor.userId,
            tenantId: actor.tenantId,
            caseId,
            sku: decision.sku,
            rung: decision.rung,
            cents: String(decision.cents),
            ...(decision.promoCode ? { promoCode: decision.promoCode } : {}),
          },
        });
        return { ok: true, method: 'CARD', url: session.url ?? '', cents: decision.cents, sku: decision.sku, rung: decision.rung };
      }
      default:
        return { ok: false, status: 409, error: 'METHOD_NOT_AVAILABLE', method: opts.method, decision, methods };
    }
  });

  // Credits, allowances and the free review start the pipeline at once; a
  // card waits for the webhook (fulfillCounselSession).
  if (result.ok && result.method !== 'CARD' && !result.idempotent) await startAnalysis(caseId, actor.tenantId);
  return result;
}

// ── Long records: the quote request ──────────────────────────────────────────

export type RequestQuoteResult =
  | { ok: true; quoteRequest: { id: string; status: string; createdAt: string }; idempotent?: true }
  | ({ ok: false; status: number } & (QuoteError | { error: 'NOT_LONG'; decision: QuoteDecision }));

export async function requestQuote(caseId: string, actor: Actor, opts: { note?: string; bucket?: unknown } = {}): Promise<RequestQuoteResult> {
  const out = await withTenant(actor.tenantId, async (tx): Promise<RequestQuoteResult & { emailed?: { org: string; pages: MeteredPages } }> => {
    const ctx = await quoteContext(tx, caseId, actor, opts);
    if (isQuoteError(ctx)) return { ok: false, status: ctx.error === 'NOT_FOUND' ? 404 : 409, ...ctx };
    if (ctx.decision.kind !== 'QUOTE_REQUIRED') return { ok: false, status: 409, error: 'NOT_LONG', decision: ctx.decision };
    const open = await tx.quoteRequest.findFirst({ where: { caseId, status: 'OPEN' } });
    if (open) return { ok: true, quoteRequest: { id: open.id, status: open.status, createdAt: open.createdAt.toISOString() }, idempotent: true };
    const qr = await tx.quoteRequest.create({
      data: {
        tenantId: actor.tenantId, caseId, requestedBy: actor.userId,
        meteredPages: ctx.meteredPages as unknown as Prisma.InputJsonValue,
        note: opts.note?.trim() || null,
      },
    });
    await enterQuoted(tx, ctx.kase, actor.userId);
    await appendCaseEvent(tx, { caseId, tenantId: actor.tenantId, type: 'quote.requested', actor: actor.userId, payload: { quoteRequestId: qr.id } });
    return { ok: true, quoteRequest: { id: qr.id, status: qr.status, createdAt: qr.createdAt.toISOString() }, emailed: { org: ctx.org?.name ?? 'an organisation', pages: ctx.meteredPages } };
  });
  if (out.ok && !out.idempotent && out.emailed) {
    // Every admin, once; a failed send never fails the request (ENG-9).
    const [admins, requester] = await Promise.all([
      prisma.user.findMany({ where: { role: 'ADMIN', deletedAt: null }, select: { email: true } }),
      prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true, email: true } }),
    ]);
    const { sendQuoteRequest } = await import('@hg/email');
    for (const a of admins) {
      void sendQuoteRequest(a.email, {
        organisationName: out.emailed.org,
        requestedBy: requester?.name || requester?.email || 'An attorney',
        reporterPages: out.emailed.pages.reporter,
        totalPages: out.emailed.pages.total,
        note: opts.note?.trim() || null,
        consoleUrl: `${origin()}/ops/quote-requests`,
      });
    }
  }
  const { emailed: _e, ...rest } = out;
  return rest;
}

// ── Packs ────────────────────────────────────────────────────────────────────

export const PACK_SKU: Readonly<Record<Rung, Sku>> = Object.freeze({ SHORT: 'PACK_SHORT', STANDARD: 'PACK_STANDARD', EXTENDED: 'PACK_EXTENDED' });

export type BuyPackResult =
  | { ok: true; url: string; cents: number; sku: Sku; rung: Rung }
  | { ok: false; status: number; error: 'PAYMENTS_NOT_CONFIGURED' | 'NO_PRICE' | 'BAD_RUNG' };

export async function buyPack(rung: unknown, actor: Actor): Promise<BuyPackResult> {
  if (!isRung(rung)) return { ok: false, status: 400, error: 'BAD_RUNG' };
  const book = await loadPriceBook();
  const sku = PACK_SKU[rung];
  const row = resolvePrice(book, { audience: 'ATTORNEY', sku, at: new Date().toISOString() });
  if (!row || row.purchasable === false) return { ok: false, status: 409, error: 'NO_PRICE' };
  const stripe = getStripe();
  if (!stripe) return { ok: false, status: 503, error: 'PAYMENTS_NOT_CONFIGURED' };
  const org = await prisma.organisation.findUnique({ where: { tenantId: actor.tenantId }, select: { id: true } });
  const priceId = stripePriceIdFor(book, row);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      priceId
        ? { quantity: 1, price: priceId }
        : { quantity: 1, price_data: { currency: 'usd', unit_amount: row.cents, product_data: { tax_code: process.env.STRIPE_TAX_CODE ?? 'txcd_20030000', name: row.label } } },
    ],
    success_url: `${origin()}/counsel?pack=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin()}/counsel?pack=canceled`,
    ...({ managed_payments: { enabled: false } } as object),
    ...(process.env.STRIPE_AUTOMATIC_TAX === '1' ? { automatic_tax: { enabled: true } } : {}),
    metadata: {
      kind: 'counsel_pack',
      userId: actor.userId,
      tenantId: actor.tenantId,
      ...(org ? { organisationId: org.id } : {}),
      sku,
      rung,
      cents: String(row.cents),
    },
  });
  return { ok: true, url: session.url ?? '', cents: row.cents, sku, rung };
}

// ── Stripe fulfilment for counsel sessions ───────────────────────────────────

export interface CounselSession {
  id: string;
  amount_total: number | null;
  metadata: Record<string, string | undefined> | null;
  payment_intent?: string | { id: string } | null;
}

/**
 * Called by `fulfillCheckoutSession` for `kind: counsel_review | counsel_pack`
 * — the webhook, the hourly sweep and the success-page self-heal all land
 * here, so a missed webhook heals the same way it does for families. Safe
 * to call more than once (Payment.stripeId is unique).
 */
export async function fulfillCounselSession(session: CounselSession): Promise<{ caseId?: string; packId?: string; skipped?: string }> {
  const meta = session.metadata ?? {};
  const { userId, tenantId, kind } = meta;
  if (!userId || !tenantId || !isCounselSessionKind(kind)) return { skipped: 'missing metadata' };
  const existing = await prisma.payment.findUnique({ where: { stripeId: session.id } });
  if (existing) return { caseId: existing.caseId ?? undefined, packId: kind === 'counsel_pack' ? session.id : undefined, skipped: 'already fulfilled' };
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
  const { capture } = await import('./analytics.service');
  capture('snl.counsel.purchase_fulfilled', tenantId, { kind, rung: meta.rung ?? '' });

  if (kind === 'counsel_pack') {
    const rung = meta.rung;
    if (!isRung(rung)) return { skipped: 'unknown pack rung' };
    const book = await loadPriceBook();
    const purchasedAt = new Date().toISOString();
    const pack = issuePackCredits({ rung, purchasedAt, packId: session.id, book });
    await withTenant(tenantId, async (tx) => {
      const payment = await tx.payment.create({
        data: {
          stripeId: session.id, paymentIntentId, userId, tenantId,
          kind: 'PACK', status: 'SUCCEEDED',
          amountCents: session.amount_total ?? pack.totalCents,
          sku: PACK_SKU[rung], rung,
        },
      });
      await tx.credit.createMany({
        data: pack.credits.map((c) => ({
          id: c.id, tenantId, organisationId: meta.organisationId ?? null, userId, packId: pack.packId, rung,
          issuedAt: new Date(c.issuedAt), expiresAt: new Date(c.expiresAt), paymentId: payment.id,
        })),
      });
    });
    return { packId: session.id };
  }

  // counsel_review: the card paid for one record.
  const caseId = meta.caseId;
  if (!caseId) return { skipped: 'missing caseId for counsel review' };
  const target = await prisma.case.findUnique({ where: { id: caseId } });
  if (!target || target.tenantId !== tenantId) return { skipped: 'unknown case for purchase' };
  const sku = (meta.sku ?? 'COUNSEL_STANDARD') as Sku;
  const rung = isRung(meta.rung) ? meta.rung : 'STANDARD';
  await withTenant(tenantId, async (tx) => {
    const payment = await tx.payment.create({
      data: {
        stripeId: session.id, paymentIntentId, caseId, userId, tenantId,
        kind: 'REVIEW', status: 'SUCCEEDED',
        amountCents: session.amount_total ?? Number(meta.cents ?? 0),
        promoCode: meta.promoCode ?? null, sku, rung,
      },
    });
    const prior = await settledQuote(tx, caseId);
    if (!prior) {
      await enterQuoted(tx, { id: target.id, status: target.status, tenantId }, 'system');
      await appendCaseEvent(tx, {
        caseId, tenantId, type: 'quote.accepted', actor: 'system',
        payload: { method: 'CARD', sku, rung, paymentId: payment.id },
      });
    }
  });
  if (meta.promoCode && (session.amount_total ?? 0) > 0) {
    const { redeemPromo } = await import('./promo.service');
    await redeemPromo(meta.promoCode);
  }
  await startAnalysis(caseId, tenantId);
  return { caseId };
}

// ── The gate at analysis start ───────────────────────────────────────────────

export class QuoteNotSettledError extends Error {
  constructor(caseId: string, detail: string) {
    super(`Case ${caseId} is a counsel matter and its quote is not settled (${detail}) — analysis does not start until it is paid, credited or covered by an allowance.`);
    this.name = 'QuoteNotSettledError';
  }
}

/**
 * A counsel case (its tenant has a professional Organisation) must carry a
 * `quote.accepted` event AND the row that proves it — the AllowanceEntry, the
 * spent Credit or the SUCCEEDED Payment. Families (no organisation, or a
 * FAMILY one) are never asked. Runs inside the analysis start transaction.
 */
export async function assertQuoteSettled(tx: PrismaNs.TransactionClient, kase: { id: string; tenantId: string }): Promise<void> {
  const org = await tx.organisation.findUnique({ where: { tenantId: kase.tenantId }, select: { kind: true } });
  if (!org || org.kind === 'FAMILY') return;
  const settled = await settledQuote(tx, kase.id);
  if (!settled) throw new QuoteNotSettledError(kase.id, 'no accepted quote');
  switch (settled.method) {
    case 'ALLOWANCE': {
      const entry = await tx.allowanceEntry.findUnique({ where: { caseId: kase.id } });
      if (!entry) throw new QuoteNotSettledError(kase.id, 'allowance entry missing');
      return;
    }
    case 'CREDIT': {
      const credit = await tx.credit.findFirst({ where: { consumedCaseId: kase.id } });
      if (!credit) throw new QuoteNotSettledError(kase.id, 'credit not spent');
      return;
    }
    default: {
      const payment = await tx.payment.findFirst({ where: { caseId: kase.id, kind: 'REVIEW', status: 'SUCCEEDED' } });
      if (!payment) throw new QuoteNotSettledError(kase.id, 'payment missing');
    }
  }
}

/** Is this tenant a professional organisation (so its cases are quoted before analysis)? */
export async function isCounselTenant(tx: PrismaNs.TransactionClient, tenantId: string): Promise<boolean> {
  const org = await tx.organisation.findUnique({ where: { tenantId }, select: { kind: true } });
  return !!org && org.kind !== 'FAMILY';
}
