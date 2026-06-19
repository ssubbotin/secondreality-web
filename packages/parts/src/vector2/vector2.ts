import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import type { RMatrix } from './fixed.js';
import type { BakedModel } from './model.js';
import { RasterSurface, SCREEN_H, SCREEN_W } from './nodes.js';
import { parsePalette } from './palette.js';
import { createSceneRenderer, type SceneRenderer } from './renderer.js';

/** authentic = chunky 320×200 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

/**
 * Playback cadence for the baked U2E flythrough. The original advanced its animation counter in
 * half-VGA-frame units (currframe += 2) under a ~70 Hz copper, i.e. ≈ 35 decoded frames/second. We replay
 * the 1801 baked frames at that rate on a fixed-timestep accumulator so the flythrough speed is
 * display-fps-independent, then loop.
 */
const PLAY_HZ = 35;
const PLAY_DT = 1 / PLAY_HZ;

const MODEL_URL = '/models/vector2.json';
const PALETTE_URL = '/models/vector2.pal';

/**
 * Vector Part II — the KewlComplex city flythrough (part #18, original VISU/U2E). Loads the baked city
 * geometry (CITY.ASC, scaled into engine space) + the camera track decoded verbatim from U2E.0AB, then
 * replays it: each frame transforms the visible objects by the camera rmatrix, culls/shades/projects the
 * flat polygons (ACALC/ADRAW math) and fills them into a 320×200 palette-index buffer, blitted through the
 * U2E palette. Authentic = NearestFilter chunky upscale; modern = LinearFilter smooth upscale (both share
 * the CPU raster). The background picture/overlay is deferred (see STATUS).
 */
export class Vector2 implements Effect {
  readonly id = 'vector2';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private model: BakedModel | null = null;
  private palette: Uint8Array<ArrayBufferLike> = new Uint8Array(256 * 3);
  private renderer: SceneRenderer | null = null;
  private surface: RasterSurface | null = null;
  private readonly index = new Uint8Array(SCREEN_W * SCREEN_H);
  private frameIndex = 0;
  private acc = 0;

  /** Inject a pre-baked model directly (used by tests / the sequenced demo) instead of fetching. */
  setModel(model: BakedModel, palette: Uint8Array): void {
    this.model = model;
    this.palette = palette;
  }

  async load(_ctx: LoadContext): Promise<void> {
    if (this.model) return; // already injected
    if (typeof fetch !== 'function') return; // non-browser (tests drive the renderer directly)
    const [modelRes, palRes] = await Promise.all([fetch(MODEL_URL), fetch(PALETTE_URL)]);
    this.model = (await modelRes.json()) as BakedModel;
    this.palette = parsePalette(new Uint8Array(await palRes.arrayBuffer()));
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.surface = new RasterSurface(this.palette);
    if (this.model) this.renderer = createSceneRenderer(this.model);
    this.frameIndex = 0;
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
  }

  update(frame: FrameContext): void {
    const model = this.model;
    const renderer = this.renderer;
    if (!model || !renderer) return;

    this.acc += frame.dt;
    const total = model.frames.length;
    while (this.acc >= PLAY_DT) {
      this.acc -= PLAY_DT;
      this.frameIndex++;
      if (this.frameIndex >= total) this.frameIndex = 0; // self-loop in the lab
    }

    const f = model.frames[this.frameIndex];
    if (!f) return;
    const cam: RMatrix = { m: f.m, x: f.x, y: f.y, z: f.z };
    this.index.fill(0);
    renderer.render(this.index, cam, f.objects, this.frameIndex);
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
    this.renderer = null;
    this.ctx = null;
  }
}
