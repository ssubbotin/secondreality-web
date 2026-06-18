import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { COMAN_FRAMES, createFieldState, type FieldState, stepField } from './field-sim.js';
import { RasterSurface } from './nodes.js';
import { buildComanchePalette } from './palette.js';
import { buildHeightOffset, FIELD_H, FIELD_W, rasterField } from './raster.js';
import { buildSin1024, buildWave2, buildZwave, WAVESIN } from './tables.js';
import { decodeW1dta } from './w1dta.js';

/** authentic = chunky 160×200 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

const SIM_HZ = 70; // original mode-X frame cadence; the sim is fps-independent via the accumulator
const SIM_DT = 1 / SIM_HZ;

/**
 * Part #17 "3D Sinus field" (COMAN) — a Comanche-style forward voxel raster of a sine-animated terrain.
 *
 * Both modes render the shared CPU voxel rasteriser (byte-exact against THELOOP.INC); the look toggles
 * via the upscale filter (authentic = chunky NearestFilter matching the original mode-X pixel-doubling,
 * modern = smooth LinearFilter). A GPU heightfield raymarch is parked for the shared post chain — the
 * raster path renders identically across the WebGPU/WebGL2 backends, which the dot-tunnel port proved is
 * the dependable cross-backend route. The COMBG.LBM background picture is deferred (the background stays
 * the cleared sky / palette 0) until the image pipeline lands.
 */
export class Comanche implements Effect {
  readonly id = 'comanche';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private readonly sin1024 = buildSin1024();
  private readonly palette = buildComanchePalette();
  private readonly heightX = decodeW1dta();
  private readonly heightY = buildWave2(WAVESIN);
  private readonly off = buildHeightOffset(buildZwave());
  private state: FieldState = createFieldState();
  private readonly index = new Uint8Array(FIELD_W * FIELD_H);
  private surface: RasterSurface | null = null;
  private acc = 0;

  async load(_ctx: LoadContext): Promise<void> {
    // No external assets — the heightfields are embedded/regenerated in code. (The COMBG.LBM background
    // is deferred to the future image pipeline.)
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.surface = new RasterSurface(this.palette);
    this.state = createFieldState();
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
      stepField(this.state, this.sin1024);
      if (this.state.frame >= COMAN_FRAMES) this.state = createFieldState(); // self-loop in the lab
    }
    rasterField(this.index, this.state, this.heightX, this.heightY, this.off);
    this.surface?.update(this.index);
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    if (!renderer || !this.surface) return;
    this.surface.render(renderer, target.gpu);
  }

  resize(_width: number, _height: number): void {
    // The 160×200 field is fixed; the blit upscales to whatever target it is given.
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;
    this.ctx = null;
  }
}
