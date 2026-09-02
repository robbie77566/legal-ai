#!/usr/bin/env bash
# The verify-every-change gate. Exit codes PROPAGATE — no grep-masking.
set -euo pipefail
cd "$(dirname "$0")/.."
export CI=true
export DATABASE_URL="${DATABASE_URL:-postgresql://user:password@localhost:5433/legal_ai?schema=public}"

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
