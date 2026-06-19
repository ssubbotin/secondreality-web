import { describe, expect, it } from 'vitest';
import {
  AVISTAN,
  calcLight,
  isBackFacing,
  makeWindow,
  normalLight,
  projectVertex,
  setCameraAngle,
  UNIT,
  VF_NEAR,
  VF_RIGHT,
} from './project.js';

describe('projection setup (vid_window / vid_cameraangle)', () => {
  it('makeWindow centres addx/addy in the clip rect (U2E: 0..319, 25..174)', () => {
    const w = makeWindow(0, 319, 25, 174, 512, 9999999);
    expect(w.addx).toBe(159); // (0+319)>>1
    expect(w.addy).toBe(99); // (25+174)>>1
    expect(w.clipZmin).toBe(512);
  });

  it('setCameraAngle reproduces the AVISTAN-table projmul for the U2E fov (7168)', () => {
    // U2E.0AB sets fov = 0x1C00 = 7168 for the whole flythrough.
    const w = makeWindow(0, 319, 25, 174, 512, 9999999);
    setCameraAngle(w, 7168);
    // halfwidth = 319 - 159 = 160; halfAngle = 3584; index = (3584>>5)&~1 = 112&~1 = 112; tan = AVISTAN[112]
    const tan = AVISTAN[112] ?? 0;
    expect(w.mulx).toBe(Math.trunc((160 * tan) / 256));
    expect(w.muly).toBe(Math.trunc((w.mulx * 256) / 256)); // projaspect 256 → muly == mulx
    expect(w.mulx).toBe(w.muly);
  });

  it('clamps the half-angle to the table bounds', () => {
    const w = makeWindow(0, 319, 25, 174, 512, 9999999);
    setCameraAngle(w, 0); // clamps to 8*64
    expect(w.mulx).toBeGreaterThan(0);
  });
});

describe('projectVertex (calc_project verbatim)', () => {
  const w = makeWindow(0, 319, 25, 174, 512, 9999999);
  setCameraAngle(w, 7168);

  it('projects a point on the optical axis to the screen centre', () => {
    const p = projectVertex(w, 0, 0, 100000);
    expect(p.x).toBe(w.addx);
    expect(p.y).toBe(w.addy);
    expect(p.vf).toBe(0);
  });

  it('a closer point projects wider (perspective divide)', () => {
    const near = projectVertex(w, 10000, 0, 20000);
    const far = projectVertex(w, 10000, 0, 80000);
    expect(near.x - w.addx).toBeGreaterThan(far.x - w.addx);
  });

  it('flags VF_NEAR behind the near plane and clamps Z', () => {
    const p = projectVertex(w, 0, 0, 100);
    expect(p.vf & VF_NEAR).toBe(VF_NEAR);
  });

  it('flags VF_RIGHT past the right clip edge', () => {
    const p = projectVertex(w, 1_000_000, 0, 1000);
    expect(p.vf & VF_RIGHT).toBe(VF_RIGHT);
  });
});

describe('flat shading + culling (ADRAW verbatim)', () => {
  it('normalLight peaks toward the light and floors at 0 away from it', () => {
    // Normal aligned with newlight (12118,10603,3030) gives the brightest value (clamped 255).
    const bright = normalLight(12118, 10603, 3030);
    const dark = normalLight(-12118, -10603, -3030);
    expect(bright).toBeGreaterThan(dark);
    expect(bright).toBeLessThanOrEqual(255);
    expect(dark).toBeGreaterThanOrEqual(0);
  });

  it('calcLight returns 0 for an unshaded material and a [1,30] index otherwise', () => {
    expect(calcLight(UNIT, 0, 0, 0)).toBe(0);
    const s = calcLight(12118, 10603, 3030, 3); // SHADE32 shift
    expect(s).toBeGreaterThanOrEqual(1);
    expect(s).toBeLessThanOrEqual(30);
  });

  it('isBackFacing culls when N·V >= 0 (face points away in camera space)', () => {
    // Camera looks down +Z; a face whose normal has +Z and a vertex at +Z is back-facing.
    expect(isBackFacing(0, 0, UNIT, 0, 0, 1000)).toBe(true);
    expect(isBackFacing(0, 0, -UNIT, 0, 0, 1000)).toBe(false);
  });
});
