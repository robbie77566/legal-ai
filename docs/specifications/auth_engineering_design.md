# Authentication Engineering Design

**Document type:** Engineering Design & Implementation Plan  
**Status:** Ready for Implementation  
**Version:** 1.0  
**Date:** 2026-06-08  
**Depends on:** `user_authentication_experience.md` v1.0  
**Author:** Engineering  

---

## 1. Engineering Review of the Product Specification

### What the spec gets right

- **Enumeration-safe error messages** — identical response for "wrong password" and "no account" is correctly specified. This is already implemented in the backend with the timing-safe dummy bcrypt hash.
- **Invite-only registration** — correct for a sensitive legal platform. No self-registration surface means no anonymous account creation.
- **`passwordChangedAt` pattern** for session invalidation — this is the right choice. Maintaining a session version counter adds write overhead on every token refresh; `iat` comparison against `passwordChangedAt` is read-only once the timestamp is set.
- **`callbackUrl` redirect after login** — standard and correctly specified.

### Spec gaps the implementation plan must address

| Gap | Impact | Resolution |
|-----|--------|-----------|
| NextAuth `signIn('credentials')` is a **client-side call** in v4. The spec's mention of Server Actions for the sign-in form is partially inaccurate. | Sign-in form must remain a Client Component. | Use Server Actions for profile/password mutation; use client `signIn()` for credential submission. See §4.2. |
| The spec recommends `/auth/signin` but NextAuth's default `callbackUrl` guard uses `/api/auth/signin`. | Middleware redirect must match the configured `pages.signIn`. | Set `pages: { signIn: '/auth/signin' }` in `authOptions`. |
| "Remember me" extending session from 1 day to 30 days requires NextAuth config changes not mentioned. | Sessions will always use the default `maxAge`. | Store `rememberMe` in the JWT token and use conditional `maxAge` logic. See §4.3. |
| Invite/reset tokens stored in the `User` model as plaintext would expose them in a database breach. | Token theft from DB → account takeover. | Store **bcrypt hashes** of tokens (not plaintext). The link contains the raw token; the DB stores its hash. |
| The spec defers session listing to Phase 2 but shows a sessions UI in Phase 1 account page. | Inconsistency creates dev uncertainty. | Phase 1 ships current-session info only (derived from the JWT). Full session table is Phase 2. |

### Recommendation on NextAuth version

The current codebase runs NextAuth **v4**. Auth.js v5 (the successor) has first-class App Router support and proper Server Action helpers, but migrating from v4 to v5 is a breaking change in the callback API, database adapter interface, and session shape. **Do not migrate as part of this work.** Plan a dedicated v5 migration sprint after Phase 2 ships.

---

## 2. Technology Stack Additions

### New dependencies

```
apps/web
  react-hook-form          ^7.x   Client-side form state and validation
  @hookform/resolvers      ^3.x   Zod schema integration with RHF
  zxcvbn                   ^4.x   Password strength estimation
  sonner                   ^1.x   Toast notification system
  
packages/auth
  jose                     ^5.x   Web-standard JWT for invite/reset tokens
                                  (NOT replacing NextAuth — used for OOB tokens only)

packages/database
  (schema changes only — no new runtime dep)

packages/email (NEW workspace package)
  @react-email/components  ^0.x   React-based email template authoring
  resend                   ^4.x   Transactional email delivery
```

### Why these choices

**`react-hook-form` + `@hookform/resolvers/zod`** — The codebase already uses Zod throughout the API layer. RHF gives uncontrolled-input performance (no re-render per keystroke), and the Zod resolver lets the same validation schema run on client and be mirrored on the server action, eliminating duplication.

**`jose`** — Invite and reset tokens must be stateless (signed and time-limited) but are NOT NextAuth session tokens. `jose` is the web-standard JOSE implementation that runs on Edge, Node, and Deno. It avoids pulling in the full `jsonwebtoken` C++ binding. Tokens are signed with `HS256` using a `TOKEN_SECRET` env var, include `sub` (userId), `exp`, and `purpose` (invite | reset) claims.

**`sonner`** — Lighter than `react-hot-toast`, has first-class Next.js App Router support, and is accessible out-of-the-box. Add a single `<Toaster />` to the root layout.

**`zxcvbn`** — Provides realistic password strength scores based on dictionary attacks and pattern analysis, not naive "has uppercase + number" rules. Returns a 0–4 score that drives the visual strength meter.

