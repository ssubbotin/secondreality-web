import { WebGPURenderer } from 'three/webgpu';
import type { Backend } from '../types.js';
import { selectBackend } from './select-backend.js';

export interface RendererHandle {
  renderer: WebGPURenderer;
  backend: Backend;
  /** Resolves when the GPU device is (re)initialized. */
  ready: Promise<void>;
  dispose(): void;
}

function detectSafari(ua: string): boolean {
  return /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
}

export interface CreateRendererOptions {
  canvas: HTMLCanvasElement;
  /** Override the heuristic (e.g. a ?backend= dev flag). */
  forceBackend?: Backend;
  allowWebGPUOnSafari?: boolean;
  onDeviceLost?: (reason: string) => void;
}

/**
 * Build the shared renderer. WebGPU and WebGL2 are co-primary: the backend is chosen
 * by selectBackend() and forced via WebGPURenderer's forceWebGL option. Three's built-in
 * onDeviceLost callback is wired for both backends (WebGPU device.lost and WebGL
 * webglcontextlost are both surfaced through this single hook).
 */
export function createRenderer(opts: CreateRendererOptions): RendererHandle {
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const isSafari = detectSafari(typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const backend =
    opts.forceBackend ??
    selectBackend({ hasWebGPU, isSafari, allowWebGPUOnSafari: opts.allowWebGPUOnSafari ?? false });

  const renderer = new WebGPURenderer({
    canvas: opts.canvas,
    antialias: true,
    forceWebGL: backend === 'webgl2',
  });

  // Three's Renderer exposes a single onDeviceLost hook that is called for both
  // the WebGPU device.lost path and the WebGL webglcontextlost path.
  if (opts.onDeviceLost) {
    const cb = opts.onDeviceLost;
    const defaultHandler = renderer.onDeviceLost.bind(renderer);
    renderer.onDeviceLost = (info) => {
      defaultHandler(info); // preserve three's bookkeeping (_isDeviceLost) + default logging
      cb(`${info.api} device lost: ${info.message}`);
    };
  }

  const ready = renderer.init().then((): void => {});
  // Mark handled so a rejection before any caller awaits doesn't fire unhandledRejection.
  // Callers who `await handle.ready` still get the rejection thrown at their await.
  void ready.catch(() => {});

  return {
    renderer,
    backend,
    ready,
    dispose: () => renderer.dispose(),
  };
}
