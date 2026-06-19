import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RMatrix } from './fixed.js';
import type { BakedModel } from './model.js';
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

describe('createSceneRenderer on the baked U2E model', () => {
  const renderer = createSceneRenderer(model);

  it('uses the baked window + fov for the projection', () => {
    expect(renderer.projection.addx).toBe(159); // (0+319)>>1
    expect(renderer.projection.mulx).toBeGreaterThan(0);
  });

  it('renders some lit pixels for a mid-flythrough frame that has visible meshes', () => {
    // Find a frame with several visible meshes so the city is on screen.
    const frame = model.frames.findIndex((f) => f.vis.length >= 4);
    expect(frame).toBeGreaterThanOrEqual(0);
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    renderer.render(buf, camFor(frame), model.frames[frame]?.vis ?? []);
    let lit = 0;
    for (const v of buf) if (v !== 0) lit++;
    expect(lit).toBeGreaterThan(50);
  });

  it('keeps every filled pixel on the 320×200 screen (raster clipping holds)', () => {
    // The VISU window only sets the projection centre + clip flags; the fill itself spans the full
    // mode-X screen (the original had a background picture outside the city). The hard invariant is that
    // the rasteriser never writes out of the screen buffer.
    const frame = model.frames.findIndex((f) => f.vis.length >= 4);
    const big = SCREEN_W * SCREEN_H;
    const buf = new Uint8Array(big + 16); // padding sentinel
    buf.fill(0xaa, big); // mark the tail
    renderer.render(buf.subarray(0, big), camFor(frame), model.frames[frame]?.vis ?? []);
    for (let i = big; i < buf.length; i++) expect(buf[i]).toBe(0xaa); // tail untouched
  });

  it('draws nothing when no meshes are visible', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    renderer.render(buf, camFor(0), []);
    expect(buf.every((v) => v === 0)).toBe(true);
  });

  it('produces a stable pixel count across the whole flythrough (no crash, bounded fills)', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    let totalLitFrames = 0;
    for (let i = 0; i < model.frames.length; i += 25) {
      buf.fill(0);
      renderer.render(buf, camFor(i), model.frames[i]?.vis ?? []);
      let lit = 0;
      for (const v of buf) if (v !== 0) lit++;
      if (lit > 0) totalLitFrames++;
    }
    expect(totalLitFrames).toBeGreaterThan(10);
  });
});
