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

/** Mount a single Effect, drive its lifecycle, and blit its target to the canvas. */
export async function runEffect(effect: Effect, deps: RunEffectDeps): Promise<void> {
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

  let frameNumber = 0;
  startLoop((dt) => {
    const frame: FrameContext = {
      clock: music.resolve(audio.sample()),
      dt,
      frameNumber: frameNumber++,
      cueTime: 0,
      cueProgress: 0,
    };
    effect.update(frame);
    effect.render(frame, { width: gpu.width, height: gpu.height, gpu });

    blit.setSource(gpu.texture);
    renderer.setRenderTarget(null);
    blit.render(renderer);
  });
}
