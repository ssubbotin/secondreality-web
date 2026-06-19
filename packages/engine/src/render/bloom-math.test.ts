import { describe, expect, it } from 'vitest';
import { blurKernel, brightPass, gaussianWeights } from './bloom-math.js';

describe('gaussianWeights', () => {
  it('peaks at the centre and falls off monotonically', () => {
    const w = gaussianWeights(4);
    expect(w).toHaveLength(5); // w[0..4]
    expect(w[0]).toBe(1); // exp(0) = 1, un-normalised centre
    for (let i = 1; i < w.length; i++) {
      expect(w[i]).toBeLessThan(w[i - 1] ?? 0);
      expect(w[i]).toBeGreaterThan(0);
    }
  });

  it('a larger sigma flattens the falloff (more weight in the wings)', () => {
    const tight = gaussianWeights(4, 1);
    const wide = gaussianWeights(4, 3);
    expect(wide[4] ?? 0).toBeGreaterThan(tight[4] ?? 0);
  });

  it('rejects a non-positive or non-integer radius and a non-positive sigma', () => {
    expect(() => gaussianWeights(0)).toThrow(RangeError);
    expect(() => gaussianWeights(2.5)).toThrow(RangeError);
    expect(() => gaussianWeights(2, 0)).toThrow(RangeError);
  });
});

describe('blurKernel', () => {
  it('is symmetric, spans [-radius, +radius], and normalises to 1', () => {
    const r = 5;
    const taps = blurKernel(r);
    expect(taps).toHaveLength(2 * r + 1);
    expect(taps[0]?.offset).toBe(-r);
    expect(taps[taps.length - 1]?.offset).toBe(r);
    const sum = taps.reduce((acc, t) => acc + t.weight, 0);
    expect(sum).toBeCloseTo(1, 12);
    // mirror symmetry: tap at -i weighs the same as the tap at +i
    for (let i = 1; i <= r; i++) {
      const lo = taps.find((t) => t.offset === -i)?.weight ?? 0;
      const hi = taps.find((t) => t.offset === i)?.weight ?? 0;
      expect(lo).toBeCloseTo(hi, 12);
    }
  });

  it('weights the centre tap heaviest', () => {
    const taps = blurKernel(4);
    const centre = taps.find((t) => t.offset === 0)?.weight ?? 0;
    for (const t of taps) {
      if (t.offset !== 0) expect(centre).toBeGreaterThanOrEqual(t.weight);
    }
  });
});

describe('brightPass', () => {
  it('suppresses below the knee and passes through above it', () => {
    expect(brightPass(0.1, 0.7, 0.2)).toBe(0); // <= 0.5
    expect(brightPass(1.0, 0.7, 0.2)).toBe(1.0); // >= 0.9, unchanged
  });

  it('ramps smoothly inside the knee band', () => {
    const mid = brightPass(0.7, 0.7, 0.2); // exact threshold → smoothstep(0.5) = 0.5 → 0.7*0.5
    expect(mid).toBeCloseTo(0.35, 6);
    // monotonic non-decreasing across the band
    let prev = -1;
    for (let v = 0.5; v <= 0.9; v += 0.05) {
      const out = brightPass(v, 0.7, 0.2);
      expect(out).toBeGreaterThanOrEqual(prev);
      prev = out;
    }
  });

  it('a zero knee is a hard threshold', () => {
    expect(brightPass(0.69, 0.7, 0)).toBe(0);
    expect(brightPass(0.71, 0.7, 0)).toBe(0.71);
  });

  it('rejects a negative knee', () => {
    expect(() => brightPass(1, 0.5, -0.1)).toThrow(RangeError);
  });
});
