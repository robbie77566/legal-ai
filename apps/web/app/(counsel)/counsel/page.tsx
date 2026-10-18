import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@hg/auth'
import prisma from '@hg/database'

export const dynamic = 'force-dynamic'

/**
 * /counsel — the professional's home (persona_rollout_plan.md §5 A). A stub
 * until workstream F lands matter intake: the organisation's name and the one
 * line that says what arrives next. The middleware already requires a
 * PROFESSIONAL here; the checks below only cover a direct server render.
 */
export default async function CounselHome() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/auth/signin')
  if (session.user.accountKind !== 'PROFESSIONAL') redirect('/go')

  // Owner connection with an explicit tenant filter (the web service holds no
  // hg_app credentials; same pattern as dashboard/account/_actions.ts).
  const seat = await prisma.membership.findFirst({
    where: { userId: session.user.id, tenantId: session.user.tenantId },
    include: { organisation: { select: { name: true, kind: true } } },
  })

  return (
    <section>
      <p className="text-sm text-slate-500">{seat?.organisation.name ?? 'Your organisation'}</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold">Your matters</h1>
      <p className="mt-6 text-slate-700">
        {seat
          ? 'Matter intake arrives next. Your account is ready; the first matter form opens here when it ships.'
          : 'Your seat in an organisation has been removed. Ask the organisation owner to invite you again.'}
      </p>
    </section>
  )
}
