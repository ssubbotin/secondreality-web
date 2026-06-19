import { LinearFilter, type Texture, Vector2 } from 'three';
import { luminance, smoothstep, texture as textureNode, uniform, uv, vec4 } from 'three/tsl';
import {
  type RenderTarget as GpuRenderTarget,
  MeshBasicNodeMaterial,
  QuadMesh,
  RenderTarget as ThreeRenderTarget,
  type WebGPURenderer,
} from 'three/webgpu';
import { type BlurTap, blurKernel } from './bloom-math.js';

/**
 * Cross-backend bloom / glow post-process.
 *
 * A bright-pass threshold → separable Gaussian blur → additive composite chain, built entirely from
 * fullscreen `QuadMesh` + TSL passes (the same primitive `Blit` uses), so it runs identically on the
 * WebGPU and WebGL2 node backends — no instancing or compute that the WebGL2 path can't deliver.
 *
 * Pipeline (per `render`):
 *  1. bright-pass: sample the source, take luma, apply a soft-knee threshold, write `color·keep` into
 *     a HALF-resolution `bright` target (half-res widens the glow cheaply and is the standard trick).
 *  2. horizontal blur: `bright` → `blurA`, N symmetric Gaussian taps along X.
 *  3. vertical blur:   `blurA` → `blurB`, the same kernel along Y.
 *  4. composite: ONE fullscreen pass into the supplied output: `source.rgb + blurB.rgb · strength`.
 *     Done in a single draw (not copy-then-additive-blend) so the renderer's default autoClear can
 *     never wipe an earlier pass — the failure mode that bites multi-draw composites on WebGL2.
 *
 * Ergonomics mirror `Blit`: `setSource(tex)`, `render(renderer, target)`, `setStrength`/`setThreshold`,
 * `resize(w, h)`, `dispose()`. The output target is supplied by the caller (so a part composites bloom
 * straight into its `RenderTarget.gpu`); the scratch targets are owned here.
 */
export class BloomPass {
  /** Separable blur radius in (half-res) texels. 5 taps each side → a soft, wide glow. */
  private static readonly BLUR_RADIUS = 5;
  /** Internal scale of the blur targets relative to the output (half-res). */
  private static readonly DOWNSAMPLE = 2;

  private readonly thresholdU = uniform(0.6);
  private readonly kneeU = uniform(0.25);
  private readonly strengthU = uniform(1.0);
  /** Texel size (1/size) of the half-res blur targets; set in resize. */
  private readonly texelH = uniform(new Vector2(1 / 320, 0));
  private readonly texelV = uniform(new Vector2(0, 1 / 200));

  private readonly brightMat = new MeshBasicNodeMaterial();
  private readonly blurHMat = new MeshBasicNodeMaterial();
  private readonly blurVMat = new MeshBasicNodeMaterial();
  private readonly compositeMat = new MeshBasicNodeMaterial();

  private readonly brightQuad = new QuadMesh(this.brightMat);
  private readonly blurHQuad = new QuadMesh(this.blurHMat);
  private readonly blurVQuad = new QuadMesh(this.blurVMat);
  private readonly compositeQuad = new QuadMesh(this.compositeMat);

  private brightRT: GpuRenderTarget | null = null;
  private blurART: GpuRenderTarget | null = null;
  private blurBRT: GpuRenderTarget | null = null;
  private source: Texture | null = null;

  /** The texture to glow (the part's raster scratch RT). Rebuilds the source-dependent passes. */
  setSource(tex: Texture): void {
    this.source = tex;
    this.rebuildSourcePasses();
  }

  /** Glow intensity multiplier on the additive composite (default 1.0). */
  setStrength(strength: number): void {
    this.strengthU.value = strength;
  }

  /** Luma above which a pixel contributes to the glow (default 0.6); `knee` softens the edge. */
  setThreshold(threshold: number, knee = 0.25): void {
    this.thresholdU.value = threshold;
    this.kneeU.value = knee;
  }

