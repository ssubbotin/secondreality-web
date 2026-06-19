import { describe, expect, it } from 'vitest';
import {
  applyRMatrix,
  identityMatrix,
  mulMatrices3x3,
  type RMatrix,
  rotateSingle,
  rotateVertex,
  singleZ,
  UNIT,
} from './fixed.js';

describe('fixed-point matrix math (ACALC verbatim)', () => {
  it('identity matrix is UNIT on the diagonal', () => {
    const i = identityMatrix();
    expect(i.m).toEqual([UNIT, 0, 0, 0, UNIT, 0, 0, 0, UNIT]);
  });

  it('multiplying by identity is a no-op (>>14 of UNIT·v)', () => {
    const id = [UNIT, 0, 0, 0, UNIT, 0, 0, 0, UNIT];
    const m = [1000, -2000, 3000, 4000, 5000, -6000, 7000, 8000, 9000];
    expect(mulMatrices3x3(m, id)).toEqual(m);
    expect(mulMatrices3x3(id, m)).toEqual(m);
  });

  it('rotateSingle with identity returns the input (UNIT·v>>14)', () => {
    expect(rotateSingle([UNIT, 0, 0, 0, UNIT, 0, 0, 0, UNIT], 12345, -678, 90)).toEqual([
      12345, -678, 90,
    ]);
  });

  it('rotateSingle by a 90° yaw maps (x,0,0) → (0, -x, 0) style with the engine sign convention', () => {
    // A pure rotation about Z by +90°: m = [0,-UNIT,0, UNIT,0,0, 0,0,UNIT].
    const m = [0, -UNIT, 0, UNIT, 0, 0, 0, 0, UNIT];
    expect(rotateSingle(m, UNIT, 0, 0)).toEqual([0, UNIT, 0]);
    expect(rotateSingle(m, 0, UNIT, 0)).toEqual([-UNIT, 0, 0]);
  });

  it('rotateVertex adds the translation after rotating', () => {
    const r: RMatrix = { m: [UNIT, 0, 0, 0, UNIT, 0, 0, 0, UNIT], x: 100, y: 200, z: 300 };
    expect(rotateVertex(r, 1, 2, 3)).toEqual([101, 202, 303]);
  });

  it('applyRMatrix with identity dest returns the camera transform unchanged', () => {
    const dest = identityMatrix();
    const cam: RMatrix = { m: [UNIT, 0, 0, 0, UNIT, 0, 0, 0, UNIT], x: 5, y: 6, z: 7 };
    const out = applyRMatrix(dest, cam);
    expect(out.m).toEqual(cam.m);
    expect([out.x, out.y, out.z]).toEqual([5, 6, 7]);
  });

  it('applyRMatrix rotates the dest position by the camera, then translates', () => {
    // dest at (UNIT,0,0); camera = +90° about Z, no translation → rotated pos = (0, UNIT, 0).
    const dest: RMatrix = { m: [UNIT, 0, 0, 0, UNIT, 0, 0, 0, UNIT], x: UNIT, y: 0, z: 0 };
    const cam: RMatrix = { m: [0, -UNIT, 0, UNIT, 0, 0, 0, 0, UNIT], x: 1000, y: 2000, z: 3000 };
    const out = applyRMatrix(dest, cam);
    expect([out.x, out.y, out.z]).toEqual([0 + 1000, UNIT + 2000, 0 + 3000]);
  });

  it('singleZ returns the rotated+translated Z (matches rotateVertex Z)', () => {
    const r: RMatrix = { m: [UNIT, 0, 0, 0, UNIT, 0, 0, 0, UNIT], x: 0, y: 0, z: 500 };
    expect(singleZ(r, 10, 20, 30)).toBe(530);
    expect(singleZ(r, 10, 20, 30)).toBe(rotateVertex(r, 10, 20, 30)[2]);
  });

  it('matches the original C >>14 truncation toward -inf for negative products', () => {
    // (-1)·UNIT >>14 = -1; (-3)·1 >>14 floors to -1 (sar), matching x86 arithmetic shift.
    expect(rotateSingle([UNIT, 0, 0, 0, UNIT, 0, 0, 0, UNIT], -1, 0, 0)[0]).toBe(-1);
    expect(rotateSingle([1, 0, 0, 0, 0, 0, 0, 0, 0], -3, 0, 0)[0]).toBe(-1);
  });
});
