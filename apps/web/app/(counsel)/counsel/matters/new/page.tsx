'use client'

/**
 * /counsel/matters/new — open a matter (persona_rollout_plan.md §5 C): the
 * form is the interview. On 201 the matter page opens with the uploader.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import MatterForm from '@/components/counsel/MatterForm'

export default function NewMatter() {
  const router = useRouter()
  return (
    <section className="mx-auto max-w-2xl">
      <p className="text-sm text-db-muted"><Link href="/counsel" className="underline">Matters</Link> · New</p>
      <h1 className="mt-1 font-db-serif text-3xl font-semibold">Open a matter</h1>
      <p className="mt-2 text-[15px] text-db-muted">Vehicle, court identifiers, initials and dates. Nothing runs until the record is uploaded, metered and priced.</p>
      <div className="mt-8">
        <MatterForm onCreated={(caseId) => router.push(`/counsel/matters/${caseId}`)} />
      </div>
    </section>
  )
}
