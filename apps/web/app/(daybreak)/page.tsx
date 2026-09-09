import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@hg/auth'
import BrandHome from '../../components/site/BrandHome'

/**
 * The home route. A signed-in visitor is sent to their own landing (/go:
 * families → their reviews, staff → the console) instead of the marketing
 * page and its sign-up pitch (PO, 2026-09-09). Decided on the server, so
 * there is no flash of the wrong page. Everyone else gets the brand home.
 */
export default async function Home() {
  const session = await getServerSession(authOptions)
  if (session?.user) redirect('/go')
  return <BrandHome />
}
