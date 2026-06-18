import { describe, expect, it } from 'vitest';
import { cos16, sin16 } from './mathsin.js';
import { calcMatrixYXZ } from './matrix.js';

// Element layout (word offsets / 2): m[0..8] = the 3x3 row-major matrix MATH.ASM stores at ds:[di+0..16].
describe('calcMatrixYXZ — verbatim rY*rX*rZ from GLENZ/MATH.ASM:calcmatrix', () => {
  it('is (near-)identity at 0 degrees', () => {
    const m = calcMatrixYXZ(0, 0, 0);
    // Diagonal = cos*cos products ~ 32766 (one ulp under 32767 after the Q15 multiplies); off-diagonal 0.
    expect(m[0]).toBe(32766); // element 0 = Ycos*Zcos
    expect(m[4]).toBe(32766); // element 8 = Xcos*Zcos
    expect(m[8]).toBe(32766); // element 16 = Xcos*Ycos
    expect(m[1]).toBe(0);
    expect(m[2]).toBe(0);
    expect(m[3]).toBe(0);
    expect(m[5]).toBe(0); // element 10 = Xsin = 0 at rx=0
    expect(m[6]).toBe(0);
    expect(m[7]).toBe(0);
  });

  it('m[5] (element 10 = Xsin) tracks sin16(rx)', () => {
    // calcmatrix stores rxsin directly at di+10 (word index 5).
    const rx = 450; // 45 degrees
    const m = calcMatrixYXZ(rx, 0, 0);
    expect(m[5]).toBe(sin16(rx));
  });

  it('matches a hand-evaluated element at 90 degrees (rx=900)', () => {
    // element 10 = Xsin = sin16(900) = 32767.
    const m = calcMatrixYXZ(900, 0, 0);
    expect(m[5]).toBe(32767);
    // element 16 (word 8) = Xcos*Ycos; at rx=900 Xcos=0 -> 0.
    expect(m[8]).toBe(0);
  });

  it('is deterministic and returns 9 int16 words', () => {
    const m = calcMatrixYXZ(123, 456, 789);
    expect(m).toHaveLength(9);
    for (const v of m) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-32768);
      expect(v).toBeLessThanOrEqual(32767);
    }
    expect(Array.from(calcMatrixYXZ(123, 456, 789))).toEqual(Array.from(m));
  });

  it('cos16/sin16 inputs are wrapped via checkdeg (negative and >=3600)', () => {
    expect(Array.from(calcMatrixYXZ(-100, 4000, 3600))).toEqual(
      Array.from(calcMatrixYXZ(3500, 400, 0)),
    );
  });
});