**`resend`** — Modern transactional email API with React Email template support, generous free tier, and a clean SDK. Abstracted behind a `packages/email` service so the provider can be swapped without touching application code.

---

## 3. Database Schema Changes

### 3.1 Prisma schema diff

```prisma
// packages/database/prisma/schema.prisma

enum Role {
  ADMIN
  ATTORNEY
  INVESTIGATOR
  VIEWER          // ADD — read-only role for external reviewers (implemented)
  CLIENT          // ADD (Aug 2026, MVP v1.0) — consumer purchaser in a
                  // single-member tenant; see §12 and mvp_v1_engineering_notes ENG-7
}

model User {
  id                  String    @id @default(cuid())
  email               String    @unique
  name                String?
  passwordHash        String?
  role                Role      @default(ATTORNEY)
  tenantId            String
  tenant              Tenant    @relation(fields: [tenantId], references: [id])
  caseAccess          CaseAccess[]

  // Session invalidation — compared against JWT iat on every session callback
  passwordChangedAt   DateTime?               // ADD

  // Invite flow — token stored as bcrypt hash
  inviteToken         String?                 // ADD
  inviteExpires       DateTime?               // ADD
  inviteAccepted      Boolean   @default(false) // ADD

  // Password reset — token stored as bcrypt hash
  resetToken          String?                 // ADD
  resetExpires        DateTime?               // ADD

  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
}
```

### 3.2 Migration notes

- `VIEWER` added to the `Role` enum — verify the `permissions.ts` route (already accepts `'VIEWER'` in its Zod schema) aligns with the updated schema.
- `inviteToken` and `resetToken` are bcrypt-hashed values. The raw token travels only in the email link and is never persisted.
- `passwordChangedAt` starts as `null` for all existing users. The NextAuth `jwt` callback treats `null` as "no change since account creation" and does not invalidate existing tokens.

### 3.3 Required migration commands

```bash
pnpm --filter @hg/database db:generate   # Regenerate Prisma client
pnpm --filter @hg/database db:migrate    # Create and apply migration
```

---

## 4. Architecture

### 4.1 File structure

```
apps/web/
├── middleware.ts                            # Route protection (NEW)
├── app/
│   ├── layout.tsx                           # Update: add <Toaster />
│   ├── page.tsx                             # Update: "Sign In" → /auth/signin
│   │
│   ├── (auth)/                              # Route group — auth shell (NEW)
│   │   ├── layout.tsx                       # Centered card layout, HG wordmark
│   │   ├── signin/
│   │   │   └── page.tsx                     # Sign-in form (Client Component)
│   │   ├── forgot-password/
│   │   │   └── page.tsx                     # Email entry form + Server Action
│   │   ├── reset-password/
│   │   │   └── page.tsx                     # New password form + Server Action
│   │   └── setup-password/
│   │       └── page.tsx                     # First-time password setup (invite)
│   │
│   ├── dashboard/
│   │   ├── layout.tsx                       # Update: add UserMenu to header (NEW)
│   │   ├── account/                         # Account settings (NEW)
│   │   │   ├── page.tsx                     # RSC wrapper — fetches user from DB
│   │   │   └── _actions.ts                  # Server Actions: updateProfile, changePassword
│   │   ├── permissions/
│   │   │   └── page.tsx                     # Existing — no changes required
│   │   └── ...
│   │
│   └── api/
│       └── auth/
│           └── [...nextauth]/
│               └── route.ts                 # Existing — no changes
│
├── components/
│   ├── auth/
│   │   ├── SignInForm.tsx                   # Client Component (NEW)
│   │   ├── PasswordInput.tsx               # Show/hide toggle input (NEW)
│   │   └── PasswordStrength.tsx            # zxcvbn strength meter (NEW)
│   └── nav/
│       ├── DashboardHeader.tsx             # NEW — replaces inline header
│       └── UserMenu.tsx                    # Dropdown: Account + Sign Out (NEW)
│
packages/
├── auth/
│   ├── auth-options.ts                     # Update: pages config, jwt callback
│   └── token.ts                           # NEW: invite/reset token sign/verify
│
├── database/
│   └── prisma/schema.prisma               # Update: VIEWER role + new User fields
│
└── email/                                  # NEW workspace package
    ├── package.json
    ├── index.ts                            # sendInvite(), sendPasswordReset(), sendLoginNotification()
    └── templates/
        ├── invite.tsx                      # React Email template
        └── reset-password.tsx              # React Email template
```

