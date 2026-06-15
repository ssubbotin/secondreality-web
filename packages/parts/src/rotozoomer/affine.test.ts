import { describe, expect, it } from 'vitest';
import { ASPECT, affineBasis } from './affine.js';

describe('rotozoomer affine', () => {
  it('θ=0, scale=1 (xa=0, ya=1024): identity columns, aspect on rows', () => {
    const b = affineBasis({ x: 0, y: 0, xa: 0, ya: 1024 });
    expect(b.startUV).toEqual([0, 0]);
    expect(b.colStep[0]).toBeCloseTo(1, 6); // ya·S
    expect(b.colStep[1]).toBeCloseTo(0, 6); // −xa·S
    expect(b.rowStep[0]).toBeCloseTo(0, 6); // xa·S·ASPECT
    expect(b.rowStep[1]).toBeCloseTo(ASPECT, 6); // ya·S·ASPECT = 307/256
  });

  it('θ=90° (xa=−1024, ya=0): columns down, rows left·aspect', () => {
    const b = affineBasis({ x: 5, y: 7, xa: -1024, ya: 0 });
    expect(b.startUV).toEqual([5, 7]);
    expect(b.colStep[0]).toBeCloseTo(0, 6);
    expect(b.colStep[1]).toBeCloseTo(1, 6); // −xa·S = 1
    expect(b.rowStep[0]).toBeCloseTo(-ASPECT, 6); // xa·S·ASPECT
    expect(b.rowStep[1]).toBeCloseTo(0, 6);
  });
});
