import {
  type AudioEngine,
  Blit,
  type DemoContext,
  type Effect,
  type FrameContext,
  type MusicSync,
  type RendererHandle,
  startLoop,
} from '@sr/engine';
import { RenderTarget as GpuRenderTarget } from 'three/webgpu';

export interface RunEffectDeps {
  handle: RendererHandle;
  canvas: HTMLCanvasElement;
  audio: AudioEngine;
  music: MusicSync;
}

/** A persistent lab host: owns the renderer loop + render target, swaps the mounted Effect. */
export interface EffectHost {
  /** Load + init `effect`, then atomically swap it in and dispose the previous one. */
  setEffect(effect: Effect): Promise<void>;
  /** The currently mounted effect (null before the first `setEffect`). */
  current(): Effect | null;
  /** Stop the loop and release all persistent + current GPU resources. */
  dispose(): void;
}

/**
 * Build the host once. The renderer, render target, blit and RAF loop persist across effect swaps;
 * only the Effect instance changes. The loop renders whatever `current` is, advancing from the music
 * clock (hybrid: wall-time until audio plays, then song-seconds). Returns the host.
 */
export function createEffectHost(deps: RunEffectDeps): EffectHost {
  const { handle, canvas, audio, music } = deps;
  const { renderer, backend } = handle;

  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  const size = () => ({
    width: Math.max(1, Math.floor(canvas.clientWidth * dpr)),
    height: Math.max(1, Math.floor(canvas.clientHeight * dpr)),
  });

  const viewport = size();
  const ctx: DemoContext = { backend, renderer, viewport };
  const gpu = new GpuRenderTarget(viewport.width, viewport.height);
  const blit = new Blit();
  blit.setSource(gpu.texture);

  let current: Effect | null = null;
  let token = 0;

  const onResize = () => {
    const s = size();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    gpu.setSize(s.width, s.height);
    current?.resize(s.width, s.height);
  };
  window.addEventListener('resize', onResize);
  onResize(); // size the renderer now (current is null → its resize is skipped)

  let frameNumber = 0;
  let lastSong = 0;
  const loop = startLoop((rafDt) => {
    const clock = music.resolve(audio.sample());
    // Hybrid clock: wall-time until the track plays, then advance by elapsed SONG-seconds (pause →
    // freeze; loop-wrap / seek → one clamped frame). rAF always paces rendering.
    const songDt = Math.min(0.1, Math.max(0, clock.songSeconds - lastSong));
    lastSong = clock.songSeconds;
    const dt = audio.isRunning ? songDt : rafDt;
    if (!current) return;
    const frame: FrameContext = {
      clock,
      dt,
      frameNumber: frameNumber++,
      cueTime: 0,
      cueProgress: 0,
    };
    current.update(frame);
    current.render(frame, { width: gpu.width, height: gpu.height, gpu });
    renderer.setRenderTarget(null);
    blit.render(renderer);
  });

  return {
    async setEffect(effect: Effect): Promise<void> {
      const mine = ++token; // stale-load guard: a newer setEffect supersedes this one
      await effect.load({ backend });
      if (mine !== token) {
        effect.dispose();
        return;
      }
      effect.init(ctx);
      const s = size();
      effect.resize(s.width, s.height);
      if (mine !== token) {
        effect.dispose();
        return;
      }
      const prev = current;
      current = effect;
      prev?.dispose();
    },
    current: () => current,
    dispose: () => {
      token++; // invalidate any in-flight setEffect
      loop.stop();
      window.removeEventListener('resize', onResize);
      current?.dispose();
      blit.dispose();
      gpu.dispose();
    },
  };
}
