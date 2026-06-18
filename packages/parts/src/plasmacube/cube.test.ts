import { describe, expect, it } from 'vitest';
import { countConst, lightDir, rotateProject, sortFaces } from './cube.js';
import { getspl } from './spline.js';
import { buildKosinit, buildRata, buildSinit, buildSplineCoef } from './tables.js';

const sinit = buildSinit();
const kosinit = buildKosinit(sinit);
const coef = buildSplineCoef();
const rata = buildRata();

describe('cube transform', () => {
  it('countConst at zero rotation is the fixed-point identity diag(255,255,255)', () => {
    const m = countConst(0, 0, 0, sinit, kosinit);
    expect(m).toEqual({
      cxx: 255,
      cxy: 0,
      cxz: 0,
      cyx: 0,
      cyy: 255,
      cyz: 0,
      czx: 0,
      czy: 0,
      czz: 255,
    });
  });

  it('builds the verbatim rotation matrix for the frame-0 spline angles', () => {
    const s = getspl(4 * 256, coef, rata);
    const m = countConst(s.kx & 1023, s.ky & 1023, s.kz & 1023, sinit, kosinit);
    expect(m).toEqual({
      cxx: 104,
      cxy: -9,
      cxz: 233,
      cyx: 38,
      cyy: 252,
      cyz: -9,
      czx: -231,
      czy: 38,
      czz: 104,
    });
  });

  it('projects the 8 cube vertices to the verbatim frame-0 screen coords', () => {
    const s = getspl(4 * 256, coef, rata);
    const m = countConst(s.kx & 1023, s.ky & 1023, s.kz & 1023, sinit, kosinit);
    const pts = rotateProject(m, s.tx, s.ty, s.dis);
    const screen = pts.map((p) => [p.sx, p.sy]);
    expect(screen).toEqual([
      [410, 243],
      [422, 175],
      [346, 129],
      [341, 176],
      [271, 298],
      [273, 214],
      [244, 143],
      [246, 198],
    ]);
    // Spot-check one post-rotation camera coord too (drives the backface test).
    expect(pts[0]).toMatchObject({ xx: 160, yy: 569, zz: 455 });
  });

  it('computes the frame-0 light direction (straight down +Y) from ls_kx/ls_ky', () => {
    const s = getspl(4 * 256, coef, rata);
    expect(lightDir(s.lsKx, s.lsKy, sinit, kosinit)).toEqual({ x: 0, y: 127, z: 0 });
  });

  it('culls back-facing quads and shades the visible ones (frame 0: faces 1,2,3)', () => {
    const s = getspl(4 * 256, coef, rata);
    const m = countConst(s.kx & 1023, s.ky & 1023, s.kz & 1023, sinit, kosinit);
    const pts = rotateProject(m, s.tx, s.ty, s.dis);
    const light = lightDir(s.lsKx, s.lsKy, sinit, kosinit);
    const visible = sortFaces(pts, light);
    expect(visible).toEqual([
      { faceIndex: 1, light: 32 },
      { faceIndex: 2, light: 28 },
      { faceIndex: 3, light: 63 },
    ]);
  });
});
