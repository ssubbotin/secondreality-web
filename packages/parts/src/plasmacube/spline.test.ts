import { describe, expect, it } from 'vitest';
import { getspl } from './spline.js';
import { buildRata, buildSplineCoef } from './tables.js';

const coef = buildSplineCoef();
const rata = buildRata();

describe('getspl spline interpolation', () => {
  it('interpolates the RATA path at frame 0 (position 4·256)', () => {
    const s = getspl(4 * 256, coef, rata);
    expect(s).toEqual({
      tx: 0,
      ty: 432,
      dis: 499,
      kx: 499,
      ky: 699,
      kz: 499,
      lsKx: 0,
      lsKy: 0,
    });
  });

  it('matches the verbatim getspl arithmetic at later spline positions', () => {
    // vect() calls getspl(4*256 + frames*4); these are frames 50 and 150.
    expect(getspl(1024 + 50 * 4, coef, rata)).toEqual({
      tx: 0,
      ty: -21,
      dis: 499,
      kx: 580,
      ky: 619,
      kz: 419,
      lsKx: 0,
      lsKy: 0,
    });
    expect(getspl(1024 + 150 * 4, coef, rata)).toEqual({
      tx: 0,
      ty: 0,
      dis: 499,
      kx: 725,
      ky: 467,
      kz: 267,
      lsKx: 14,
      lsKy: 0,
    });
  });

  it('clamps to the static tail well past the path end (no out-of-range control read)', () => {
    const tail = getspl(135 * 256, coef, rata);
    // The whole tail is the static point {0,0,500, 0,0,0, 256,512}; interpolation of identical points
    // returns that point scaled by the basis sum (≈2^15) >> 15.
    expect(tail.dis).toBe(499);
    expect(tail.kx).toBe(0);
    expect(tail.ky).toBe(0);
    expect(tail.lsKx).toBe(255);
    expect(tail.lsKy).toBe(511);
  });
});
