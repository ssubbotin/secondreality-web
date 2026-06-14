import {
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  type MagnificationTextureFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
} from 'three';
import { clamp, step, texture as textureNode, uniform, uv, vec2, vec3 } from 'three/tsl';
import {
  AdditiveBlending,
  RenderTarget as GpuRenderTarget,
  MeshBasicNodeMaterial,
  QuadMesh,
  type WebGPURenderer,
} from 'three/webgpu';
import type { Quad } from './geometry.js';
import { buildTechnoPalette } from './palette.js';

const QUAD_COUNT = 11;
const VERTS_PER_QUAD = 6; // two triangles
const VERTEX_COUNT = QUAD_COUNT * VERTS_PER_QUAD; // 66
const FLOATS_PER_VERTEX = 3; // x, y, z

const BLACK = new Color(0, 0, 0);

/**
 * Additive accumulation pass for the 11 techno bars. The quad corners come from `barQuads` in the
 * original 320×200 screen space (centre 160,100, Y down). An orthographic camera maps that space
 * directly onto the target, so corners are uploaded verbatim. Bars draw as additive grey/white so
 * overlaps brighten — palette mapping and the feedback trail are layered on in later passes.
 */
export class BarLayer {
  // Float32BufferAttribute copies its input, so it owns the only buffer we write into (setQuads
  // writes attribute.array directly — writing a separate array would never reach the GPU).
  private readonly attribute = new Float32BufferAttribute(
    new Float32Array(VERTEX_COUNT * FLOATS_PER_VERTEX),
    FLOATS_PER_VERTEX,
  );
  private readonly geometry = new BufferGeometry();
  private readonly intensityUniform = uniform(1);
  private readonly material = new MeshBasicNodeMaterial();
  private readonly scene = new Scene();
  // Frame the original 320×200 space (centre 160,100, Y down). The long bars overfill it — exactly
  // as on the original 320×200 screen, so the formation reaches the edges instead of floating.
  private readonly camera = new OrthographicCamera(0, 320, 0, 200, -1, 1);

