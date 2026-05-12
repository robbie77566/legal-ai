import type { NextAuthConfig } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@hg/database"

export const authOptions: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  providers: [
    // Configure specific providers (e.g., Azure AD for law firms)
  ],
  callbacks: {
    session: async ({ session, user }) => {
      if (session?.user) {
        session.user.id = user.id;
        
        // Expose tenantId to the session object so the frontend can securely
        // pass it to API endpoints requiring RLS bypass.
        // The user model in Prisma contains the tenantId relation.
        (session.user as any).tenantId = (user as any).tenantId;
      }
      return session;
    },
  },
}
