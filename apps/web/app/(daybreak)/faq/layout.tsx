import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'FAQ — Family Case Review',
  description:
    'How long the review takes, what file formats work, what happens if we find nothing, how your data is handled, and how paying in installments works.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
