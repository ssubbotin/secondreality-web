import { describe, expect, it } from 'vitest';
import { calcMatrixYXZ } from './matrix.js';
import {
  faceCross,
  type Point3,
  PROJ_320,
  projectPoints,
  rotatePoints,
  scaleMatrix,
} from './vec.js';

const pts = (...xyz: number[]): Int32Array => {
  const t = new Int32Array(xyz.length);
  t.set(xyz);
  return t;
};

describe('rotatePoints — verbatim GLENZ/VEC.ASM:rotlist (M*p>>15 + translate)', () => {
  it('identity matrix + translation just translates', () => {
    // m = pure scale 1.0 in Q15 (32767 on the diagonal) ~ identity.
    const m = calcMatrixYXZ(0, 0, 0); // ~32766 diagonal
    const src = pts(1000, 2000, 3000);
    const out = rotatePoints(m, src, 1, 10, 20, 30);
    // (1000*32766)>>15 = 999 (truncation), + translation.
    expect(out[0]).toBe(((1000 * 32766) >> 15) + 10);
    expect(out[1]).toBe(((2000 * 32766) >> 15) + 20);
    expect(out[2]).toBe(((3000 * 32766) >> 15) + 30);
  });

  it('a 90-degree Y rotation maps +X toward -Z (right-handed sense of the asm)', () => {
    const m = calcMatrixYXZ(0, 900, 0);
    const out = rotatePoints(m, pts(10000, 0, 0), 1, 0, 0, 0);
    // x' ~ 0, z' ~ ±x. Magnitude preserved up to fixed-point drift.
    expect(Math.abs(out[0] ?? 0)).toBeLessThan(20);
    expect(Math.abs(Math.abs(out[2] ?? 0) - 10000)).toBeLessThan(5);
  });

  it('scaleMatrix builds the diagonal scale*64 matrix the driver uses', () => {
    const m = scaleMatrix(120, 120, 120);
    expect(m[0]).toBe(120 * 64);
    expect(m[4]).toBe(120 * 64);
    expect(m[8]).toBe(120 * 64);
    expect(m[1]).toBe(0);
  });
});

describe('projectPoints — verbatim GLENZ/VEC.ASM:projlist (perspective idiv + clamp)', () => {
  it('projects a centred point to the screen centre', () => {
    const p: Point3 = projectPoints(pts(0, 0, 1500), PROJ_320)[0] ?? { sx: 0, sy: 0, z: 0, flags: 0 };
    expect(p.sx).toBe(160); // projxadd
    expect(p.sy).toBe(130); // projyadd
  });

  it('uses idiv (truncates toward zero) with projxmul/projymul', () => {
    const p: Point3 = projectPoints(pts(3000, -3000, 1500), PROJ_320)[0] ?? {
      sx: 0,
      sy: 0,
      z: 0,
      flags: 0,
    };
    // sx = trunc(3000*256/1500) + 160 = 512 + 160 = 672 -> off the right edge (flag set).
    expect(p.sx).toBe(Math.trunc((3000 * 256) / 1500) + 160);
    expect(p.sy).toBe(Math.trunc((-3000 * 213) / 1500) + 130);
    expect(p.z).toBe(1500);
  });

  it('clamps z to projminz (128) for near points', () => {
    const p: Point3 = projectPoints(pts(100, 0, 10), PROJ_320)[0] ?? { sx: 0, sy: 0, z: 0, flags: 0 };
    // divided by 128 not 10; z stored is the original 10.
    expect(p.sx).toBe(Math.trunc((100 * 256) / 128) + 160);
    expect(p.z).toBe(10);
    expect(p.flags & 16).toBe(16); // near-clip flag
  });
});

describe('faceCross — verbatim GLENZ/VEC.ASM:checkhiddenbx (signed 2D cross = facing + brightness)', () => {
  it('CCW screen triangle is front-facing (cross >= 0)', () => {
    // v0=(0,0) v1=(10,0) v2=(0,10): (x0-x1)(y0-y2)-(y0-y1)(x0-x2) = (-10)(-10)-(0)(-... )
    const { hidden } = faceCross(
      { sx: 0, sy: 0 },
      { sx: 10, sy: 0 },
      { sx: 0, sy: 10 },
    );
    expect(hidden).toBe(false);
  });

  it('CW screen triangle is back-facing (hidden)', () => {
    const { hidden } = faceCross(
      { sx: 0, sy: 0 },
      { sx: 0, sy: 10 },
      { sx: 10, sy: 0 },
    );
    expect(hidden).toBe(true);
  });

  it('returns the signed 32-bit cross magnitude used by demo_glz for brightness', () => {
    const { cross } = faceCross({ sx: 0, sy: 0 }, { sx: 100, sy: 0 }, { sx: 0, sy: 100 });
    // (0-100)*(0-100) - (0-0)*(0-0) = 10000
    expect(cross).toBe(10000);
  });
});
