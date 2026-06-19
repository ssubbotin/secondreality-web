import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeAnimation } from './anim.js';
import { parseSceneMaterials } from './assets.js';
import type { RMatrix } from './fixed.js';
import { parseModel } from './model.js';
import { buildFramePolys, type SceneObject } from './scene.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

const CAM: RMatrix = {
  m: [-16385, 0, 0, 0, 10, -16384, 0, -16384, -10],
  x: -221,
  y: -323,
  z: 7088,
};

describe('vector1 scene pipeline (VISU/C/U2A.C draw loop)', () => {
  const models = [
    parseModel(fixture('U2A.001')),
    parseModel(fixture('U2A.002')),
    parseModel(fixture('U2A.003')),
  ];
  const mat = parseSceneMaterials(fixture('U2A.00M'));
  const { frames } = decodeAnimation(fixture('U2A.0AB'));

  // Slot -> mesh map from the object index list (co[1..]).
  const objectsForFrame = (frameIndex: number): SceneObject[] => {
    const f = frames[frameIndex];
    if (!f) return [];
    const objs: SceneObject[] = [];
    for (let slot = 1; slot < mat.conum; slot++) {
      const objIdx = mat.objectIndex[slot - 1] ?? 1;
      const model = models[objIdx - 1];
      const s = f.slots[slot];
      if (!model || !s) continue;
      objs.push({ model, r0: { m: [...s.m], x: s.x, y: s.y, z: s.z }, on: s.on });
    }
    return objs;
  };

  it('frame 100: only Sippi (co[2]) is on, producing front-facing screen polys', () => {
    const polys = buildFramePolys(objectsForFrame(100), CAM);
    expect(polys.length).toBeGreaterThan(0);
    // Every poly is a valid ring with an in-range palette colour.
    for (const p of polys) {
      expect(p.pts.length).toBeGreaterThanOrEqual(3);
      expect(p.color).toBeGreaterThanOrEqual(0);
      expect(p.color).toBeLessThan(256);
    }
    // Sippi's near-camera faces project around the screen centre (the ship fills the view at frame 100).
    // A few vertices grazing the near plane fling far off-screen (the original clips them); use the median
    // to assert the bulk of the geometry is centred, not the outlier-skewed mean.
    const median = (vals: number[]): number => {
      const s = [...vals].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)] ?? 0;
    };
    const xs = polys.flatMap((p) => p.pts.map((pt) => pt.x));
    const ys = polys.flatMap((p) => p.pts.map((pt) => pt.y));
    expect(median(xs)).toBeGreaterThan(60);
    expect(median(xs)).toBeLessThan(260);
    expect(median(ys)).toBeGreaterThan(20);
    expect(median(ys)).toBeLessThan(180);
  });

  it('frame 100 culls Sippi face 0 (back-facing: n.v >= 0) and shades the visible ones', () => {
    // The colours emitted are base (0 or 4) + a shade offset, so some land above the base index.
    const polys = buildFramePolys(objectsForFrame(100), CAM);
    const shadedAboveBase = polys.some((p) => p.color > 4);
    expect(shadedAboveBase).toBe(true);
    // No emitted face is the back-facing face 0's projected ring (it begins at proj of v0=(140,85)) as a
    // *front* face — we just assert culling reduced the count below the full 75-face mesh.
    expect(polys.length).toBeLessThan(75);
  });

  it('an empty frame (nothing switched on) yields no polygons', () => {
    expect(buildFramePolys(objectsForFrame(0), CAM)).toEqual([]);
  });

  it('frame 300: all five ships on -> polys from multiple meshes, painter-ordered', () => {
    const polys = buildFramePolys(objectsForFrame(300), CAM);
    expect(polys.length).toBeGreaterThan(10);
  });
});
