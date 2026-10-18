/** packages/database/flags.ts against live Postgres: the typed key guard,
 *  override precedence (plan §5 J acceptance J2), the list shape, and the
 *  15-second cache that makes a flip live on every instance without a deploy. */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import prisma from '../index';
import {
  FLAG_KEYS, FLAG_CACHE_TTL_MS, UnknownFlagKeyError, __invalidateFlagCache,
  clearOverride, isFlagKey, isFlagOn, listFlags, listFlagsForAdmin, setFlag, setOverride,
} from '../flags';

const tenant = `t_flags_${Date.now()}`;
const other = `${tenant}_other`;
const actor = 'u_flags_test';

const reset = async () => {
  await prisma.featureFlagOverride.deleteMany({ where: { tenantId: { in: [tenant, other] } } });
  await prisma.featureFlag.updateMany({ data: { enabled: false, updatedBy: null } });
  __invalidateFlagCache();
};

beforeAll(reset);
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

describe('keys', () => {
  it('the six keys of the plan are seeded, dark, and the only ones the guard accepts', async () => {
    const rows = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    expect(rows.map((r) => r.key)).toEqual([...FLAG_KEYS].sort());
    expect(rows.every((r) => r.enabled === false)).toBe(true);
    expect(isFlagKey('offices')).toBe(true);
    expect(isFlagKey('Offices')).toBe(false);
    expect(isFlagKey(undefined)).toBe(false);
    // @ts-expect-error — an unknown key is a type error AND a runtime refusal
    await expect(isFlagOn('nope')).rejects.toBeInstanceOf(UnknownFlagKeyError);
    // @ts-expect-error
    await expect(setFlag('nope', true, actor)).rejects.toBeInstanceOf(UnknownFlagKeyError);
    // @ts-expect-error
    await expect(setOverride('nope', tenant, true, null, actor)).rejects.toBeInstanceOf(UnknownFlagKeyError);
    // @ts-expect-error
    await expect(clearOverride('nope', tenant, actor)).rejects.toBeInstanceOf(UnknownFlagKeyError);
  });
});

describe('precedence (J2)', () => {
  it('override wins over global, in both directions; clearing restores the global', async () => {
    await reset();
    expect(await isFlagOn('offices')).toBe(false);
    expect(await isFlagOn('offices', tenant)).toBe(false);

    expect(await setOverride('offices', tenant, true, 'pilot', actor)).toEqual({ key: 'offices', tenantId: tenant, before: null, after: true });
    expect(await isFlagOn('offices', tenant)).toBe(true);
    expect(await isFlagOn('offices', other)).toBe(false);
    expect(await isFlagOn('offices')).toBe(false);

    expect(await setFlag('offices', true, actor)).toEqual({ key: 'offices', tenantId: null, before: false, after: true });
    expect(await setOverride('offices', tenant, false, null, actor)).toEqual({ key: 'offices', tenantId: tenant, before: true, after: false });
    expect(await isFlagOn('offices', tenant)).toBe(false);
    expect(await isFlagOn('offices', other)).toBe(true);
    expect(await isFlagOn('offices')).toBe(true);

    expect(await clearOverride('offices', tenant, actor)).toEqual({ key: 'offices', tenantId: tenant, before: false, after: null });
    expect(await isFlagOn('offices', tenant)).toBe(true);
    expect(await clearOverride('offices', tenant, actor)).toEqual({ key: 'offices', tenantId: tenant, before: null, after: null });
  });

  it('listFlags reports global, effective and overridden per key; the admin list carries overrides', async () => {
    await reset();
    await setFlag('clinic_inbox', true, actor);
    await setOverride('clinic_inbox', tenant, false, 'not yet', actor);
    const views = await listFlags(tenant);
    expect(views.map((v) => v.key)).toEqual([...FLAG_KEYS]);
    expect(views.find((v) => v.key === 'clinic_inbox')).toEqual({ key: 'clinic_inbox', enabled: true, effective: false, overridden: true });
    expect(views.find((v) => v.key === 'offices')).toEqual({ key: 'offices', enabled: false, effective: false, overridden: false });
    expect((await listFlags()).find((v) => v.key === 'clinic_inbox')).toEqual({ key: 'clinic_inbox', enabled: true, effective: true, overridden: false });

    const admin = await listFlagsForAdmin();
    const clinic = admin.find((f) => f.key === 'clinic_inbox')!;
    expect(clinic.updatedBy).toBe(actor);
    expect(clinic.overrides).toEqual([expect.objectContaining({ tenantId: tenant, enabled: false, note: 'not yet', updatedBy: actor })]);
  });
});

describe('cache', () => {
  it('a row changed underneath a warm cache shows up after the TTL, and at once after invalidation', async () => {
    await reset();
    expect(await isFlagOn('long_records')).toBe(false); // warm
    await prisma.featureFlag.update({ where: { key: 'long_records' }, data: { enabled: true } });
    expect(await isFlagOn('long_records')).toBe(false); // served from cache

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + FLAG_CACHE_TTL_MS - 1_000);
    expect(await isFlagOn('long_records')).toBe(false);
    vi.setSystemTime(Date.now() + 2_000); // past the TTL
    expect(await isFlagOn('long_records')).toBe(true);

    await prisma.featureFlag.update({ where: { key: 'long_records' }, data: { enabled: false } });
    expect(await isFlagOn('long_records')).toBe(true);
    __invalidateFlagCache();
    expect(await isFlagOn('long_records')).toBe(false);
  });

  it('concurrent cold reads share one load', async () => {
    __invalidateFlagCache();
    // The delegate is a Proxy, so a bare spy does not call through; pass the original on.
    const original = prisma.featureFlag.findMany.bind(prisma.featureFlag);
    const spy = vi.spyOn(prisma.featureFlag, 'findMany').mockImplementation(original as never);
    await Promise.all([isFlagOn('offices'), isFlagOn('record_desk', tenant), listFlags(tenant)]);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
