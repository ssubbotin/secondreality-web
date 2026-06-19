import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeRix } from './picture.js';

// Tests run in vitest's node env (parts tsconfig excludes *.test.ts), so node:fs/url are fine here.
const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe('decodeRix', () => {
  it('decodes BKG.CLX (the tausta background) as 320×200 with a 6-bit VGA palette', () => {
    const raw = fixture('BKG.CLX');
    const pic = decodeRix(new Uint8Array(raw));
    expect(pic.width).toBe(320);
    expect(pic.height).toBe(200);
    expect(pic.palette).toHaveLength(768);
    expect(pic.pixels).toHaveLength(320 * 200);
    // 6-bit VGA DAC values must be ≤ 63 (we scale ×4 at render).
    expect(Math.max(...pic.palette)).toBeLessThanOrEqual(63);
    // Header bytes carry the magic + dimensions; pixels start at offset 778 verbatim.
    expect(pic.pixels[0]).toBe(raw[778]);
    expect(pic.pixels[320 * 200 - 1]).toBe(raw[778 + 320 * 200 - 1]);
  });

  it('decodes FONT.CLX (the 400×34 scroll font strip) with the demo palette', () => {
    const pic = decodeRix(new Uint8Array(fixture('FONT.CLX')));
    expect(pic.width).toBe(400);
    expect(pic.height).toBe(34);
    expect(pic.pixels).toHaveLength(400 * 34);
    expect(Math.max(...pic.palette)).toBeLessThanOrEqual(63);
    // The font strip carries actual glyph pixels.
    expect(pic.pixels.some((v) => v !== 0)).toBe(true);
  });

  it('rejects a non-RIX3 blob', () => {
    const bad = new Uint8Array(800);
    bad.set([0x46, 0x4f, 0x4f, 0x21]); // 'FOO!'
    expect(() => decodeRix(bad)).toThrow(/RIX3/);
  });
});
