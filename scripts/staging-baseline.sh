#!/usr/bin/env bash
# Copy the production database into staging as BASELINE DATA, scrubbed.
#
#   pnpm staging:baseline --confirm-source-is-test-data            # dump prod → restore staging → scrub
#   pnpm staging:baseline --dump-only                               # just refresh the local baseline dump
#   pnpm staging:baseline --restore-from .staging-baseline/prod-20261018.dump   # weekly reset, no prod access
#   … --s3                                                          # also sync case documents (see S3 below)
#
# Needs only the Postgres client tools (pg_dump/pg_restore/psql 16+; plus the
# aws CLI for --s3) — no node, no repo install — so it runs from the dev box,
# any laptop, or the Render shell of api-staging-0o8p (runbook → Staging
# baseline data). Both databases are private to Render: allowlist the machine's
# IP (`curl -4 ifconfig.me`; a Render service's outbound IPs are under its
# Settings) on hg-postgres (prod) and hg-postgres-staging for the duration, then
# remove it from staging again (its ipAllowList is [] by design).
#
# Inputs (.env.prod, gitignored; see .env.prod.example):
#   PROD_DATABASE_URL          source. hg_readonly is enough (pg_dump only SELECTs;
#                              --enable-row-security is added so the readonly_inspection
#                              policies apply). Any other role needs --allow-owner.
#   STAGING_DATABASE_URL       target. The OWNER external connection string of
#                              hg-postgres-staging (Render → Info). Must name a
#                              database ending in _staging — anything else is refused.
#   STAGING_BASELINE_PASSWORD  password every copied account gets (default: staging-baseline-2026)
#   STAGING_S3_SOURCE_BUCKET / STAGING_S3_TARGET_BUCKET   for --s3 (target must contain "staging")
#
# Guards, in order: target db name ends in _staging; target host != source host;
# source role is hg_readonly unless --allow-owner; the scrub SQL re-checks the
# db name inside the transaction. --confirm-source-is-test-data is a deliberate
# attestation: production holds only the founder's test and reference cases
# today. Case CONTENT (titles, facts, record text, findings, documents) is copied
# as-is because that is what makes the baseline useful; only identities, contact
# details, credentials, tokens, payment card data, IPs, free-text notes, leads and
# share links are scrubbed (scripts/sql/staging_scrub.sql). The day a real family
# is in production this script must stop being run against it: build the
# baseline from a curated set instead (environment_reference.md → Staging).
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIRM=0; DUMP_ONLY=0; ALLOW_OWNER=0; DO_S3=0; RESTORE_FROM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --confirm-source-is-test-data) CONFIRM=1 ;;
    --dump-only) DUMP_ONLY=1 ;;
    --allow-owner) ALLOW_OWNER=1 ;;
    --s3) DO_S3=1 ;;
    --restore-from) RESTORE_FROM="${2:?--restore-from needs a path}"; shift ;;
    -h|--help) sed -n '2,36p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

# .env.prod values fill in anything not already exported.
if [ -f .env.prod ]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*([A-Z0-9_]+)[[:space:]]*=[[:space:]]*(.*)$ ]] || continue
    k="${BASH_REMATCH[1]}"; v="${BASH_REMATCH[2]}"; v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
    [ -z "${!k:-}" ] && export "$k=$v"
  done < .env.prod
fi

for tool in pg_dump pg_restore psql; do
  command -v "$tool" >/dev/null || { echo "missing: $tool (install postgresql-client 16+)" >&2; exit 2; }
done

url_part() { # url_part <url> <host|user|db>  — postgres://user:pass@host:port/db?params
  local u="${1#*://}" rest
  case "$2" in
    user) [[ "$u" == *@* ]] && printf '%s\n' "${u%%@*}" | sed 's/:.*//' || echo "" ;;
    host) rest="${u##*@}"; rest="${rest%%/*}"; printf '%s\n' "${rest%%:*}" ;;
    db)   rest="${u#*/}"; printf '%s\n' "${rest%%\?*}" ;;
  esac
}

