import { describe, expect, it } from 'vitest';
import {
  INITTABLE_K,
  INITTABLE_L,
  K_DELTAS,
  L_DELTAS,
  moveplz,
  moveplzL,
  sectionsPassed,
  TIMETABLE,
} from './phase.js';

describe('plasma phase', () => {
  it('moveplz applies the verbatim per-frame deltas mod 4096', () => {
    const k = moveplz([3500, 2300, 3900, 3670]);
    expect(k).toEqual([3500 - 3, 2300 - 2, 3900 + 1, 3670 + 2]);
    expect(K_DELTAS).toEqual([-3, -2, 1, 2]);
  });

  it('moveplz wraps each param into [0,4096)', () => {
    expect(moveplz([1, 1, 4095, 4094])).toEqual([4094, 4095, 0, 0]); // -3→4094... +1→0, +2→0
  });

  it('moveplzL applies the l deltas mod 4096 (the interlaced set)', () => {
    expect(L_DELTAS).toEqual([-1, -2, 2, 3]);
    expect(moveplzL([1000, 2000, 3000, 4000])).toEqual([999, 1998, 3002, 4003]);
    expect(moveplzL([0, 1, 4094, 4093])).toEqual([4095, 4095, 0, 0]); // -1→4095... +2→0, +3→0
  });

  it('TIMETABLE and INITTABLE_K/L match the original', () => {
    expect(TIMETABLE).toEqual([723, 1491, 1875, 2259, 2778]);
    expect(INITTABLE_K[0]).toEqual([3500, 2300, 3900, 3670]);
    expect(INITTABLE_K[1]).toEqual([1500, 2300, 3900, 1670]);
    expect(INITTABLE_K).toHaveLength(5);
    expect(INITTABLE_L[0]).toEqual([1000, 2000, 3000, 4000]);
    expect(INITTABLE_L[2]).toEqual([3500, 1000, 3000, 1000]);
    expect(INITTABLE_L).toHaveLength(5);
  });

  it('sectionsPassed counts thresholds crossed', () => {
    expect(sectionsPassed(0)).toBe(0);
    expect(sectionsPassed(722)).toBe(0);
    expect(sectionsPassed(723)).toBe(1);
    expect(sectionsPassed(2000)).toBe(3);
    expect(sectionsPassed(99999)).toBe(5);
  });
});
