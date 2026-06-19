import { describe, expect, it } from 'vitest';
import {
  countConst,
  lightDir,
  PORT_X_BIAS,
  PORT_Y_BIAS,
  rotateProject,
  sortFaces,
} from './cube.js';
import {
  CUBE_TRANSPARENT,
  compositeToRgb,
  rasterCubeBuffer,
  SCREEN_H,
  SCREEN_W,
} from './raster.js';
import { getspl } from './spline.js';
import { buildKosinit, buildRata, buildSini, buildSinit, buildSplineCoef } from './tables.js';
import { buildDist, buildTiles } from './texture.js';

const sinit = buildSinit();
const kosinit = buildKosinit(sinit);
const coef = buildSplineCoef();
const rata = buildRata();
const sini = buildSini();
const tiles = buildTiles(sini);
const dist = buildDist(sini);

describe('plasma-behind-cube composite', () => {
  it('rasterCubeBuffer marks undrawn pixels CUBE_TRANSPARENT and draws faces over it', () => {
    const s = getspl(4 * 256, coef, rata);
    const m = countConst(s.kx & 1023, s.ky & 1023, s.kz & 1023, sinit, kosinit);
    const pts = rotateProject(m, s.tx, s.ty, s.dis, PORT_X_BIAS, PORT_Y_BIAS);
    const visible = sortFaces(pts, lightDir(s.lsKx, s.lsKy, sinit, kosinit));
    expect(visible.length).toBeGreaterThan(0);

    const cube = new Uint8Array(SCREEN_W * SCREEN_H);
    // 200 is in the cube tiles' never-produced gap (bands span 0..191, the sentinel is 255), so any
    // surviving 200 would mean rasterCubeBuffer failed to re-fill with the sentinel.
    const PROBE = 200;
    cube.fill(PROBE);
    rasterCubeBuffer(cube, pts, visible, tiles, dist, 0);

    let drawn = 0;
    let transparent = 0;
    let leftoverProbe = 0;
    for (const v of cube) {
      if (v === CUBE_TRANSPARENT) transparent++;
      else drawn++;
      if (v === PROBE) leftoverProbe++;
    }
    expect(leftoverProbe).toBe(0); // the fill(PROBE) was replaced by the sentinel + cube draws
    expect(drawn).toBeGreaterThan(0); // the cube drew some pixels
    expect(transparent).toBeGreaterThan(0); // the plasma shows through elsewhere
    // Cube tile indices span the three 64-entry bands (0..191, texture.ts); a drawn pixel is never the
    // sentinel and never reaches into the 192..254 gap.
    for (const v of cube) if (v !== CUBE_TRANSPARENT) expect(v).toBeLessThanOrEqual(191);
  });

  it('cube pixels override the plasma where the cube is drawn; plasma shows through otherwise', () => {
    // Plasma fills the whole field with index 5; the cube draws a small axis-aligned block of index 100.
    const W = 4;
    const H = 3;
    const plasma = new Uint8Array(W * H).fill(5);
    const cube = new Uint8Array(W * H).fill(CUBE_TRANSPARENT);
    cube[W * 1 + 1] = 100; // one cube pixel at (1,1)
    cube[W * 1 + 2] = 100; // and (2,1)

    // Distinct palettes so we can tell which layer a pixel came from.
    const plasmaPalette = new Uint8Array(256 * 3);
    plasmaPalette[5 * 3] = 10; // plasma index 5 → red 10
    const cubePalette = new Uint8Array(256 * 3);
    cubePalette[100 * 3 + 1] = 20; // cube index 100 → green 20

    const rgba = new Uint8Array(W * H * 4);
    compositeToRgb(plasma, plasmaPalette, cube, cubePalette, rgba);

    const at = (x: number, y: number): [number, number, number] => {
      const d = (y * W + x) * 4;
      return [rgba[d] ?? 0, rgba[d + 1] ?? 0, rgba[d + 2] ?? 0];
    };
    // Where the cube drew: cube palette (green 20 ×4 = 80), NOT the plasma red.
    expect(at(1, 1)).toEqual([0, 80, 0]);
    expect(at(2, 1)).toEqual([0, 80, 0]);
    // Everywhere else: plasma palette (red 10 ×4 = 40).
    expect(at(0, 0)).toEqual([40, 0, 0]);
    expect(at(3, 2)).toEqual([40, 0, 0]);
    expect(at(0, 1)).toEqual([40, 0, 0]);
    // Alpha is always opaque.
    expect(rgba[3]).toBe(255);
  });

  it('a fully-transparent cube layer leaves the plasma fully visible (no cube on top)', () => {
    const W = 2;
    const H = 2;
    const plasma = new Uint8Array(W * H).fill(9);
    const cube = new Uint8Array(W * H).fill(CUBE_TRANSPARENT);
    const plasmaPalette = new Uint8Array(256 * 3);
    plasmaPalette[9 * 3 + 2] = 15; // plasma index 9 → blue 15
    const cubePalette = new Uint8Array(256 * 3); // all black

    const rgba = new Uint8Array(W * H * 4);
    compositeToRgb(plasma, plasmaPalette, cube, cubePalette, rgba);
    for (let i = 0; i < W * H; i++) {
      expect(rgba[i * 4 + 2]).toBe(60); // blue 15 ×4 everywhere — pure plasma
    }
  });
});
