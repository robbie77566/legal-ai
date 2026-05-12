import { NextAuthOptions } from 'next-auth'
import { prisma } from '@hg/database'

export const authOptions: NextAuthOptions = {
  providers: [
    // Add providers here (e.g., Google, GitHub, Credentials)
  ],
  callbacks: {
    async session({ session, token }) {
      if (token && session.user) {
        // @ts-ignore
        session.user.id = token.sub
        
        // Fetch tenantId for the user
        const user = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { tenantId: true },
        })
        
        if (user) {
          // @ts-ignore
          session.user.tenantId = user.tenantId
        }
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id
      }
      return token
    },
  },
  session: {
    strategy: 'jwt',
  },
}
