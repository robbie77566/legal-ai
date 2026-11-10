import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact — Snot Nose Legal',
  description: 'Reach us at admin@snotnoselegal.com — answers within two business days.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
