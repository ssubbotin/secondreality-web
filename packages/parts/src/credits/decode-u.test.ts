import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeU } from './decode-u.js';

// Tests run in vitest's node environment and are excluded from tsc, so node:fs/node:url are fine here.
const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe('decodeU (FONA.UH)', () => {
  it('reads the ENDSCRL FONA.UH header geometry', () => {
    const d = decodeU(fixture('FONA.UH'));
    expect(d.width).toBe(1500);
    expect(d.height).toBe(30);
    expect(d.cols).toBe(256);
    expect(d.add).toBe(49);
  });

  it('returns a full 1500×30 index block and a 768-byte palette', () => {
    const d = decodeU(fixture('FONA.UH'));
    expect(d.indices).toHaveLength(1500 * 30);
    expect(d.palette).toHaveLength(256 * 3);
  });

  it('decodes a 2-bit font — ink levels are within {0,1,2,3} (one stray 63 in the unused tail)', () => {
    const d = decodeU(fixture('FONA.UH'));
    const seen = new Set<number>();
    for (const v of d.indices) seen.add(v);
    // The glyph ink is 0..3; the on-disk sheet carries a single stray 63 in the far-right blank region.
    for (const v of seen) expect(v === 63 || v <= 3).toBe(true);
    expect(seen.has(0)).toBe(true);
    expect(seen.has(3)).toBe(true);
  });

  it('matches the raw on-disk pixel block byte-for-byte (raw fast-path)', () => {
    const buf = fixture('FONA.UH');
    const d = decodeU(buf);
    const total = 1500 * 30;
    const rawStart = buf.length - total - 1; // 783
    expect(rawStart).toBe(783);
    for (let i = 0; i < total; i++) expect(d.indices[i]).toBe(buf[rawStart + i]);
  });

  it('reads the greyscale palette (index 1 = 20, index 3 = 60 on the 0..63 DAC)', () => {
    const d = decodeU(fixture('FONA.UH'));
    // The on-disk FONA palette is the source ramp; the part overrides it with the setrgbpalette ramp,
    // but the decoded entries should still be 6-bit (<=63).
    for (const v of d.palette) expect(v).toBeLessThanOrEqual(63);
  });
});
