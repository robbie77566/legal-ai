import { withTenant } from '@hg/database';
import type { Matter, Case } from '@prisma/client';
import {
  computeTrapClock,
  trapInputsForMatter,
  posture1107,
  isVehicle,
  CaseFactsSchema,
  type CounselVehicle,
  type WritVehicle,
  type CivilDate,
} from '@hg/case-lifecycle';
import type { CounselPacketInput, CounselPacketFinding } from '@hg/reports';
import { verifyFindings, planScreens } from './analysis.service';
import { attachConfidence } from './finding-confidence.service';
import { inventory } from './inventory.service';

/**
 * The counsel packet's input (persona_rollout_plan.md §5 E): the released
 * report the family route serves — the latest version (or the one asked
 * for), FR-7 re-verified AT THIS RENDER with the same `verifyFindings` call,
 * the confidence attached the same way — plus the matter, the record
 * inventory, the TRAP clock and, for a writ, the Art. 11.07 posture as the
 * recorded inputs and the rule. The renderer (packages/reports) gets two
 * lists, verified and dropped; it never sees a flag it could be lied to by.
 *
 * UPL review 2026-10-23: the Part A client letter is no longer built here —
 * counsel decision pending (question 8); the renderer keeps the path behind
 * `WITHHELD_PENDING_COUNSEL`. The W.D. Tex. certificate and the 47.2(e)
 * block are withheld in the renderer (question 9). The §2254 map is not
 * built until the grounds feature exists (question 11).
 *
 * Organisation scope is the caller's: a matter from another organisation
 * is `not_found`, never a hint. Client identity is initials only — nothing
 * here reads a name.
 */

interface SnapshotFinding {
  id: string;
  category: string;
  severity: string;
  confidence?: number;
  partAText: string;
  partBText: string;
  citations: { volume: string | null; page: number | null; line?: number | null; excerpt: string }[];
  preserved?: string;
  harmStandard?: string;
  vehicle?: string;
  develop?: string;
  dependsOn?: string[];
}

export interface PacketOptions {
  versionNo?: number;
  /** The clock's "today" (civil date, America/Chicago); tests replay it. */
  today?: CivilDate;
}

export type PacketLoad =
  | { status: 'not_found' }
  | { status: 'no_report' }
  | { status: 'ok'; input: CounselPacketInput; report: { id: string; versionNo: number }; matter: { id: string; vehicle: string } };

const toCivil = (d: Date | null | undefined): CivilDate | null => (d ? d.toISOString().slice(0, 10) : null);
const todayCivil = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const WRIT_VEHICLES: readonly WritVehicle[] = ['11.07', '11.071', '11.072', '11.09'];

function asFinding(f: SnapshotFinding, screen: string | null | undefined): CounselPacketFinding {
  return {
    id: f.id,
    category: f.category,
    severity: f.severity,
    ...(typeof f.confidence === 'number' ? { confidence: f.confidence } : {}),
    partAText: f.partAText,
    partBText: f.partBText,
    citations: f.citations.map((c) => ({ volume: c.volume, page: c.page, line: c.line ?? null, excerpt: c.excerpt })),
    preserved: f.preserved,
    harmStandard: f.harmStandard,
    vehicle: f.vehicle,
    develop: f.develop,
    dependsOn: f.dependsOn,
    screen: screen ?? null,
  };
}

/** The recorded fact from Case.facts (matters.ts stores it there): true / false, or null when nobody has recorded it. */
export function priorWritsDecidedOnMeritsFor(kase: Pick<Case, 'facts'>): boolean | null {
  const parsed = CaseFactsSchema.safeParse(kase.facts ?? {});
  const v = parsed.success ? parsed.data.priorWritsDecidedOnMerits : undefined;
  return typeof v === 'boolean' ? v : null;
}

