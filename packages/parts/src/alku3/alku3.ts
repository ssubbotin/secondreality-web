import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { closingFadeStep, revealStep } from './fade.js';
import { type DecodedPicture, loadRevealPicture, REVEAL_PICTURES } from './lbm.js';
import { flashAt } from './reveal.js';
import { PictureRevealSurface } from './surface.js';

/** authentic = chunky nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

/** The original opening field is locked to the ~70 Hz vblank (frame_count); we drive the same cadence. */
const SIM_HZ = 70;
const SIM_DT = 1 / SIM_HZ;

const BLACK = new Uint8Array(256 * 3);

/**
 * Part #3 "Opening texts III" — the final reveal (ALKU). Ports the `sync 4` picture-reveal palette fade
 * (`ALKU/MAIN.C:79-86`, `cop_fadepal = picin; cop_dofade = 128`) and the closing `dofade`
 * (`MAIN.C:147-149`): the picture flashes in from black over a 128-step incremental palette fade
 * (`COPPER.ASM:115-145`), holds, then fades back to black. The four shipped ALKU reveal pictures —
 * PIC001 / HOIKKA / RYPPIS / U2-MOVIE — are cycled through this exact fade.
 *
 * A fixed-timestep accumulator at `SIM_HZ = 70` keeps the reveal cadence display-fps-independent
 * (128/70 ≈ 1.83 s, matching the original). The fade lives entirely in the palette; the index buffer per
 * picture is uploaded once when that picture becomes active. authentic = NearestFilter chunky upscale;
 * modern = LinearFilter smooth (default).
 */
export class Alku3 implements Effect {
  readonly id = 'alku3';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private readonly pictures: (DecodedPicture | null)[] = REVEAL_PICTURES.map(() => null);
  private surface: PictureRevealSurface | null = null;
  /** Index of the picture the current surface was built for (so we rebuild only on a change). */
  private activeIndex = -1;
  private frame = 0;
  private acc = 0;

  async load(_ctx: LoadContext): Promise<void> {
    const decoded = await Promise.all(REVEAL_PICTURES.map((name) => loadRevealPicture(name)));
    for (let i = 0; i < decoded.length; i++) this.pictures[i] = decoded[i] ?? null;
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.frame = 0;
    this.acc = 0;
    this.activeIndex = -1;
    this.surface = null;
    this.composeInto(0);
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
      this.frame++;
    }
    this.composeInto(this.frame);
  }

  /** Select the active picture for sim-frame `f`, (re)build its surface, and push the live fade palette. */
  private composeInto(f: number): void {
    const state = flashAt(f);
    const pic = this.pictures[state.pictureIndex];
    if (!pic) return;

    if (state.pictureIndex !== this.activeIndex) {
      this.surface?.dispose();
      this.surface = new PictureRevealSurface(pic.width, pic.height, pic.indices);
      this.activeIndex = state.pictureIndex;
      this.applyMode();
    }
    const surface = this.surface;
    if (!surface) return;

    // The live 6-bit palette for this phase:
    //   reveal — the 128-step incremental fade black -> the picture palette
    //   hold   — the full picture palette
    //   close  — the 64-step dofade from the picture palette -> black
    let palette6: Uint8Array;
    if (state.phase === 'reveal') {
      palette6 = revealStep(state.revealStep, pic.palette6);
    } else if (state.phase === 'close') {
      palette6 = closingFadeStep(state.closeStep, pic.palette6, BLACK);
    } else {
      palette6 = pic.palette6;
    }
    surface.setPalette6(palette6);
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    if (!renderer || !this.surface) return;
    this.surface.render(renderer, target.gpu);
  }

  resize(_width: number, _height: number): void {
    // Each decoded picture is a fixed-size field; the host blit upscales it to whatever target it is given.
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;
    this.ctx = null;
    this.activeIndex = -1;
    for (let i = 0; i < this.pictures.length; i++) this.pictures[i] = null;
  }
}
