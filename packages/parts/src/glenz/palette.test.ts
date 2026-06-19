import { describe, expect, it } from 'vitest';
import {
  buildBackpalRamp,
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

describe('buildGlenzRenderPalette — FC backdrop base + glenz coverage brightening', () => {
  // A representative FC ramp: index 0 black, index 1 a dark purple (as in FC.UH), the rest a gradient.
  const backpal = (): Uint8Array => {
    const bp = new Uint8Array(16 * 3);
    bp[3] = 13;
    bp[4] = 9;
    bp[5] = 13; // index 1
    for (let a = 2; a < 16; a++) {
      bp[a * 3] = a * 2;
      bp[a * 3 + 1] = a;
      bp[a * 3 + 2] = a * 2;
    }
    return bp;
  };

  it('a pure FC byte (no glenz bits) renders the FC backdrop colour verbatim', () => {
    const bp = backpal();
    const pal = buildGlenzRenderPalette(bp);
    expect(pal).toHaveLength(768);
    // Index 0: black background pixel stays black.
    expect([pal[0], pal[1], pal[2]]).toEqual([0, 0, 0]);
    // Index 1 (FC dark purple), no coverage bits set above the low nibble -> the FC colour itself.
    expect([pal[3], pal[4], pal[5]]).toEqual([13, 9, 13]);
    // Index 7 (FC nibble, no high/lit bits) -> FC colour 7.
    expect([pal[21], pal[22], pal[23]]).toEqual([bp[21], bp[22], bp[23]]);
  });

  it('brightness rises monotonically as glenz coverage bits accumulate over the FC base', () => {
    const pal = buildGlenzRenderPalette(backpal());
    const lum = (a: number) => (pal[a * 3] ?? 0) + (pal[a * 3 + 1] ?? 0) + (pal[a * 3 + 2] ?? 0);
    // Same FC base nibble (1), increasing glenz bits: lit bit, then one high bit, then more.
    const base = 0b0001;
    expect(lum(base)).toBeLessThan(lum(base | 0x08)); // lit bit adds glass
    expect(lum(base | 0x08)).toBeLessThanOrEqual(lum(base | 0x08 | 0x10));
    expect(lum(base | 0x08 | 0x10)).toBeLessThanOrEqual(lum(base | 0xf8));
  });

  it('never lowers a pixel below its FC base and clamps every component to 63', () => {
    const bp = backpal();
    const pal = buildGlenzRenderPalette(bp);
    for (let a = 0; a < 256; a++) {
      const fcBase = a & 0x0f;
      // The composite must be at least as bright as the FC base in each channel.
      expect(pal[a * 3] ?? 0).toBeGreaterThanOrEqual(bp[fcBase * 3] ?? 0);
      expect(pal[a * 3]).toBeLessThanOrEqual(63);
      expect(pal[a * 3 + 1]).toBeLessThanOrEqual(63);
      expect(pal[a * 3 + 2]).toBeLessThanOrEqual(63);
    }
  });
});
