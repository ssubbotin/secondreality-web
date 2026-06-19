import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { decodeU } from './decode-u.js';
import { type BitmapFont, loadFona } from './font.js';
import { SCREEN_W } from './layout.js';
import { RasterSurface } from './nodes.js';
import { buildCreditsPalette } from './palette.js';
import { rasterField, SCREEN_H } from './raster.js';
import { contentHeight } from './scroll.js';
import { parseScrollText } from './scrolltext.js';

/** authentic = chunky 640×400 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

/** Vendored ENDSCRL assets. (FONA-END.UH is the end-scroll font, distinct from ALKU's /pics/FONA.UH.) */
const FONT_URL = '/pics/FONA-END.UH';
const TEXT_URL = '/pics/ENDSCROL.TXT';

/** The original do_scroll runs at the ~70 Hz vblank; the accumulator keeps the scroll fps-independent. */
const SIM_HZ = 70;
const SIM_DT = 1 / SIM_HZ;

/** Decoded assets resolved by load(), held until init() builds the GPU surface. */
interface CreditsAssets {
  font: BitmapFont;
  lines: readonly string[];
}

async function fetchBytes(url: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Credits: failed to fetch ${url} (HTTP ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Part #20 — "Credits / greetings scroll" (ENDSCRL). Ports `ENDSCRL/MAIN.C`: a vertical scroller of
 * horizontally centred text lines drawn from the `FONA.UH` bitmap font, scrolling up one pixel per frame,
 * content from `ENDSCROL.TXT`. Each text line is `FONAY` (30) pixels tall with no gap. A fixed 70 Hz
 * accumulator keeps the scroll speed display-fps-independent; the scroll loops (default-loop playback).
 * authentic = chunky NearestFilter upscale; modern = smooth LinearFilter.
 */
export class Credits implements Effect {
  readonly id = 'credits';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private assets: CreditsAssets | null = null;
  private surface: RasterSurface | null = null;
  private readonly palette = buildCreditsPalette();
  private readonly index = new Uint8Array(SCREEN_W * SCREEN_H);
  private height = 0;
  private frame = 0;
  private acc = 0;
  private dirty = true;

  async load(_ctx: LoadContext): Promise<void> {
    const fetchImpl: typeof fetch = fetch;
    const [fontBytes, textBytes] = await Promise.all([
      fetchBytes(FONT_URL, fetchImpl),
      fetchBytes(TEXT_URL, fetchImpl),
    ]);
    this.assets = {
      font: loadFona(decodeU(fontBytes)),
      lines: parseScrollText(textBytes).lines,
    };
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    const assets = this.assets;
    if (!assets) throw new Error('Credits.init called before load resolved');
    this.surface = new RasterSurface(this.palette);
    this.height = contentHeight(assets.lines.length);
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
    if (!this.assets) return;
    this.acc += frame.dt;
    let advanced = false;
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      this.frame++;
      advanced = true;
    }
    if (advanced) this.composeInto(this.frame);
  }

  /** Rasterise the visible window for sim-frame `f` into the index field and mark it for upload. */
  private composeInto(f: number): void {
    const assets = this.assets;
    if (!assets) return;
    rasterField(this.index, assets.font, assets.lines, f, this.height);
    this.dirty = true;
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
    // The composited 640×400 field is fixed; the host blit upscales it to whatever target it is handed.
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;
    this.ctx = null;
    this.assets = null;
  }
}
