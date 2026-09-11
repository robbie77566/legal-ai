#!/usr/bin/env bash
# The verify-every-change gate. Exit codes PROPAGATE — no grep-masking.
set -euo pipefail
cd "$(dirname "$0")/.."
export CI=true
# Force test mode regardless of what the caller's shell has exported (a sourced
# .env once made every api suite boot a real server on :3001 — 2026-09-09).
export NODE_ENV=test
export DATABASE_URL="${DATABASE_URL:-postgresql://user:password@localhost:5433/legal_ai?schema=public}"

echo "── migrations ──"
# The dev database follows the code automatically: apply anything pending
# and regenerate the client BEFORE typecheck/tests, so a pulled migration
# never needs remembering (PO, 2026-09-09). Idempotent and fast when current.
pnpm --filter @hg/database db:migrate:deploy > /tmp/gate-migrate.log 2>&1 || { tail -20 /tmp/gate-migrate.log; exit 1; }
pnpm --filter @hg/database db:generate > /tmp/gate-generate.log 2>&1 || { tail -20 /tmp/gate-generate.log; exit 1; }
grep -E "applied|up to date|No pending" /tmp/gate-migrate.log | tail -1 || echo "migrations OK"

echo "── env drift ──"
# Blueprint ↔ environment_reference.md ↔ .env.example must agree (every prod
# failure in Sept 2026 was configuration, not code — dev_prod_switching.md).
node scripts/env-drift.cjs || exit 1

echo "── typecheck ──"
pnpm typecheck > /tmp/gate-typecheck.log 2>&1 || { tail -20 /tmp/gate-typecheck.log; exit 1; }
grep -E "Tasks:" /tmp/gate-typecheck.log | tail -1

echo "── lint ──"
# CI runs lint; the gate must too (an unconfigured `next lint` failed every
# CI run for two days while this gate stayed green — 2026-09-02).
pnpm lint > /tmp/gate-lint.log 2>&1 || { grep -E "Error|error|✖" /tmp/gate-lint.log | head -20; exit 1; }
echo "lint OK"

echo "── tests ──"
npx vitest run > /tmp/gate-tests.log 2>&1 || { grep -E "FAIL|Tests |×" /tmp/gate-tests.log | head -20; exit 1; }
grep -E "Test Files|Tests " /tmp/gate-tests.log | tail -2

echo "── web build ──"
# Isolated dist dir: never corrupt a running dev server's .next (see next.config.mjs)
NEXT_DIST_DIR=.next-gate pnpm --filter web build > /tmp/gate-build.log 2>&1 || { tail -20 /tmp/gate-build.log; exit 1; }
echo "build OK"
echo "GATE GREEN"
