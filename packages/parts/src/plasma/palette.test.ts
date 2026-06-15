// packages/parts/src/plasma/palette.test.ts
import { describe, expect, it } from 'vitest';
import { buildPlasmaPalettes, crossFade, PALETTE_COUNT } from './palette.js';
import { buildPtau } from './tables.js';

describe('plasma palettes', () => {
  const pals = buildPlasmaPalettes(buildPtau());

  it('builds 5 palettes of 256 RGB triples in 0..63, colour 0 black', () => {
    expect(pals).toHaveLength(PALETTE_COUNT);
    for (const p of pals) {
      expect(p).toHaveLength(256 * 3);
      expect([p[0], p[1], p[2]]).toEqual([0, 0, 0]); // colour 0 = black
      for (const v of p) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(63);
    }
  });

  it('palette 0 (RGB) ramps red on the first band', () => {
    const ptau = buildPtau();
    // init_plz pals[0]: colour 1 = (ptau[1], ptau[0], ptau[0]) = (ptau[1], 0, 0)
    expect(pals[0]![1 * 3]).toBe(ptau[1]);
    expect(pals[0]![1 * 3 + 1]).toBe(0);
    expect(pals[0]![1 * 3 + 2]).toBe(0);
  });

  it('crossFade endpoints return the source and target verbatim', () => {
    const a = pals[0]!;
    const b = pals[1]!;
    expect(Array.from(crossFade(a, b, 0))).toEqual(Array.from(a));
    expect(Array.from(crossFade(a, b, 1))).toEqual(Array.from(b));
    const mid = crossFade(a, b, 0.5);
    expect(mid[300]).toBe(Math.round((a[300]! + b[300]!) / 2));
  });
});
