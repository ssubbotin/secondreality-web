import {
  BloomComposite,
  type DemoContext,
  type Effect,
  type FrameContext,
  type LoadContext,
  type RenderTarget,
} from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { RasterSurface } from './nodes.js';
import { buildStarPalette } from './palette.js';
import { SCREEN_H, SCREEN_W, StarRaster } from './raster.js';
import {
  advanceReveal,
  compositeReveal,
  createRevealState,
  type RevealState,
  scheduleReveal,
  TEXTPIC_DATA_OFFSET,
} from './reveal.js';
import { createStarState, palfadeScale, type StarState, stepStars } from './star-sim.js';
import { buildMuldivX, buildMuldivY } from './tables.js';
import { type DecodedTextpic, decodeTextpic } from './textpic.js';

/** authentic = chunky 320×200 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

/** Vendored DDSTARS overlay art — the `_textpic` "Desert Dream" text/picture (TEXTS.16). */
const TEXTPIC_URL = '/pics/TEXTS.16';

const SIM_HZ = 70; // original mode-X frame cadence; the sim is fps-independent via the accumulator
const SIM_DT = 1 / SIM_HZ;
/**
 * Self-loop cap in the lab (the original exits at its own `int 0FCh, bx=2`; we restart the field). Set past
 * the second text reveal + its hold (block 2 arms at frame 3200; `startxtclose` keeps it up ~1500 ticks more)
 * so both "Desert Dream" credit blocks fully play before the field restarts.
 */
const LIFETIME = 5200;

// Modern-mode bloom tuning. The field is bright stars + the "Desert Dream" reveal over black; a low
// threshold blooms the lit stars and text while black stays black, a moderate strength gives a soft
// twinkle halo. Authentic mode never constructs the bloom.
const BLOOM_THRESHOLD = 0.45;
const BLOOM_KNEE = 0.2;
const BLOOM_STRENGTH = 1.1;

export class DDStars implements Effect {
  readonly id = 'ddstars';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private readonly muldivx = buildMuldivX();
  private readonly muldivy = buildMuldivY();
  private readonly palette = buildStarPalette();
  private state: StarState = createStarState();
  private reveal: RevealState = createRevealState();
  private readonly raster = new StarRaster();
  private readonly index = new Uint8Array(SCREEN_W * SCREEN_H);
  private surface: RasterSurface | null = null;
  private bloom: BloomComposite | null = null;
  private textpic: DecodedTextpic | null = null;
  private acc = 0;

  async load(_ctx: LoadContext): Promise<void> {
    // The procedural star field is pure code; the "Desert Dream" text/picture overlay is the vendored
    // `_textpic` art (TEXTS.16), decoded here and composited on the reveal schedule (STARS.ASM `risetext`).
    const res = await fetch(TEXTPIC_URL);
    if (!res.ok) throw new Error(`DDStars: failed to fetch ${TEXTPIC_URL} (HTTP ${res.status})`);
    this.textpic = decodeTextpic(new Uint8Array(await res.arrayBuffer()));
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.surface = new RasterSurface(this.palette);
    this.state = createStarState();
    this.reveal = createRevealState();
    this.raster.reset();
    this.acc = 0;
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
    // Bloom exists only in modern mode; authentic blits the raster straight through, unchanged.
    if (this.mode === 'modern') {
      if (!this.bloom) {
        this.bloom = new BloomComposite();
        this.bloom.setThreshold(BLOOM_THRESHOLD, BLOOM_KNEE);
        this.bloom.setStrength(BLOOM_STRENGTH);
      }
    } else {
      this.bloom?.dispose();
      this.bloom = null;
    }
  }

  /**
   * Run the "Desert Dream" text/picture reveal for the current tick over the freshly rendered star frame
   * (STARS.ASM `do_stars` `@@st1`/`@@st2` schedule + `risetext`). The original calls `risetext` *before* the
   * star copy loops, but those loops protect the text band via the `_nostar1`/`_nostar2` clip (active in
   * STARS.OK); the final STARS.ASM left that clip commented out. We composite the reveal *after* the star
   * raster — the faithful visible result of the clipped copy (stars skip the text band, the text remains).
   */
  private applyReveal(): void {
    const tp = this.textpic;
    if (!tp) return;
    scheduleReveal(this.reveal, this.state.frame);
    const use = advanceReveal(this.reveal);
    const srcOffset = TEXTPIC_DATA_OFFSET + this.reveal.startxtp0;
    compositeReveal(this.index, use, srcOffset, tp.indices, tp.width, tp.height);
  }

  update(frame: FrameContext): void {
    this.acc += frame.dt;
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      stepStars(this.state, this.muldivx, this.muldivy);
      this.raster.render(this.index, this.state);
      this.applyReveal();
      if (this.state.frame >= LIFETIME) {
        this.state = createStarState();
        this.reveal = createRevealState();
        this.raster.reset();
      }
    }
    // Both modes render the CPU rasteriser; the look toggles via the upscale filter (authentic = chunky
    // NearestFilter, modern = smooth LinearFilter), matching the shipped dot-tunnel cross-backend path. The
    // GPU instanced-point renderer (StarCloud, parked in nodes.ts) is kept for the post-chain/bloom pass.
    this.surface?.update(this.index, palfadeScale(this.state));
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    const surface = this.surface;
    if (!renderer || !surface) return;
    if (this.bloom) {
      // Modern: raster → scratch, then bloom (bright-pass → blur → composite) → the supplied target.
      this.bloom.render(renderer, target.gpu, (r, scratch) => surface.render(r, scratch));
    } else {
      // Authentic: blit the chunky raster straight through, unchanged.
      surface.render(renderer, target.gpu);
    }
  }

  resize(width: number, height: number): void {
    // The 320×200 field is fixed; the blit upscales to whatever target it is given. The bloom scratch
    // buffers track the output resolution so the glow is sharp.
    this.bloom?.resize(width, height);
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;
    this.bloom?.dispose();
    this.bloom = null;
    this.ctx = null;
  }
}
