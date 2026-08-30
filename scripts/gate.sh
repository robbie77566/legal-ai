#!/usr/bin/env bash
# The verify-every-change gate. Exit codes PROPAGATE — no grep-masking.
set -euo pipefail
cd "$(dirname "$0")/.."
export CI=true
export DATABASE_URL="${DATABASE_URL:-postgresql://user:password@localhost:5433/legal_ai?schema=public}"

echo "── typecheck ──"
pnpm typecheck > /tmp/gate-typecheck.log 2>&1 || { tail -20 /tmp/gate-typecheck.log; exit 1; }
grep -E "Tasks:" /tmp/gate-typecheck.log | tail -1

echo "── tests ──"
npx vitest run > /tmp/gate-tests.log 2>&1 || { grep -E "FAIL|Tests |×" /tmp/gate-tests.log | head -20; exit 1; }
grep -E "Test Files|Tests " /tmp/gate-tests.log | tail -2

echo "── web build ──"
pnpm --filter web build > /tmp/gate-build.log 2>&1 || { tail -20 /tmp/gate-build.log; exit 1; }
echo "build OK"
echo "GATE GREEN"
