import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { decodeFcPicture, fcBackground, fcBackpal } from './fc-picture.js';
import { MAIN_SOLID, SMALL_SOLID } from './geometry.js';
import { GlenzFill, type GlenzPolygon, SCREEN_H, SCREEN_W } from './glenz-fill.js';
import { GlenzSurface } from './nodes.js';
import { buildGlenzRenderPalette } from './palette.js';
import { buildSolidPolygons, projectSolid } from './render.js';
import { createGlenzState, type GlenzState, stepGlenz } from './sim.js';

/** The FC backdrop picture (GLENZ/FC.UH), the background the glenz solids OR over. */
const FC_PICTURE_URL = '/pics/FC.UH';

/** authentic = chunky 320x200 nearest upscale; modern = smooth LinearFilter upscale (default). */
export type LookMode = 'authentic' | 'modern';

const SIM_HZ = 70; // original mode-X frame cadence; the sim is fps-independent via the accumulator
const SIM_DT = 1 / SIM_HZ;
const ZPOS = 7500; // MAIN.C zpos
const LOOP_FRAME = 2100; // self-loop point in the lab (both solids have come and the scales collapse)

/**
 * Glenz vectors (part #4, original GLENZ). Real-time 3D additive "glass" solids spun over the FC backdrop
 * picture. update() advances the MAIN.C sim at a fixed 70 Hz; render() runs the full CPU pipeline
 * (rotate/scale/project/cull/colour each solid -> additive XOR fill ORed over the FC backdrop) into a
 * 320x200 index buffer, then blits it through the glenz render palette into the supplied target. The
 * background is GLENZ/FC.UH (the Future Crew logo backdrop) — MAIN.C draws it, snapshots it into `bgpic`,
 * and the glenz scanline filler ORs each solid over that snapshot (NEW.ASM ng_pass3 `or ah,fs:[di]`).
 * Both modes use the CPU rasteriser; the look toggles via the upscale filter (authentic = NearestFilter,
 * modern = LinearFilter). A real GPU-geometry additive renderer is deferred — see STATUS.
 */
export class Glenz implements Effect {
  readonly id = 'glenz';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  // Render palette + background are derived from the decoded FC picture in load(); a neutral fallback
  // (black backpal) keeps the part renderable if load() has not completed.
  private palette = buildGlenzRenderPalette(new Uint8Array(16 * 3));
  private readonly fill = new GlenzFill();
  private readonly index = new Uint8Array(SCREEN_W * SCREEN_H);
  private background: Uint8Array = new Uint8Array(SCREEN_W * SCREEN_H);
  private state: GlenzState = createGlenzState();
  private surface: GlenzSurface | null = null;
  private acc = 0;

  async load(_ctx: LoadContext): Promise<void> {
    // Decode the FC backdrop (FC.UH): its own 16-colour palette becomes the render-palette base and its
    // index plane becomes the background the additive glenz fill ORs over.
    const res = await fetch(FC_PICTURE_URL);
    if (!res.ok) throw new Error(`glenz: failed to load ${FC_PICTURE_URL} (${res.status})`);
    const pic = decodeFcPicture(await res.arrayBuffer());
    this.background = fcBackground(pic);
    this.palette = buildGlenzRenderPalette(fcBackpal(pic));
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.surface = new GlenzSurface(this.palette);
    this.state = createGlenzState();
    this.acc = 0;
    this.applyMode();
  }

  /** dis_setmode equivalent — switch the authentic<->modern look (default modern). */
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
      stepGlenz(this.state);
      if (this.state.frame >= LOOP_FRAME) {
        this.state = createGlenzState(); // self-loop in the lab
      }
    }

    // Build this frame's polygon list: the main solid always (while it has scale), the small solid after
    // frame 800 (MAIN.C gates `if(frame>800 && bscale>4)`).
    const s = this.state;
    const polys: GlenzPolygon[] = [];
    if (s.xscale > 4) {
      const proj = projectSolid(MAIN_SOLID, s.rx, s.ry, s.rz, s.xscale, s.yscale, s.zscale, {
        ox: s.oxp,
        oy: s.ypos + 1500 + s.oyp,
        oz: ZPOS + s.ozp,
      });
      for (const p of buildSolidPolygons(MAIN_SOLID, proj, s.lightshift)) polys.push(p);
    }
    if (s.frame > 800 && s.bscale > 4) {
      // MAIN.C rotates the second solid by (3600-rx/3, 3600-ry/3, 3600-rz/3) at uniform bscale.
      const proj = projectSolid(
        SMALL_SOLID,
        3600 - Math.trunc(s.rx / 3),
        3600 - Math.trunc(s.ry / 3),
        3600 - Math.trunc(s.rz / 3),
        s.bscale,
        s.bscale,
        s.bscale,
        { ox: s.oxb, oy: s.ypos + 1500 + s.oyb, oz: ZPOS + s.ozb },
      );
      for (const p of buildSolidPolygons(SMALL_SOLID, proj, s.lightshift)) polys.push(p);
    }

    // The FC backdrop is the static background; the additive glenz fill ORs the solids over it.
    this.fill.render(this.index, this.background, polys);
    this.surface?.update(this.index);
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    if (!renderer || !this.surface) return;
    this.surface.render(renderer, target.gpu);
  }

  resize(_width: number, _height: number): void {
    // The 320x200 field is fixed; the blit upscales to whatever target it is given.
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;
    this.ctx = null;
  }
}
