import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { DotCloud, RasterSurface } from './nodes.js';
import { buildTunnelPalette } from './palette.js';
import { rasterTunnel, SCREEN_H, SCREEN_W } from './raster.js';
import { buildCircleTable, buildCosit, buildSade, buildSinit } from './tables.js';
import { createTunnelState, stepTunnel, type TunnelState, VEKE } from './tunnel-sim.js';

/** authentic = chunky 320×200 nearest upscale; modern = GPU glowing dots (default). */
export type LookMode = 'authentic' | 'modern';

const SIM_HZ = 70; // original mode-X frame cadence; the sim is fps-independent via the accumulator
const SIM_DT = 1 / SIM_HZ;

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
  private cloud: DotCloud | null = null;
  private acc = 0;

  async load(_ctx: LoadContext): Promise<void> {
    // No external assets — tables are code.
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.surface = new RasterSurface(this.palette);
    this.cloud = new DotCloud(this.palette, this.circle, this.sade);
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
  }

  update(frame: FrameContext): void {
    this.acc += frame.dt;
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      stepTunnel(this.state, this.sinit, this.cosit);
      if (this.state.frame >= VEKE) this.state = createTunnelState(); // self-loop in the lab
    }
    if (this.mode === 'authentic') {
      rasterTunnel(this.index, this.state, this.circle, this.sade);
      this.surface?.update(this.index);
    } else {
      this.cloud?.update(this.state);
    }
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    if (!renderer) return;
    if (this.mode === 'authentic') this.surface?.render(renderer, target.gpu);
    else this.cloud?.render(renderer, target.gpu);
  }

  resize(_width: number, _height: number): void {
    // The 320×200 field is fixed; the blit upscales to whatever target it is given.
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;
    this.cloud?.dispose();
    this.cloud = null;
    this.ctx = null;
  }
}
