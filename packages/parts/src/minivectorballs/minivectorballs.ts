import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { type BallsState, createBallsState, stepBalls, VEKE } from './balls-sim.js';
import { RasterSurface } from './nodes.js';
import { buildBallPalette } from './palette.js';
import { rasterBalls, SCREEN_H, SCREEN_W } from './raster.js';
import { buildDepthTables } from './tables.js';

/** authentic = chunky 320×200 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

const SIM_HZ = 70; // original mode-X frame cadence; the sim is fps-independent via the accumulator
const SIM_DT = 1 / SIM_HZ;

export class MiniVectorBalls implements Effect {
  readonly id = 'minivectorballs';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private readonly palette = buildBallPalette();
  private readonly depth = buildDepthTables();
  private state: BallsState = createBallsState();
  private readonly index = new Uint8Array(SCREEN_W * SCREEN_H);
  private surface: RasterSurface | null = null;
  private acc = 0;

  async load(_ctx: LoadContext): Promise<void> {
    // No external assets — the tables are code, and the background picture is deferred (solid clear).
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.surface = new RasterSurface(this.palette);
    this.state = createBallsState();
    this.acc = 0;
    this.applyMode();
  }

  /** dis_setmode equivalent — switch the authentic↔modern look (default modern). */
  setMode(mode: LookMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.applyMode();
  }

  private applyMode(): void {
    this.surface?.setFilter(this.mode === 'authentic' ? NearestFilter : LinearFilter);
  }

  update(frame: FrameContext): void {
    this.acc += frame.dt;
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      stepBalls(this.state);
      if (this.state.frame >= VEKE) this.state = createBallsState(); // self-loop in the lab
    }
    // Both modes render the CPU rasteriser; the look toggles via the upscale filter (authentic =
    // chunky NearestFilter, modern = smooth LinearFilter). A GPU instanced-disc renderer (BallCloud,
    // parked in nodes.ts) is the documented modern path, but the shipped dot-tunnel showed three's
    // instanced-geometry path delivers no per-instance data on the WebGL2 node backend, so modern uses
    // the proven cross-backend raster path until a true bloom/post chain lands. rasterBalls also
    // integrates each ball's gravity once per sim tick (the _drawdots writeback), so it runs every tick.
    rasterBalls(this.index, this.state, this.depth);
    this.surface?.update(this.index);
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    if (!renderer || !this.surface) return;
    this.surface.render(renderer, target.gpu);
  }

  resize(_width: number, _height: number): void {
    // The 320×200 field is fixed; the blit upscales to whatever target it is given.
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;
    this.ctx = null;
  }
}
