import { describe, expect, it } from 'vitest';
import { buildAlkuPalette, lerpPalette, TEXT_BASE } from './palette.js';

/** A 256×3 6-bit source palette where index i has component (i & 63) on all channels. */
function fakeHoiPalette(): Uint8Array {
  const p = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i & 63;
    p[i * 3] = v;
    p[i * 3 + 1] = v;
    p[i * 3 + 2] = v;
  }
  return p;
}

describe('buildAlkuPalette (palette2 port, MAIN.C:184-209)', () => {
  it('returns a 256-entry, 6-bit VGA palette', () => {
    const p = buildAlkuPalette(fakeHoiPalette());
    expect(p.length).toBe(256 * 3);
    for (const v of p) expect(v).toBeLessThanOrEqual(63);
  });

  it('keeps band 0 (indices 0..63) as the verbatim picture colours', () => {
    const hoi = fakeHoiPalette();
    const p = buildAlkuPalette(hoi);
    for (let i = 0; i < 64 * 3; i++) expect(p[i]).toBe(hoi[i]);
  });

  it('tints the brightest band more than the dimmest for the same base index', () => {
    const hoi = fakeHoiPalette();
    const p = buildAlkuPalette(hoi);
    const bandBase = (band: number, baseIdx: number) => (band * 64 + baseIdx) * 3;
    // Picture index 40, band 3 (ink colour 3) tints more than band 1 (ink colour 1).
    expect(p[bandBase(3, 40)] ?? 0).toBeGreaterThanOrEqual(p[bandBase(1, 40)] ?? 0);
    expect(TEXT_BASE).toBe(0x40);
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
