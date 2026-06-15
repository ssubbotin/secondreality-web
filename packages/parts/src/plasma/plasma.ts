// packages/parts/src/plasma/plasma.ts
import {
  Blit,
  type DemoContext,
  type Effect,
  type FrameContext,
  type LoadContext,
  type RenderTarget,
} from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { RenderTarget as GpuRenderTarget } from 'three/webgpu';
import { PLASMA_H, PLASMA_W, PlasmaField } from './nodes.js';
import { buildPlasmaPalettes, crossFade } from './palette.js';
import {
  INITTABLE_K,
  INITTABLE_L,
  moveplz,
  moveplzL,
  type PhaseK,
  sectionsPassed,
  TIMETABLE,
} from './phase.js';
import { buildPtau } from './tables.js';

/** authentic = chunky NearestFilter upscale; modern = smooth LinearFilter (default). */
export type LookMode = 'authentic' | 'modern';

const SIM_HZ = 70; // original VGA/copper frame cadence (moveplz runs per frame)
const SIM_DT = 1 / SIM_HZ;
const MFRAME_HZ = 50; // assumed song-tick rate (BPM·2/5 at 125 BPM) for the standalone lab loop
const FADE_FRAMES = 64; // cop_drop cross-fade span

// noUncheckedIndexedAccess makes array reads `T | undefined`; resolve to concrete values up front.
// The codebase forbids non-null assertions (`!`), so guard/fallback instead.
const INITK0: PhaseK = INITTABLE_K[0] ?? [3500, 2300, 3900, 3670];
const INITL0: PhaseK = INITTABLE_L[0] ?? [1000, 2000, 3000, 4000];
const SECTION_END = TIMETABLE[TIMETABLE.length - 1] ?? 0;

export class Plasma implements Effect {
  readonly id = 'plasma';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private readonly palettes = buildPlasmaPalettes(buildPtau());
  private field: PlasmaField | null = null;
  private fieldTarget: GpuRenderTarget | null = null;
  private blit: Blit | null = null;

  private k: PhaseK = INITK0;
  private l: PhaseK = INITL0;
  private section = 0;
  private fromSection = 0;
  private fade = FADE_FRAMES; // frames into the current cross-fade (starts settled)
  private mframe = 0; // elapsed mframes since (re)start
  private acc = 0;
  private settled = false; // true once the settled palette has been uploaded (skips per-frame churn)

  async load(_ctx: LoadContext): Promise<void> {
    // No external assets — tables are code.
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.field = new PlasmaField();
    this.fieldTarget = new GpuRenderTarget(PLASMA_W, PLASMA_H);
    this.blit = new Blit();
    this.blit.setSource(this.fieldTarget.texture);
    this.applyFilter();
    this.k = INITK0;
    this.l = INITL0;
    this.section = 0;
    this.fromSection = 0;
    this.fade = FADE_FRAMES;
    this.mframe = 0;
    this.acc = 0;
    this.settled = false;
  }

  /** dis_setmode equivalent — switch the authentic↔modern upscale filter (default modern). */
  setMode(mode: LookMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.applyFilter();
  }

  private applyFilter(): void {
    const tex = this.fieldTarget?.texture;
    if (!tex) return;
    const filter = this.mode === 'authentic' ? NearestFilter : LinearFilter;
    tex.minFilter = filter;
    tex.magFilter = filter;
    tex.needsUpdate = true;
  }

  update(frame: FrameContext): void {
    this.acc += frame.dt;
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      this.k = moveplz(this.k);
      this.l = moveplzL(this.l);
      this.mframe += MFRAME_HZ * SIM_DT;
      if (this.mframe >= SECTION_END) {
        // Loop the whole choreography (the sequencer will gate one-shot entry/exit later).
        this.mframe = 0;
        this.section = 0;
        this.fromSection = 0;
        this.fade = FADE_FRAMES;
        this.k = INITK0;
        this.l = INITL0;
        this.settled = false;
      }
      const passed = Math.min(sectionsPassed(this.mframe), this.palettes.length - 1);
      if (passed !== this.section) {
        this.fromSection = this.section;
        this.section = passed;
        this.fade = 0; // begin a fresh cross-fade
        this.k = INITTABLE_K[passed] ?? this.k;
        this.l = INITTABLE_L[passed] ?? this.l;
        this.settled = false;
      }
      if (this.fade < FADE_FRAMES) this.fade++;
    }
    const from = this.palettes[this.fromSection];
    const to = this.palettes[this.section];
    this.field?.setPhase(this.k, this.l);
    if (from && to) {
      // While a cross-fade is in progress, rebuild the blended LUT each frame; once settled, upload
      // the target palette once and stop re-allocating/re-uploading it every frame.
      if (this.fade < FADE_FRAMES) {
        this.field?.setPalette(crossFade(from, to, this.fade / FADE_FRAMES));
      } else if (!this.settled) {
        this.field?.setPalette(to);
        this.settled = true;
      }
    }
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    if (!renderer || !this.field || !this.fieldTarget || !this.blit) return;
    this.field.render(renderer, this.fieldTarget); // plasma → 320×280 field
    renderer.setRenderTarget(target.gpu); // upscale field → the supplied output target
    this.blit.render(renderer);
    renderer.setRenderTarget(null);
  }

  resize(_width: number, _height: number): void {
    // The field is a fixed logical size; the blit upscales to whatever target it is given.
  }

  dispose(): void {
    this.field?.dispose();
    this.field = null;
    this.fieldTarget?.dispose();
    this.fieldTarget = null;
    this.blit?.dispose();
    this.blit = null;
    this.ctx = null;
  }
}
