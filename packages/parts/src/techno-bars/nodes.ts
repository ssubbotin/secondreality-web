import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  OrthographicCamera,
  Scene,
} from 'three';
import { uniform, vec3 } from 'three/tsl';
import {
  AdditiveBlending,
  type RenderTarget as GpuRenderTarget,
  MeshBasicNodeMaterial,
  type WebGPURenderer,
} from 'three/webgpu';
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
  private readonly positions = new Float32Array(VERTEX_COUNT * FLOATS_PER_VERTEX);
  private readonly attribute = new Float32BufferAttribute(this.positions, FLOATS_PER_VERTEX);
  private readonly geometry = new BufferGeometry();
  private readonly intensityUniform = uniform(1);
  private readonly material = new MeshBasicNodeMaterial();
  private readonly scene = new Scene();
  // left=0, right=320, top=0, bottom=200 → original coords map 1:1 with Y increasing downward.
  private readonly camera = new OrthographicCamera(0, 320, 0, 200, -1, 1);

  constructor() {
    this.geometry.setAttribute('position', this.attribute);
    this.material.colorNode = vec3(this.intensityUniform);
    this.material.blending = AdditiveBlending;
    this.material.transparent = true;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.scene.add(new Mesh(this.geometry, this.material));
  }

  /** Overwrite the corner positions for all 11 quads (two triangles each). */
  setQuads(quads: Quad[]): void {
    const p = this.positions;
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
