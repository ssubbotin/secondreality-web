import { describe, expect, it } from 'vitest';
import { buildComanchePalette } from './palette.js';

describe('comanche palette', () => {
  const p = buildComanchePalette();
  const rgb = (i: number): [number, number, number] => [
    p[i * 3] ?? 0,
    p[i * 3 + 1] ?? 0,
    p[i * 3 + 2] ?? 0,
  ];

  it('is 256 RGB triples, all within the 6-bit VGA range', () => {
    expect(p).toHaveLength(256 * 3);
    for (const v of p) expect(v).toBeLessThanOrEqual(63);
  });

  it('matches the MAIN.C oracle at representative indices', () => {
    // [index, r, g, b] emulated directly from MAIN.C's palette build (real SIN1024.INC table).
    const oracle: ReadonlyArray<readonly [number, number, number, number]> = [
      [0, 0, 0, 0],
      [32, 16, 0, 13],
      [64, 4, 4, 33],
      [96, 0, 22, 51],
      [128, 0, 46, 63],
      [160, 0, 63, 63],
      [220, 0, 63, 63],
      [232, 9, 0, 0],
      [239, 6, 0, 0],
      [240, 0, 0, 0], // COMBG band start — overwritten to black
      [247, 0, 0, 0],
      [255, 0, 0, 0],
    ];
    for (const [i, r, g, b] of oracle) expect(rgb(i)).toEqual([r, g, b]);
  });

  it('is a depth/height ramp: dark blue at low indices climbing to bright cyan in the mid band', () => {
    // The terrain raster shades into the gradient region (dl≈50..97 via THELOOP.INC) — NOT the cyan
    // plateau — so these mid indices must form a rising blue→cyan ramp, not all flat cyan.
    expect(rgb(50)).toEqual([12, 0, 24]); // deep purple-blue (near terrain peaks)
    expect(rgb(64)).toEqual([4, 4, 33]); // dim blue
    expect(rgb(80)).toEqual([0, 13, 42]); // blue
    expect(rgb(96)).toEqual([0, 22, 51]); // brighter blue/cyan
    expect(rgb(128)).toEqual([0, 46, 63]); // bright cyan
    // the far plateau (indices ≥152) is genuinely flat cyan in MAIN.C
    expect(rgb(200)).toEqual([0, 63, 63]);
  });

  it('carries the red band in indices 232..239 (a−4 ramp), green/blue zero', () => {
    expect(rgb(232)).toEqual([9, 0, 0]); // a=23 → (23−4)/2 = 9
    expect(rgb(239)).toEqual([6, 0, 0]); // a=16 → (16−4)/2 = 6
    for (let i = 232; i < 240; i++) {
      expect(rgb(i)[1]).toBe(0);
      expect(rgb(i)[2]).toBe(0);
    }
  });

  it('overwrites the COMBG band (indices 240..255) to black (the unpacked COMBG.UH palette is zeroed)', () => {
    for (let i = 240; i < 256; i++) expect(rgb(i)).toEqual([0, 0, 0]);
  });

  it('forces index 0 to black', () => {
    expect(rgb(0)).toEqual([0, 0, 0]);
  });
});
