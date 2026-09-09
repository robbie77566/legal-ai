# AWS IAM — one user per environment

**Why (2026-09-09):** the buckets were split into prod and dev, but one access key (`legal-ai-local-dev`) still reached both. A leaked dev key could read or delete production case files. Each environment gets its own IAM user whose policy names only its own bucket.

| Environment | IAM user | Policy file | Bucket | Where the key lives |
|---|---|---|---|---|
| Production | `snl-api-prod` (create) | `docs/operations/iam/snl-api-prod-policy.json` | `snl-case-documents-327600375718` | Render → api → `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` |
| Dev | `legal-ai-local-dev` (exists) — replace its policy, or create `snl-api-dev` | `docs/operations/iam/snl-api-dev-policy.json` | `snl-case-documents-dev-327600375718` | root `.env` on the dev box |

Both policies also allow **read-only** access to the eval corpus bucket (seed `--corpus`, fetch script) and exactly the three Textract calls the pipeline makes (`DetectDocumentText`, `StartDocumentTextDetection`, `GetDocumentTextDetection`). Nothing else — no IAM, no other buckets, no console.

## Creating a user (AWS console, ~2 minutes)

1. IAM → Users → **Create user** → name (`snl-api-prod` or `snl-api-dev`) → *no* console access → Next.
2. Permissions: **Attach policies directly** → **Create policy** → JSON tab → paste the matching file from `docs/operations/iam/` → name it the same as the user → create, then attach it to the user → Create user.
3. Open the user → **Security credentials** → **Create access key** → *Application running outside AWS* → copy both values **once**.
4. Put them where that environment reads them (table above). Prod: save on the Render api service and let it redeploy. Dev: edit `.env` — never paste a key into chat.
5. Verify the scope (below). Then **deactivate, and after a day delete, the old key** in IAM so the over-broad key stops working.

## Verifying a key's scope

```bash
node scripts/aws-scope-check.cjs dev    # on the dev box: dev REACHABLE, prod denied, eval REACHABLE → exit 0
node scripts/aws-scope-check.cjs prod   # with the prod key in the environment (e.g. a Render shell)
```

`LEAK` and exit 1 mean the key reaches the other environment's bucket — fix the policy before using it. The check prints only the first characters of the key id.

For production without a shell: the `/ops` **File storage** tile runs a HeadBucket against `S3_BUCKET` with the api's key — green proves the key reaches its own bucket; it cannot prove it is denied the other, which is what the script adds.

## Rotation

Same steps: create a new access key on the user, swap it in, run the scope check, deactivate the old one. Keys that have appeared in a chat transcript count as leaked and get rotated (go_live_readiness §5).
