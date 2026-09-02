import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sample Report — Family Case Review',
  description:
    'See exactly what the $299 review delivers: a sample Part A built from a fictional case — findings in plain English, each backed by a quoted line from the record, with the attorney version attached.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
