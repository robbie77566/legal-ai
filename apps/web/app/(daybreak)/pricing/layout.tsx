import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing — Family Case Review',
  description:
    'One price: $299 for a complete review of the Texas court record, up to 5,000 pages. No per-page fees, uploading is always free, and the only add-ons are stated up front.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
