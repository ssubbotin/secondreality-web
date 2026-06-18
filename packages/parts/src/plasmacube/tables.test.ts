import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildKosinit,
  buildRata,
  buildSini,
  buildSinit,
  buildSplineCoef,
  RATA_COUNT,
} from './tables.js';

// Tests run in vitest's node environment and are excluded from tsc (parts tsconfig excludes *.test.ts),
// so node:fs/node:url are fine here without @types/node.
const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe('plasmacube tables', () => {
  it('buildSinit reproduces SINIT.DAT byte-for-byte (1280 Int16LE words)', () => {
    const dat = fixture('SINIT.DAT');
    const sinit = buildSinit();
    expect(sinit).toHaveLength(1280);
    expect(dat.length).toBe(1280 * 2);
    for (let i = 0; i < 1280; i++) expect(sinit[i]).toBe(dat.readInt16LE(i * 2));
  });

  it('sinit peaks at +32766 (index 256); the negative half carries the +1 generator bias', () => {
    const sinit = buildSinit();
    expect(sinit[256]).toBe(32766);
    // The trough is −32765, not −32766: the shipped table's negative half is one larger than a plain
    // negation (the generator biased the magnitude). This is exactly what makes the byte match above.
    expect(sinit[768]).toBe(-32765);
    expect(sinit[0]).toBe(0);
    expect(sinit[512]).toBe(0);
  });

  it('kosinit is sinit shifted by 256 (the quarter-phase cosine), and equals +32766 at index 0', () => {
    const sinit = buildSinit();
    const kosinit = buildKosinit(sinit);
    expect(kosinit).toHaveLength(1024);
    expect(kosinit[0]).toBe(sinit[256]);
    expect(kosinit[0]).toBe(32766);
    for (let i = 0; i < 1024; i++) expect(kosinit[i]).toBe(sinit[i + 256]);
  });

  it('buildSplineCoef has 1024 words; each sub-position basis sums to ≈2^15', () => {
    const c = buildSplineCoef();
    expect(c).toHaveLength(1024);
    for (const p of [0, 1, 64, 128, 200, 255]) {
      const sum = (c[p] ?? 0) + (c[p + 256] ?? 0) + (c[p + 512] ?? 0) + (c[p + 768] ?? 0);
      expect(sum).toBeGreaterThanOrEqual(32760);
      expect(sum).toBeLessThanOrEqual(32768);
    }
    // Verbatim spot-checks from SPLINE.INC.
    expect(c[4]).toBe(2);
    expect(c[510]).toBe(16179); // the table peak
    expect(c[1023]).toBe(0);
  });

  it('buildRata has 136 control points; the first/last and the kkk-scaling are verbatim', () => {
    const rata = buildRata();
    expect(rata).toHaveLength(RATA_COUNT);
    expect(RATA_COUNT).toBe(136);
    expect(rata[0]).toEqual([0, 2000, 500, 0, 400, 600, 0, 0]);
    expect(rata[5]).toEqual([0, -150, 500, 500, 700, 500, 0, 0]);
    expect(rata[35]).toEqual([0, 0, 500, 100, 100, 100, 192, 512]);
    // The REPT-100 tail.
    expect(rata[36]).toEqual([0, 0, 500, 0, 0, 0, 256, 512]);
    expect(rata[135]).toEqual([0, 0, 500, 0, 0, 0, 256, 512]);
  });

  it('buildSini is a truncated 127-amplitude sine of length 1524', () => {
    const sini = buildSini();
    expect(sini).toHaveLength(1524);
    expect(sini[0]).toBe(0);
    // a/1024·π·4 = π/2 at a = 128 → sin = 1 → trunc(127) = 127.
    expect(sini[128]).toBe(127);
    // peak magnitude never exceeds 127.
    for (let a = 0; a < 1524; a++) expect(Math.abs(sini[a] ?? 0)).toBeLessThanOrEqual(127);
  });
});
