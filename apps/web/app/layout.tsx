import './globals.css';
import type { Metadata } from 'next';
import { isStagingSite } from '@/lib/site-env';
import { Toaster } from 'sonner';
import { Providers } from './providers';

// Staging carries a noindex on every page (robots.ts also disallows the whole
// site); production leaves page metadata to each route.
export const metadata: Metadata = isStagingSite() ? { robots: { index: false, follow: false } } : {};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        <Toaster position="top-center" theme="dark" richColors />
      </body>
    </html>
  )
}
