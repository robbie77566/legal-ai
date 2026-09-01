/**
 * Fetch the real reference-case corpora from the encrypted eval bucket into
 * the local (gitignored) "Test Case Files/" directory — the new-laptop path.
 * The corpora are REAL court records (ENG-10): they live ONLY in the bucket,
 * never in git.
 *
 *   pnpm --filter api tsx scripts/fetch-test-cases.ts --list        # what's available
 *   pnpm --filter api tsx scripts/fetch-test-cases.ts Gary          # one corpus
 *   pnpm --filter api tsx scripts/fetch-test-cases.ts --all         # everything
 *
 * Needs AWS creds + EVAL_CORPUS_BUCKET in the root .env (environment_reference.md).
 * Existing local files with matching sizes are skipped, so re-runs are cheap.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') }); // root .env, regardless of cwd
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const DEST_ROOT = path.resolve(__dirname, '../../../Test Case Files');
const region = (process.env.AWS_REGION ?? 'us-east-2').replace(/"/g, '');
const bucket = (process.env.EVAL_CORPUS_BUCKET ?? '').replace(/"/g, '');

async function main() {
  if (!bucket) {
    console.error('EVAL_CORPUS_BUCKET is not set (root .env) — see docs/operations/environment_reference.md');
    process.exit(1);
  }
  const s3 = new S3Client({ region });
  const args = process.argv.slice(2);

  // Full inventory under corpus/
  const objects: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: 'corpus/', ContinuationToken: token })
    );
    for (const o of page.Contents ?? []) {
      if (o.Key && !o.Key.endsWith('/')) objects.push({ key: o.Key, size: o.Size ?? 0 });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  const corpora = new Map<string, { files: number; bytes: number }>();
  for (const o of objects) {
    const name = o.key.split('/')[1];
    const c = corpora.get(name) ?? { files: 0, bytes: 0 };
    c.files++;
    c.bytes += o.size;
    corpora.set(name, c);
  }

  if (args.includes('--list') || args.length === 0) {
    console.log(`Corpora in s3://${bucket}/corpus/ :`);
    for (const [name, c] of corpora) {
      console.log(`  ${name.padEnd(20)} ${c.files} files, ${(c.bytes / 1e6).toFixed(0)} MB`);
    }
    if (args.length === 0) console.log('\nFetch with: tsx scripts/fetch-test-cases.ts <name> | --all');
    return;
  }

  const wanted = args.includes('--all') ? [...corpora.keys()] : args.filter((a) => !a.startsWith('-'));
  for (const w of wanted) {
    if (!corpora.has(w)) {
      console.error(`No corpus "${w}" — available: ${[...corpora.keys()].join(', ')}`);
      process.exit(1);
    }
  }

  for (const name of wanted) {
    const files = objects.filter((o) => o.key.startsWith(`corpus/${name}/`));
    console.log(`\n${name}: ${files.length} files, ${(files.reduce((s, f) => s + f.size, 0) / 1e6).toFixed(0)} MB`);
    for (const f of files) {
      const rel = f.key.slice('corpus/'.length); // "<name>/<file...>"
      const dest = path.join(DEST_ROOT, rel);
      if (fs.existsSync(dest) && fs.statSync(dest).size === f.size) {
        console.log(`  skip (have it)  ${rel}`);
        continue;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: f.key }));
      const bytes = Buffer.from(await res.Body!.transformToByteArray());
      fs.writeFileSync(dest, bytes);
      console.log(`  fetched ${(f.size / 1e6).toFixed(1).padStart(8)} MB  ${rel}`);
    }
  }
  console.log(`\nDone → ${DEST_ROOT} (gitignored — these files must never enter git)`);
}

void main();
