import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { paletteToRgba, parsePalette } from './palette.js';

const RAW = new Uint8Array(
  readFileSync(fileURLToPath(new URL('./__fixtures__/U2E.PAL', import.meta.url))),
);

describe('U2E palette', () => {
  const pal = parsePalette(RAW);

  it('is 256 RGB triplets', () => {
    expect(pal.length).toBe(256 * 3);
  });

  it('keeps index 0 black (the background/clear colour)', () => {
    expect([pal[0], pal[1], pal[2]]).toEqual([0, 0, 0]);
  });

  it('expands 6-bit DAC values ×4 into an 8-bit RGBA LUT', () => {
    const rgba = paletteToRgba(pal);
    // Index 1 of U2E.PAL is the start of the grey ramp (0x0f,0x0b,0x0b) → ×4.
    expect(rgba[1 * 4]).toBe((pal[3] ?? 0) * 4);
    expect(rgba[1 * 4 + 3]).toBe(255);
    expect(rgba.length).toBe(256 * 4);
  });
});
