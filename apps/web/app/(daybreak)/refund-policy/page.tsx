'use client'

import PolicyPage from '../../../components/site/PolicyPage'
import { REFUND_POLICY_CONTENT } from '../../../lib/content/refund-policy'

/** Refund policy (landing_page_spec.md §4.5, §5; UPL review 2026-10-23, rec 10). DRAFT until counsel signs. */
export default function RefundPolicy() {
  return <PolicyPage content={REFUND_POLICY_CONTENT} testId="refund-policy-page" />
}