### 4.2 Sign-in form: client call vs Server Action

NextAuth v4's credential submission requires a client-side call. The recommended pattern:

```typescript
// app/(auth)/signin/page.tsx — Client Component
'use client';
import { signIn } from 'next-auth/react';

async function handleSubmit(data: SignInValues) {
  const result = await signIn('credentials', {
    email: data.email,
    password: data.password,
    redirect: false,   // handle redirect manually for error display
  });

  if (result?.error) {
    // Map NextAuth error codes to user-facing messages
    setError(mapAuthError(result.error));
    return;
  }

  router.push(callbackUrl || '/dashboard');
}
```

**All other authenticated mutations** (change password, update profile) use Server Actions because they do not go through NextAuth:

```typescript
// dashboard/account/_actions.ts
'use server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@hg/auth';

export async function changePassword(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('Unauthorized');
  // ... bcrypt verify current → hash new → db.update → set passwordChangedAt
}
```

### 4.3 "Remember Me" implementation

The spec requires sessions to extend from 1 day to 30 days when "Remember Me" is checked. In NextAuth v4, this is achieved by:

1. Adding `rememberMe` as a credential field in `authOptions`
2. Storing `rememberMe: true` in the JWT during the `jwt` callback
3. Using conditional session `maxAge` in the NextAuth options

```typescript
// packages/auth/auth-options.ts
session: {
  strategy: 'jwt',
  maxAge: 24 * 60 * 60, // default: 1 day
},
callbacks: {
  async jwt({ token, user }) {
    if (user) {
      token.rememberMe = (user as any).rememberMe ?? false;
      // When rememberMe is true, extend the token expiry
      if (token.rememberMe) {
        token.exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days
      }
    }
    return token;
  }
}
```

### 4.4 Session invalidation on password change

The `jwt` callback checks whether the token was issued before the user's last password change:

```typescript
// packages/auth/auth-options.ts — jwt callback
async jwt({ token, user, trigger }) {
  // Initial sign-in
  if (user) {
    token.id = user.id;
    token.tenantId = (user as any).tenantId;
    token.role = (user as any).role;
    token.rememberMe = (user as any).rememberMe ?? false;
  }

  // On every token refresh, check if password changed after token was issued
  if (token.id && token.iat) {
    const dbUser = await prisma.user.findUnique({
      where: { id: token.id as string },
      select: { passwordChangedAt: true }
    });
    if (
      dbUser?.passwordChangedAt &&
      dbUser.passwordChangedAt.getTime() / 1000 > (token.iat as number)
    ) {
      // Token predates the password change — force re-authentication
      return null; // NextAuth treats null as "sign out"
    }
  }

  return token;
}
```

> **Trade-off:** This adds one Prisma query per token refresh. Token refresh happens on every `getServerSession()` call. For high-frequency dashboards, consider caching the `passwordChangedAt` value in the JWT itself (refreshed only at sign-in) and accepting a brief window (equal to token expiry) before the invalidation takes effect.

### 4.5 Route protection middleware

```typescript
// apps/web/middleware.ts
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    // Token is guaranteed non-null here (withAuth checked it)
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/auth/signin',
    },
  }
);

export const config = {
  matcher: ['/dashboard/:path*', '/workspace/:path*'],
};
```

The matcher uses Next.js path patterns. Routes outside the matcher are public. The NextAuth cookie name must match what `withAuth` expects — this is automatic when both `authOptions` and the middleware use the same `NEXTAUTH_SECRET`.

### 4.6 Invite & reset token design

Tokens are cryptographically random, short-lived, and stored as bcrypt hashes — the same pattern used for API keys in security-conscious systems.

```typescript
// packages/auth/token.ts
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

const TOKEN_BYTES = 32; // 256-bit entropy

export async function generateToken(): Promise<{ raw: string; hash: string }> {
  const raw = randomBytes(TOKEN_BYTES).toString('hex'); // 64-char hex string
  const hash = await bcrypt.hash(raw, 10); // cost 10 — fast enough for tokens
  return { raw, hash };
}

export async function verifyToken(raw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(raw, hash);
}
```

**Invite flow:**

