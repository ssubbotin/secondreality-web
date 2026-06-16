// packages/parts/src/rotozoomer/rotozoomer.ts
import {
  Blit,
  type DemoContext,
  type Effect,
  type FrameContext,
  type LoadContext,
  type RenderTarget,
} from '@sr/engine';
import {
  LinearFilter,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from 'three';
import { RenderTarget as GpuRenderTarget } from 'three/webgpu';
import { affineBasis } from './affine.js';
import { ROTO_H, ROTO_W, RotozoomLayer } from './nodes.js';
import { fadeLevel, INIT_PATH, type PathState, ROTO_FRAMES, stepPath } from './path.js';

/** authentic = chunky NearestFilter; modern = smooth LinearFilter (default). */
export type LookMode = 'authentic' | 'modern';

const SIM_HZ = 70; // original frame cadence
const SIM_DT = 1 / SIM_HZ;
const TEXTURE_URL = '/textures/rotozoom.png'; // served from apps/lab/public (authentic palette baked in)

export class Rotozoomer implements Effect {
  readonly id = 'rotozoomer';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';
  private picture: Texture | null = null;
  private layer: RotozoomLayer | null = null;
  private fieldTarget: GpuRenderTarget | null = null;
  private blit: Blit | null = null;

  private path: PathState = INIT_PATH;
  private acc = 0;

  async load(_ctx: LoadContext): Promise<void> {
    const tex = await new TextureLoader().loadAsync(TEXTURE_URL);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.colorSpace = SRGBColorSpace; // baked-RGB picture
    tex.generateMipmaps = false;
    this.picture = tex;
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    if (!this.picture) return;
    this.layer = new RotozoomLayer(this.picture);
    this.fieldTarget = new GpuRenderTarget(ROTO_W, ROTO_H);
    this.blit = new Blit();
    this.blit.setSource(this.fieldTarget.texture);
    this.applyFilter();
    this.path = INIT_PATH;
    this.acc = 0;
  }

  setMode(mode: LookMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.applyFilter();
  }

  private applyFilter(): void {
    const filter = this.mode === 'authentic' ? NearestFilter : LinearFilter;
    if (this.picture) {
      this.picture.minFilter = filter;
      this.picture.magFilter = filter;
      this.picture.needsUpdate = true;
    }
    const tex = this.fieldTarget?.texture;
    if (tex) {
      tex.minFilter = filter;
      tex.magFilter = filter;
      tex.needsUpdate = true;
    }
  }

  update(frame: FrameContext): void {
    this.acc += frame.dt;
    let pose = stepPath(this.path); // ensure at least one pose even at tiny dt
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      pose = stepPath(this.path);
      this.path = pose.state;
      if (this.path.frame >= ROTO_FRAMES) this.path = INIT_PATH; // self-loop in the lab
    }
    const b = affineBasis(pose);
    this.layer?.setBasis(b.startUV, b.colStep, b.rowStep);
    this.layer?.setFade(fadeLevel(this.path.frame));
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    if (!renderer || !this.layer || !this.fieldTarget || !this.blit) return;
    this.layer.render(renderer, this.fieldTarget);
    renderer.setRenderTarget(target.gpu);
    this.blit.render(renderer);
    renderer.setRenderTarget(null);
  }

  resize(_width: number, _height: number): void {
    // Fixed logical field; the blit upscales to whatever target it is given.
  }

  dispose(): void {
    this.layer?.dispose();
    this.layer = null;
    this.fieldTarget?.dispose();
    this.fieldTarget = null;
    this.blit?.dispose();
    this.blit = null;
    this.picture?.dispose();
    this.picture = null;
    this.ctx = null;
  }
}