DUMP_DIR=".staging-baseline"; mkdir -p "$DUMP_DIR"
TODAY="$(date +%Y%m%d)"

# ---- 1. dump (or pick the file to restore) -----------------------------------
if [ -n "$RESTORE_FROM" ]; then
  [ -f "$RESTORE_FROM" ] || { echo "no such dump: $RESTORE_FROM" >&2; exit 2; }
  DUMP="$RESTORE_FROM"
  echo "Restoring from existing baseline $DUMP (production not contacted)."
else
  [ "$CONFIRM" = 1 ] || [ "$DUMP_ONLY" = 1 ] || {
    echo "Refusing: pass --confirm-source-is-test-data to attest that production holds no real customer data." >&2; exit 2; }
  : "${PROD_DATABASE_URL:?set PROD_DATABASE_URL (in .env.prod)}"
  SRC_USER="$(url_part "$PROD_DATABASE_URL" user)"
  if [ "$SRC_USER" != "hg_readonly" ] && [ "$ALLOW_OWNER" != 1 ]; then
    echo "Refusing: source role is \"$SRC_USER\", not hg_readonly. Pass --allow-owner knowingly." >&2; exit 2
  fi
  RLS_FLAG=()
  if [ "$SRC_USER" = "hg_readonly" ]; then
    # hg_readonly sees rows only through readonly_inspection policies; a table
    # without one would dump EMPTY and the baseline would silently lose it.
    RLS_FLAG=(--enable-row-security)
    MISSING="$(psql "$PROD_DATABASE_URL" -tAX -c "select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and not exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polroles @> array[(select oid from pg_roles where rolname = 'hg_readonly')])")"
    if [ -n "$MISSING" ]; then
      echo "Refusing: RLS tables with no readonly_inspection policy for hg_readonly: $MISSING" >&2
      echo "Add them to docs/operations/sql/readonly_role.sql step 2 and run it as the owner, or dump with the owner URL and --allow-owner." >&2; exit 2
    fi
  fi
  # pg_dump reads every sequence's position; readonly_role.sql grants that too.
  NOSEQ="$(psql "$PROD_DATABASE_URL" -tAX -c "select string_agg(sequencename, ', ') from pg_sequences where schemaname = 'public' and not has_sequence_privilege(quote_ident(schemaname) || '.' || quote_ident(sequencename), 'SELECT')")"
  if [ -n "$NOSEQ" ]; then
    echo "Refusing: $SRC_USER cannot read sequence(s) $NOSEQ. As the owner: GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO $SRC_USER; (docs/operations/sql/readonly_role.sql)" >&2; exit 2
  fi
  DUMP="$DUMP_DIR/prod-$TODAY.dump"
  echo "Dumping $(url_part "$PROD_DATABASE_URL" db) on $(url_part "$PROD_DATABASE_URL" host) as $SRC_USER → $DUMP"
  rm -f "$DUMP.part"
  pg_dump "$PROD_DATABASE_URL" --format=custom --no-owner --no-privileges "${RLS_FLAG[@]}" \
    --file "$DUMP.part" || { rm -f "$DUMP.part"; echo "pg_dump failed; nothing written." >&2; exit 1; }
  mv "$DUMP.part" "$DUMP"
  echo "Dump: $(du -h "$DUMP" | cut -f1). Keep it: --restore-from $DUMP resets staging without touching production."
  [ "$DUMP_ONLY" = 1 ] && exit 0
fi

# ---- 2. target guards ----------------------------------------------------------
: "${STAGING_DATABASE_URL:?set STAGING_DATABASE_URL (hg-postgres-staging owner external URL, in .env.prod)}"
TGT_DB="$(url_part "$STAGING_DATABASE_URL" db)"; TGT_HOST="$(url_part "$STAGING_DATABASE_URL" host)"
case "$TGT_DB" in *_staging) ;; *) echo "Refusing: target database \"$TGT_DB\" does not end in _staging." >&2; exit 2 ;; esac
if [ -n "${PROD_DATABASE_URL:-}" ] && [ "$TGT_HOST" = "$(url_part "$PROD_DATABASE_URL" host)" ]; then
  echo "Refusing: target host equals the production host." >&2; exit 2
