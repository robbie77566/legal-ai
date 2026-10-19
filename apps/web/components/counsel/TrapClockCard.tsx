/**
 * The TRAP clock (packages/case-lifecycle/trap/clock.ts) on the matter page:
 * every step with its rule, due date, status and the jurisdictional label,
 * the next due line, the engine's notes, and the disclaimer the api's
 * `unsignedCount` drives — the vectors are proposed until counsel signs
 * them. Pure presentation; the api computed the clock.
 */
export interface TrapStepView {
  id: string
  rule: string
  subdivision?: string
  label: string
  due: string | null
  status: 'done' | 'open' | 'missed' | 'not_yet'
  filedAt?: string
  late: boolean
  jurisdictional: boolean
  isExtension: boolean
  optional: boolean
  basis: string
}
export interface TrapClockView {
  vehicle: string
  asOf: string
  steps: TrapStepView[]
  nextDue?: { id: string; rule: string; due: string; daysLeft: number }
  missedJurisdictional: boolean
  unsignedCount: number
  notes: string[]
}

const STATUS: Record<TrapStepView['status'], { label: string; color: string }> = {
  done: { label: 'Filed', color: 'var(--db-signal)' },
  open: { label: 'Open', color: 'var(--db-review)' },
  missed: { label: 'Missed', color: 'var(--db-urgent)' },
  not_yet: { label: 'Not yet', color: 'var(--db-none)' },
}

export default function TrapClockCard({ clock }: { clock: TrapClockView }) {
  return (
    <section data-testid="trap-clock" className="rounded-xl border border-db-line bg-db-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-db-serif text-xl font-semibold">TRAP clock</h2>
        <p className="text-sm text-db-muted">As of {clock.asOf}</p>
      </div>
      {clock.nextDue && (
        <p className="mt-2 text-[15px]" data-testid="trap-next-due">
          Next: <span className="font-semibold">TRAP {clock.nextDue.rule}</span> due {clock.nextDue.due} — {clock.nextDue.daysLeft} day{clock.nextDue.daysLeft === 1 ? '' : 's'} left.
        </p>
      )}
      {clock.missedJurisdictional && (
        <p className="mt-2 text-[15px] font-semibold" style={{ color: 'var(--db-urgent)' }} data-testid="trap-missed">
          A jurisdictional step reads as missed. Verify the dates before relying on this.
        </p>
      )}
      {clock.steps.length === 0 ? (
        <p className="mt-3 text-[15px] text-db-muted">No steps for this vehicle yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-db-line text-xs uppercase tracking-wider text-db-muted">
                <th className="py-2 pr-3 font-semibold">Rule</th>
                <th className="py-2 pr-3 font-semibold">Step</th>
                <th className="py-2 pr-3 font-semibold">Due</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 font-semibold">Nature</th>
              </tr>
            </thead>
            <tbody>
              {clock.steps.map((s) => (
                <tr key={s.id} className="border-b border-db-line align-top last:border-b-0" data-testid={`trap-step-${s.id}`}>
                  <td className="py-2 pr-3 font-db-mono text-xs">{s.rule}{s.subdivision ?? ''}</td>
                  <td className="py-2 pr-3">
                    <div>{s.label}{s.isExtension ? ' (extension)' : ''}{s.optional ? ' (optional)' : ''}</div>
                    <div className="text-xs text-db-muted">{s.basis}</div>
                  </td>
                  <td className="py-2 pr-3 font-db-mono text-xs">{s.due ?? '—'}</td>
                  <td className="py-2 pr-3 font-semibold" style={{ color: STATUS[s.status].color }}>
                    {STATUS[s.status].label}{s.status === 'done' && s.late ? ' late' : ''}
                  </td>
                  <td className="py-2 text-xs">{s.jurisdictional ? <span className="rounded-full border border-db-line px-2 py-0.5 font-semibold">Jurisdictional</span> : <span className="text-db-muted">Discretionary</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {clock.notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-db-muted">
          {clock.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
      <p className="mt-3 text-xs text-db-muted" data-testid="trap-disclaimer">
        {clock.unsignedCount > 0
          ? `${clock.unsignedCount} of these vectors ${clock.unsignedCount === 1 ? 'is' : 'are'} proposed until counsel signs them. `
          : ''}
        Every date is an estimate from the dates you gave; verify it against the rule in force and the court&rsquo;s calendar.
      </p>
    </section>
  )
}
