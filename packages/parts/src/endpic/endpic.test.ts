import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DemoContext, FrameContext } from '@sr/engine';
import type { WebGPURenderer } from 'three/webgpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Endpic } from './endpic.js';
import { FADE_STEPS } from './fade.js';

// The vendored fixture lives in the engine package; reuse it here for the load() round-trip.
const srtitle = (): Uint8Array =>
  new Uint8Array(
    readFileSync(
      fileURLToPath(new URL('../../../engine/src/assets/__fixtures__/SRTITLE.U', import.meta.url)),
    ),
  );

function fakeFrame(dt: number): FrameContext {
  return {
    clock: {
      muscode: 0,
      musplus: 0,
      musrow: 0,
      mframe: 0,
      songSeconds: 0,
      order: 0,
      pattern: 0,
      bpm: 125,
    },
    dt,
    frameNumber: 0,
    cueTime: 0,
    cueProgress: 0,
  };
}

// init() only stores ctx + builds the CPU surface; render() is never called in these tests, so a
// minimal stub renderer is enough.
const fakeCtx = (): DemoContext => ({
  backend: 'webgl2',
  renderer: {} as WebGPURenderer,
  viewport: { width: 1280, height: 720 },
});

describe('Endpic effect', () => {
  beforeEach(() => {
    const bytes = srtitle();
    const buf = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => buf }) as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads + decodes SRTITLE.U and starts on a full-white flash frame', async () => {
    const fx = new Endpic();
    await fx.load({ backend: 'webgl2' });
    fx.init(fakeCtx());
    // Reaching into the private surface for verification is fine in-package via a typed cast.
    const surface = (fx as unknown as { surface: { pixelAt(c: number, r: number): number[] } })
      .surface;
    // Frame 0 of the fade: every touched component is white (63<<2 = 252) — even the title-art pixel
    // at (col 37, row 86), which is palette index 9 and is washed out by the flash.
    expect(surface.pixelAt(37, 86)).toEqual([252, 252, 252, 255]);
    expect(surface.pixelAt(0, 0)).toEqual([252, 252, 252, 255]);
    fx.dispose();
  });

  it('advances the fade on a 70 Hz accumulator and holds the final palette', async () => {
    const fx = new Endpic();
    await fx.load({ backend: 'webgl2' });
    fx.init(fakeCtx());
    const surface = (fx as unknown as { surface: { pixelAt(c: number, r: number): number[] } })
      .surface;
    const step = () => (fx as unknown as { step: number }).step;

    expect(step()).toBe(0);
    // Advance well past the full fade (129 steps at 70 Hz ≈ 1.84 s); 4 s of dt overshoots.
    fx.update(fakeFrame(4));
    expect(step()).toBe(FADE_STEPS - 1); // clamped to the last step
    // Final palette: the title-art pixel (index 9 = 6-bit (11,15,19)) resolves to its real colour
    // (11<<2, 15<<2, 19<<2) = (44, 60, 76) — no longer the white flash.
    expect(surface.pixelAt(37, 86)).toEqual([44, 60, 76, 255]);
    // The white background (index 31 = (63,63,63)) stays full-white.
    expect(surface.pixelAt(0, 0)).toEqual([252, 252, 252, 255]);

    // Further updates do not advance (hold).
    fx.update(fakeFrame(4));
    expect(step()).toBe(FADE_STEPS - 1);
    fx.dispose();
  });

  it('setMode before init does not throw', () => {
    const fx = new Endpic();
    expect(() => fx.setMode('authentic')).not.toThrow();
  });
});
