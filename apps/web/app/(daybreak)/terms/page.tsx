'use client'

import PolicyPage from '../../../components/site/PolicyPage'
import { TERMS_CONTENT } from '../../../lib/content/terms'

/** Terms of service (landing_page_spec.md §5; UPL review 2026-10-23, rec 10). DRAFT until counsel signs. */
export default function Terms() {
  return <PolicyPage content={TERMS_CONTENT} testId="terms-page" />
}
