import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'How It Works — Family Case Review',
  description:
    'From the free check to the report: collect documents at your own pace, we read every page, six checks run with live progress, quality gates verify every quote — then Part A for the family and Part B for the lawyer.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
