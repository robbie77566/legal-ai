import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact — Snot Nose Legal',
  description: 'Reach a real person at admin@snotnoselegal.com — answers within two business days.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
