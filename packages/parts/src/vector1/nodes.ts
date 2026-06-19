import { Blit } from '@sr/engine';
import {
  BufferGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  type MagnificationTextureFilter,
  Matrix4,
  Mesh,
  NearestFilter,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import {
  type RenderTarget as GpuRenderTarget,
  MeshLambertNodeMaterial,
  type WebGPURenderer,
} from 'three/webgpu';
import { applyMatrix, cloneMatrix, type RMatrix, UNIT } from './fixed.js';
import type { Model } from './model.js';
import { SCREEN_H, SCREEN_W } from './scene.js';

const BLACK = new Color(0, 0, 0);

/**
 * Authentic surface: maps the 320x200 palette-index buffer through the 6-bit VGA palette (x4) into an RGBA
 * DataTexture and blits it to the supplied target (the dot-tunnel/glenz RasterSurface pattern). sRGB-tagged
 * so the DAC bytes land verbatim; rows flipped on write (index buffer is top-row-first, three's uv origin
 * is bottom-left); NearestFilter = chunky mode-X, LinearFilter = smoothed.
 */
export class RasterSurface {
  private readonly rgba = new Uint8Array(SCREEN_W * SCREEN_H * 4);
  private readonly tex: DataTexture;
  private readonly blit = new Blit();
  private readonly palette: Uint8Array;

  constructor(palette: Uint8Array) {
    this.palette = palette;
    this.tex = new DataTexture(this.rgba, SCREEN_W, SCREEN_H, RGBAFormat, UnsignedByteType);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.minFilter = NearestFilter;
    this.tex.magFilter = NearestFilter;
    this.tex.needsUpdate = true;
    this.blit.setSource(this.tex);
  }

  setFilter(filter: MagnificationTextureFilter): void {
    this.tex.minFilter = filter;
    this.tex.magFilter = filter;
    this.tex.needsUpdate = true;
  }

  update(index: Uint8Array): void {
    for (let row = 0; row < SCREEN_H; row++) {
      const src = row * SCREEN_W;
      const dst = (SCREEN_H - 1 - row) * SCREEN_W; // flip vertically
      for (let col = 0; col < SCREEN_W; col++) {
        const c = index[src + col] ?? 0;
        const d = (dst + col) * 4;
        this.rgba[d] = (this.palette[c * 3] ?? 0) * 4;
        this.rgba[d + 1] = (this.palette[c * 3 + 1] ?? 0) * 4;
        this.rgba[d + 2] = (this.palette[c * 3 + 2] ?? 0) * 4;
        this.rgba[d + 3] = 255;
      }
    }
    this.tex.needsUpdate = true;
  }

  render(renderer: WebGPURenderer, target: GpuRenderTarget): void {
    renderer.setRenderTarget(target);
    this.blit.render(renderer);
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.tex.dispose();
    this.blit.dispose();
  }
}

/** Resolve a 6-bit VGA palette entry (x4) to a linear-ish three.js Color (sRGB DAC byte). */
function paletteColor(palette: Uint8Array, index: number): Color {
  const r = (palette[index * 3] ?? 0) * 4;
  const g = (palette[index * 3 + 1] ?? 0) * 4;
  const b = (palette[index * 3 + 2] ?? 0) * 4;
  const c = new Color();
  c.setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
  return c;
}

/** One scene mesh instance for the modern renderer: its mesh + the per-frame world matrix + on flag. */
export interface ModernObject {
  model: Model;
  r0: RMatrix;
  on: boolean;
}

/**
 * Convert an engine view-space matrix (rows m[0..8] scaled by UNIT, translation x/y/z) to a three.js
 * column-major 16-element model matrix, applying the (1,-1,-1) engine->three flip (engine view space is
 * x-right / y-down / z-into-screen; three is x-right / y-up / z-toward-camera). Pure; unit-tested.
 */
export function engineToViewMatrix(r: RMatrix): number[] {
  const s = 1 / UNIT;
  const m = r.m;
  // Row-major affine rows (with rows 1,2 negated and translation Y/Z negated):
  //   [ m0  m1  m2 | x ]
  //   [-m3 -m4 -m5 |-y ]
  //   [-m6 -m7 -m8 |-z ]
  // three.Matrix4.set takes row-major; .elements stores column-major. Return column-major directly.
  return [
    (m[0] ?? 0) * s,
    -((m[3] ?? 0) * s),
    -((m[6] ?? 0) * s),
    0,
    (m[1] ?? 0) * s,
    -((m[4] ?? 0) * s),
    -((m[7] ?? 0) * s),
    0,
    (m[2] ?? 0) * s,
    -((m[5] ?? 0) * s),
    -((m[8] ?? 0) * s),
    0,
    r.x,
    -r.y,
    -r.z,
    1,
  ];
}

interface MeshEntry {
  /** One Mesh per material colour group (so each face group gets its flat base colour). */
  meshes: { mesh: Mesh; baseColor: number }[];
}

/**
 * Modern renderer: real three.js geometry in *view space* (the same space the CPU pipeline projects into),
 * with a perspective camera matching the mode-X projection (projmulx/y -> fov, projaddx/y = the principal
 * point at the screen centre). Each ship is one flat-shaded mesh whose model matrix is the engine world
 * matrix `applyMatrix(r0, cam)` converted to three's column-major Matrix4 (with Y flipped: engine screen Y
 * grows downward, three grows upward). A directional light along the engine's `newlight` gives the same
 * flat shading direction.
 */
export class VectorScene {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly entries = new Map<Model, MeshEntry>();
  private readonly light = new DirectionalLight(0xffffff, 1.0);
  private readonly tmp = new Matrix4();

  constructor(
    models: readonly Model[],
    private readonly palette: Uint8Array,
    private readonly cam: RMatrix,
  ) {
    // Perspective: mode-X projmulx=250 over the 320-wide field -> horizontal fov; we drive the camera by
    // the same projmul so the on-screen scale matches the authentic raster. The engine projects with
    // sx = mulX*x/z + addX, i.e. focal length mulX in pixels over a 320-wide image. Vertical fov from mulY.
    const aspect = SCREEN_W / SCREEN_H;
    // Vertical fov from the engine's vertical focal length mulY=220 over the 200-row field (addY=100).
    const vfov = 2 * Math.atan(SCREEN_H / 2 / 220) * (180 / Math.PI);
    this.camera = new PerspectiveCamera(vfov, aspect, 1, 1e9);
    // The geometry is supplied already in *engine view space* (camera-applied), so the three camera stays
    // at the origin with its default orientation (looking down -Z). We convert engine view space (x-right,
    // y-down, z-into-screen) to three view space (x-right, y-up, z-toward-camera) with the (1,-1,-1) flip
    // baked into each object's model matrix below.
    this.camera.position.set(0, 0, 0);

    // Light along the engine `newlight` direction, with the same (1,-1,-1) flip as the geometry, so the
    // flat shading lands the same way as the authentic raster.
    this.light.position.set(12118, -10603, -3030).normalize();
    this.scene.add(this.light);

    for (const model of models) this.entries.set(model, this.buildMesh(model));
  }

  /** Build flat-shaded geometry grouped by material base colour (one Mesh per distinct face colour). */
  private buildMesh(model: Model): MeshEntry {
    const byColor = new Map<number, number[][]>();
    for (const face of model.faces) {
      // Triangulate the face fan.
      for (let k = 1; k + 1 < face.v.length; k++) {
        const tri = [face.v[0] ?? 0, face.v[k] ?? 0, face.v[k + 1] ?? 0];
        const list = byColor.get(face.color) ?? [];
        list.push(tri);
        byColor.set(face.color, list);
      }
    }
    const meshes: { mesh: Mesh; baseColor: number }[] = [];
    for (const [color, tris] of byColor) {
      const positions: number[] = [];
      for (const tri of tris) {
        for (const idx of tri) {
          const v = model.vertices[idx];
          if (!v) {
            positions.push(0, 0, 0);
            continue;
          }
          positions.push(v.x, v.y, v.z);
        }
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
      geo.computeVertexNormals();
      // DoubleSide: the (1,-1,-1) view-space flip mirrors handedness so triangle winding inverts; rather
      // than re-wind every face, draw both sides and let the depth buffer + directional flat shading
      // resolve visibility (the authentic path culls explicitly; the modern path leans on real lighting).
      const mat = new MeshLambertNodeMaterial({
        color: paletteColor(this.palette, color),
        flatShading: true,
        side: DoubleSide,
      });
      const mesh = new Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.scene.add(mesh);
      meshes.push({ mesh, baseColor: color });
    }
    return { meshes };
  }

  /** Place each enabled object using the engine world matrix (camera-applied), Y/Z flipped for three. */
  update(objects: readonly ModernObject[]): void {
    // Hide everything first.
    for (const entry of this.entries.values()) {
      for (const m of entry.meshes) m.mesh.visible = false;
    }
    for (const obj of objects) {
      if (!obj.on) continue;
      const entry = this.entries.get(obj.model);
      if (!entry) continue;
      const r = applyMatrix(cloneMatrix(obj.r0), this.cam);
      this.tmp.fromArray(engineToViewMatrix(r));
      for (const me of entry.meshes) {
        me.mesh.visible = true;
        me.mesh.matrixAutoUpdate = false;
        me.mesh.matrix.copy(this.tmp);
      }
    }
  }

  setSize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render(renderer: WebGPURenderer, target: GpuRenderTarget): void {
    renderer.setRenderTarget(target);
    renderer.setClearColor(BLACK, 1);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      for (const me of entry.meshes) {
        me.mesh.geometry.dispose();
        (me.mesh.material as MeshLambertNodeMaterial).dispose();
      }
    }
    this.entries.clear();
  }
}
