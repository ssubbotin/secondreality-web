import {
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  type Texture,
  UnsignedByteType,
} from 'three';
import { clamp, texture as textureNode, uniform, uv, vec2, vec3 } from 'three/tsl';
import {
  AdditiveBlending,
  type RenderTarget as GpuRenderTarget,
  MeshBasicNodeMaterial,
  QuadMesh,
  type WebGPURenderer,
} from 'three/webgpu';
import { buildTechnoPalette } from './palette.js';
import type { Quad } from './geometry.js';

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
 * Fullscreen pass: map the accumulation buffer's overlap count through the original 16×16 purple
 * palette. The accumulation stores one additive unit per covering bar, so its red channel is the
 * overlap count `a` (0..15); the beat flash supplies the brightness row `c` (0..15). NearestFilter
 * keeps the palette stepped (the authentic indexed look).
 */
export class PaletteResolve {
  private readonly lut: DataTexture;
  private readonly flashUniform = uniform(0);
  private readonly material = new MeshBasicNodeMaterial();
  private readonly quad: QuadMesh;

  constructor(accumTexture: Texture) {
    const pal = buildTechnoPalette(); // 16×16×3, VGA 6-bit (0..63)
    const data = new Uint8Array(16 * 16 * 4);
    for (let i = 0; i < 16 * 16; i++) {
      data[i * 4] = (pal[i * 3] ?? 0) * 4; // 6-bit -> 8-bit
      data[i * 4 + 1] = (pal[i * 3 + 1] ?? 0) * 4;
      data[i * 4 + 2] = (pal[i * 3 + 2] ?? 0) * 4;
      data[i * 4 + 3] = 255;
    }
    this.lut = new DataTexture(data, 16, 16, RGBAFormat, UnsignedByteType);
    this.lut.minFilter = NearestFilter;
    this.lut.magFilter = NearestFilter;
    this.lut.needsUpdate = true;

    const overlap = clamp(textureNode(accumTexture, uv()).r, 0, 15); // a
    const flash = clamp(this.flashUniform, 0, 15); // c
    const lutUv = vec2(overlap.add(0.5).div(16), flash.add(0.5).div(16));
    this.material.colorNode = textureNode(this.lut, lutUv);
    this.quad = new QuadMesh(this.material);
  }

  /** Resolve `accum` into `target`, with the current beat-flash level (0..15) brightening it. */
  render(renderer: WebGPURenderer, target: GpuRenderTarget, flash: number): void {
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