export async function loadCounselPacket(caseId: string, tenantId: string, organisationId: string, organisationName: string, opts: PacketOptions = {}): Promise<PacketLoad> {
  const loaded = await withTenant(tenantId, async (tx): Promise<PacketLoad | { status: 'partial'; matter: Matter & { case: Case }; build: (inv: CounselPacketInput['inventory']) => CounselPacketInput; report: { id: string; versionNo: number } }> => {
    const matter = await tx.matter.findUnique({ where: { caseId }, include: { case: true } });
    if (!matter || matter.organisationId !== organisationId || matter.case.status === 'DELETED' || !isVehicle(matter.vehicle)) {
      return { status: 'not_found' };
    }
    const report = await tx.report.findFirst({
      where: { caseId, ...(opts.versionNo ? { versionNo: opts.versionNo } : {}) },
      orderBy: { versionNo: 'desc' },
    });
    if (!report) return { status: 'no_report' };

    // FR-7 at every render, the family route's own call: a tampered chunk
    // drops its finding here exactly as it drops it from the family report.
    const snapshot = report.findingsSnapshot as unknown as { findings: SnapshotFinding[] };
    const ids = snapshot.findings.map((f) => f.id);
    const { verified, failed } = await verifyFindings(tx, ids);
    const withConfidence = await attachConfidence(tx, snapshot.findings.filter((f) => verified.includes(f.id)));
    // The screen that grounded each finding (Finding.screen) — the Anders map and the Part B grouping read it.
    const rows = ids.length ? await tx.finding.findMany({ where: { id: { in: ids } }, select: { id: true, screen: true } }) : [];
    const screenOf = new Map(rows.map((r) => [r.id, r.screen]));
    const findings = withConfidence.map((f) => asFinding(f, screenOf.get(f.id)));
    const droppedFindings = snapshot.findings.filter((f) => failed.includes(f.id)).map((f) => asFinding(f, screenOf.get(f.id)));

    const vehicle = matter.vehicle as CounselVehicle;
    const dates = {
      judgmentSignedAt: toCivil(matter.judgmentSignedAt),
      sentenceImposedAt: toCivil(matter.sentenceImposedAt),
      noticeOfAppealFiledAt: toCivil(matter.noticeOfAppealFiledAt),
      recordFiledAt: toCivil(matter.recordFiledAt),
    };
    const trapClock = computeTrapClock(trapInputsForMatter({ vehicle, ...dates }, opts.today ?? todayCivil()));
    const isWrit = (WRIT_VEHICLES as readonly string[]).includes(vehicle);
    // Recorded inputs only: the count on the matter (the subsequent-application
    // flag counts as one recorded prior) and whether they reached the merits,
    // which is null — "not recorded; counsel to confirm" — until counsel says.
    const priorWrits = Math.max(matter.priorWrits, matter.subsequentWrit ? 1 : 0);
    const priorWritsDecidedOnMerits = priorWritsDecidedOnMeritsFor(matter.case);
    const posture = isWrit ? posture1107({ vehicle: vehicle as WritVehicle, priorWrits, priorWritsDecidedOnMerits }) : null;
    // The screens the run planned for this lane and vehicle — the tool statement names them.
    const screensRun = planScreens(matter.case.lane ?? matter.lane ?? 'TRIAL', vehicle).screens;

    const build = (inv: CounselPacketInput['inventory']): CounselPacketInput => ({
      matter: {
        vehicle,
        county: matter.county,
        court: matter.court,
        causeNumber: matter.causeNumber,
        clientInitials: matter.clientInitials,
        priorWrits: matter.priorWrits,
        subsequentWrit: matter.subsequentWrit,
        priorWritsDecidedOnMerits,
        lane: matter.lane,
      },
      organisationName,
      reportId: report.id,
      versionNo: report.versionNo,
      reportTemplateVersion: report.templateVersion,
      renderedAt: report.renderedAt,
      changeNotes: Array.isArray(report.changeNotes) ? (report.changeNotes as string[]) : [],
      findings,
      droppedFindings,
      inventory: inv,
      trapClock,
      posture,
      screensRun,
    });
    return { status: 'partial', matter, build, report: { id: report.id, versionNo: report.versionNo } };
  });
  if (loaded.status !== 'partial') return loaded;
  // The inventory read runs in its own tenant-scoped transaction (inventory.service).
  const inv = await inventory(caseId, tenantId);
  return { status: 'ok', input: loaded.build(inv), report: loaded.report, matter: { id: loaded.matter.id, vehicle: loaded.matter.vehicle } };
}
