import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { Color } from 'three';
import { RenderTarget as GpuRenderTarget } from 'three/webgpu';
import { barQuads, type Quad } from './geometry.js';
import {
  BEAT_FLASH_LEVEL,
  beatFlashDecay,
  initPhaseA,
  initPhaseB,
  type PhaseState,
  stepPhase,
} from './phase.js';

const SIM_HZ = 70; // original mode-X frame cadence
const SIM_DT = 1 / SIM_HZ;
const PHASE_A_SECONDS = 6; // KOE.C doit1(70*6)
const PHASE_B_SECONDS = 12; // KOE.C doit2(70*12)

export class TechnoBars implements Effect {
  readonly id = 'techno-bars';

  private ctx: DemoContext | null = null;
  private accum: GpuRenderTarget | null = null;
  private simState: PhaseState = initPhaseA();
  private simClock = 0; // seconds fed to the fixed-step sim
  private acc = 0; // dt accumulator
  private flash = 0;
  private lastRow = -1;
  private quads: Quad[] = [];

  async load(_ctx: LoadContext): Promise<void> {
    // No external assets — tables are code (sin1024/palette).
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.accum = new GpuRenderTarget(ctx.viewport.width, ctx.viewport.height);
    this.simState = initPhaseA();
    this.simClock = 0;
    this.acc = 0;
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
      // Phase A then B, self-advancing (sequencer will gate entry later via musplus/mframe).
      if (this.simState.kind === 'A' && this.simClock >= PHASE_A_SECONDS) {
        this.simState = initPhaseB();
      }
      this.simState = stepPhase(this.simState);
      this.flash = beatFlashDecay(this.flash);
    }
    this.quads = barQuads(this.simState.rot, this.simState.vm);
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    if (!renderer) return;
    // Skeleton: clear the supplied target to a dark purple so we can confirm wiring.
    renderer.setRenderTarget(target.gpu);
    renderer.setClearColor(new Color(0.05, 0.0, 0.08), 1);
    renderer.clear();
    renderer.setRenderTarget(null);
  }

  resize(width: number, height: number): void {
    this.accum?.setSize(width, height);
  }

  dispose(): void {
    this.accum?.dispose();
    this.accum = null;
    this.ctx = null;
  }
}
