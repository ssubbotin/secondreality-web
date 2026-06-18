import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { RasterSurface } from './nodes.js';
import { buildStarPalette } from './palette.js';
import { SCREEN_H, SCREEN_W, StarRaster } from './raster.js';
import { createStarState, palfadeScale, type StarState, stepStars } from './star-sim.js';
import { buildMuldivX, buildMuldivY } from './tables.js';

/** authentic = chunky 320×200 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

const SIM_HZ = 70; // original mode-X frame cadence; the sim is fps-independent via the accumulator
const SIM_DT = 1 / SIM_HZ;
/** Self-loop cap in the lab (the original exits at its own `int 0FCh, bx=2`; we restart the field). */
const LIFETIME = 4000;

export class DDStars implements Effect {
  readonly id = 'ddstars';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private readonly muldivx = buildMuldivX();
  private readonly muldivy = buildMuldivY();
  private readonly palette = buildStarPalette();
  private state: StarState = createStarState();
  private readonly raster = new StarRaster();
  private readonly index = new Uint8Array(SCREEN_W * SCREEN_H);
  private surface: RasterSurface | null = null;
  private acc = 0;

  async load(_ctx: LoadContext): Promise<void> {
    // No external assets — the procedural star field is pure code. The "Desert Dream" text/picture overlay
    // (TEXTS.LBM / PIC.EGA / PIC2.EGA) is deferred to the future image pipeline.
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.surface = new RasterSurface(this.palette);
    this.state = createStarState();
    this.raster.reset();
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
      stepStars(this.state, this.muldivx, this.muldivy);
      this.raster.render(this.index, this.state);
      if (this.state.frame >= LIFETIME) {
        this.state = createStarState();
        this.raster.reset();
      }
    }
    // Both modes render the CPU rasteriser; the look toggles via the upscale filter (authentic = chunky
    // NearestFilter, modern = smooth LinearFilter), matching the shipped dot-tunnel cross-backend path. The
    // GPU instanced-point renderer (StarCloud, parked in nodes.ts) is kept for the post-chain/bloom pass.
    this.surface?.update(this.index, palfadeScale(this.state));
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
