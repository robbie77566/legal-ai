'use client'

/**
 * The matter form (persona_rollout_plan.md §5 C; packages/case-lifecycle/
 * matters.ts MatterCreateSchema): the vehicle picker with each vehicle's
 * label and court, county, court, cause number, client initials — never a
 * name, and the form says so — offence, sentence, the four dates, prior
 * writs and the subsequent-writ flag, the outside-record note. Validation
 * is the api's own schema run in the browser (lib/counsel.ts
 * validateMatterForm); the capital refusal comes back from the api as a 422
 * and is shown inline.
 */
import { useState } from 'react'
import { createMatter } from '@/lib/api'
import { EMPTY_MATTER_FORM, VEHICLE_OPTIONS, matterBodyFor, validateMatterForm, type MatterFormState } from '@/lib/counsel'

const field = 'mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3 text-[15px]'
const label = 'text-sm font-semibold'

function Err({ msg, id }: { msg?: string; id: string }) {
  if (!msg) return null
  return (
    <p id={id} role="alert" className="mt-1 text-sm" style={{ color: 'var(--db-urgent)' }}>
      {msg}
    </p>
  )
}

export default function MatterForm({ onCreated }: { onCreated: (caseId: string) => void }) {
  const [f, setF] = useState<MatterFormState>(EMPTY_MATTER_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof MatterFormState, string>>>({})
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof MatterFormState>(k: K, v: MatterFormState[K]) => setF((cur) => ({ ...cur, [k]: v }))
  const text = (k: keyof MatterFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError('')
    const errs = validateMatterForm(f)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setBusy(true)
    try {
      const res = await createMatter(matterBodyFor(f))
      const body = (await res.json().catch(() => ({}))) as { caseId?: string; error?: string; reason?: string; field?: string }
      if (res.status === 201 && body.caseId) {
        onCreated(body.caseId)
        return
      }
      if (res.status === 422 && body.reason === 'CAPITAL_REFUSED') {
        setServerError(body.error ?? 'Capital cases are refused for the Counsel Review.')
      } else if (res.status === 404) {
        setServerError('Matter intake is not available for your organisation yet.')
      } else if (res.status === 403) {
        setServerError(body.error ?? 'Your seat cannot open a matter.')
      } else {
        setServerError(body.error ?? 'The matter could not be opened — check the fields and try again.')
        if (body.field && body.field in EMPTY_MATTER_FORM) setErrors({ [body.field]: body.error } as Partial<Record<keyof MatterFormState, string>>)
      }
    } catch {
      setServerError('The request did not reach us — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate data-testid="matter-form" className="space-y-8">
      {serverError && (
        <p role="alert" data-testid="matter-server-error" className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--db-urgent)', color: 'var(--db-urgent)' }}>
          {serverError}
        </p>
      )}

      <fieldset>
        <legend className="font-db-serif text-xl font-semibold">Vehicle</legend>
        <p className="mt-1 text-sm text-db-muted">The filing this record is being read for. It sets which screens run first and which clock the matter keeps.</p>
        <div className="mt-3 space-y-2" role="radiogroup" aria-label="Vehicle">
          {VEHICLE_OPTIONS.map((v) => (
            <label
              key={v.id}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${f.vehicle === v.id ? 'border-db-accent bg-db-accent-soft' : 'border-db-line bg-db-surface'}`}
            >
              <input type="radio" name="vehicle" value={v.id} checked={f.vehicle === v.id} onChange={() => set('vehicle', v.id)} className="mt-1" data-testid={`vehicle-${v.id}`} />
              <span>
                <span className="font-semibold">{v.label}</span>
                {v.refused && <span className="ml-2 rounded-full border border-db-line px-2 py-0.5 text-xs font-semibold" style={{ color: 'var(--db-urgent)' }}>Refused</span>}
                <span className="mt-0.5 block text-sm text-db-muted">{v.court}</span>
              </span>
            </label>
          ))}
        </div>
        <Err id="err-vehicle" msg={errors.vehicle} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="font-db-serif text-xl font-semibold">The case</legend>
        <label className="block">
          <span className={label}>County</span>
          <input id="matter-county" required maxLength={64} value={f.county} onChange={text('county')} className={field} aria-describedby={errors.county ? 'err-county' : undefined} />
          <Err id="err-county" msg={errors.county} />
        </label>
        <label className="block">
          <span className={label}>Court</span>
          <input id="matter-court" maxLength={120} value={f.court} onChange={text('court')} className={field} placeholder="e.g. 144th District Court" />
          <Err id="err-court" msg={errors.court} />
        </label>
        <label className="block">
          <span className={label}>Cause number</span>
          <input id="matter-cause" maxLength={64} value={f.causeNumber} onChange={text('causeNumber')} className={field} />
          <Err id="err-causeNumber" msg={errors.causeNumber} />
        </label>
        <label className="block">
          <span className={label}>Client initials</span>
          <input id="matter-initials" required maxLength={4} value={f.clientInitials} onChange={text('clientInitials')} className={`${field} uppercase`} autoCapitalize="characters" aria-describedby="initials-note" />
          <span id="initials-note" className="mt-1 block text-xs text-db-muted">One to four letters. Never a name: the client is identified by initials only, here and in the packet.</span>
          <Err id="err-clientInitials" msg={errors.clientInitials} />
        </label>
        <label className="block">
          <span className={label}>Offence</span>
          <input id="matter-offence" maxLength={120} value={f.offence} onChange={text('offence')} className={field} />
        </label>
        <label className="block">
          <span className={label}>Sentence</span>
          <input id="matter-sentence" maxLength={120} value={f.sentence} onChange={text('sentence')} className={field} />
        </label>
        <label className="block">
          <span className={label}>Lane</span>
          <select id="matter-lane" value={f.lane} onChange={text('lane')} className={field}>
            <option value="">Not known yet</option>
            <option value="TRIAL">Trial</option>
            <option value="PLEA">Plea</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="font-db-serif text-xl font-semibold">Dates</legend>
        <p className="text-sm text-db-muted sm:col-span-2">Any you have. The clock runs from them and can be corrected until the review starts. Type a date as you would write it.</p>
        {(
          [
            ['judgmentSignedAt', 'Judgment signed'],
            ['sentenceImposedAt', 'Sentence imposed in open court'],
            ['noticeOfAppealFiledAt', 'Notice of appeal filed'],
            ['recordFiledAt', 'Record filed (the later of clerk\'s and reporter\'s)'],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="block">
            <span className={label}>{l}</span>
            <input id={`matter-${k}`} value={f[k]} onChange={text(k)} className={field} placeholder="YYYY-MM-DD" inputMode="numeric" />
            <Err id={`err-${k}`} msg={errors[k]} />
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-db-serif text-xl font-semibold">Posture</legend>
        <label className="block sm:w-48">
          <span className={label}>Prior writs filed</span>
          <input id="matter-prior-writs" type="number" min={0} max={20} value={f.priorWrits} onChange={text('priorWrits')} className={field} />
          <Err id="err-priorWrits" msg={errors.priorWrits} />
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={f.subsequentWrit} onChange={(e) => set('subsequentWrit', e.target.checked)} className="mt-1 h-5 w-5" data-testid="matter-subsequent" />
          <span>
            <span className="font-semibold">This would be a subsequent application</span>
            <span className="block text-sm text-db-muted">Puts the matter in Art. 11.07 §4 posture; a prior writ counted above does the same.</span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={f.capital} onChange={(e) => set('capital', e.target.checked)} className="mt-1 h-5 w-5" data-testid="matter-capital" />
          <span>
            <span className="font-semibold">This is a capital case</span>
            <span className="block text-sm text-db-muted">Capital work is outside the Counsel Review; the matter will be refused.</span>
          </span>
        </label>
        <label className="block">
          <span className={label}>Outside the record</span>
          <textarea id="matter-note" rows={3} maxLength={2000} value={f.outsideRecordNote} onChange={text('outsideRecordNote')} className={field} placeholder="Anything you already know that the record will not show — a witness, a lab, a prior ruling." />
          <Err id="err-outsideRecordNote" msg={errors.outsideRecordNote} />
        </label>
      </fieldset>

      <button type="submit" disabled={busy} className="rounded-xl bg-db-accent px-6 py-3 text-lg font-semibold text-db-surface disabled:opacity-40" data-testid="matter-submit">
        {busy ? 'Opening…' : 'Open the matter'}
      </button>
    </form>
  )
}
