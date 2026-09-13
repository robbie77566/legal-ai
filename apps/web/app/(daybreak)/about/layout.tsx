import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About — Snot Nose Legal',
  description:
    'Snot Nose Legal is operated by Tangent Solutions LLC. Why we built a $299 court-record review for Texas post-conviction families — and what we are not.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
