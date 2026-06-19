import {
  BloomComposite,
  type DemoContext,
  type Effect,
  type FrameContext,
  type LoadContext,
  type RenderTarget,
} from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { RasterSurface } from './nodes.js';
import { buildTunnelPalette } from './palette.js';
import { rasterTunnel, SCREEN_H, SCREEN_W } from './raster.js';
import { buildCircleTable, buildCosit, buildSade, buildSinit } from './tables.js';
import { createTunnelState, stepTunnel, type TunnelState, VEKE } from './tunnel-sim.js';

/** authentic = chunky 320×200 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

const SIM_HZ = 70; // original mode-X frame cadence; the sim is fps-independent via the accumulator
const SIM_DT = 1 / SIM_HZ;

// Modern-mode bloom tuning. The dot field is bright points on black, so a low threshold lets the lit
// dots bloom while the black background stays black; a moderate strength gives a halo without washing
// the dots out. Authentic mode never constructs the bloom (chunky raster, no glow).
const BLOOM_THRESHOLD = 0.45;
const BLOOM_KNEE = 0.2;
const BLOOM_STRENGTH = 1.15;

export class DotTunnel implements Effect {
  readonly id = 'dot-tunnel';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private readonly sinit = buildSinit();
  private readonly cosit = buildCosit();
  private readonly circle = buildCircleTable();
  private readonly sade = buildSade();
  private readonly palette = buildTunnelPalette();
  private state: TunnelState = createTunnelState();
  private readonly index = new Uint8Array(SCREEN_W * SCREEN_H);
  private surface: RasterSurface | null = null;
  private bloom: BloomComposite | null = null;
  private acc = 0;

  async load(_ctx: LoadContext): Promise<void> {
    // No external assets — tables are code.
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.surface = new RasterSurface(this.palette);
    this.state = createTunnelState();
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
    // Bloom exists only in modern mode; authentic blits the raster straight through, unchanged.
    if (this.mode === 'modern') {
      if (!this.bloom) {
        this.bloom = new BloomComposite();
        this.bloom.setThreshold(BLOOM_THRESHOLD, BLOOM_KNEE);
        this.bloom.setStrength(BLOOM_STRENGTH);
      }
    } else {
      this.bloom?.dispose();
      this.bloom = null;
    }
  }

  update(frame: FrameContext): void {
    this.acc += frame.dt;
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      stepTunnel(this.state, this.sinit, this.cosit);
      if (this.state.frame >= VEKE) this.state = createTunnelState(); // self-loop in the lab
    }
    // Both modes render the CPU rasteriser; the look toggles via the upscale filter (authentic =
    // chunky NearestFilter, modern = smooth LinearFilter). A GPU instanced-dot renderer (DotCloud,
    // parked in nodes.ts) draws nothing on the WebGL2 node backend — three's instanced-geometry path
    // doesn't deliver the per-instance data there — so modern uses the proven cross-backend raster path.
    rasterTunnel(this.index, this.state, this.circle, this.sade);
    this.surface?.update(this.index);
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    const surface = this.surface;
    if (!renderer || !surface) return;
    if (this.bloom) {
      // Modern: raster → scratch, then bloom (bright-pass → blur → composite) → the supplied target.
      this.bloom.render(renderer, target.gpu, (r, scratch) => surface.render(r, scratch));
    } else {
      // Authentic: blit the chunky raster straight through, unchanged.
      surface.render(renderer, target.gpu);
    }
  }

  resize(width: number, height: number): void {
    // The 320×200 field is fixed; the blit upscales to whatever target it is given. The bloom scratch
    // buffers track the output resolution so the glow is sharp.
    this.bloom?.resize(width, height);
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;
    this.bloom?.dispose();
    this.bloom = null;
    this.ctx = null;
  }
}