1. ADMIN submits invite form → API creates `User` with `inviteToken = hash`, `inviteExpires = now + 24h`
2. Email is sent with link containing `raw` token
3. User clicks link → `/auth/setup-password?token=<raw>`
4. Server: find user where `inviteExpires > now`, call `verifyToken(raw, user.inviteToken)` → if valid, allow password set
5. On password set: clear `inviteToken`, set `inviteExpires = null`, set `inviteAccepted = true`, set `passwordHash`

**Reset flow (identical pattern, 1-hour window):**

1. User submits email → Server Action generates token, stores hash, sends email
2. User clicks link → `/auth/reset-password?token=<raw>&id=<userId>`
3. Server: look up user by id, verify token, check expiry
4. On new password set: clear `resetToken`, set `passwordChangedAt = now`, set `passwordHash`

Storing `userId` in the URL (alongside the token) avoids a full-table scan for the token hash. The security guarantee comes from the token — the userId alone is useless without it.

---

## 5. Component Design

### 5.1 `(auth)` route group layout

The auth layout provides the centered card shell used by all four auth pages (sign-in, forgot-password, setup-password, reset-password):

```typescript
// app/(auth)/layout.tsx — Server Component
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0B0E14] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* HabeasGraph wordmark */}
        <div className="text-center mb-8">
          <span className="text-[#D4AF37] font-serif font-bold text-2xl tracking-wider">
            HabeasGraph
          </span>
        </div>

        {/* Card */}
        <div className="bg-[#161B22] border border-gray-800 rounded-xl p-8 shadow-2xl">
          {children}
        </div>

        {/* Legal notice */}
        <p className="text-center text-gray-600 text-xs mt-6 leading-relaxed">
          Access to this system is restricted to authorized users of your organization.
          Unauthorized access is prohibited.
        </p>
      </div>
    </div>
  );
}
```

This layout is not applied to `/dashboard` or `/workspace` routes because route groups are opt-in per-segment.

### 5.2 `PasswordInput` component

Reused across sign-in, setup-password, reset-password, and change-password:

```typescript
// components/auth/PasswordInput.tsx
'use client';
import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  id: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, error, id, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const errorId = `${id}-error`;

    return (
      <div className="space-y-1">
        <label htmlFor={id} className="block text-sm font-medium text-gray-400">
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={visible ? 'text' : 'password'}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={!!error}
            className="w-full bg-[#0B0E14] border border-gray-700 rounded-lg px-3 py-2
                       text-white pr-10 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]
                       focus:border-[#D4AF37] aria-[invalid=true]:border-red-500"
            {...props}
          />
          <button
            type="button"
            aria-label={visible ? 'Hide password' : 'Show password'}
            onClick={() => setVisible(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500
                       hover:text-gray-300 transition-colors"
          >
            {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-red-400 text-xs mt-1">
            {error}
          </p>
        )}
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';
```

### 5.3 `PasswordStrength` component

Used on setup-password and reset-password pages, and on the account change-password form:

```typescript
// components/auth/PasswordStrength.tsx
'use client';
import { useMemo } from 'react';
import zxcvbn from 'zxcvbn';

const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
const COLORS = [
  'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-400', 'bg-green-500'
];

export function PasswordStrength({ password }: { password: string }) {
  const result = useMemo(() => zxcvbn(password), [password]);
  if (!password) return null;

  const score = result.score; // 0–4
  return (
    <div className="mt-1 space-y-1" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i <= score - 1 ? COLORS[score] : 'bg-gray-700'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-gray-400">{LABELS[score]}</p>
    </div>
  );
}
```

### 5.4 `UserMenu` component

Dropdown in the dashboard header, using Radix UI primitives (already available via the UI package or installable separately):

