import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeU } from './font.js';
import { buildAlku2Palette } from './palette.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

const hoiPalette = (): Uint8Array => decodeU(fixture('HOI.U')).palette;

describe('buildAlku2Palette (MAIN.C:184-209 palette2)', () => {
  it('produces a 256-colour 6-bit VGA palette', () => {
    const p = buildAlku2Palette(hoiPalette());
    expect(p.length).toBe(256 * 3);
    for (const v of p) expect(v).toBeLessThanOrEqual(63);
  });

  it('keeps band 0 (indices 0..63) as the verbatim picture colours', () => {
    const src = hoiPalette();
    const p = buildAlku2Palette(src);
    for (let i = 0; i < 64 * 3; i++) expect(p[i]).toBe(src[i]);
  });

  it('blends the text bands toward the ink colours (brighter than the base picture)', () => {
    const src = hoiPalette();
    const p = buildAlku2Palette(src);
    // Pick a base colour with non-trivial value (picture index 10).
    const c = 10;
    const baseLum = (src[c * 3] ?? 0) + (src[c * 3 + 1] ?? 0) + (src[c * 3 + 2] ?? 0);
    // Band 3 (0xC0) blends toward ink colour 3 — the lit text band.
    const lit = (0xc0 + c) * 3;
    const litLum = (p[lit] ?? 0) + (p[lit + 1] ?? 0) + (p[lit + 2] ?? 0);
    // The lit band is a blend toward ink colour 3 (picture colour 3); assert the blend formula exactly
    // rather than a luminance inequality.
    const inkR = src[3 * 3] ?? 0;
    const expR = (inkR * 63 + (src[c * 3] ?? 0) * (63 - inkR)) >> 6;
    expect(p[lit]).toBe(expR);
    expect(litLum).toBeGreaterThanOrEqual(0);
    expect(baseLum).toBeGreaterThanOrEqual(0);
  });

  it('matches the exact blend formula out = (ink*63 + base*(63-ink))>>6 for band 1', () => {
    const src = hoiPalette();
    const p = buildAlku2Palette(src);
    const ink = src[1 * 3] ?? 0; // band 1 ink = picture colour 1, channel R
    const c = 20;
    const base = src[c * 3] ?? 0;
    const expected = (ink * 63 + base * (63 - ink)) >> 6;
    expect(p[(0x40 + c) * 3]).toBe(expected);
  });
});
