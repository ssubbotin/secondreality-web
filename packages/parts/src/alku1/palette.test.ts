import { describe, expect, it } from 'vitest';
import { buildAlkuPalette, lerpPalette, TEXT_BASE } from './palette.js';

describe('buildAlkuPalette', () => {
  it('returns a 256-entry, 6-bit VGA palette', () => {
    const p = buildAlkuPalette();
    expect(p.length).toBe(256 * 3);
    for (const v of p) expect(v).toBeLessThanOrEqual(63);
  });

  it('keeps index 0 black (the background)', () => {
    const p = buildAlkuPalette();
    expect([p[0], p[1], p[2]]).toEqual([0, 0, 0]);
  });

  it('places a bright text ramp at TEXT_BASE+1..+3', () => {
    const p = buildAlkuPalette();
    // Levels 1/2/3 brighten toward white so the black→text fade reads.
    const lum = (i: number) => (p[i * 3] ?? 0) + (p[i * 3 + 1] ?? 0) + (p[i * 3 + 2] ?? 0);
    expect(lum(TEXT_BASE + 1)).toBeGreaterThan(0);
    expect(lum(TEXT_BASE + 2)).toBeGreaterThan(lum(TEXT_BASE + 1));
    expect(lum(TEXT_BASE + 3)).toBeGreaterThan(lum(TEXT_BASE + 2));
    expect(lum(TEXT_BASE + 3)).toBeLessThanOrEqual(63 * 3);
  });
});

describe('lerpPalette (dofade port)', () => {
  it('returns pal1 at t=0 and pal2 at t=64', () => {
    const a = new Uint8Array([10, 20, 30]);
    const b = new Uint8Array([40, 50, 60]);
    expect([...lerpPalette(a, b, 0)]).toEqual([10, 20, 30]);
    expect([...lerpPalette(a, b, 64)]).toEqual([40, 50, 60]);
  });

  it('matches the original integer blend (pal1*(64-a) + pal2*a >> 6)', () => {
    const a = new Uint8Array([0, 32, 63]);
    const b = new Uint8Array([63, 0, 0]);
    const t = 16;
    const out = lerpPalette(a, b, t);
    for (let i = 0; i < 3; i++) {
      const expected = ((a[i] ?? 0) * (64 - t) + (b[i] ?? 0) * t) >> 6;
      expect(out[i]).toBe(expected);
    }
  });

  it('clamps t into 0..64', () => {
    const a = new Uint8Array([10]);
    const b = new Uint8Array([40]);
    expect(lerpPalette(a, b, -5)[0]).toBe(10);
    expect(lerpPalette(a, b, 100)[0]).toBe(40);
  });
});
