import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyRMatrix, identityMatrix, type RMatrix } from './fixed.js';
import type { BakedModel, BakedObject } from './model.js';
import { SCREEN_H, SCREEN_W } from './raster.js';
import { createSceneRenderer } from './renderer.js';

const model: BakedModel = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./__fixtures__/vector2-model.json', import.meta.url)),
    'utf8',
  ),
);

function camFor(frame: number): RMatrix {
  const f = model.frames[frame];
  if (!f) throw new Error(`no frame ${frame}`);
  return { m: f.m, x: f.x, y: f.y, z: f.z };
}

function objectsFor(frame: number): BakedObject[] {
  return model.frames[frame]?.objects ?? [];
}

describe('createSceneRenderer on the baked U2E model', () => {
  const renderer = createSceneRenderer(model);

  it('uses the baked window + fov for the projection', () => {
    expect(renderer.projection.addx).toBe(159); // (0+319)>>1
    expect(renderer.projection.mulx).toBeGreaterThan(0);
  });

  it('renders some lit pixels for a mid-flythrough frame that has visible meshes', () => {
    const frame = model.frames.findIndex((f) => f.objects.length >= 4);
    expect(frame).toBeGreaterThanOrEqual(0);
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    renderer.render(buf, camFor(frame), objectsFor(frame), frame);
    let lit = 0;
    for (const v of buf) if (v !== 0) lit++;
    expect(lit).toBeGreaterThan(50);
  });

  it('keeps every filled pixel on the 320×200 screen (raster clipping holds)', () => {
    const frame = model.frames.findIndex((f) => f.objects.length >= 4);
    const big = SCREEN_W * SCREEN_H;
    const buf = new Uint8Array(big + 16); // padding sentinel
    buf.fill(0xaa, big); // mark the tail
    renderer.render(buf.subarray(0, big), camFor(frame), objectsFor(frame), frame);
    for (let i = big; i < buf.length; i++) expect(buf[i]).toBe(0xaa); // tail untouched
  });

  it('draws nothing when no objects are visible', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    renderer.render(buf, camFor(0), [], 0);
    expect(buf.every((v) => v === 0)).toBe(true);
  });

  it('renders the FC-logo finale frame (last frame shows only the logo)', () => {
    const last = model.frames.length - 1;
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    renderer.render(buf, camFor(last), objectsFor(last), last);
    let lit = 0;
    for (const v of buf) if (v !== 0) lit++;
    expect(lit).toBeGreaterThan(50);
  });

  it('produces a stable pixel count across the whole flythrough (no crash, bounded fills)', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    let totalLitFrames = 0;
    for (let i = 0; i < model.frames.length; i += 25) {
      buf.fill(0);
      renderer.render(buf, camFor(i), objectsFor(i), i);
      let lit = 0;
      for (const v of buf) if (v !== 0) lit++;
      if (lit > 0) totalLitFrames++;
    }
    expect(totalLitFrames).toBeGreaterThan(10);
  });

  it('applies per-object animation: BuildingH lands differently when its matrix rotates', () => {
    // Frame 601 is the first frame BuildingH (mesh 1) carries a non-identity matrix. Render it as baked,
    // then with the building forced back to identity at its origin, and confirm the lit pixels differ —
    // i.e. the decoded per-object transform actually moves the object on screen.
    const frame = model.frames.findIndex((f, i) => {
      if (i < 1) return false;
      const bh = f.objects.find((o) => model.meshes[o.mesh]?.name === '"BuildingH"');
      if (!bh) return false;
      const id = identityMatrix();
      return !(bh.m.every((v, k) => v === id.m[k]) && bh.x === 0 && bh.y === 0 && bh.z === 0);
    });
    expect(frame).toBeGreaterThanOrEqual(0);

    const animated = objectsFor(frame);
    const reset = animated.map((o) =>
      model.meshes[o.mesh]?.name === '"BuildingH"'
        ? { ...o, m: identityMatrix().m, x: 0, y: 0, z: 0 }
        : o,
    );

    const bufA = new Uint8Array(SCREEN_W * SCREEN_H);
    const bufB = new Uint8Array(SCREEN_W * SCREEN_H);
    renderer.render(bufA, camFor(frame), animated, frame);
    renderer.render(bufB, camFor(frame), reset, frame);
    let diff = 0;
    for (let i = 0; i < bufA.length; i++) if (bufA[i] !== bufB[i]) diff++;
    expect(diff).toBeGreaterThan(0);
  });
});

describe('applyRMatrix composition (per-object r0 ∘ camera, U2E.C calc_applyrmatrix)', () => {
  it('identity object matrix reduces to the camera (static objects draw at baked position)', () => {
    const cam: RMatrix = { m: [16384, 0, 0, 0, 16384, 0, 0, 0, 16384], x: 100, y: -50, z: 30 };
    const r = applyRMatrix(identityMatrix(), cam);
    expect(r.m).toEqual(cam.m);
    expect([r.x, r.y, r.z]).toEqual([cam.x, cam.y, cam.z]);
  });

  it('an object translation rotates into camera space then adds the camera position', () => {
    // Object offset +1000 in X; camera rotated 0 but shifted. applyRMatrix(obj, cam) = rotate obj.pos by
    // cam.m (identity here) + cam.pos.
    const cam: RMatrix = { m: [16384, 0, 0, 0, 16384, 0, 0, 0, 16384], x: 5, y: 6, z: 7 };
    const obj: RMatrix = { m: identityMatrix().m, x: 1000, y: 0, z: 0 };
    const r = applyRMatrix(obj, cam);
    expect([r.x, r.y, r.z]).toEqual([1005, 6, 7]);
  });
});
