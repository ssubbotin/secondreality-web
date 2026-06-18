import { describe, expect, it } from 'vitest';
import { GlenzFill, type GlenzPolygon, SCREEN_H, SCREEN_W } from './glenz-fill.js';

const px = (buf: Uint8Array, x: number, y: number): number => buf[y * SCREEN_W + x] ?? 0;

// An axis-aligned square polygon (CCW) at [x0,x1]x[y0,y1].
function square(x0: number, y0: number, x1: number, y1: number, color: number): GlenzPolygon {
  return {
    color,
    pts: [
      { sx: x0, sy: y0 },
      { sx: x1, sy: y0 },
      { sx: x1, sy: y1 },
      { sx: x0, sy: y1 },
    ],
  };
}

describe('GlenzFill — additive XOR-run-list fill (GLENZ/NEW.ASM ng_pass2/ng_pass3)', () => {
  it('fills a single convex polygon interior with its colour bits (OR over background)', () => {
    const fill = new GlenzFill();
    const bg = new Uint8Array(SCREEN_W * SCREEN_H); // black background
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    fill.render(out, bg, [square(50, 50, 100, 100, 0x08)]);
    expect(px(out, 75, 75)).toBe(0x08); // interior carries the colour
    expect(px(out, 10, 10)).toBe(0); // outside untouched
  });

  it('overlapping faces combine their bits where they overlap (the additive brighten)', () => {
    const fill = new GlenzFill();
    const bg = new Uint8Array(SCREEN_W * SCREEN_H);
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    // Two squares with disjoint colour bits; overlap region carries both bits => brighter palette entry.
    fill.render(out, bg, [square(40, 40, 90, 90, 0x08), square(70, 70, 120, 120, 0x10)]);
    expect(px(out, 50, 50)).toBe(0x08); // only first
    expect(px(out, 110, 110)).toBe(0x10); // only second
    expect(px(out, 80, 80)).toBe(0x18); // overlap: both bits set (0x08 | 0x10)
  });

  it('ORs the running colour over a non-zero background', () => {
    const fill = new GlenzFill();
    const bg = new Uint8Array(SCREEN_W * SCREEN_H).fill(0x01); // background colour 1 everywhere
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    fill.render(out, bg, [square(50, 50, 100, 100, 0x08)]);
    expect(px(out, 75, 75)).toBe(0x09); // 0x01 | 0x08
    expect(px(out, 10, 10)).toBe(0x01); // background preserved outside
  });

  it('a face drawn twice with the same colour cancels (XOR of coincident edges)', () => {
    const fill = new GlenzFill();
    const bg = new Uint8Array(SCREEN_W * SCREEN_H);
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    const sq = square(50, 50, 100, 100, 0x08);
    fill.render(out, bg, [sq, { ...sq }]);
    // XOR semantics: the same span toggled twice leaves the background showing through.
    expect(px(out, 75, 75)).toBe(0);
  });

  it('clips to the 320x200 field without writing out of bounds', () => {
    const fill = new GlenzFill();
    const bg = new Uint8Array(SCREEN_W * SCREEN_H);
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    expect(() => fill.render(out, bg, [square(-50, -50, 400, 400, 0x08)])).not.toThrow();
    expect(px(out, 160, 100)).toBe(0x08); // centre filled
  });
});