fi
LIVE_DB="$(psql "$STAGING_DATABASE_URL" -tAX -c 'select current_database()')"
[ "$LIVE_DB" = "$TGT_DB" ] || { echo "Refusing: connected database is \"$LIVE_DB\", expected \"$TGT_DB\"." >&2; exit 2; }

# ---- 3. restore ----------------------------------------------------------------
echo "Restoring into $TGT_DB on $TGT_HOST (drops and recreates every object in public)…"
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$ BEGIN
  -- render.staging.yaml manual step S1 creates both; the dump (schema public only) brings neither.
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hg_app') THEN
    RAISE EXCEPTION 'hg_app role missing on staging — run render.staging.yaml manual step S1 first';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_extension WHERE extname = 'vector') THEN
    RAISE WARNING 'vector extension missing on staging — DocumentChunk embeddings will fail to restore (manual step S1)';
  END IF;
  -- the dump carries production's readonly_inspection policies, which name this role
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hg_readonly') THEN
    CREATE ROLE hg_readonly NOLOGIN;
  END IF;
END $$;
SQL
# --clean/--if-exists drop what the dump recreates; --no-owner/--no-privileges
# because the staging owner differs and grants are re-applied below.
pg_restore --dbname "$STAGING_DATABASE_URL" --clean --if-exists --no-owner --no-privileges \
  --exit-on-error --single-transaction --schema=public "$DUMP"

# ---- 4. grants + scrub ---------------------------------------------------------
# --no-privileges dropped the application role's grants; same statements as the
# RLS migration (20260829000001). Policies came with the dump (they are DDL).
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
GRANT USAGE ON SCHEMA public TO hg_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hg_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hg_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hg_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hg_app;
SQL
# The baseline password is hashed in Postgres (pgcrypto bcrypt, cost 12 — the
# same $2a$ format bcryptjs verifies), so no node is needed here.
STAGING_BASELINE_PASSWORD="${STAGING_BASELINE_PASSWORD:-staging-baseline-2026}"
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -v "staging_password=$STAGING_BASELINE_PASSWORD" -f "$(dirname "$0")/sql/staging_scrub.sql"

# ---- 5. documents --------------------------------------------------------------
if [ "$DO_S3" = 1 ]; then
  command -v aws >/dev/null || { echo "missing: aws cli (needed for --s3)" >&2; exit 2; }
  : "${STAGING_S3_SOURCE_BUCKET:?}" ; : "${STAGING_S3_TARGET_BUCKET:?}"
  case "$STAGING_S3_TARGET_BUCKET" in *staging*) ;; *) echo "Refusing: S3 target \"$STAGING_S3_TARGET_BUCKET\" is not a staging bucket." >&2; exit 2 ;; esac
  [ "$STAGING_S3_SOURCE_BUCKET" != "$STAGING_S3_TARGET_BUCKET" ] || { echo "Refusing: S3 source and target are the same bucket." >&2; exit 2; }
  echo "Syncing s3://$STAGING_S3_SOURCE_BUCKET/cases/ → s3://$STAGING_S3_TARGET_BUCKET/cases/ (needs a key that reads prod and writes staging, e.g. an admin profile)…"
  aws s3 sync "s3://$STAGING_S3_SOURCE_BUCKET/cases/" "s3://$STAGING_S3_TARGET_BUCKET/cases/" --delete --only-show-errors
else
  echo "Documents not synced (no --s3): Document.s3Key rows point at objects that may be missing on staging; uploads and new analyses still work."
fi

echo
echo "Staging baseline ready. Every copied account signs in with the baseline password; staff keep their email, clients are client-<hash>@example.com."
echo "Add any staging-only test accounts again (they were replaced): POST /buy/account on api.staging, or the admin seed."
