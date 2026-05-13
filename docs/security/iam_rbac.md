# Identity and Access Management (IAM) & RBAC

This document outlines the Identity and Access Management (IAM) model and Role-Based Access Control (RBAC) architecture implemented in the HabeasGraph Litigation Triage application.

## Overview

The application utilizes a multi-tenant, role-based security model. It leverages NextAuth v4 for authentication and Prisma ORM for database-level authorization tracking. Cases are no longer universally accessible; instead, access is strictly governed by the `CaseAccess` mapping table.

## Authentication (NextAuth v4)

We use `next-auth@4` integrated with our `@hg/auth` package to manage user sessions. 

1. **Credentials Provider**: Users authenticate locally via a standard email/password strategy.
2. **Session Injection**: Upon successful login, the user's `tenantId` and global system `role` are injected into their JWT token and the client-side session object via the `jwt` and `session` callbacks.
3. **Session Propagation**: The entire Next.js application is wrapped in a `<SessionProvider>`, making session data available globally via the `useSession()` hook.

## Role-Based Access Control (RBAC)

RBAC operates on two distinct levels: System-level (Global) and Case-level.

### 1. System-Level Roles
Users possess a global `role` associated with their tenant, defined by the following Prisma `Enum`:
- **`ADMIN`**: Can manage users, create cases, and assign permissions.
- **`ATTORNEY`**: Can view and analyze cases they are assigned to, and trigger AI drafting actions.
- **`INVESTIGATOR`**: Can view specific assigned cases to upload evidence and review data.
- **`VIEWER`**: Read-only access to assigned cases.

### 2. Case-Level Permissions (`CaseAccess`)
A user cannot access a case simply by being in the same tenant. Access is granular and explicitly granted via the `CaseAccess` model:

```prisma
model CaseAccess {
  id        String   @id @default(cuid())
  caseId    String
  userId    String
  role      Role     @default(VIEWER) // Role specific to this case
  
  case      Case     @relation(fields: [caseId], references: [id])
  user      User     @relation(fields: [userId], references: [id])

  @@unique([caseId, userId]) // A user has exactly one access record per case
}
```

## Security Workflows

### Case Creation
When a user creates a new case (via `POST /cases`), the frontend extracts the `tenantId` and `userId` from the active session and injects them as headers (`x-tenant-id`, `x-user-id`). The API creates the `Case` and automatically generates a `CaseAccess` record for the creator with the `ADMIN` role.

### API Authorization (CRUD)
The Fastify API enforces authorization dynamically:
- **Read (`GET /cases`)**: The API joins the `Case` table with the `CaseAccess` table to return only cases where `CaseAccess.userId === currentUserId`.
- **Update/Delete (`PATCH`, `DELETE`)**: The API checks the `CaseAccess` table for the specific `caseId` and `userId` combination. It verifies that `access.role === 'ADMIN'` before allowing destructive or modifying actions.

### Permission Management
An administrative interface (`/dashboard/permissions`) allows global Admins to view all users within their tenant, invite new users, and adjust case-specific access mappings.
