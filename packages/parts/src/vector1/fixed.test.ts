import { describe, expect, it } from 'vitest';
import {
  applyMatrix,
  cdiv,
  identityMatrix,
  matMul,
  PROJ_MODEX,
  projectVertex,
  rotatePoint,
  rotateVertex,
  singleZ,
  UNIT,
  VF_NEAR,
  zeroMatrix,
} from './fixed.js';

// Oracles computed by re-running the ACALC.ASM fixed-point arithmetic against the U2A camera matrix.
const CAM = { m: [-16385, 0, 0, 0, 10, -16384, 0, -16384, -10], x: -221, y: -323, z: 7088 };

describe('vector1 fixed-point math (VISU/ACALC.ASM)', () => {
  it('UNIT/identity constants match the engine', () => {
    expect(UNIT).toBe(16384);
    const id = identityMatrix();
    expect(id.m).toEqual([UNIT, 0, 0, 0, UNIT, 0, 0, 0, UNIT]);
  });

  it('cdiv truncates toward zero (C integer division)', () => {
    expect(cdiv(7, 2)).toBe(3);
    expect(cdiv(-7, 2)).toBe(-3);
    expect(cdiv(7, -2)).toBe(-3);
    expect(cdiv(-7, -2)).toBe(3);
  });

  it('matMul: identity . identity = identity (>>14)', () => {
    const id = [UNIT, 0, 0, 0, UNIT, 0, 0, 0, UNIT];
    expect(matMul(id, id)).toEqual(id);
  });

  it('rotatePoint applies the camera rotation with the >>14 floor shift', () => {
    // cam.m . (1000,-50000,2000): rows dotted then >>14.
    expect(rotatePoint(CAM.m, 1000, -50000, 2000)).toEqual([-1001, -2031, 49998]);
  });

  it('applyMatrix(o.r, cam): m = cam.m . o.r0.m, pos = cam.m . pos + cam.pos', () => {
    const r = identityMatrix();
    r.x = 1000;
    r.y = -50000;
    r.z = 2000;
    applyMatrix(r, CAM);
    // identity carried through the camera matrix -> camera matrix.
    expect(r.m).toEqual([-16385, 0, 0, 0, 10, -16384, 0, -16384, -10]);
    expect([r.x, r.y, r.z]).toEqual([-1222, -2354, 57086]);
  });

  it('rotateVertex matches calc_rotate (signed-16 matrix, >>14, +pos) on a real ship vertex', () => {
    // Use the applied matrix/pos from above to rotate ship s01's vertex 0 (74,6787,-674).
    const r = identityMatrix();
    r.x = 1000;
    r.y = -50000;
    r.z = 2000;
    applyMatrix(r, CAM);
    const v = rotateVertex(r.m, r.x, r.y, r.z, 74, 6787, -674);
    expect(v).toEqual([-1297, -1676, 50299]);
  });

  it('singleZ returns the Z sort key (Z row + matrix Z)', () => {
    const r = identityMatrix();
    r.x = 1000;
    r.y = -50000;
    r.z = 2000;
    applyMatrix(r, CAM);
    const v = rotateVertex(r.m, r.x, r.y, r.z, 74, 6787, -674);
    expect(singleZ(r.m, r.z, 74, 6787, -674)).toBe(v[2]);
  });

  it('projectVertex perspective-divides with truncating division and clip flags', () => {
    const p = projectVertex(-1297, -1676, 50299, PROJ_MODEX, 319, 199);
    // sx = trunc(250*-1297/50299)+160 ; sy = trunc(-1676*220/50299)+100
    expect(p.sx).toBe(cdiv(250 * -1297, 50299) + 160);
    expect(p.sy).toBe(cdiv(-1676 * 220, 50299) + 100);
    expect(p.sx).toBe(154);
    expect(p.sy).toBe(93);
    expect(p.vf & VF_NEAR).toBe(0);
  });

  it('projectVertex clamps Z below clipZMin and flags VF_NEAR', () => {
    const p = projectVertex(100, 100, 10, PROJ_MODEX, 319, 199);
    expect(p.vf & VF_NEAR).toBe(VF_NEAR);
    // Z clamped to 256.
    expect(p.sx).toBe(cdiv(250 * 100, 256) + 160);
  });

  it('zeroMatrix is all zeros (the animation accumulator base state)', () => {
    expect(zeroMatrix()).toEqual({ m: [0, 0, 0, 0, 0, 0, 0, 0, 0], x: 0, y: 0, z: 0 });
  });
});
