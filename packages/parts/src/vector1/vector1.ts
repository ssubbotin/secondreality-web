import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, NearestFilter } from 'three';
import { type AnimFrame, decodeAnimation } from './anim.js';
import { parseSceneMaterials, type SceneMaterials } from './assets.js';
import type { RMatrix } from './fixed.js';
import { type Model, parseModel } from './model.js';
import { type ModernObject, RasterSurface, VectorScene } from './nodes.js';
import { rasterFrame } from './raster.js';
import { buildFramePolys, SCREEN_H, SCREEN_W, type SceneObject } from './scene.js';

export type LookMode = 'authentic' | 'modern';

const SIM_HZ = 70; // mode-X frame cadence; the track plays fps-independently via the accumulator
const SIM_DT = 1 / SIM_HZ;

/** Where to fetch the vendored U2A binaries from (lab public dir). */
const MODEL_BASE = 'models/vector1';
const MODEL_FILES = ['u2a.001', 'u2a.002', 'u2a.003'] as const;

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`vector1: failed to load ${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Vector Part I — "Space battle" (part #8, original VISU/U2A). The Pixel ships sweep past a static observer
 * driven by the baked U2A.0AB animation track. load() fetches the compiled engine objects + palette +
 * stream; update() advances the 70 Hz track on an accumulator and decodes the current frame's object poses;
 * render() draws via the CPU flat-poly raster (authentic, chunky mode-X) or real three.js flat-shaded
 * meshes (modern, default), into the supplied RenderTarget. The track loops at frame 521 (resetscene).
 *
 * The U2A background picture + copper palette animation are deferred (the picture pipeline) — the field is
 * a flat dark clear. See the STATUS doc.
 */
export class Vector1 implements Effect {
  readonly id = 'vector1';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';

  private models: Model[] = [];
  private materials: SceneMaterials | null = null;
  private frames: AnimFrame[] = [];
  private cam: RMatrix = { m: [16384, 0, 0, 0, 16384, 0, 0, 0, 16384], x: 0, y: 0, z: 0 };

  private surface: RasterSurface | null = null;
  private vectorScene: VectorScene | null = null;
  private readonly index = new Uint8Array(SCREEN_W * SCREEN_H);

  private acc = 0;
  private frameIdx = 0;

  async load(_ctx: LoadContext): Promise<void> {
    const [o1, o2, o3, mat, anim] = await Promise.all([
      ...MODEL_FILES.map((f) => fetchBytes(`${MODEL_BASE}/${f}`)),
      fetchBytes(`${MODEL_BASE}/u2a.00m`),
      fetchBytes(`${MODEL_BASE}/u2a.0ab`),
    ]);
    if (!o1 || !o2 || !o3 || !mat || !anim) throw new Error('vector1: missing scene asset');
    this.models = [parseModel(o1), parseModel(o2), parseModel(o3)];
    this.materials = parseSceneMaterials(mat);
    const decoded = decodeAnimation(anim);
    this.frames = decoded.frames;
    // The camera is co[0]'s (static) matrix; read it from the first frame.
    const c0 = this.frames[0]?.slots[0];
    if (c0) this.cam = { m: [...c0.m], x: c0.x, y: c0.y, z: c0.z };
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    const pal = this.materials?.palette ?? new Uint8Array(768);
    this.surface = new RasterSurface(pal);
    this.vectorScene = new VectorScene(this.models, pal, this.cam);
    this.vectorScene.setSize(ctx.viewport.width, ctx.viewport.height);
    this.acc = 0;
    this.frameIdx = 0;
    this.applyMode();
  }

  /** dis_setmode equivalent — switch authentic<->modern (default modern). */
  setMode(mode: LookMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.applyMode();
  }

  private applyMode(): void {
    this.surface?.setFilter(this.mode === 'authentic' ? NearestFilter : LinearFilter);
  }

  /** Map the active frame's slots onto the scene-object instances (slot -> mesh via the object index). */
  private objectsForFrame(frame: AnimFrame): { cpu: SceneObject[]; gpu: ModernObject[] } {
    const cpu: SceneObject[] = [];
    const gpu: ModernObject[] = [];
    const mat = this.materials;
    if (!mat) return { cpu, gpu };
    for (let slot = 1; slot < mat.conum; slot++) {
      const objIdx = mat.objectIndex[slot - 1] ?? 1;
      const model = this.models[objIdx - 1];
      const s = frame.slots[slot];
      if (!model || !s) continue;
      const r0: RMatrix = { m: [...s.m], x: s.x, y: s.y, z: s.z };
      cpu.push({ model, r0, on: s.on });
      gpu.push({ model, r0, on: s.on });
    }
    return { cpu, gpu };
  }

  update(frame: FrameContext): void {
    if (this.frames.length === 0) return;
    this.acc += frame.dt;
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      this.frameIdx++;
      if (this.frameIdx >= this.frames.length) this.frameIdx = 0; // loop (resetscene)
    }
    const active = this.frames[this.frameIdx];
    if (!active) return;
    const { cpu, gpu } = this.objectsForFrame(active);

    if (this.mode === 'modern') {
      this.vectorScene?.update(gpu);
    } else {
      const polys = buildFramePolys(cpu, this.cam);
      rasterFrame(this.index, polys, 0);
      this.surface?.update(this.index);
    }
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    if (!renderer) return;
    if (this.mode === 'modern') this.vectorScene?.render(renderer, target.gpu);
    else this.surface?.render(renderer, target.gpu);
  }

  resize(width: number, height: number): void {
    this.vectorScene?.setSize(width, height);
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;
    this.vectorScene?.dispose();
    this.vectorScene = null;
    this.ctx = null;
  }
}
