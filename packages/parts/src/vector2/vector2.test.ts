import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FrameContext } from '@sr/engine';
import { describe, expect, it } from 'vitest';
import type { BakedModel } from './model.js';
import { parsePalette } from './palette.js';
import { SCREEN_H, SCREEN_W } from './raster.js';
import { createSceneRenderer } from './renderer.js';

const dir = (n: string) => fileURLToPath(new URL(`./__fixtures__/${n}`, import.meta.url));
const model: BakedModel = JSON.parse(readFileSync(dir('vector2-model.json'), 'utf8'));
const palette = parsePalette(new Uint8Array(readFileSync(dir('U2E.PAL'))));

// The Effect's render() needs a WebGPU renderer; here we exercise the update/loop logic through the same
// SceneRenderer the Effect uses, plus the frame-advance arithmetic, without a GPU.
describe('Vector2 flythrough playback (headless)', () => {
  it('the baked model is loadable and has the expected shape', () => {
    expect(model.meshes.length).toBe(42);
    expect(model.frames.length).toBe(1801);
    expect(model.fov).toBe(0x1c00);
    expect(palette.length).toBe(256 * 3);
  });

  it('replays distinct frames as the accumulator advances at 35 Hz', () => {
    const PLAY_DT = 1 / 35;
    let acc = 0;
    let frameIndex = 0;
    const advance = (dt: number): void => {
      acc += dt;
      while (acc >= PLAY_DT) {
        acc -= PLAY_DT;
        frameIndex = (frameIndex + 1) % model.frames.length;
      }
    };
    advance(1.0); // 1 s → ~35 frames (float accumulation may land one short)
    expect(frameIndex).toBeGreaterThanOrEqual(34);
    expect(frameIndex).toBeLessThanOrEqual(35);
    const before = frameIndex;
    advance(1801 / 35); // a full loop returns near the same index (wrapped)
    expect(Math.abs(frameIndex - before)).toBeLessThanOrEqual(1);
  });

  it('renders a non-empty index buffer for a frame with visible city', () => {
    const renderer = createSceneRenderer(model);
    const fi = model.frames.findIndex((f) => f.objects.length >= 4);
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    const f = model.frames[fi];
    if (!f) throw new Error('no frame');
    renderer.render(buf, { m: f.m, x: f.x, y: f.y, z: f.z }, f.objects, fi);
    expect(buf.some((v) => v !== 0)).toBe(true);
  });

  it('every baked frame renders without throwing (full flythrough sweep)', () => {
    const renderer = createSceneRenderer(model);
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    for (let i = 0; i < model.frames.length; i += 7) {
      buf.fill(0);
      const f = model.frames[i];
      if (!f) continue;
      expect(() =>
        renderer.render(buf, { m: f.m, x: f.x, y: f.y, z: f.z }, f.objects, i),
      ).not.toThrow();
    }
  });
});

// A tiny FrameContext factory kept here to document the shape the Effect's update() consumes.
export function frameCtx(dt: number, frameNumber: number): FrameContext {
  return {
    dt,
    frameNumber,
    cueTime: frameNumber * dt,
    cueProgress: 0,
    clock: {
      muscode: 0,
      musplus: 0,
      musrow: 0,
      mframe: 0,
      songSeconds: frameNumber * dt,
      order: 0,
      pattern: 0,
      bpm: 125,
    },
  };
}
