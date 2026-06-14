import {
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  HalfFloatType,
  type MagnificationTextureFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  type Texture,
  UnsignedByteType,
} from 'three';
import { clamp, max, texture as textureNode, uniform, uv, vec2, vec3 } from 'three/tsl';
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
  // Frame a region well larger than 320×200 and centred on (160,100): the bar formation reaches
  // ~±300 px from centre, so a 1:1 frame would be entirely overfilled. Y increases downward.
  private readonly camera = new OrthographicCamera(-340, 660, -212, 412, -1, 1);

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

/**
 * Two-target ping-pong feedback: `out = max(current, fade·previous)`, recreating the original's
 * page-flip motion accumulation so the rotating bars leave fading trails (bounded, so the centre
 * stays defined). Targets are half-float so values can exceed 1.0. `render` returns the freshly
 * written trail texture each frame.
 */
export class Trail {
  private targetA: GpuRenderTarget;
  private targetB: GpuRenderTarget;
  private read: GpuRenderTarget;
  private write: GpuRenderTarget;
  private readonly fadeUniform = uniform(0.72);
  private readonly currentNode: ReturnType<typeof textureNode>;
  private readonly prevNode: ReturnType<typeof textureNode>;
  private readonly material = new MeshBasicNodeMaterial();
  private readonly quad: QuadMesh;

  constructor(currentTexture: Texture, width: number, height: number) {
    this.targetA = new GpuRenderTarget(width, height, { type: HalfFloatType });
    this.targetB = new GpuRenderTarget(width, height, { type: HalfFloatType });
    this.read = this.targetA;
    this.write = this.targetB;
    this.currentNode = textureNode(currentTexture, uv());
    this.prevNode = textureNode(this.read.texture, uv());
    // Bounded feedback: keep the brightest of "covered now" vs "the fading past", so the centre
    // stays defined (no runaway accumulation to white) while the rotation history decays cleanly.
    this.material.colorNode = max(this.currentNode, this.prevNode.mul(this.fadeUniform));
    this.quad = new QuadMesh(this.material);
  }

  /** Advance the trail by one frame (reading the accumulation bound at construction). */
  render(renderer: WebGPURenderer): Texture {
    this.prevNode.value = this.read.texture;
    renderer.setRenderTarget(this.write);
    this.quad.render(renderer);
    renderer.setRenderTarget(null);
    const swap = this.read;
    this.read = this.write;
    this.write = swap;
    return this.read.texture;
  }

  setSize(width: number, height: number): void {
    this.targetA.setSize(width, height);
    this.targetB.setSize(width, height);
  }

  /** Crisp (NearestFilter) vs smooth (LinearFilter) upscaling of the trail to the output. */
  setFilter(filter: MagnificationTextureFilter): void {
    for (const t of [this.targetA, this.targetB]) {
      t.texture.minFilter = filter;
      t.texture.magFilter = filter;
      t.texture.needsUpdate = true;
    }
  }

  dispose(): void {
    this.targetA.dispose();
    this.targetB.dispose();
    this.material.dispose();
  }
}

/**
 * Fullscreen pass mapping a coverage/trail texture through a purple ramp. A continuous trail can't
 * index the authentic plane-bitmask palette directly (that is the Approach-C path), so the palette's
 * five base purples are interpolated into a smooth monotonic 16-step ramp: trail 0 → black, high →
 * bright purple. The beat flash drives the brightness row `c`. NearestFilter keeps the steps crisp.
 */
export class PaletteResolve {
  private readonly lut: DataTexture;
  private readonly flashUniform = uniform(0);
  private readonly scaleUniform = uniform(5); // trail value → coverage step (0..15)
  private readonly sourceNode: ReturnType<typeof textureNode>;
  private readonly material = new MeshBasicNodeMaterial();
  private readonly quad: QuadMesh;

  constructor(initialSource: Texture) {
    const pal = buildTechnoPalette(); // [c*16+a]*3, VGA 6-bit
    const tierA = [0, 1, 3, 7, 15]; // popcount 0..4 → the five base purples
    const data = new Uint8Array(16 * 16 * 4);
    for (let c = 0; c < 16; c++) {
      for (let k = 0; k < 16; k++) {
        const f = (k / 15) * 4;
        const t0 = Math.floor(f);
        const t1 = Math.min(4, t0 + 1);
        const fr = f - t0;
        for (let ch = 0; ch < 3; ch++) {
          const v0 = pal[(c * 16 + (tierA[t0] ?? 0)) * 3 + ch] ?? 0;
          const v1 = pal[(c * 16 + (tierA[t1] ?? 0)) * 3 + ch] ?? 0;
          data[(c * 16 + k) * 4 + ch] = Math.round((v0 * (1 - fr) + v1 * fr) * 4); // 6-bit → 8-bit
        }
        data[(c * 16 + k) * 4 + 3] = 255;
      }
    }
    this.lut = new DataTexture(data, 16, 16, RGBAFormat, UnsignedByteType);
    this.lut.minFilter = NearestFilter;
    this.lut.magFilter = NearestFilter;
    this.lut.needsUpdate = true;

    this.sourceNode = textureNode(initialSource, uv());
    const coverage = clamp(this.sourceNode.r.mul(this.scaleUniform), 0, 15);
    const flash = clamp(this.flashUniform, 0, 15);
    const lutUv = vec2(coverage.add(0.5).div(16), flash.add(0.5).div(16));
    this.material.colorNode = textureNode(this.lut, lutUv);
    this.quad = new QuadMesh(this.material);
  }

  /** Resolve `sourceTex` (the trail) into `target`, brightened by the beat-flash level (0..15). */
  render(
    renderer: WebGPURenderer,
    sourceTex: Texture,
    target: GpuRenderTarget,
    flash: number,
  ): void {
    this.sourceNode.value = sourceTex;
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