  /**
   * (Re)allocate the half-res scratch targets to match the output size and rebuild the blur passes.
   * Must be called once before `render` (the parts call it from their own `resize`/`init`).
   */
  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width / BloomPass.DOWNSAMPLE));
    const h = Math.max(1, Math.floor(height / BloomPass.DOWNSAMPLE));
    if (this.brightRT && this.brightRT.width === w && this.brightRT.height === h) return;

    this.brightRT?.dispose();
    this.blurART?.dispose();
    this.blurBRT?.dispose();

    this.brightRT = makeTarget(w, h);
    this.blurART = makeTarget(w, h);
    this.blurBRT = makeTarget(w, h);

    this.texelH.value.set(1 / w, 0);
    this.texelV.value.set(0, 1 / h);
    this.rebuildBlurPasses();
    this.rebuildSourcePasses();
  }

  /**
   * Render the full bloom chain: the source plus its glow into `target`. No-op (and does not touch the
   * output) until both a source and the scratch targets exist. Each pass renders to a DISTINCT target,
   * and the final composite is a SINGLE QuadMesh draw (source + glow in one shader) — so the renderer's
   * default autoClear can never wipe a previous pass on the same target. Cross-backend safe.
   */
  render(renderer: WebGPURenderer, target: GpuRenderTarget): void {
    const src = this.source;
    const bright = this.brightRT;
    const blurA = this.blurART;
    const blurB = this.blurBRT;
    if (!src || !bright || !blurA || !blurB) return;

    renderer.setRenderTarget(bright);
    this.brightQuad.render(renderer);

    renderer.setRenderTarget(blurA);
    this.blurHQuad.render(renderer);

    renderer.setRenderTarget(blurB);
    this.blurVQuad.render(renderer);

    // Single combined composite into the supplied output: source.rgb + glow·strength.
    renderer.setRenderTarget(target);
    this.compositeQuad.render(renderer);
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.brightRT?.dispose();
    this.blurART?.dispose();
    this.blurBRT?.dispose();
    this.brightRT = null;
    this.blurART = null;
    this.blurBRT = null;
    this.brightMat.dispose();
    this.blurHMat.dispose();
    this.blurVMat.dispose();
    this.compositeMat.dispose();
  }

  /** The source-reading passes: the bright-pass threshold, plus the composite (rebuilt when ready). */
  private rebuildSourcePasses(): void {
    const src = this.source;
    if (!src) return;
    const c = textureNode(src, uv());
    // soft-knee bright pass on luma; `keep` is a 0..1 mask (mirrors bloom-math.brightPass) applied to
    // the colour so coloured highlights keep their hue.
    const lum = luminance(c.rgb);
    const lo = this.thresholdU.sub(this.kneeU);
    const hi = this.thresholdU.add(this.kneeU);
    const keep = smoothstep(lo, hi, lum); // 0 below the knee, 1 above; smooth in between
    this.brightMat.colorNode = vec4(c.rgb.mul(keep), 1);
    this.brightMat.needsUpdate = true;

    this.rebuildComposite();
  }

  /** The final composite: source.rgb + blurB.rgb·strength, in one fullscreen pass. */
  private rebuildComposite(): void {
    const src = this.source;
    const blurB = this.blurBRT;
    if (!src || !blurB) return;
    const base = textureNode(src, uv()).rgb;
    const glow = textureNode(blurB.texture, uv()).rgb.mul(this.strengthU);
    this.compositeMat.colorNode = vec4(base.add(glow), 1);
    this.compositeMat.needsUpdate = true;
  }

  /** Separable blur passes; both read scratch targets. The composite reads the blurred result. */
  private rebuildBlurPasses(): void {
    const bright = this.brightRT;
    const blurA = this.blurART;
    const blurB = this.blurBRT;
    if (!bright || !blurA || !blurB) return;
    const kernel = blurKernel(BloomPass.BLUR_RADIUS);

    this.blurHMat.colorNode = vec4(blurAccumulate(bright.texture, this.texelH, kernel), 1);
    this.blurHMat.needsUpdate = true;

    this.blurVMat.colorNode = vec4(blurAccumulate(blurA.texture, this.texelV, kernel), 1);
    this.blurVMat.needsUpdate = true;

    this.rebuildComposite();
  }
}

