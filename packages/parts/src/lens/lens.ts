import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { buildLensPlan, type LensPlan, parseExTable, SCREEN_W } from './displacement.js';
import { LensSurface } from './nodes.js';
import { buildLensPalette } from './palette.js';
import { INIT_PATH, LENS_FRAMES, type PathState, stepPath } from './path.js';
import { makeBackBuffer, SCREEN_H, SCREEN_PIXELS, warpLens } from './warp.js';

/** authentic = chunky 320×200 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

const SIM_HZ = 70; // original mode-X frame cadence; the sim is fps-independent via the accumulator
const SIM_DT = 1 / SIM_HZ;

// The displacement tables and background image, served from apps/lab/public.
const EX_URLS = ['/pics/LENS.EX1', '/pics/LENS.EX2', '/pics/LENS.EX3', '/pics/LENS.EX4'] as const;
const BACK_URL = '/pics/LENS.U';

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lens: failed to load ${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

export class Lens implements Effect {
  readonly id = 'lens';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private readonly palette = buildLensPalette();
  private readonly index = new Uint8Array(SCREEN_PIXELS);

  private plan: LensPlan | null = null;
  private back: Uint8Array | null = null;
  private surface: LensSurface | null = null;

  private path: PathState = INIT_PATH;
  private acc = 0;

  async load(_ctx: LoadContext): Promise<void> {
    const [ex1, ex2, ex3, ex4, back] = await Promise.all([
      ...EX_URLS.map(fetchBytes),
      fetchBytes(BACK_URL),
    ]);
    this.plan = buildLensPlan(
      parseExTable(ex1 ?? new Uint8Array()),
      parseExTable(ex2 ?? new Uint8Array()),
      parseExTable(ex3 ?? new Uint8Array()),
      parseExTable(ex4 ?? new Uint8Array()),
    );
    this.back = makeBackBuffer(back ?? new Uint8Array(SCREEN_PIXELS));
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.surface = new LensSurface(this.palette);
    this.path = INIT_PATH;
    this.acc = 0;
    this.applyMode();
    // Paint the first frame (background) so something shows before the accumulator advances.
    if (this.plan && this.back) {
      const pose = stepPath(this.path);
      warpLens(this.index, this.back, this.plan, pose.x, pose.y);
      this.surface.update(this.index);
    }
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
    if (!this.plan || !this.back) return;
    this.acc += frame.dt;
    let pose = stepPath(this.path); // at least one pose even at tiny dt
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      pose = stepPath(this.path);
      this.path = pose.state;
      if (this.path.frame >= LENS_FRAMES) this.path = INIT_PATH; // self-loop in the lab
    }
    warpLens(this.index, this.back, this.plan, pose.x, pose.y);
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

// Re-exported for callers that need the field dimensions (host pixel-aspect correction).
export { SCREEN_H, SCREEN_W };
