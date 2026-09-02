import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Learn — Family Case Review',
  description:
    'Plain-words explanations of Texas post-conviction basics: the 11.07 writ, the federal one-year deadline, why the first writ matters most, and what ineffective assistance really means.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