/** Draws an effect's frame into the supplied scratch target (e.g. a part's `surface.render`). */
export type DrawScene = (renderer: WebGPURenderer, scratch: GpuRenderTarget) => void;

/**
 * The MODERN-mode glow wiring a part calls. Owns a full-resolution scratch target plus a `BloomPass`,
 * so a part that already renders its raster into a target only has to: in modern mode call
 * `composite.render(renderer, output, (r, rt) => surface.render(r, rt))`; in authentic mode keep the
 * existing direct `surface.render(renderer, output)` — bloom is never touched and authentic is byte-for-
 * byte unchanged. Sizing the scratch to the OUTPUT keeps the glow at display resolution; the BloomPass
 * downsamples internally for the blur.
 */
export class BloomComposite {
  private readonly bloom = new BloomPass();
  private scratch: GpuRenderTarget | null = null;
  private width = 0;
  private height = 0;

  /** Glow intensity multiplier (default 1.0 in BloomPass). */
  setStrength(strength: number): void {
    this.bloom.setStrength(strength);
  }

  /** Luma threshold + soft knee for the bright pass. */
  setThreshold(threshold: number, knee?: number): void {
    if (knee === undefined) this.bloom.setThreshold(threshold);
    else this.bloom.setThreshold(threshold, knee);
  }

  /** (Re)size the scratch target and the bloom scratch buffers to the output resolution. */
  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.scratch && this.width === w && this.height === h) {
      this.bloom.resize(w, h);
      return;
    }
    this.width = w;
    this.height = h;
    this.scratch?.dispose();
    this.scratch = makeTarget(w, h);
    // The scratch texture identity changed → (re)bind the bloom source ONCE (not per frame; rebinding
    // recompiles the TSL graph, which is what makes per-frame setSource flaky on WebGL2).
    this.bloom.setSource(this.scratch.texture);
    this.bloom.resize(w, h);
  }

  /**
   * Render the part's frame through the glow into `output`. Lazily allocates the scratch target to the
   * output size if `resize` was not called yet, so a part can wire bloom without changing its `resize`.
   */
  render(renderer: WebGPURenderer, output: GpuRenderTarget, draw: DrawScene): void {
    if (!this.scratch || this.width !== output.width || this.height !== output.height) {
      this.resize(output.width, output.height);
    }
    const scratch = this.scratch;
    if (!scratch) return;
    draw(renderer, scratch);
    this.bloom.render(renderer, output);
  }

  dispose(): void {
    this.bloom.dispose();
    this.scratch?.dispose();
    this.scratch = null;
  }
}

/** A linear-filtered, clamp-to-edge colour target (no depth) for the blur scratch buffers. */
function makeTarget(w: number, h: number): GpuRenderTarget {
  const rt = new ThreeRenderTarget(w, h, { depthBuffer: false });
  rt.texture.minFilter = LinearFilter;
  rt.texture.magFilter = LinearFilter;
  rt.texture.generateMipmaps = false;
  return rt;
}

/** Sum the Gaussian taps of `tex` along the `texelStep` axis into an RGB node. */
function blurAccumulate(tex: Texture, texelStep: ReturnType<typeof uniform>, kernel: BlurTap[]) {
  const tap = (offset: number) => textureNode(tex, uv().add(texelStep.mul(offset))).rgb;
  // Sum each weighted tap; the kernel always has >= 3 taps (radius >= 1), so [0] exists.
  const first = kernel[0] ?? { offset: 0, weight: 1 };
  let acc = tap(first.offset).mul(first.weight);
  for (let i = 1; i < kernel.length; i++) {
    const t = kernel[i] ?? { offset: 0, weight: 0 };
    acc = acc.add(tap(t.offset).mul(t.weight));
  }
  return acc;
}
