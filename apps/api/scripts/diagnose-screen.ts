/** Diagnose zero-findings: run ONE screen, capture the RAW model output. */
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
let dir = process.cwd();
while (!fs.existsSync(path.join(dir, '.env')) && dir !== path.dirname(dir)) dir = path.dirname(dir);
dotenv.config({ path: path.join(dir, '.env') });

import Anthropic from '@anthropic-ai/sdk';
import prisma from '@hg/database';

const CASE = 'cmtfunjd10002u733xuw8r7p0';
const SCREEN =
  'You are a forensic-science consultant screening expert testimony for methods now discredited or materially refined (Art. 11.073): bite marks, hair comparison, arson indicators, dog-scent lineups, overstated identification claims.';
const OUTPUT_INSTRUCTIONS = `Respond with ONLY a JSON object: {"findings":[{"category":...,"severity":"dispositive|supportive|background","confidence":0..1,"chunkIndex":<index of the excerpt the finding cites>,"quote":"<VERBATIM text copied from that excerpt>","partA":"<plain English for a family, 8th-grade level, no advice>","partB":"<precise statement for an attorney>"}]}. The quote MUST be copied character-for-character from one excerpt. If nothing qualifies, return {"findings":[]}.`;

(async () => {
  const docs = await prisma.document.findMany({
    where: { caseId: CASE },
    include: { chunks: true },
    orderBy: { createdAt: 'asc' },
  });
  const chunks = docs.flatMap((d) => d.chunks);
  console.log('chunks:', chunks.length, '| sample chunk 0 head:', JSON.stringify(chunks[0]?.content.slice(0, 150)));
  const record = chunks.map((c, i) => `[Excerpt ${i}] ${c.content}`).join('\n\n');

  const client = new Anthropic();
  const response = await client.beta.messages
    .stream({
      model: 'claude-opus-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system:
        'You are a meticulous post-conviction record examiner. You analyze Texas criminal court records exactly as instructed in the final message of each request, and you respond with ONLY the JSON object that instruction specifies.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: record, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: `${SCREEN}\n${OUTPUT_INSTRUCTIONS}` },
          ],
        },
      ],
    })
    .finalMessage();

  console.log('stop_reason:', response.stop_reason, '| model:', response.model);
  console.log('usage:', JSON.stringify(response.usage));
  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  console.log('RAW LENGTH:', raw.length);
  console.log('RAW HEAD (2000):', raw.slice(0, 2000));
  console.log('RAW TAIL (500):', raw.slice(-500));

  const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  try {
    const parsed = JSON.parse(jsonText);
    console.log('JSON PARSE OK — findings count:', parsed.findings?.length);
    if (parsed.findings?.length) console.log('first finding:', JSON.stringify(parsed.findings[0]).slice(0, 400));
  } catch (e) {
    console.log('JSON PARSE FAILED:', (e as Error).message);
  }
  process.exit(0);
})();
