import { describe, expect, it } from 'vitest';
import {
  buildBackpalRamp,
  buildCopperBackground,
  buildGlenzPalette,
  buildGlenzRenderPalette,
  faceBrightness,
} from './palette.js';

describe('buildGlenzPalette — verbatim MAIN.C tmppal build (256-entry copper/glenz LUT)', () => {
  it('maps indices 0..15 straight to the background ramp', () => {
    const backpal = buildBackpalRamp();
    const pal = buildGlenzPalette(backpal);
    expect(pal).toHaveLength(768);
    for (let a = 0; a < 16; a++) {
      expect(pal[a * 3]).toBe(backpal[a * 3]);
      expect(pal[a * 3 + 1]).toBe(backpal[a * 3 + 1]);
      expect(pal[a * 3 + 2]).toBe(backpal[a * 3 + 2]);
    }
  });

  it('indices >=16 reuse background colour (a&7); bit 8 adds +16 (the lit/glenz half)', () => {
    const backpal = buildBackpalRamp();
    const pal = buildGlenzPalette(backpal);
    const a = 0b11010; // 26: a&7 = 2, a&8 = 8 -> base colour 2 + 16
    const base = 2;
    expect(pal[a * 3]).toBe(Math.min(63, (backpal[base * 3] ?? 0) + 16));
    expect(pal[a * 3 + 1]).toBe(Math.min(63, (backpal[base * 3 + 1] ?? 0) + 16));
    expect(pal[a * 3 + 2]).toBe(Math.min(63, (backpal[base * 3 + 2] ?? 0) + 16));
  });

  it('index >=16 without bit 8 set: just background colour a&7, no +16', () => {
    const backpal = buildBackpalRamp();
    const pal = buildGlenzPalette(backpal);
    const a = 0b10101; // 21: a&7 = 5, a&8 = 0
    const base = 5;
    expect(pal[a * 3]).toBe(backpal[base * 3]);
  });

  it('clamps every component to 63', () => {
    const backpal = new Uint8Array(16 * 3).fill(60);
    const pal = buildGlenzPalette(backpal);
    for (let i = 0; i < 768; i++) expect(pal[i]).toBeLessThanOrEqual(63);
  });
});

describe('faceBrightness — verbatim GLENZ/VEC.ASM:demo_glz intensity', () => {
  it('lightshift 9: brightness = cross >> 7, clamped to [0,63]', () => {
    expect(faceBrightness(60 << 7, 9)).toBe(60); // 60 in-range
    expect(faceBrightness(1 << 14, 9)).toBe(63); // (1<<14)>>7 = 128 -> clamps to 63
    expect(faceBrightness(1 << 20, 9)).toBe(63); // clamps high
    expect(faceBrightness(-5, 9)).toBe(0); // clamps negative
  });

  it('non-9 lightshift uses the (cross>>8)+(cross>>9) blend, clamped', () => {
    const cross = 1 << 15;
    const want = Math.min(63, Math.max(0, (cross >> 8) + (cross >> 9)));
    expect(faceBrightness(cross, 10)).toBe(want);
  });
});

describe('buildGlenzRenderPalette — coverage-brightening glass LUT (modern compromise)', () => {
  it('index 0 is black; brightness rises monotonically with coverage', () => {
    const pal = buildGlenzRenderPalette();
    expect(pal).toHaveLength(768);
    expect([pal[0], pal[1], pal[2]]).toEqual([0, 0, 0]);
    const lum = (a: number) => (pal[a * 3] ?? 0) + (pal[a * 3 + 1] ?? 0) + (pal[a * 3 + 2] ?? 0);
    // More coverage bits => brighter (one bit < three bits < the lit-plus-bits high indices).
    expect(lum(0b0001)).toBeLessThan(lum(0b0111));
    expect(lum(0b0111)).toBeLessThanOrEqual(lum(0b1111));
    for (let i = 0; i < 768; i++) expect(pal[i]).toBeLessThanOrEqual(63);
  });
});

describe('buildCopperBackground — procedural copper bars (FC picture deferred)', () => {
  it('fills each scanline with a low copper-ramp index, constant across a row', () => {
    const bg = buildCopperBackground(320, 200, 0);
    expect(bg).toHaveLength(320 * 200);
    for (let y = 0; y < 200; y++) {
      const v = bg[y * 320] ?? -1;
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(7);
      expect(bg[y * 320 + 319]).toBe(v); // constant across the row
    }
  });

  it('phase shifts the bars', () => {
    const a = buildCopperBackground(320, 200, 0);
    const b = buildCopperBackground(320, 200, 64);
    let differs = false;
    for (let y = 0; y < 200; y++) if (a[y * 320] !== b[y * 320]) differs = true;
    expect(differs).toBe(true);
  });
});
