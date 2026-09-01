import { describe, it, expect } from 'vitest';
import { planZipEntries, ZIP_LIMITS } from '../src/services/zip-ingest.service';
import { validateEventPayload } from '@hg/case-lifecycle';

const MB = 1024 * 1024;
const entry = (name: string, uncompressedBytes = MB, isDirectory = false) => ({
  name,
  isDirectory,
  uncompressedBytes,
});

describe('bulk ZIP entry planning (bulk_zip_upload.md)', () => {
  it('accepts the picker formats, skips junk and unsupported files', () => {
    const plan = planZipEntries([
      entry('records/judgment.pdf'),
      entry('records/vol 3 photo.JPG'),
      entry('records/page.HEIC'),
      entry('records/', 0, true), // directory
      entry('__MACOSX/records/._judgment.pdf'), // macOS resource fork
      entry('.DS_Store'),
      entry('records/notes.docx'), // unsupported
      entry('records/nested.zip'), // one level only
      entry('records/empty.pdf', 0), // zero bytes
    ]);
    expect(plan.accepted.map((a) => a.basename)).toEqual(['judgment.pdf', 'vol 3 photo.JPG', 'page.HEIC']);
    expect(plan.skippedUnsupported).toBe(2); // docx + nested zip
    expect(plan.skippedJunk).toBe(4); // dir + __MACOSX + .DS_Store + zero-byte
  });

  it('counts a zero-byte entry as junk', () => {
    const plan = planZipEntries([entry('a.pdf', 0)]);
    expect(plan.accepted).toHaveLength(0);
    expect(plan.skippedJunk).toBe(1);
  });

  it('zip-bomb bounds: oversized entries and total-size overflow are skipped, never accepted', () => {
    const fill = Math.floor(ZIP_LIMITS.maxTotalUncompressedBytes / ZIP_LIMITS.maxEntryBytes); // 10 × 150MB = the total cap
    const plan = planZipEntries([
      entry('huge.pdf', ZIP_LIMITS.maxEntryBytes + 1), // over the per-entry cap
      ...Array.from({ length: fill }, (_, i) => entry(`a${i}.pdf`, ZIP_LIMITS.maxEntryBytes)),
      entry('overflow.pdf', MB), // any further byte crosses the total cap
      entry('c.jpg', 0.5 * MB), // also over the (now exhausted) total cap
    ]);
    expect(plan.accepted).toHaveLength(fill);
    expect(plan.accepted.some((a) => a.basename === 'huge.pdf' || a.basename === 'overflow.pdf')).toBe(false);
    expect(plan.skippedTooLarge).toBe(3); // huge + overflow + c.jpg
  });

  it('stops at the entry cap and reports the truncation', () => {
    const many = Array.from({ length: ZIP_LIMITS.maxEntries + 5 }, (_, i) => entry(`p${i}.jpg`, 1000));
    const plan = planZipEntries(many);
    expect(plan.accepted).toHaveLength(ZIP_LIMITS.maxEntries);
    expect(plan.truncatedAtEntryCap).toBe(true);
  });

  it('zip.ingested event payload is registered, strict, and counts-only', () => {
    const payload = { accepted: 12, skippedUnsupported: 1, skippedTooLarge: 0, skippedJunk: 3, failed: 0 };
    expect(validateEventPayload('zip.ingested', 1, payload)).toEqual(payload);
    expect(() =>
      validateEventPayload('zip.ingested', 1, { ...payload, filenames: ['smith_v_state.pdf'] })
    ).toThrow(); // PII can never ride along
  });
});
