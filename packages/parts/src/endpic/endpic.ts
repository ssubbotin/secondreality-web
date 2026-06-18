import {
  type DecodedPicture,
  type DemoContext,
  type Effect,
  type FrameContext,
  type LoadContext,
  loadPicture,
  type RenderTarget,
} from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { FADE_STEPS, fadeStep } from './fade.js';
import { PictureSurface } from './surface.js';

/** authentic = chunky nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

/** URL of the vendored end-title picture (raw .U, decoded at runtime). */
const PICTURE_URL = '/pics/SRTITLE.U';

const SIM_HZ = 70; // original mode-X / dis_waitb cadence; the fade is fps-independent via the accumulator
const SIM_DT = 1 / SIM_HZ;

/**
 * Part #19 — "End picture flash" (ENDPIC). Ports `ENDPIC/BEG.C`: blit the decoded SRTITLE picture, then
 * flash-fade the palette from full white (`c=0`) into the real picture palette over 129 frames
 * (`c=0..128`), one frame per `dis_waitb()`. Here the fade advances on a fixed 70 Hz accumulator so its
 * duration is display-fps-independent (~129/70 ≈ 1.84 s, matching the original). After the fade
 * completes the final palette holds (the original's 300-frame hold / `0xf0` exit is the sequencer's job).
 */
export class Endpic implements Effect {
  readonly id = 'endpic';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private picture: DecodedPicture | null = null;
  private surface: PictureSurface | null = null;
  private acc = 0;
  private step = 0;

  async load(_ctx: LoadContext): Promise<void> {
    this.picture = await loadPicture(PICTURE_URL);
  }

  init(_ctx: DemoContext): void {
    this.ctx = _ctx;
    const pic = this.picture;
    if (!pic) throw new Error('Endpic.init called before load resolved');
    this.surface = new PictureSurface(pic.width, pic.height, pic.indices);
    this.acc = 0;
    this.step = 0;
    this.applyMode();
    // Frame 0 of the fade: a full-white flash.
    this.surface.setPalette6(fadeStep(0, pic.palette6));
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
    const pic = this.picture;
    const surface = this.surface;
    if (!pic || !surface) return;
    if (this.step >= FADE_STEPS - 1) return; // fade complete; hold the final palette
    this.acc += frame.dt;
    let changed = false;
    while (this.acc >= SIM_DT && this.step < FADE_STEPS - 1) {
      this.acc -= SIM_DT;
      this.step++;
      changed = true;
    }
    if (changed) surface.setPalette6(fadeStep(this.step, pic.palette6));
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    if (!renderer || !this.surface) return;
    this.surface.render(renderer, target.gpu);
  }

  resize(_width: number, _height: number): void {
    // The decoded picture is a fixed-size field; the blit upscales to whatever target it is given.
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;
    this.ctx = null;
    this.picture = null;
  }
}
