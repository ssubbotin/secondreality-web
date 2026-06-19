// packages/parts/src/plasma/plasma.ts
import {
  Blit,
  BloomComposite,
  type DemoContext,
  type Effect,
  type FrameContext,
  type LoadContext,
  type RenderTarget,
} from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { RenderTarget as GpuRenderTarget } from 'three/webgpu';
import { PLASMA_H, PLASMA_W, PlasmaField } from './nodes.js';
import { buildPlasmaPalettes } from './palette.js';
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

// Modern-mode bloom tuning. Plasma fills the whole frame with colour, so the threshold is HIGH: only
// the brightest plasma crests bloom into a soft glow; the mid-tone body of the field stays as-is rather
// than washing the screen out. Authentic mode never constructs the bloom.
const BLOOM_THRESHOLD = 0.72;
const BLOOM_KNEE = 0.2;
const BLOOM_STRENGTH = 0.7;

export class Plasma implements Effect {
  readonly id = 'plasma';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private readonly palettes = buildPlasmaPalettes(buildPtau());
  private field: PlasmaField | null = null;
  private fieldTarget: GpuRenderTarget | null = null;
  private blit: Blit | null = null;
  private bloom: BloomComposite | null = null;

  private k: PhaseK = INITK0;
  private l: PhaseK = INITL0;
  private section = 0;
  private fromSection = 0;
  private fade = FADE_FRAMES; // frames into the current cross-fade (starts settled)
  private mframe = 0; // elapsed mframes since (re)start
  private acc = 0;

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
    const p0 = this.palettes[0];
    if (p0) this.field.setPalettes(p0, p0);
    this.field.setFade(1);
  }

  /** dis_setmode equivalent — switch the authentic↔modern upscale filter (default modern). */
  setMode(mode: LookMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.applyFilter();
  }

  private applyFilter(): void {
    const tex = this.fieldTarget?.texture;
    if (tex) {
      const filter = this.mode === 'authentic' ? NearestFilter : LinearFilter;
      tex.minFilter = filter;
      tex.magFilter = filter;
      tex.needsUpdate = true;
    }
    // Bloom exists only in modern mode; authentic upscales the field straight through, unchanged.
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

  update(frame: FrameContext): void {
    this.acc += frame.dt;
    let sectionChanged = false;
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
        sectionChanged = true;
      }
      const passed = Math.min(sectionsPassed(this.mframe), this.palettes.length - 1);
      if (passed !== this.section) {
        this.fromSection = this.section;
        this.section = passed;
        this.fade = 0; // begin a fresh cross-fade
        this.k = INITTABLE_K[passed] ?? this.k;
        this.l = INITTABLE_L[passed] ?? this.l;
        sectionChanged = true;
      }
      if (this.fade < FADE_FRAMES) this.fade++;
    }
    this.field?.setPhase(this.k, this.l);
    // Swap the LUT pair only when the section changed (rare); the per-frame motion is the fade uniform.
    // The palette textures stay stable between sections — WebGL2 doesn't reliably re-upload a texture
    // every frame, which is why the cross-fade is a shader mix rather than a CPU palette rebuild.
    if (sectionChanged) {
      const from = this.palettes[this.fromSection];
      const to = this.palettes[this.section];
      if (from && to) this.field?.setPalettes(from, to);
    }
    this.field?.setFade(Math.min(this.fade / FADE_FRAMES, 1));
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    const field = this.field;
    const fieldTarget = this.fieldTarget;
    const blit = this.blit;
    if (!renderer || !field || !fieldTarget || !blit) return;
    if (this.bloom) {
      // Modern: render the field, upscale it into the bloom scratch, then bloom → the supplied target.
      this.bloom.render(renderer, target.gpu, (r, scratch) => {
        field.render(r, fieldTarget); // plasma → 320×280 field
        r.setRenderTarget(scratch); // upscale field → bloom scratch
        blit.render(r);
        r.setRenderTarget(null);
      });
    } else {
      field.render(renderer, fieldTarget); // plasma → 320×280 field
      renderer.setRenderTarget(target.gpu); // upscale field → the supplied output target
      blit.render(renderer);
      renderer.setRenderTarget(null);
    }
  }

  resize(width: number, height: number): void {
    // The field is a fixed logical size; the blit upscales to whatever target it is given. The bloom
    // scratch buffers track the output resolution so the glow is sharp.
    this.bloom?.resize(width, height);
  }

  dispose(): void {
    this.field?.dispose();
    this.field = null;
    this.fieldTarget?.dispose();
    this.fieldTarget = null;
    this.blit?.dispose();
    this.blit = null;
    this.bloom?.dispose();
    this.bloom = null;
    this.ctx = null;
  }
}
