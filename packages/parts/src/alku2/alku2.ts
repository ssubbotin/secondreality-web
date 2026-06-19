import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { composeFrame } from './compose.js';
import { SCREEN_H, SCREEN_W } from './copper.js';
import { type BitmapFont, decodeU, loadFona } from './font.js';
import { decodeHoi } from './hoi.js';
import { RasterSurface } from './nodes.js';
import { buildAlku2Palette } from './palette.js';
import { CREDIT_CARDS, PER_CARD_SCROLL, scrollAt } from './scroll.js';
import { addText, CENTER_X, makeTextBuffer, TBUF_W } from './text-buffer.js';

/** authentic = chunky 320×200 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

/** The original opening field is locked to the ~70 Hz vblank (frame_count); we drive the same cadence. */
const SIM_HZ = 70;
const SIM_DT = 1 / SIM_HZ;

/** How far (in scroll pixels) a card travels right→left across its window: full screen + its own width. */
const CARD_TRAVEL = SCREEN_W + TBUF_W;

/** Decoded assets resolved by load(), held until init() builds the surface. */
interface Alku2Assets {
  font: BitmapFont;
  hoi: Uint8Array;
  palette: Uint8Array;
}

async function fetchU(url: string): Promise<ReturnType<typeof decodeU>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`alku2: failed to load ${url} (${res.status})`);
  return decodeU(await res.arrayBuffer());
}

/** Fetch the HOI horizon picture and decode it via the `hzpic` read path (palette@16, pixels@add*16). */
async function fetchHoi(url: string): Promise<ReturnType<typeof decodeHoi>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`alku2: failed to load ${url} (${res.status})`);
  return decodeHoi(await res.arrayBuffer());
}

/**
 * Part #2 — "Opening texts II" (ALKU, the scroller section). Ports `MAIN.C` section 2 (`MAIN.C:79-152`): the
 * HOI picture pans horizontally behind a chunky XOR-plane credit scroller, the four FC credit cards entering
 * from the right one after another. We render the *visible* result — the HOI window plus the scrolled text
 * band — through a CPU raster → 6-bit palette LUT, on a fixed 70 Hz accumulator so the scroll speed is
 * display-fps-independent. authentic = NearestFilter chunky upscale; modern = LinearFilter smooth upscale.
 */
export class Alku2 implements Effect {
  readonly id = 'alku2';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private assets: Alku2Assets | null = null;
  private surface: RasterSurface | null = null;
  /** One stamped text buffer per credit card, built once in init(). */
  private cardBufs: Uint8Array[] = [];
  private readonly index = new Uint8Array(SCREEN_W * SCREEN_H);
  private frame = 0;
  private acc = 0;
  private dirty = true;

  async load(_ctx: LoadContext): Promise<void> {
    const [fona, hoi] = await Promise.all([fetchU('/pics/FONA.UH'), fetchHoi('/pics/HOI.U')]);
    this.assets = {
      font: loadFona(fona),
      hoi: hoi.indices,
      palette: buildAlku2Palette(hoi.palette),
    };
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    const assets = this.assets;
    if (!assets) throw new Error('Alku2.init called before load resolved');
    this.surface = new RasterSurface(assets.palette);
    this.cardBufs = buildCardBuffers(assets.font);
    this.frame = 0;
    this.acc = 0;
    this.dirty = true;
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
    if (!this.assets) return;
    this.acc += frame.dt;
    let advanced = false;
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      this.frame++;
      advanced = true;
    }
    if (advanced) {
      this.composeInto(this.frame);
      this.dirty = true;
    }
  }

  /** Build the index buffer for sim-frame `f`: HOI backdrop pan + the active card's scrolled text. */
  private composeInto(f: number): void {
    const assets = this.assets;
    if (!assets) return;
    const { scroll, card } = scrollAt(f);
    const tbuf = this.cardBufs[card] ?? this.cardBufs[0] ?? makeTextBuffer();
    // The card's local progress within its window maps to a right→left travel across the screen.
    const local = scroll - card * PER_CARD_SCROLL;
    const textScroll = Math.trunc((local * CARD_TRAVEL) / PER_CARD_SCROLL);
    composeFrame(this.index, assets.hoi, tbuf, scroll, textScroll);
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    const surface = this.surface;
    if (!renderer || !surface) return;
    if (this.dirty) {
      surface.update(this.index);
      this.dirty = false;
    }
    surface.render(renderer, target.gpu);
  }

  resize(_width: number, _height: number): void {
    // The 320×200 field is fixed; the host blit upscales it to whatever target it is given.
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;
    this.cardBufs = [];
    this.ctx = null;
    this.assets = null;
  }
}

/**
 * Stamp every credit card into its own chunky text buffer, centred on x=160 (`addtext(160, …)`,
 * `MAIN.C:103-128`). Built once; the scroller translates each buffer horizontally per frame.
 */
export function buildCardBuffers(font: BitmapFont): Uint8Array[] {
  return CREDIT_CARDS.map((cardDef) => {
    const buf = makeTextBuffer();
    for (const line of cardDef.lines) addText(buf, font, CENTER_X, line.y, line.text);
    return buf;
  });
}