```typescript
// components/nav/UserMenu.tsx
'use client';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  ATTORNEY: 'Attorney',
  INVESTIGATOR: 'Investigator',
  VIEWER: 'Viewer',
};

export function UserMenu() {
  const { data: session } = useSession();
  if (!session) return null;

  const user = session.user;
  const initials = (user.name ?? user.email ?? '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative group">
      {/* Trigger */}
      <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                         hover:bg-[#D4AF37]/10 transition-colors text-sm">
        <div className="w-7 h-7 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40
                        flex items-center justify-center text-[#D4AF37] text-xs font-semibold">
          {initials}
        </div>
        <span className="text-gray-200 max-w-[120px] truncate">{user.name ?? user.email}</span>
      </button>

      {/* Dropdown */}
      <div className="absolute right-0 top-full mt-1 w-56 bg-[#161B22] border border-gray-800
                      rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100
                      group-hover:visible transition-all duration-150 z-50">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-sm font-medium text-white truncate">{user.name}</p>
          <p className="text-xs text-gray-500 truncate">{user.email}</p>
          <span className="mt-1 inline-block text-xs px-2 py-0.5 rounded-full
                           bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20">
            {ROLE_LABELS[user.role ?? ''] ?? user.role}
          </span>
        </div>

        {/* Items */}
        <div className="p-1">
          <Link href="/dashboard/account"
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300
                       rounded-lg hover:bg-[#D4AF37]/10 hover:text-white transition-colors">
            Account Settings
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400
                       rounded-lg hover:bg-red-500/10 transition-colors">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 6. Implementation Phases

### Phase 1 — Core auth (no external services required)

Everything in this phase runs with zero new environment variables.

| Task | File(s) | Notes |
|------|---------|-------|
| Schema migration (VIEWER + new User fields) | `schema.prisma` | Run `db:generate` + `db:migrate` |
| Update `authOptions` | `packages/auth/auth-options.ts` | Add `pages.signIn`, `passwordChangedAt` check, `rememberMe` logic |
| Middleware | `apps/web/middleware.ts` | New file |
| Auth route group layout | `app/(auth)/layout.tsx` | New file |
| Sign-in page + form | `app/(auth)/signin/page.tsx`, `SignInForm.tsx` | Client Component |
| `PasswordInput` component | `components/auth/PasswordInput.tsx` | New shared component |
| Update landing page nav | `app/page.tsx` | Change `/dashboard` link to `/auth/signin` |
| Dashboard layout header | `app/dashboard/layout.tsx` | Add header with `UserMenu` (or update existing) |
| `UserMenu` component | `components/nav/UserMenu.tsx` | New component |
| Account settings page | `app/dashboard/account/page.tsx` | RSC with `getServerSession` |
| Account Server Actions | `app/dashboard/account/_actions.ts` | `updateProfile`, `changePassword` |
| Token utility | `packages/auth/token.ts` | `generateToken()`, `verifyToken()` |
| Setup password page (no email yet) | `app/(auth)/setup-password/page.tsx` | Accepts token from query param |
| Add `sonner` Toaster | `app/layout.tsx` | One-line change |
| Install new dependencies | `pnpm-lock.yaml` | `react-hook-form`, `@hookform/resolvers`, `zxcvbn`, `sonner` |

**Phase 1 deliverable:** Users can sign in, are redirected on unauthenticated access, can view and update their profile, change their password, and sign out. Admins can create invite links (tokens) and manually share them (email is not yet wired).

### Phase 2 — Email flows (requires email service)

| Task | File(s) | Notes |
|------|---------|-------|
| Create `packages/email` | `package.json`, `index.ts`, templates | New workspace package |
| Add Resend API key to env | `.env.example` | `RESEND_API_KEY`, `EMAIL_FROM` |
| Invite email template | `packages/email/templates/invite.tsx` | React Email |
| Reset password email template | `packages/email/templates/reset-password.tsx` | React Email |
| Wire invite email to permissions API | `apps/api/src/routes/permissions.ts` | Call `sendInvite()` on user create |
| Forgot password page + Server Action | `app/(auth)/forgot-password/page.tsx` | Generates token, sends email |
| Reset password page + Server Action | `app/(auth)/reset-password/page.tsx` | Verifies token, sets new password |
| Re-send invite endpoint | `apps/api/src/routes/permissions.ts` | New PATCH endpoint: regenerate `inviteToken` |

**Phase 2 deliverable:** Full end-to-end onboarding flow. New invitees receive emails. Forgotten passwords are self-serviceable.

### Phase 3 — Security hardening (opt-in, scheduled)

| Task | Notes |
|------|-------|
| Rate limiting on sign-in | Use `upstash/ratelimit` (if Redis is available) or in-memory fallback. Max 5 attempts per IP per 15 minutes. |
| TOTP / MFA | Add `otpauth` package, `totpSecret` field to User model, QR code setup flow on account page. |
| Login notification emails | Send email on sign-in from a new IP (requires storing last-seen IP). |
| Full session table | Store session metadata in DB for the active sessions UI in account page. |
| NextAuth v5 migration | Breaking change — dedicated sprint, not bundled with auth features. |

---

## 7. Password Policy Enforcement

### Zod schema (shared between client and Server Actions)

```typescript
// packages/auth/password.schema.ts
import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(12, 'Must be at least 12 characters')
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[0-9!@#$%^&*()_+\-=\[\]{}|;':",.<>\/?]/, 'Must contain a number or symbol');

export const newPasswordFormSchema = (userEmail: string) =>
  z.object({
    password: passwordSchema.refine(
      val => val.toLowerCase() !== userEmail.toLowerCase(),
      'Password cannot be your email address'
    ),
    confirm: z.string(),
  }).refine(data => data.password === data.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
```

The same `passwordSchema` is imported by:
- `SignInForm` (client) — for client-side feedback before submission
- `_actions.ts` (server) — for authoritative server-side validation
- `setup-password` and `reset-password` pages

### Strength meter threshold

The `zxcvbn` score must be ≥ 2 ("Fair") before the form allows submission. Display the strength meter in real-time; disable the submit button when score < 2 on password-creation pages (not on sign-in).

---

## 8. Accessibility Checklist

| Requirement | Implementation |
|------------|----------------|
| All inputs have `<label>` | Enforced by the `PasswordInput` component's `label` prop |
| Error messages linked to inputs | `aria-describedby={errorId}` on input, `role="alert"` on error `<p>` |
| Loading state communicated | `useFormStatus().pending` disables submit and sets `aria-busy` on the form |
| Password strength announced | `aria-live="polite"` on the strength meter container |
| Focus trap in dropdowns | `UserMenu` should use `@radix-ui/react-dropdown-menu` for full keyboard support |
| Reduced motion | Framer Motion's `useReducedMotion()` hook — wrap any auth page animations |

---

## 9. Testing Plan

### Unit tests (Vitest)

| Test | File |
|------|------|
| `generateToken()` returns raw + hash with expected entropy | `packages/auth/token.test.ts` |
| `verifyToken(raw, hash)` returns true/false correctly | `packages/auth/token.test.ts` |
| `passwordSchema` rejects weak passwords, accepts strong | `packages/auth/password.schema.test.ts` |
| `changePassword` Server Action rejects wrong current password | `app/dashboard/account/_actions.test.ts` |
| `changePassword` sets `passwordChangedAt` on success | Same |
| JWT callback invalidates token when `passwordChangedAt > iat` | `packages/auth/auth-options.test.ts` |

### Integration tests (Playwright)

| Scenario | Route |
|----------|-------|
| Unauthenticated visit to `/dashboard` redirects to `/auth/signin?callbackUrl=/dashboard` | middleware |
| Successful sign-in with valid credentials redirects to `callbackUrl` | `/auth/signin` |
| Sign-in with wrong password shows enumeration-safe error, does not reveal email existence | `/auth/signin` |
| Password change invalidates existing session (sign in → change password → existing tab redirects to sign-in) | `/dashboard/account` |
| Profile name update persists and is reflected in the `UserMenu` | `/dashboard/account` |
| Sign-out clears session and redirects to `/` | Any authenticated page |

---

## 10. Environment Variables

```bash
# .env.example additions

# Auth token signing (for invite and reset tokens — separate from NEXTAUTH_SECRET)
TOKEN_SECRET="change-this-to-a-random-32-char-string"

# Phase 2: Email (Resend)
RESEND_API_KEY="re_..."
EMAIL_FROM="HabeasGraph <noreply@yourdomain.com>"
```

`TOKEN_SECRET` is required from Phase 1 (token generation exists even without email delivery). It must be at least 32 characters and different from `NEXTAUTH_SECRET`. The two secrets serve different systems and should not be shared.

---

## 11. Open Questions for Engineering Team

1. **`UserMenu` hover vs. click** — The component design above uses CSS `group-hover`. Accessibility best practice is a click-toggled dropdown with focus trap (Radix `DropdownMenu`). Decision: use Radix unless the UI package already has a dropdown primitive.

2. **`passwordChangedAt` query on every JWT refresh** — One Prisma query per `getServerSession()` call is acceptable for the current scale. If the platform grows to thousands of concurrent sessions, consider moving `passwordChangedAt` into the JWT payload itself (refreshed only at sign-in) with a `SESSION_VALIDITY_WINDOW` config (e.g., 1 hour) before the stale check fires.

3. **Dashboard layout** — There is currently no `apps/web/app/dashboard/layout.tsx`. The header with `UserMenu` must be added. Confirm with design whether the header is shared with the `/workspace` route or is separate.

4. **Token URL shape** — The plan uses `?token=<raw>&id=<userId>` for reset links. An alternative is to encode both in a signed JWT (one URL param). Either is acceptable; the signed-JWT approach avoids the need for `userId` in the URL entirely but requires `jose` on the API side too.

---

## 12. Consumer-tier addendum (MVP v1.0, Aug 2026)

The MVP v1.0 consumer product (`mvp_v1_prd.md`, `mvp_v1_engineering_notes.md` ENG-7, system design `../architecture/mvp_v1_system_design.md` §10) changes several assumptions in this document. This section is authoritative where it conflicts with §§1–11.

### 12.1 CLIENT role
The purchaser is a new `CLIENT` role in a **single-member tenant** — never ADMIN (tenant settings/user management misfit) or ATTORNEY (professional surfaces). CLIENT can: manage their own account, access their own cases' Daybreak surfaces (`/case/**`), download their reports, and grant/revoke referral consent. CLIENT can never reach `/dashboard`, `/workspace`, `/qa`, `/ops`, or any permissions surface — enforced in middleware **and** per-route in the API.

### 12.2 Self-registration exception
"No self-registration" (§1) now applies to **staff/professional tenants only**. The consumer purchase flow (`landing_page_spec.md` §3, W-3) creates the account itself: at `/buy`, after the disclosure-acknowledgment step, an email + password form creates `User(role: CLIENT)` + its single-member `Tenant` in one transaction, then hands off to Stripe Checkout. The Case is created by the `payment.succeeded` webhook (idempotent; reconciliation-healed). Email verification is **non-blocking** (link sent; purchase proceeds). Invite-only onboarding is unchanged for every other role.

### 12.3 Password reset is v1.0 launch scope
Phase 2's forgot/reset flow (§6) moves into the v1.0 launch gate: the consumer returning after weeks of records-gathering is the primary account-recovery case (PRD §10.7). The reset flow, `packages/email`, and the Resend integration ship with the consumer launch — not "after Phase 1 settles."

### 12.4 Middleware matcher & theming
The matcher grows beyond §4.5:

```typescript
export const config = {
  matcher: [
    '/dashboard/:path*', '/workspace/:path*',   // staff (ADMIN/ATTORNEY/INVESTIGATOR/VIEWER)
    '/qa/:path*',                               // ATTORNEY/ADMIN
    '/ops/:path*',                              // ADMIN
    '/case/:path*',                             // CLIENT (own tenant) or staff
    '/buy/:path*',                              // partially public: account step onward
  ],
};
```

`/`, `/check`, `/help`, and `/auth/**` stay public. The middleware also **role-gates** (the current `authorized: ({token}) => !!token` is authentication only): a token's `role` must match the prefix matrix above, with the API re-enforcing the same matrix as the real gate. Consumer-facing auth screens (`/auth/**` reached from Daybreak) render in the Daybreak theme, not the Industrial Authority card in §5.1 — one set of routes, theme selected by referring surface.

### 12.5 Anonymous S0 drafts & sessions
- S0 eligibility answers are stored server-side keyed by an opaque random token (cookie), **30-day TTL then hard delete**, never used for marketing; promotion to a case copies then deletes the draft (ENG-7).
- Consumer session default: the records-gathering journey spans weeks — "remember me" defaults **on** (checked) for CLIENT sign-ins; staff default stays unchecked.

### 12.6 API authentication (supersedes header-trust)
The Fastify API currently trusts `x-tenant-id`/`x-user-id` headers with no verification — this is a launch-blocking defect. The API adopts a preHandler that verifies the NextAuth JWT (shared `NEXTAUTH_SECRET`) and derives `userId`/`tenantId`/`role` exclusively from it; the headers are removed everywhere. Redis-backed rate limiting (replacing §6's in-memory Phase-1 limiter) covers auth, eligibility, presign, and webhook endpoints before launch (`internal_operations_spec.md` SRE-6). Details: system design §10.