  constructor() {
    this.geometry.setAttribute('position', this.attribute);
    this.material.colorNode = vec3(this.intensityUniform);
    this.material.blending = AdditiveBlending;
    this.material.transparent = true;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    // The Y-inverted ortho (top=0, bottom=200) flips winding, so draw both sides; the bars also
    // sweep well outside any once-computed bounding sphere, so skip frustum culling.
    this.material.side = DoubleSide;
    const mesh = new Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /** Overwrite the corner positions for all 11 quads (two triangles each). */
  setQuads(quads: Quad[]): void {
    const p = this.attribute.array as Float32Array;
    let o = 0;
    const write = (x: number, y: number): void => {
      p[o++] = x;
      p[o++] = y;
      p[o++] = 0;
    };
    for (let i = 0; i < QUAD_COUNT; i++) {
      const q = quads[i];
      if (!q) {
        // Degenerate (collapse to origin) if fewer than 11 quads are supplied.
        for (let v = 0; v < VERTS_PER_QUAD; v++) write(0, 0);
        continue;
      }
      // Triangle (c1, c2, c3)
      write(q.x1, q.y1);
      write(q.x2, q.y2);
      write(q.x3, q.y3);
      // Triangle (c1, c3, c4)
      write(q.x1, q.y1);
      write(q.x3, q.y3);
      write(q.x4, q.y4);
    }
    this.attribute.needsUpdate = true;
  }

  /** Additively draw the bars into `target`, scaled by `intensity` (clears target to black first). */
  render(renderer: WebGPURenderer, target: GpuRenderTarget, intensity: number): void {
    this.intensityUniform.value = intensity;
    renderer.setRenderTarget(target);
    renderer.setClearColor(BLACK, 1);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Sim-frames between plane snapshots — the original's page-flip period (`pl` cycles 1,2,4,8). */
export const PLANE_PERIOD = 8;

/**
 * The original composites the solid bars into one of 4 VGA bit-planes, cycling the plane every
 * page-flip period (~8 frames). A pixel's colour then comes from its 4-bit plane combination —
 * which of the last 4 snapshots covered it. We reproduce that with 4 coverage targets: the "live"
 * one is re-rendered every frame (smooth current motion); the other 3 hold frozen snapshots ~8/16/24
 * sim-frames old, supplying the temporal depth that makes the look cycle pink-ribbon ↔ grey-lattice.
 */
export class PlaneStack {
  private readonly planes: GpuRenderTarget[];

  constructor(width: number, height: number) {
    this.planes = [0, 1, 2, 3].map(() => new GpuRenderTarget(width, height));
  }

  /** The target to render the current coverage into; cycles every PLANE_PERIOD sim-frames. */
  live(simStep: number): GpuRenderTarget {
    return this.planes[Math.floor(simStep / PLANE_PERIOD) % 4] as GpuRenderTarget;
  }

  /** The four plane coverage textures (LUT assembly is order-independent). */
  textures(): [Texture, Texture, Texture, Texture] {
    const p = this.planes;
    return [
      (p[0] as GpuRenderTarget).texture,
      (p[1] as GpuRenderTarget).texture,
      (p[2] as GpuRenderTarget).texture,
      (p[3] as GpuRenderTarget).texture,
    ];
  }

  /** Crisp (NearestFilter) vs smooth (LinearFilter) upscaling of the planes to the output. */
  setFilter(filter: MagnificationTextureFilter): void {
    for (const p of this.planes) {
      p.texture.minFilter = filter;
      p.texture.magFilter = filter;
      p.texture.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const p of this.planes) p.dispose();
  }
}

/**
 * Fullscreen pass mapping the 4 plane coverages through the authentic 16×16 palette. Each plane
 * contributes one bit of the 4-bit index `a` (covered → 1); `buildTechnoPalette` resolves `a` by
 * popcount → base purple (more planes set → brighter), exactly as the original VGA palette did. The
 * beat flash drives the brightness row `c`. NearestFilter keeps the indexed steps crisp.
 */
export class PaletteResolve {
  private readonly lut: DataTexture;
  private readonly flashUniform = uniform(0);
  private readonly p0: ReturnType<typeof textureNode>;
  private readonly p1: ReturnType<typeof textureNode>;
  private readonly p2: ReturnType<typeof textureNode>;
  private readonly p3: ReturnType<typeof textureNode>;
  private readonly material = new MeshBasicNodeMaterial();
  private readonly quad: QuadMesh;

  constructor(planes: [Texture, Texture, Texture, Texture]) {
    // Authentic palette: 16 brightness rows (c) × 16 plane-combination columns (a), VGA 6-bit → 8-bit.
    const pal = buildTechnoPalette();
    const data = new Uint8Array(16 * 16 * 4);
    for (let i = 0; i < 16 * 16; i++) {
      data[i * 4] = (pal[i * 3] ?? 0) * 4;
      data[i * 4 + 1] = (pal[i * 3 + 1] ?? 0) * 4;
      data[i * 4 + 2] = (pal[i * 3 + 2] ?? 0) * 4;
      data[i * 4 + 3] = 255;
    }
    this.lut = new DataTexture(data, 16, 16, RGBAFormat, UnsignedByteType);
    this.lut.minFilter = NearestFilter;
    this.lut.magFilter = NearestFilter;
    // The palette holds literal VGA DAC bytes (6-bit→8-bit). Tag the LUT sRGB so the sample-decode
    // and the output-pass sRGB-encode cancel: the raw bytes land on the canvas verbatim, instead of
    // being treated as linear and brightened/desaturated into a grey wash.
    this.lut.colorSpace = SRGBColorSpace;
    this.lut.needsUpdate = true;

    this.p0 = textureNode(planes[0], uv());
    this.p1 = textureNode(planes[1], uv());
    this.p2 = textureNode(planes[2], uv());
    this.p3 = textureNode(planes[3], uv());
    // a = b0 + 2·b1 + 4·b2 + 8·b3, each bit = "this plane covered" (coverage ≥ 0.5).
    const a = step(0.5, this.p0.r)
      .add(step(0.5, this.p1.r).mul(2))
      .add(step(0.5, this.p2.r).mul(4))
      .add(step(0.5, this.p3.r).mul(8));
    const c = clamp(this.flashUniform, 0, 15);
    const lutUv = vec2(a.add(0.5).div(16), c.add(0.5).div(16));
    this.material.colorNode = textureNode(this.lut, lutUv);
    this.quad = new QuadMesh(this.material);
  }

  /** Resolve the 4 plane coverages into `target`, brightened by the beat-flash level (0..15). */
  render(
    renderer: WebGPURenderer,
    planes: [Texture, Texture, Texture, Texture],
    target: GpuRenderTarget,
    flash: number,
  ): void {
    this.p0.value = planes[0];
    this.p1.value = planes[1];
    this.p2.value = planes[2];
    this.p3.value = planes[3];
    this.flashUniform.value = flash;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.lut.dispose();
    this.material.dispose();
  }
}
