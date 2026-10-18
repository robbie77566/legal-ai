import "next-auth"
import "next-auth/jwt"

// accountKind (FAMILY | PROFESSIONAL | STAFF) rides beside role from the
// identity expand step (persona_rollout_plan.md §5 A). Optional on the token
// because sessions issued before that deploy carry no such claim.
declare module "next-auth" {
  interface User {
    id: string
    tenantId: string
    role: string
    accountKind?: string
  }

  interface Session {
    user: {
      id: string
      email?: string | null
      name?: string | null
      image?: string | null
      tenantId: string
      role: string
      accountKind?: string
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    tenantId: string
    role: string
    accountKind?: string
  }
}
