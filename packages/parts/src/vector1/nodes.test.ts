import { describe, expect, it } from 'vitest';
import { applyMatrix, cloneMatrix, type RMatrix, UNIT } from './fixed.js';
import { engineToViewMatrix } from './nodes.js';

const CAM: RMatrix = {
  m: [-16385, 0, 0, 0, 10, -16384, 0, -16384, -10],
  x: -221,
  y: -323,
  z: 7088,
};

/** Apply a column-major 4x4 (16-array) to a point. */
function applyColMajor(
  m: readonly number[],
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const px = (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0);
  const py = (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0);
  const pz = (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0);
  return [px, py, pz];
}

describe('vector1 modern view-matrix (engineToViewMatrix)', () => {
  it('identity rotation maps a point with the (1,-1,-1) engine->three flip', () => {
    const r: RMatrix = { m: [UNIT, 0, 0, 0, UNIT, 0, 0, 0, UNIT], x: 10, y: 20, z: 30 };
    const cm = engineToViewMatrix(r);
    const [x, y, z] = applyColMajor(cm, 1, 2, 3);
    // Engine world point = (1+10, 2+20, 3+30) = (11,22,33); three flips Y and Z.
    expect(x).toBeCloseTo(11, 5);
    expect(y).toBeCloseTo(-22, 5);
    expect(z).toBeCloseTo(-33, 5);
  });

  it('matches applyMatrix + projection: a transformed point lands at the engine view coords (flipped)', () => {
    // Object at the same r0 used in the fixed-point oracle, through the camera.
    const r0: RMatrix = { m: [UNIT, 0, 0, 0, UNIT, 0, 0, 0, UNIT], x: 1000, y: -50000, z: 2000 };
    const world = applyMatrix(cloneMatrix(r0), CAM);
    // Engine view-space of ship vertex (74,6787,-674) via rotateVertex was [-1297,-1676,50299].
    const cm = engineToViewMatrix(world);
    const [x, y, z] = applyColMajor(cm, 74, 6787, -674);
    // The three matrix uses /UNIT rotation so it is the float analogue of the integer rotateVertex; check
    // it lands near the engine result with the Y/Z flip (a few units of fixed-point rounding tolerance).
    expect(x).toBeCloseTo(-1297, -1);
    expect(y).toBeCloseTo(1676, -1); // engine y -1676, flipped
    expect(z).toBeCloseTo(-50299, -1); // engine z 50299, flipped
  });

  it('is a pure function (does not mutate its input)', () => {
    const r: RMatrix = { m: [1, 2, 3, 4, 5, 6, 7, 8, 9], x: 1, y: 2, z: 3 };
    const before = JSON.stringify(r);
    engineToViewMatrix(r);
    expect(JSON.stringify(r)).toBe(before);
  });
});
