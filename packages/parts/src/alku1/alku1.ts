import type {
  BitmapFont,
  DemoContext,
  Effect,
  FrameContext,
  LoadContext,
  RenderTarget,
} from '@sr/engine';
import { decodeU, loadFona } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { composeFrame } from './compose.js';
import { copperBandColors, SCREEN_H, SCREEN_W } from './copper.js';
import { RasterSurface } from './nodes.js';
import { buildAlkuPalette, COPPER_BASE, lerpPalette, TEXT_BASE } from './palette.js';
import { revealAt } from './reveal.js';

/** authentic = chunky 320×200 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

/** The original opening field is locked to the ~70 Hz vblank (frame_count); we drive the same cadence. */
const SIM_HZ = 70;
const SIM_DT = 1 / SIM_HZ;

/** Part #1 "Opening texts I" (ALKU): the presentation-card reveals over a copper backdrop. */
export class Alku1 implements Effect {
  readonly id = 'alku1';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private surface: RasterSurface | null = null;
  private font: BitmapFont | null = null;
  /** The "lit" palette (text ramp at full brightness) and the all-black palette for the dofade ends. */
  private readonly basePalette = buildAlkuPalette();
  private readonly blackPalette = new Uint8Array(256 * 3);
  /** The per-frame palette uploaded to the LUT (copper band + faded text band). */
  private readonly livePalette = new Uint8Array(256 * 3);
  private readonly index = new Uint8Array(SCREEN_W * SCREEN_H);
  private frame = 0;
  private acc = 0;

  async load(_ctx: LoadContext): Promise<void> {
    // FONA.UH is the glyph sheet; HOI.U is loaded for availability (the picture backdrop is a modern
    // upgrade gated by the deferred scroller half). Both decode through the engine's .U decoder.
    const fona = await fetchU('/pics/FONA.UH');
    this.font = loadFona(fona);
    // HOI is fetched to validate the pipeline; not yet drawn (see STATUS — deferred copper-scroll).
    await fetchU('/pics/HOI.U').catch(() => undefined);
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.surface = new RasterSurface(this.livePalette);
    this.frame = 0;
    this.acc = 0;
    this.applyMode();
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

  /** Build the live palette + index buffer for sim-frame `f` and push them to the surface. */
  private composeInto(f: number): void {
    if (!this.font || !this.surface) return;
    const reveal = revealAt(f);

    // Start from the base palette, then animate the copper band and fade the text ramp via dofade.
    this.livePalette.set(this.basePalette);
    const copper = copperBandColors(f);
    this.livePalette.set(copper, COPPER_BASE * 3);

    // dofade: cross-fade the text band black→lit by `level/64`. Only the 4-entry text band needs it.
    const litBand = this.basePalette.subarray(TEXT_BASE * 3, (TEXT_BASE + 4) * 3);
    const blackBand = this.blackPalette.subarray(0, 4 * 3);
    const faded = lerpPalette(blackBand, litBand, reveal.level);
    this.livePalette.set(faded, TEXT_BASE * 3);

    this.surface.setPalette(this.livePalette);
    composeFrame(this.index, this.font, reveal, f);
    this.surface.update(this.index);
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    if (!renderer || !this.surface) return;
    this.surface.render(renderer, target.gpu);
  }

  resize(_width: number, _height: number): void {
    // The 320×200 field is fixed; the host blit upscales it to whatever target it is given.
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;
    this.ctx = null;
    this.font = null;
  }
}

/** Fetch a `.U`/`.UH` asset and decode it through the engine decoder. */
async function fetchU(url: string): Promise<ReturnType<typeof decodeU>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`alku1: failed to load ${url} (${res.status})`);
  return decodeU(await res.arrayBuffer());
}
