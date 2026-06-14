import type { WebGPURenderer } from 'three/webgpu';

export type Backend = 'webgpu' | 'webgl2';

/** The four-channel music clock reconstructed from the live (order,row,tempo) of the playing module. */
export interface MusicClock {
  /** _np_zinfo — set only by the ScreamTracker-3 Zxx command; the shipped FC modules carry none, so 0. */
  muscode: number;
  /** dis_musplus() — DIS muscode_6's computed DX: a clamped signed countdown in [-32, +32] (the dominant primitive parts poll). */
  musplus: number;
  /** _np_row — current pattern row; also the `row` component of Cue.atOrderRow (order<<8|row). TECHNO uses musrow & 7 for the beat. */
  musrow: number;
  /** _np_zframe — the separate music-frame channel: a per-song-tick counter at BPM*2/5 Hz (GLENZ/PLZPART gate on this). */
  mframe: number;
  /** Continuous song position in seconds, interpolated from the audio sample counter. */
  songSeconds: number;
  /** Module order-list index (ScreamTracker 3 order). */
  order: number;
  /** Pattern number played at the current order slot. */
  pattern: number;
  /** Module tempo in BPM, from libopenmpt. */
  bpm: number;
}

/** Per-frame state handed to every effect. The modern dis_muscode/dis_waitb surface. */
export interface FrameContext {
  clock: MusicClock;
  /** Seconds since the previous frame. */
  dt: number;
  /** Monotonic frame counter since the demo started (named to avoid `frame.frame` in effects). */
  frameNumber: number;
  /** Local time within the active cue, in seconds. */
  cueTime: number;
  /** Active cue progress, 0..1. */
  cueProgress: number;
}

/**
 * An off-screen color target an effect renders into (so the sequencer can cross-fade two live
 * effects). Geometry-only stub for now: the GPU handle (render-target texture/FBO) is added when
 * the sequencer / render-target pool lands (Plan 04). Mocks against this will extend, not break.
 */
export interface RenderTarget {
  readonly width: number;
  readonly height: number;
}

/** Shared, long-lived services. The modern injected DIS — no globals, no singletons. */
export interface DemoContext {
  readonly backend: Backend;
  readonly renderer: WebGPURenderer;
  /** Logical output size in device pixels (after DPR clamp). */
  readonly viewport: { width: number; height: number };
}

export interface LoadContext {
  readonly backend: Backend;
}

/**
 * One demo part. Mirrors the original dis_partstart / do{...; dis_waitb();}while(!dis_exit())
 * loop, but splits async load() from sync init() and update() from render() (spec section 7).
 */
export interface Effect {
  readonly id: string;
  /** Async fetch+decode of converted assets; runs DURING the previous part (no load stall). */
  load(ctx: LoadContext): Promise<void>;
  /** Sync GPU allocation, sized to the viewport. */
  init(ctx: DemoContext): void;
  /** Advance simulation from the music clock (frame.clock.songSeconds is the time source); no drawing. */
  update(frame: FrameContext): void;
  /** Draw into the SUPPLIED target so the engine can composite two live effects. */
  render(frame: FrameContext, target: RenderTarget): void;
  /** Re-size to the viewport. init() is NOT called again — recreate resolution-dependent targets here. */
  resize(width: number, height: number): void;
  /** Free GPU resources; enforced by the sequencer on cue exit. */
  dispose(): void;
}

/** A scheduled part, keyed to song position (generated from DISINT.ASM ordersync1 in Plan 04). */
export interface Cue {
  /** Song order/row packed as (order << 8 | row), matching the original ordersync1 keys. */
  atOrderRow: number;
  effectId: string;
  durationSeconds: number;
  transition: 'cut' | 'crossfade' | 'wipe';
}
