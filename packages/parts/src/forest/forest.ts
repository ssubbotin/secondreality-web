import {
  type DemoContext,
  decodeLbm,
  type Effect,
  type FrameContext,
  type LoadContext,
  type RenderTarget,
} from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { blitBackground, stampPhase } from './compose.js';
import { type PosTable, parsePos, SCREEN_PIXELS } from './pos.js';
import { parseScrolltext, Scroller } from './scrolltext.js';
import { ForestSurface } from './surface.js';

/** authentic = chunky 320×200 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

/** Vendored FOREST assets (see the design doc). */
const BACKGROUND_URL = '/pics/HILLBACK.LBM';
const SCROLLTEXT_URL = '/pics/OFOREST.SCI';
const POS_URLS = ['/pics/POS1.DAT', '/pics/POS2.DAT', '/pics/POS3.DAT'] as const;

const SIM_HZ = 70; // original dis_waitb / mode-X cadence; the scroll is fps-independent via the accumulator
const SIM_DT = 1 / SIM_HZ;
/** Number of warp phases (POS1/2/3); the font advances only on the last phase, as READ2.PAS does. */
const PHASE_COUNT = 3;
const SCROLL_PHASE = PHASE_COUNT - 1; // sss == 2

/** Decoded assets resolved by load(), held until init() builds the GPU surface. */
interface ForestAssets {
  background: Uint8Array;
  palette6: Uint8Array;
  scrolltext: Uint8Array;
  pos: PosTable[];
}

async function fetchBytes(url: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Forest: failed to fetch ${url} (HTTP ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Part #16 — "Mountain scroller" (FOREST / MNTSCRL). Ports the shipped `READ2.PAS` runtime: a static
 * mountain-lake background (`HILLBACK.LBM`) onto which a scrolltext (`OFOREST.SCI`) is additively stamped,
 * warped into the lake reflection by three precomputed phases (`POS1/2/3.DAT`). Each sim step composites
 * the active phase; the font window scrolls one column on the third phase. A fixed 70 Hz accumulator keeps
 * the scroll speed display-fps-independent. authentic = chunky NearestFilter upscale; modern = LinearFilter.
 */
export class Forest implements Effect {
  readonly id = 'forest';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private assets: ForestAssets | null = null;
  private surface: ForestSurface | null = null;
  private scroller: Scroller | null = null;
  private readonly screen = new Uint8Array(SCREEN_PIXELS);
  private phase = 0;
  private acc = 0;
  private dirty = true;

  async load(_ctx: LoadContext): Promise<void> {
    const fetchImpl: typeof fetch = fetch;
    const [bgBytes, sciBytes, ...posBytes] = await Promise.all([
      fetchBytes(BACKGROUND_URL, fetchImpl),
      fetchBytes(SCROLLTEXT_URL, fetchImpl),
      ...POS_URLS.map((u) => fetchBytes(u, fetchImpl)),
    ]);
    const decoded = decodeLbm(bgBytes);
    this.assets = {
      background: decoded.indices,
      palette6: decoded.palette6,
      scrolltext: parseScrolltext(sciBytes),
      pos: posBytes.map((b) => parsePos(b)),
    };
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    const assets = this.assets;
    if (!assets) throw new Error('Forest.init called before load resolved');
    this.surface = new ForestSurface(assets.palette6);
    this.scroller = new Scroller(assets.scrolltext);
    this.phase = 0;
    this.acc = 0;
    // Prime the first composite (phase 0 over the background) so frame 0 is not blank before the first
    // accumulated sim step.
    this.stepPhase();
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
    if (!this.assets || !this.scroller) return;
    this.acc += frame.dt;
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      this.stepPhase();
    }
  }

  /**
   * One `scr(sss)` step, in the original order: composite the current phase (background copy + additive
   * `Putrouts` warp stamp with the *current* font), then on the last phase scroll the font one column, then
   * advance the phase index. The latest composite is what render() uploads.
   */
  private stepPhase(): void {
    const scroller = this.scroller;
    const assets = this.assets;
    if (!scroller || !assets) return;
    const pos = assets.pos[this.phase] ?? assets.pos[0];
    if (pos) {
      blitBackground(this.screen, assets.background);
      stampPhase(this.screen, scroller.font, pos);
    }
    if (this.phase === SCROLL_PHASE) scroller.step();
    this.phase = (this.phase + 1) % PHASE_COUNT;
    this.dirty = true;
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    const surface = this.surface;
    if (!renderer || !surface) return;
    if (this.dirty) {
      surface.update(this.screen);
      this.dirty = false;
    }
    surface.render(renderer, target.gpu);
  }

  resize(_width: number, _height: number): void {
    // The composited 320×200 field is fixed; the blit upscales to whatever target it is handed.
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;
    this.scroller = null;
    this.ctx = null;
    this.assets = null;
  }
}
