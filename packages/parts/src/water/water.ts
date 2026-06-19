import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { composeWaterFrame } from './blit.js';
import { WaterSurface } from './nodes.js';
import { decodeRix } from './picture.js';
import { Scroller } from './scroller.js';
import { parseWatFrame, SCREEN_H, SCREEN_W, type WatFrame } from './wat-data.js';

/** authentic = chunky 320×200 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

const SIM_HZ = 70; // original mode-X frame cadence (the `waitr` vsync); fps-independent via the accumulator
const SIM_DT = 1 / SIM_HZ;

/** Served from apps/lab/public/pics (verbatim DOS data). */
const BG_URL = '/pics/water-bkg.clx';
const FONT_URL = '/pics/water-font.clx';
const WAT_URLS = ['/pics/water-wat1.dat', '/pics/water-wat2.dat', '/pics/water-wat3.dat'];

/**
 * Part #9 — "Mirror-ball water scroll" (original `WATER` / `RAYSCRL`). The POV-Ray ray-traced mirror-ball
 * still (`BKG.CLX`) is the backdrop; a horizontal text scroller (`FONT.CLX`, the `_miekka` strip) is
 * reflected and warped across the rippling water by cycling three baked displacement frames
 * (`WAT1/2/3.DAT`) through `Putrouts1` (see blit.ts / scroller.ts). Fixed-timestep accumulator at 70 Hz
 * advances the ripple phase `sss` 0→1→2→0; on wrap to 0 the scroller advances one column (DEMO.PAS).
 */
export class Water implements Effect {
  readonly id = 'water';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';

  private bg: Uint8Array = new Uint8Array(SCREEN_W * SCREEN_H);
  private palette: Uint8Array = new Uint8Array(768);
  private font: Uint8Array = new Uint8Array(0);
  private frames: WatFrame[] = [];

  private readonly scroller = new Scroller();
  private readonly index = new Uint8Array(SCREEN_W * SCREEN_H);
  private surface: WaterSurface | null = null;

  /** Ripple-frame phase (`sss`: 0→1→2→0). */
  private phase = 0;
  private acc = 0;
  private loaded = false;

  async load(_ctx: LoadContext): Promise<void> {
    const asBuf = async (url: string): Promise<Uint8Array> => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`water: failed to load ${url} (${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    };
    const [bgRaw, fontRaw, ...watRaw] = await Promise.all([
      asBuf(BG_URL),
      asBuf(FONT_URL),
      ...WAT_URLS.map(asBuf),
    ]);
    const bgPic = decodeRix(bgRaw);
    this.bg = bgPic.pixels;
    const fontPic = decodeRix(fontRaw);
    this.font = fontPic.pixels; // 400×34 strip, row-major
    // DEMO.PAS loads the active VGA palette from `_miekka+10` (the FONT.CLX header), NOT from BKG.CLX:
    //   move(mem[seg(_miekka):ofs(_miekka)+10], pal, 768);
    // The two palettes share indices 0..191 (the mirror-ball backdrop) but differ for 192..255 — exactly
    // the colours the scroll glyphs use. Using BKG.CLX's palette mis-maps the scroller; the `_miekka`
    // palette (carried verbatim in FONT.CLX) is the truth for the whole scene.
    this.palette = fontPic.palette; // 6-bit VGA `_miekka` palette; used for background + scroller alike
    this.frames = watRaw.map((b) => parseWatFrame(b));
    this.loaded = true;
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    if (!this.loaded) return;
    this.surface = new WaterSurface(this.palette);
    this.scroller.reset();
    this.phase = 0;
    this.acc = 0;
    this.applyMode();
    // Prime the buffer with the static background so the very first frame is correct.
    const f0 = this.frames[0];
    if (f0) composeWaterFrame(this.index, this.bg, f0, this.scroller.fbuf);
    this.surface?.update(this.index);
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
    if (!this.loaded || this.frames.length === 0) return;
    this.acc += frame.dt;
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      // DEMO.PAS main loop: scr(sss); if sss = 2 then { sss := 0; scroll } else inc(sss);
      if (this.phase === 2) {
        this.phase = 0;
        this.scroller.scrollStep(this.font);
      } else {
        this.phase += 1;
      }
    }
    const f = this.frames[this.phase] ?? this.frames[0];
    if (f) composeWaterFrame(this.index, this.bg, f, this.scroller.fbuf);
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
