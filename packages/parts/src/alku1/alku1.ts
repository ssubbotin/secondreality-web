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
import { SCREEN_H, SCREEN_W } from './copper.js';
import { RasterSurface } from './nodes.js';
import { buildAlkuPalette, lerpPalette } from './palette.js';
import { revealAt } from './reveal.js';

/** authentic = chunky 320×200 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

/** The original opening field is locked to the ~70 Hz vblank (frame_count); we drive the same cadence. */
const SIM_HZ = 70;
const SIM_DT = 1 / SIM_HZ;

/** Decoded assets resolved by load(), held until init() builds the surface. */
interface Alku1Assets {
  font: BitmapFont;
  /** HOI horizon picture indices (640×200). */
  hoi: Uint8Array;
  /** The lit picture+text palette (`palette2`) the dofade cross-fades up to. */
  palette2: Uint8Array;
}

/**
 * Part #1 "Opening texts I" (ALKU): the presentation cards "A / Future Crew / Production" and
 * "First Presented / at Assembly 93" (`ALKU/MAIN.C:61-69`), rendered over the **HOI horizon picture**
 * (`hzpic`) with the picture's own palette. Each card stamps its plane-byte text into the field and the
 * whole palette cross-fades black → the lit picture+text palette (`palette2`) → black (`dofade`,
 * `MAIN.C:64`). A fixed 70 Hz accumulator keeps the cadence display-fps-independent.
 */
export class Alku1 implements Effect {
  readonly id = 'alku1';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private assets: Alku1Assets | null = null;
  private surface: RasterSurface | null = null;
  /** The all-black palette for the dofade ends. */
  private readonly blackPalette = new Uint8Array(256 * 3);
  /** The per-frame palette uploaded to the LUT (palette2 faded by the current dofade level). */
  private readonly livePalette = new Uint8Array(256 * 3);
  private readonly index = new Uint8Array(SCREEN_W * SCREEN_H);
  private frame = 0;
  private acc = 0;

  async load(_ctx: LoadContext): Promise<void> {
    // FONA.UH is the glyph sheet; HOI.U is the horizon picture the cards sit on.
    const [fona, hoi] = await Promise.all([fetchU('/pics/FONA.UH'), fetchHoi('/pics/HOI.U')]);
    this.assets = {
      font: loadFona(fona),
      hoi: hoi.indices,
      palette2: buildAlkuPalette(hoi.palette),
    };
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    if (!this.assets) throw new Error('Alku1.init called before load resolved');
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
    const assets = this.assets;
    if (!assets || !this.surface) return;
    const reveal = revealAt(f);

    // dofade: the whole frame fades black → palette2 → black by `level/64` (MAIN.C:64). At level 0 the
    // picture+text reads black; at level 64 the full lit palette is shown.
    this.livePalette.set(lerpPalette(this.blackPalette, assets.palette2, reveal.level));
    this.surface.setPalette(this.livePalette);

    // The HOI horizon holds roughly still under the cards; we keep the pan at 0 for the static card phase.
    composeFrame(this.index, assets.font, assets.hoi, reveal, 0);
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
    this.assets = null;
  }
}

/** Fetch the FONA glyph sheet and decode it through the engine glyph-sheet path (`add*16 - 1`). */
async function fetchU(url: string): Promise<ReturnType<typeof decodeU>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`alku1: failed to load ${url} (${res.status})`);
  return decodeU(await res.arrayBuffer(), { glyphSheet: true });
}

/** Fetch the HOI horizon picture and decode it via the engine `.U` path (palette@16, pixels@add*16). */
async function fetchHoi(url: string): Promise<ReturnType<typeof decodeU>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`alku1: failed to load ${url} (${res.status})`);
  return decodeU(await res.arrayBuffer());
}
