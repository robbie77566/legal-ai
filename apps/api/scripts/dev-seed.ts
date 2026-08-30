/**
 * Dev seed — the testing entry point AROUND the paywall (never in the
 * product: the only production path that creates a case is payment
 * fulfillment).
 *
 *   pnpm --filter api seed:dev            → sign-in-able CLIENT + funded case
 *   pnpm --filter api seed:dev -- --gary  → same, plus Gary's reference
 *                                           volumes copied from the eval
 *                                           bucket and queued through the
 *                                           REAL digitization pipeline
 *                                           (run `pnpm --filter api dev`
 *                                           so the workers are listening).
 *
 * Refuses to run against production (NODE_ENV or a live Stripe key).
 */
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// tsx resolves __dirname as '.', so walk up from cwd to the repo root's .env.
let dir = process.cwd();
while (!fs.existsSync(path.join(dir, '.env')) && dir !== path.dirname(dir)) {
  dir = path.dirname(dir);
}
dotenv.config({ path: path.join(dir, '.env') });

import bcrypt from 'bcryptjs';
import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import {
  S3Client,
  CopyObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

const EMAIL = 'family@dev.local';
const PASSWORD = 'DevFamily2026!x';

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.STRIPE_SECRET_KEY?.includes('sk_live')) {
    throw new Error('dev-seed refuses to run against production');
  }

  // Idempotent: reuse the dev family if it exists.
  let user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    const tenant = await prisma.tenant.create({ data: { name: 'Dev Family (seeded)' } });
    user = await prisma.user.create({
      data: {
        email: EMAIL,
        name: 'Dev Family',
        role: 'CLIENT',
        tenantId: tenant.id,
        passwordHash: await bcrypt.hash(PASSWORD, 12),
      },
    });
    await prisma.disclosureAck.create({
      data: { userId: user.id, tenantId: tenant.id, disclosureSetVersion: '2026-08-29.1', ip: '127.0.0.1' },
    });
  }
  const { id: userId, tenantId } = user;

  // A funded case in AWAITING_DOCS — exactly the state real fulfillment leaves.
  const kase = await withTenant(tenantId, async (tx) => {
    const c = await tx.case.create({
      data: {
        title: `Dev Case ${new Date().toISOString().slice(0, 16)}`,
        tenantId,
        lane: 'TRIAL',
        vehicle: '11.07',
        accessList: { create: { userId, role: 'ADMIN' } },
      },
    });
    await tx.payment.create({
      data: {
        stripeId: `dev_seed_${c.id}`,
        caseId: c.id,
        userId,
        tenantId,
        kind: 'REVIEW',
        status: 'SUCCEEDED',
        amountCents: 29900,
      },
    });
    await appendCaseEvent(tx, {
      caseId: c.id, tenantId, type: 'case.created',
      payload: { lane: 'TRIAL', vehicle: '11.07' }, actor: 'dev-seed',
    });
    await appendCaseEvent(tx, {
      caseId: c.id, tenantId, type: 'payment.succeeded',
      payload: { paymentId: `dev_seed_${c.id}`, kind: 'review' }, actor: 'dev-seed',
      transition: 'AWAITING_DOCS',
    });
    return c;
  });

  console.log('────────────────────────────────────────────');
  console.log('Dev family ready:');
  console.log(`  sign in : http://localhost:3000/auth/signin`);
  console.log(`  email   : ${EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
  console.log(`  case    : http://localhost:3000/case/${kase.id}/interview`);

  if (process.argv.includes('--gary')) {
    const region = (process.env.AWS_REGION ?? 'us-east-2').replace(/"/g, '');
    const evalBucket = (process.env.EVAL_CORPUS_BUCKET ?? '').replace(/"/g, '');
    const docsBucket = (process.env.S3_BUCKET ?? '').replace(/"/g, '');
    const s3 = new S3Client({ region });
    console.log(`  s3      : region=${region} eval=${evalBucket} docs=${docsBucket}`);

    const listing = await s3.send(
      new ListObjectsV2Command({ Bucket: evalBucket, Prefix: 'corpus/Gary/' })
    );
    const pdfs = (listing.Contents ?? []).filter((o) => o.Key?.toLowerCase().endsWith('.pdf'));
    console.log(`  gary    : copying ${pdfs.length} volumes into the case…`);

    const { enqueueDocument } = await import('../src/services/queue');
    for (const obj of pdfs) {
      const filename = path.basename(obj.Key!);
      const destKey = `cases/${kase.id}/${filename}`;
      await s3.send(
        new CopyObjectCommand({
          Bucket: docsBucket,
          Key: destKey,
          CopySource: `/${evalBucket}/${encodeURIComponent(obj.Key!)}`,
        })
      );
      const doc = await withTenant(tenantId, async (tx) => {
        const d = await tx.document.create({ data: { filename, caseId: kase.id } });
        await appendCaseEvent(tx, {
          caseId: kase.id, tenantId, type: 'doc.uploaded',
          payload: { documentId: d.id }, actor: 'dev-seed',
        });
        return d;
      });
      await enqueueDocument(doc.id, destKey, kase.id);
      console.log(`    queued ${filename} (${((obj.Size ?? 0) / 1048576).toFixed(1)} MB)`);
    }
    console.log('  → run `pnpm --filter api dev` and watch the tracker digitize.');
    console.log('  → then “My records are complete” starts the analysis (needs ANTHROPIC_API_KEY).');
  }
  console.log('────────────────────────────────────────────');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('seed failed:', e.message);
    process.exit(1);
  });
