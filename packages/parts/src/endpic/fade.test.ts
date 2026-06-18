import { describe, expect, it } from 'vitest';
import { FADE_STEPS, fadeStep } from './fade.js';

/** A small synthetic 6-bit palette: idx0 black, idx1 = (10,20,30), idx255 = (50,41,33). */
function makePalette6(): Uint8Array {
  const p = new Uint8Array(256 * 3);
  p[3] = 10;
  p[4] = 20;
  p[5] = 30;
  p[255 * 3] = 50;
  p[255 * 3 + 1] = 41;
  p[255 * 3 + 2] = 33;
  return p;
}

describe('fadeStep (BEG.C white flash -> picture palette)', () => {
  it('has 129 steps (c = 0..128)', () => {
    expect(FADE_STEPS).toBe(129);
  });

  it('step 0 is a full white flash (every touched component = 63)', () => {
    const out = fadeStep(0, makePalette6());
    expect(out.length).toBe(768);
    // BEG.C touches a = 0..764; the last 3 bytes stay cleared (0)
    for (let a = 0; a < 768 - 3; a++) expect(out[a]).toBe(63);
    expect([out[765], out[766], out[767]]).toEqual([0, 0, 0]);
  });

  it('step 128 reaches the real palette (except the untouched 3-byte tail)', () => {
    const pal = makePalette6();
    const out = fadeStep(128, pal);
    for (let a = 0; a < 768 - 3; a++) expect(out[a]).toBe(pal[a]);
    // BEG.C's `a < 768-3` leaves index 255's RGB cleared to black
    expect([out[765], out[766], out[767]]).toEqual([0, 0, 0]);
  });

  it('lerps in 6-bit space with C integer truncation (midpoint c=64)', () => {
    const pal = makePalette6();
    const out = fadeStep(64, pal);
    // idx0 black: ((128-64)*63 + 0*64)/128 = 31
    expect([out[0], out[1], out[2]]).toEqual([31, 31, 31]);
    // idx1 = (10,20,30): ((64)*63 + v*64)/128 = (4032 + v*64)/128
    const lerp = (v: number) => Math.trunc((64 * 63 + v * 64) / 128);
    expect([out[3], out[4], out[5]]).toEqual([lerp(10), lerp(20), lerp(30)]);
  });

  it('clamps the step index into [0, 128]', () => {
    const pal = makePalette6();
    expect(Array.from(fadeStep(-5, pal))).toEqual(Array.from(fadeStep(0, pal)));
    expect(Array.from(fadeStep(999, pal))).toEqual(Array.from(fadeStep(128, pal)));
  });
});
