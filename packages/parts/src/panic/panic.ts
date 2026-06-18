import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import {
  type CrashState,
  createCrashState,
  rasterCrash,
  stepCrash,
  TOTAL_FRAMES,
} from './crash.js';
import { CrashSurface } from './nodes.js';
import { parseVgaPalette } from './palette.js';
import { MONSTER_SIZE, parsePicture } from './picture.js';

/** authentic = chunky 320×200 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

const SIM_HZ = 70; // original mode-X / dis_waitb cadence; the sim is fps-independent via the accumulator
const SIM_DT = 1 / SIM_HZ;
/** Frames the final dot/“crashed” state holds before the gag restarts in the lab (SHUTDOWN.C sleep(1)). */
const HOLD_FRAMES = SIM_HZ; // ~1 s, matching sleep(1)
const LOOP_FRAMES = TOTAL_FRAMES + HOLD_FRAMES;

/**
 * PANIC — the "fake crash" gag. Shows the MONSTER picture, then collapses it to a line and a pulsing
 * dot as if the machine crashed (it doesn't). Ported from SHUTDOWN.C: the picture is the raw 320×200
 * MONSTER.U, the palette is MONSTER.PAL, and the crash animation is `crash.ts`. Both look modes render
 * the same CPU raster through the palette LUT; only the upscale filter differs.
 */
export class Panic implements Effect {
  readonly id = 'panic';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private picture: Uint8Array = new Uint8Array(MONSTER_SIZE);
  private palette: Uint8Array = new Uint8Array(256 * 3);
  private state: CrashState = createCrashState();
  private readonly index = new Uint8Array(MONSTER_SIZE);
  private surface: CrashSurface | null = null;
  private acc = 0;
  private loopFrame = 0;

  async load(_ctx: LoadContext): Promise<void> {
    const [picRes, palRes] = await Promise.all([
      fetch('/pics/MONSTER.U'),
      fetch('/pics/MONSTER.PAL'),
    ]);
    if (!picRes.ok) throw new Error(`MONSTER.U fetch failed: ${picRes.status}`);
    if (!palRes.ok) throw new Error(`MONSTER.PAL fetch failed: ${palRes.status}`);
    const [picBuf, palBuf] = await Promise.all([picRes.arrayBuffer(), palRes.arrayBuffer()]);
    this.picture = parsePicture(new Uint8Array(picBuf));
    this.palette = parseVgaPalette(new Uint8Array(palBuf));
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.surface = new CrashSurface(this.palette);
    this.state = createCrashState();
    this.acc = 0;
    this.loopFrame = 0;
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
      this.loopFrame++;
      if (this.loopFrame >= LOOP_FRAMES) {
        // self-loop the gag in the lab (the sequencer will gate entry/exit by song position later)
        this.loopFrame = 0;
        this.state = createCrashState();
      } else {
        stepCrash(this.state);
      }
    }
    rasterCrash(this.index, this.state, this.picture);
    this.surface?.update(this.index, this.state.fadeA);
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
