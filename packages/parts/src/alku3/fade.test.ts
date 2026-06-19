import { describe, expect, it } from 'vitest';
import { CLOSING_STEPS, closingFadeStep, computePicin, REVEAL_STEPS, revealStep } from './fade.js';

/** A small synthetic 6-bit palette: idx0 black, idx1 = (10,20,30), idx255 = (63,40,7). */
function makePalette6(): Uint8Array {
  const p = new Uint8Array(256 * 3);
  p[3] = 10;
  p[4] = 20;
  p[5] = 30;
  p[255 * 3] = 63;
  p[255 * 3 + 1] = 40;
  p[255 * 3 + 2] = 7;
  return p;
}

describe('computePicin (MAIN.C:241, fade1 == 0)', () => {
  it('is palette6 * 256 / 128 = palette6 * 2 per byte', () => {
    const pal = makePalette6();
    const picin = computePicin(pal);
    expect(picin).toHaveLength(768);
    expect(picin[3]).toBe(20); // 10*256/128
    expect(picin[4]).toBe(40); // 20*256/128
    expect(picin[5]).toBe(60); // 30*256/128
    expect(picin[255 * 3]).toBe(126); // 63*256/128
    expect(picin[0]).toBe(0);
  });
});

describe('revealStep (COPPER.ASM 128-step incremental reveal)', () => {
  it('has 129 steps (0..128)', () => {
    expect(REVEAL_STEPS).toBe(129);
  });

  it('step 0 is all black', () => {
    const out = revealStep(0, makePalette6());
    expect(out.length).toBe(768);
    for (let i = 0; i < 768; i++) expect(out[i]).toBe(0);
  });

  it('step 128 lands exactly on the picture palette (frame-exact)', () => {
    const pal = makePalette6();
    const out = revealStep(128, pal);
    for (let i = 0; i < 768; i++) expect(out[i]).toBe(pal[i]);
  });

  it('the high byte is (step * picin) >> 8 at an intermediate step', () => {
    const pal = makePalette6();
    const picin = computePicin(pal);
    const out = revealStep(64, pal);
    for (let i = 0; i < 768; i++) {
      expect(out[i]).toBe((64 * (picin[i] ?? 0)) >> 8);
    }
    // idx1 r=10 -> picin 20 -> 64*20=1280 -> >>8 = 5
    expect(out[3]).toBe(5);
    // idx255 r=63 -> picin 126 -> 64*126=8064 -> >>8 = 31
    expect(out[255 * 3]).toBe(31);
  });

  it('is monotonically non-decreasing per byte across the fade', () => {
    const pal = makePalette6();
    let prev = revealStep(0, pal);
    for (let s = 1; s <= 128; s++) {
      const cur = revealStep(s, pal);
      for (let i = 0; i < 768; i++) expect(cur[i] ?? 0).toBeGreaterThanOrEqual(prev[i] ?? 0);
      prev = cur;
    }
  });

  it('clamps the step index into [0, 128]', () => {
    const pal = makePalette6();
    expect(Array.from(revealStep(-5, pal))).toEqual(Array.from(revealStep(0, pal)));
    expect(Array.from(revealStep(999, pal))).toEqual(Array.from(revealStep(128, pal)));
  });
});

describe('closingFadeStep (dofade, MAIN.C:306-310)', () => {
  it('has 64 steps', () => {
    expect(CLOSING_STEPS).toBe(64);
  });

  it('a=0 is pal1, a=63 is ~pal2 (the original never reaches a=64)', () => {
    const pal1 = makePalette6();
    const pal2 = new Uint8Array(256 * 3).fill(63);
    const at0 = closingFadeStep(0, pal1, pal2);
    for (let i = 0; i < 768; i++) expect(at0[i]).toBe(pal1[i]);
    const at63 = closingFadeStep(63, pal1, pal2);
    // ((pal1*1 + 63*63) >> 6)
    for (let i = 0; i < 768; i++) {
      expect(at63[i]).toBe(((pal1[i] ?? 0) * 1 + 63 * 63) >> 6);
    }
  });

  it('lerps in 6-bit space with the >>6 truncation at the midpoint', () => {
    const pal1 = new Uint8Array(256 * 3); // black
    const pal2 = new Uint8Array(256 * 3);
    pal2[0] = 60;
    const out = closingFadeStep(32, pal1, pal2);
    // (0*(64-32) + 60*32) >> 6 = 1920 >> 6 = 30
    expect(out[0]).toBe(30);
  });

  it('clamps a into [0, 63]', () => {
    const pal1 = makePalette6();
    const pal2 = new Uint8Array(256 * 3).fill(63);
    expect(Array.from(closingFadeStep(-1, pal1, pal2))).toEqual(
      Array.from(closingFadeStep(0, pal1, pal2)),
    );
    expect(Array.from(closingFadeStep(100, pal1, pal2))).toEqual(
      Array.from(closingFadeStep(63, pal1, pal2)),
    );
  });
});
