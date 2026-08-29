import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface User {
    id: string
    tenantId: string
    role: string
  }

  interface Session {
    user: {
      id: string
      email?: string | null
      name?: string | null
      image?: string | null
      tenantId: string
      role: string
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    tenantId: string
    role: string
  }
}
