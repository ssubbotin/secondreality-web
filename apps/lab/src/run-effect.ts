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

/**
 * Mount a single Effect, drive its lifecycle, and blit its target to the canvas. Returns a teardown
 * closure that stops the loop and releases GPU resources — call it on HMR / unmount so reloads don't
 * accumulate orphaned RAF loops and render targets.
 */
export async function runEffect(effect: Effect, deps: RunEffectDeps): Promise<() => void> {
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

  await effect.load({ backend });
  effect.init(ctx);

  // The target the effect renders into; blit presents it to the canvas.
  const gpu = new GpuRenderTarget(viewport.width, viewport.height);
  const blit = new Blit();

  const onResize = () => {
    const s = size();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    gpu.setSize(s.width, s.height);
    effect.resize(s.width, s.height);
  };
  window.addEventListener('resize', onResize);
  onResize();

  // The blit source is the effect's render target. three reuses the same Texture object across
  // RenderTarget.setSize, so bind it once here rather than rebuilding the TSL node every frame.
  blit.setSource(gpu.texture);

  let frameNumber = 0;
  let lastSong = 0;
  const loop = startLoop((rafDt) => {
    const clock = music.resolve(audio.sample());
    // Hybrid clock: until the track is actually playing, advance on wall-time so the demo animates
    // immediately (no frozen-until-click). Once audio runs, slave the sim to the music — advance by
    // elapsed SONG-seconds (pause → freeze; loop-wrap → one clamped frame) so it stays locked to the
    // track. rAF always paces rendering.
    const songDt = Math.min(0.1, Math.max(0, clock.songSeconds - lastSong));
    lastSong = clock.songSeconds;
    const dt = audio.isRunning ? songDt : rafDt;
    const frame: FrameContext = {
      clock,
      dt,
      frameNumber: frameNumber++,
      cueTime: 0,
      cueProgress: 0,
    };
    effect.update(frame);
    effect.render(frame, { width: gpu.width, height: gpu.height, gpu });

    renderer.setRenderTarget(null);
    blit.render(renderer);
  });

  return () => {
    loop.stop();
    window.removeEventListener('resize', onResize);
    effect.dispose();
    blit.dispose();
    gpu.dispose();
  };
}
