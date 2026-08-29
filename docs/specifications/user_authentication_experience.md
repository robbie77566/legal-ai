# User Authentication & Account Management Experience

**Document type:** Product Specification  
**Status:** Draft — Pending Engineering Review  
**Version:** 1.0  
**Date:** 2026-06-08  
**Author:** Product Management  

---

## 1. Overview

HabeasGraph is a multi-tenant legal AI platform serving Texas post-conviction advocacy teams. Access to case materials — which frequently contain sensitive attorney-client communications, medical records, and criminal history — requires a deliberate, secure, and professionally appropriate sign-in experience.

This specification defines the required authentication and account management UX. The current codebase has a fully wired NextAuth + bcrypt backend but **no sign-in UI, no route protection, and no account management page**. This document establishes the product requirements to close those gaps.

---

## 2. Current State vs. Required State

| Area | Today | Required |
|------|-------|----------|
| Sign-in page | Not implemented — clicking "Sign In" goes directly to `/dashboard` | Dedicated `/auth/signin` page with email + password form |
| Route protection | None — any URL is reachable without authentication | Middleware guards all `/dashboard` and `/workspace` routes |
| Account settings | None | `/dashboard/account` page for profile and password management |
| Password management | Admin seeds initial password; no self-service reset | In-app password change; email-based reset flow |
| Session visibility | Not surfaced to users | Active session info visible in account page |
| MFA | Not implemented | TOTP as opt-in for ADMIN and ATTORNEY roles |

---

## 3. User Roles & Context

The platform has three system-level roles. The sign-in and account experience must reflect each role's responsibilities:

| Role | Primary Users | Typical Actions |
|------|--------------|-----------------|
| **ADMIN** | Firm managing partner, IT lead | Manages users, billing, tenant settings |
| **ATTORNEY** | Defense attorney, post-conviction specialist | Creates and reviews cases, uploads documents |
| **INVESTIGATOR** | Legal investigator, paralegal | Views and annotates case materials; cannot create cases |

