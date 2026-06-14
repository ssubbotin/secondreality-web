import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { barQuads, type Quad } from './geometry.js';
import { BarLayer, PaletteResolve, PlaneStack } from './nodes.js';
import {
  BEAT_FLASH_LEVEL,
  beatFlashDecay,
  effectiveVm,
  initPhaseA,
  initPhaseB,
  type PhaseState,
  stepPhase,
} from './phase.js';

/** Authentic = chunky mode-X-resolution indexed look; modern = full-resolution smooth (default). */
export type LookMode = 'authentic' | 'modern';

/** Internal accumulation height in authentic mode (chunky mode-X pixels, upscaled to the canvas). */
const AUTHENTIC_HEIGHT = 240;

const SIM_HZ = 70; // original mode-X frame cadence
const SIM_DT = 1 / SIM_HZ;
const PHASE_A_SECONDS = 6; // KOE.C doit1(70*6)
const PHASE_B_SECONDS = 12; // KOE.C doit2(70*12)

export class TechnoBars implements Effect {
  readonly id = 'techno-bars';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private vpW = 1;
  private vpH = 1;
  private bars: BarLayer | null = null;
  private planes: PlaneStack | null = null;
  private palette: PaletteResolve | null = null;
  private simState: PhaseState = initPhaseA();
  private simClock = 0; // seconds fed to the fixed-step sim
  private simStep = 0; // monotonic sim-step counter, drives the plane cycling
  private acc = 0; // dt accumulator
  private flash = 0;
  private lastRow = -1;
  private quads: Quad[] = [];

  async load(_ctx: LoadContext): Promise<void> {
    // No external assets — tables are code (sin1024/palette).
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.vpW = ctx.viewport.width;
    this.vpH = ctx.viewport.height;
    this.bars = new BarLayer();
    this.rebuildTargets(); // sized for the current mode (creates the plane stack)
    this.palette = new PaletteResolve((this.planes as PlaneStack).textures());
    this.simState = initPhaseA();
    this.simClock = 0;
    this.simStep = 0;
    this.acc = 0;
  }

  /** dis_setmode equivalent — switch the authentic↔modern look (default modern). */
  setMode(mode: LookMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // re-size the planes; the palette rebinds to the new plane textures each frame in render().
    if (this.ctx) this.rebuildTargets();
  }

  /** Internal plane resolution: full viewport (modern) or chunky mode-X (authentic). */
  private internalSize(): { width: number; height: number } {
    if (this.mode === 'modern') return { width: this.vpW, height: this.vpH };
    const height = AUTHENTIC_HEIGHT;
    return { width: Math.max(1, Math.round((height * this.vpW) / this.vpH)), height };
  }

  /** (Re)create the 4-plane coverage stack at the mode's resolution and filtering. */
  private rebuildTargets(): void {
    const { width, height } = this.internalSize();
    this.planes?.dispose();
    this.planes = new PlaneStack(width, height);
    this.planes.setFilter(this.mode === 'authentic' ? NearestFilter : LinearFilter);
  }

  update(frame: FrameContext): void {
    // Beat flash on a new beat row (musrow & 7 == 7), decaying each sim step.
    const row = frame.clock.musrow;
    if (row !== this.lastRow) {
      this.lastRow = row;
      if ((row & 7) === 7) this.flash = BEAT_FLASH_LEVEL;
    }

    // Fixed-timestep sim so motion speed is display-fps-independent.
    this.acc += frame.dt;
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      this.simClock += SIM_DT;
      this.simStep++;
      // Phase A → B → A, self-advancing (the sequencer will gate entry via musplus/mframe later).
      if (this.simState.kind === 'A' && this.simClock >= PHASE_A_SECONDS) {
        this.simState = initPhaseB();
        this.simClock = 0;
      } else if (this.simState.kind === 'B' && this.simClock >= PHASE_B_SECONDS) {
        this.simState = initPhaseA();
        this.simClock = 0;
      }
      this.simState = stepPhase(this.simState);
      this.flash = beatFlashDecay(this.flash);
    }
    this.quads = barQuads(this.simState.rot, effectiveVm(this.simState));
    this.bars?.setQuads(this.quads);
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    if (!renderer || !this.planes || !this.bars || !this.palette) return;
    // Render the current solid bars into the live plane (cycles every PLANE_PERIOD sim-frames);
    // the other 3 planes hold older snapshots. The palette then maps each pixel's 4-bit plane
    // combination through the authentic purple palette; the beat flash brightens it.
    this.bars.render(renderer, this.planes.live(this.simStep), 1);
    this.palette.render(renderer, this.planes.textures(), target.gpu, this.flash);
  }

  resize(width: number, height: number): void {
    this.vpW = width;
    this.vpH = height;
    this.rebuildTargets();
  }

  dispose(): void {
    this.palette?.dispose();
    this.palette = null;
    this.planes?.dispose();
    this.planes = null;
    this.bars?.dispose();
    this.bars = null;
    this.ctx = null;
  }
}
