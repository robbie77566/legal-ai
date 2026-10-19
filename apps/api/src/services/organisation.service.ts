import type { Membership, MembershipRole, Organisation } from '@prisma/client';
import { withTenant } from '@hg/database';

/**
 * Organisation helpers shared by the counsel routes, the ops routes and the
 * matter-creation guard (persona_rollout_plan.md §5 I). Everything here is
 * tenant-scoped through withTenant; the ops routes read organisations on the
 * owner connection themselves because they are the cross-tenant surface.
 */

export type Seat = Membership & { organisation: Organisation };

/** The caller's seat in their organisation, or null when they have none. */
export function loadSeat(userId: string, tenantId: string): Promise<Seat | null> {
  return withTenant(tenantId, (tx) => tx.membership.findFirst({ where: { userId }, include: { organisation: true } }));
}

/** Who may open a matter: every seat but the read-only VIEWER (plan §3, §4 "unlimited users"). */
export const MATTER_CREATOR_ROLES: ReadonlySet<MembershipRole> = new Set<MembershipRole>(['OWNER', 'ATTORNEY', 'INVESTIGATOR']);

/** Who may file a Record Desk request: the investigator, an attorney or the owner. */
export const INVESTIGATION_FILER_ROLES: ReadonlySet<MembershipRole> = new Set<MembershipRole>(['OWNER', 'ATTORNEY', 'INVESTIGATOR']);

/** The grant as staff set it (workstream B owns usage; these are the granted fields). */
export function allowanceSummary(o: Organisation) {
  return {
    pilot: o.pilot,
    pilotEndsAt: o.pilotEndsAt,
    allowanceRecords: o.allowanceRecords,
    allowanceResetsAt: o.allowanceResetsAt,
    publicInterest: o.publicInterest,
  };
}

/** What a member sees of their own organisation. */
export function organisationView(o: Organisation) {
  return {
    id: o.id,
    kind: o.kind,
    name: o.name,
    legalName: o.legalName,
    billingEmail: o.billingEmail,
    securityContact: o.securityContact,
    isTest: o.isTest,
    createdAt: o.createdAt,
    ...allowanceSummary(o),
  };
}

/** What staff see in the organisations list and on the detail page. */
export function organisationStaffView(o: Organisation & { _count?: { memberships: number } }) {
  return {
    ...organisationView(o),
    tenantId: o.tenantId,
    features: o.features,
    updatedAt: o.updatedAt,
    ...(o._count ? { memberCount: o._count.memberships } : {}),
  };
}
