import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Family Case Review — $299 Texas Court Record Review',
  description:
    'Find out what is really in the Texas court record — before you spend thousands. Every finding backed by an exact quote from the record. $299, one price. Start with a free two-minute check.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