> **Note:** The permissions API accepts a fourth role value `VIEWER`. This must be added to the Prisma schema before the sign-in spec can be considered fully implemented. See [Gap: Role Alignment](#gap-role-alignment).

---

## 4. Sign-In Page — `/auth/signin`

### 4.1 Trigger Conditions

The sign-in page is shown when:

- A user visits any protected route (`/dashboard/**`, `/workspace/**`) while unauthenticated
- A user explicitly clicks "Sign In" from the landing page
- A user's JWT session expires (default: 30 days)
- A user signs out

On sign-in success, the user is redirected to the route they originally attempted to reach (`callbackUrl`), or `/dashboard` as the default.

### 4.2 Form Fields

| Field | Type | Validation | Notes |
|-------|------|-----------|-------|
| Email address | `email` input | Required, valid email format | Placeholder: `you@yourfirm.com` |
| Password | `password` input | Required, min 1 char (server enforces complexity) | Show/hide toggle |
| Remember me | Checkbox | Optional | Extends session from 1 day to 30 days |

### 4.3 Error States

The sign-in form must handle these error conditions without leaking information:

| Scenario | User-Facing Message |
|----------|-------------------|
| Email not found | "Invalid email or password." _(do not say "no account exists")_ |
| Wrong password | "Invalid email or password." _(identical message to above — prevents enumeration)_ |
| Account has no password (invited user, password not yet set) | "Your account requires a password to be set. Please contact your administrator or check your email for a setup link." |
| Network / server error | "Something went wrong. Please try again in a moment." |
| Too many failed attempts (future: rate limiting) | "Too many failed attempts. Please wait 15 minutes before trying again." |

### 4.4 Forgot Password Link

A "Forgot your password?" link appears below the password field. This initiates the password reset flow (see Section 6).

### 4.5 Visual Design

The sign-in page must match the existing HabeasGraph design language:
- Background: `#161B22` (dark navy)
- Card surface: `#0B0E14`
- Primary accent: `#D4AF37` (legal gold)
- Font: system sans-serif
- The HabeasGraph wordmark appears at the top of the sign-in card
- Below the form: "Access to this system is restricted to authorized users of your organization. Unauthorized access is prohibited."

### 4.6 Accessibility

- All form inputs have associated `<label>` elements
- Form is fully keyboard-navigable
- Error messages are associated with inputs via `aria-describedby`
- Password visibility toggle has an accessible label ("Show password" / "Hide password")

---

## 5. Route Protection (Middleware)

### 5.1 Protected Routes

All routes under these prefixes require an authenticated session:

```
/dashboard/**
/workspace/**
```

The landing page (`/`) and NextAuth API routes (`/api/auth/**`) are public.

### 5.2 Behavior

- **Unauthenticated request** → redirect to `/auth/signin?callbackUrl=<original-path>`
- **Session expired mid-session** → next request redirects to sign-in; active page shows a non-blocking toast: "Your session has expired. Please sign in again."
- **Authentication successful** → redirect back to `callbackUrl`, or `/dashboard` if no callback

### 5.3 Implementation Note

Use Next.js Middleware (`apps/web/middleware.ts`) with the NextAuth `withAuth` wrapper. The middleware should run on the Edge Runtime and check for the NextAuth session token cookie.

---

## 6. Password Management

### 6.1 First-Time Password Setup

When an ADMIN invites a new user (via `/dashboard/permissions`), the user receives no password at creation time. The system must send an invitation email containing a time-limited (24-hour) link to `/auth/setup-password?token=<signed-token>`.

**Setup Password page fields:**
- New password (with strength indicator)
- Confirm new password

**Password requirements:**
- Minimum 12 characters
- At least one uppercase letter
- At least one number or symbol
- Cannot be the same as the user's email

### 6.2 Change Password (Self-Service, Authenticated)

Available from the Account Settings page (Section 7). Requires:
- Current password (to re-authenticate before change)
- New password
- Confirm new password

On success: all existing sessions for this user are invalidated (JWT `iat` comparison or a session version field).

### 6.3 Forgot Password (Unauthenticated Reset)

Accessible from the sign-in page. Flow:

1. User enters their email address
2. System responds: "If that address is registered, you will receive a reset link shortly." _(constant response prevents enumeration)_
3. Email contains a link valid for **1 hour** with a single-use signed token
4. Link opens `/auth/reset-password?token=<token>`
5. User enters new password (same requirements as above)
6. On success: redirect to sign-in with message "Password updated. Please sign in."

---

## 7. Account Settings Page — `/dashboard/account`

Accessible from the top navigation bar (user avatar or name → "Account Settings").

### 7.1 Profile Section

Editable fields:

| Field | Notes |
|-------|-------|
| Full name | Free text, max 100 chars |
| Email address | Changing email requires re-verification; not editable by INVESTIGATOR |
| Display photo | Optional avatar upload (future phase) |

Read-only context displayed beneath the profile form:

| Field | Value |
|-------|-------|
| Organization | Tenant name (e.g., "Martinez & Partners LLP") |
| Role | ADMIN / ATTORNEY / INVESTIGATOR / VIEWER |
| Member since | Account `createdAt` date |

### 7.2 Password Section

A "Change Password" form (see Section 6.2). Collapsed by default; expands when user clicks "Change Password."

### 7.3 Active Sessions Section

Lists active JWT sessions for the current user:

| Column | Description |
|--------|-------------|
| Device / Browser | Derived from User-Agent (e.g., "Chrome on macOS") |
| Location | IP-derived city/country (e.g., "Houston, TX") |
| Last active | Relative timestamp |
| Action | "Sign out this session" button |

A "Sign out all other sessions" button invalidates all sessions except the current one.

> **Note:** Full session listing requires storing session metadata in the database. This is a Phase 2 enhancement. In Phase 1, only the current session details are shown.

### 7.4 Security Section

| Setting | Description |
|---------|-------------|
| Two-factor authentication | Enable/disable TOTP (Google Authenticator, Authy). Required for ADMIN role by tenant policy (future). |
| Login notifications | Email me when a new sign-in occurs (opt-in) |

> MFA enforcement by role is a Phase 2 feature. Phase 1 ships opt-in TOTP only.

---

## 8. Sign-Out

### 8.1 Trigger

- User clicks "Sign Out" from the navigation menu (available on all authenticated pages)
- Session expires and user attempts a protected action

### 8.2 Behavior

1. Call NextAuth `signOut()` which clears the session cookie
2. Redirect to `/` (landing page) — **not** to `/auth/signin`, to avoid implying forced logout
3. Show a brief toast on the landing page: "You've been signed out."

---

## 9. Invitation & Onboarding Flow

New users cannot self-register. All users are invited by a tenant ADMIN via the Permissions page.

**Invitation flow:**

1. ADMIN opens `/dashboard/permissions` and clicks "Invite User"
2. Fills form: Email, Full Name, Role
3. API creates a `User` record in the database (no password yet)
4. System sends invitation email to the provided address
5. Email contains:
   - Personalized greeting ("You've been invited to HabeasGraph by [ADMIN name] at [Tenant name]")
   - "Set Up Your Account" button (links to `/auth/setup-password?token=<token>`)
   - Token valid for **24 hours**
6. User sets their password on the setup page → is immediately signed in → redirected to `/dashboard`

**If invitation expires:** User can request a new invite from their admin, or the admin can re-send via the Permissions page.

---

## 10. Navigation Integration

### 10.1 Unauthenticated Header

Landing page (`/`) header:
- HabeasGraph wordmark (left)
- "Sign In" button (right) → `/auth/signin`

### 10.2 Authenticated Header

All `/dashboard/**` and `/workspace/**` pages:
- HabeasGraph wordmark (left)
- Navigation links (center/left)
- User menu (top-right): Shows user's name and role badge

**User menu items:**
- User's name + role badge (non-clickable header)
- "Account Settings" → `/dashboard/account`
- Separator
- "Sign Out"

---

## 11. Multi-Tenant Considerations

Each user belongs to exactly one tenant. The tenant context is established at sign-in from the User record and stored in the JWT. Users cannot switch tenants.

Tenant context is surfaced to the user in:
- Account Settings page ("Organization: [Tenant Name]")
- A subtle indicator in the sidebar or header for ADMIN users (prevents confusion when an ADMIN manages multiple firms — future multi-tenant portal feature)

---

## 12. Open Gaps & Engineering Dependencies

### Gap: Role Alignment

The Prisma schema defines three roles (`ADMIN`, `ATTORNEY`, `INVESTIGATOR`). The permissions API accepts a fourth: `VIEWER`. The sign-in and account pages must use roles consistently.

**Resolution required before implementation:** Add `VIEWER` to the `Role` enum in `schema.prisma`, or remove it from the permissions API. Product recommendation: **add VIEWER** — it is a meaningful read-only role for external reviewers (e.g., court-appointed monitors, oversight bodies).

### Gap: Email Service

Password reset, invitation, and login-notification emails require a transactional email provider (e.g., SendGrid, Resend, Postmark). This is not currently configured. Engineering must add an email service and relevant environment variables before Sections 6.1, 6.3, and 9 can ship.

### Gap: Session Invalidation on Password Change

The current JWT strategy has no mechanism to invalidate existing tokens when a password changes. Options:
1. Store a `passwordChangedAt` timestamp on the User record and compare against the JWT `iat` on every request (lightweight, recommended)
2. Store a `sessionVersion` integer and increment it on password change
3. Switch sensitive operations to database sessions (highest overhead)

### Gap: TOTP / MFA Infrastructure

MFA is not in the current dependency set. Engineering must add `otpauth` or a similar library and a `totpSecret` field to the User model before Section 7.4 can be implemented.

---

## 13. Success Metrics

| Metric | Target |
|--------|--------|
| Sign-in completion rate | > 95% of users who reach sign-in page complete it successfully |
| Time to sign in | < 5 seconds end-to-end (form fill + API round-trip) |
| Support tickets related to auth | < 2% of monthly active users |
| Invitation acceptance rate | > 80% within 24 hours of invite |
| Password reset completion rate | > 90% of reset emails clicked result in a new password |

---

## 14. Out of Scope (This Specification)

- **SSO / SAML** (e.g., Okta, Azure AD) — documented separately in the Enterprise Authentication roadmap
- **Clio OAuth integration** — stub exists; specification TBD once Clio API agreement is in place
- **Billing & subscription management** — separate PM-owned spec
- **Audit log UI** — covered in the Compliance & Audit specification
