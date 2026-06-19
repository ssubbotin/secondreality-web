import { Blit } from '@sr/engine';
import {
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  type MagnificationTextureFilter,
  type Matrix4,
  Mesh,
  NearestFilter,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import { texture as textureNode, uv } from 'three/tsl';
import {
  type RenderTarget as GpuRenderTarget,
  RenderTarget as GpuRenderTargetImpl,
  MeshBasicNodeMaterial,
  type WebGPURenderer,
} from 'three/webgpu';
import { PLASMA_H, PLASMA_W, PlasmaField } from '../plasma/nodes.js';
import { CUBE_FACES, CUBE_POINTS } from './cube.js';
import { compositeToRgb, SCREEN_H, SCREEN_W } from './raster.js';
import { TILE_H, TILE_W } from './texture.js';

const BLACK = new Color(0, 0, 0);

/**
 * Authentic renderer: the CPU rasterisers fill 320×200 8-bit index buffers (the plasma background, then
 * the cube on top); this surface composites them in colour space — cube pixels through the cube palette
 * where the cube drew, the plasma through the plasma palette everywhere else (MAIN.C plz() then vect()).
 * The result is mapped (×4) into an RGBA DataTexture and blitted to the supplied target. The texture data
 * is recreated each frame (the proven cross-backend path — three's WebGL backend doesn't reliably
 * re-upload a mutated DataTexture), tagged sRGB so the 6-bit→8-bit bytes land verbatim. Row 0 of the index
 * buffer is screen-top and is written verbatim to row 0 of the texture (no vertical flip).
 */
export class RasterSurface {
  private readonly rgba = new Uint8Array(SCREEN_W * SCREEN_H * 4);
  private tex: DataTexture;
  private readonly blit = new Blit();
  private filter: MagnificationTextureFilter = NearestFilter;

  constructor() {
    this.tex = this.makeTexture();
    this.blit.setSource(this.tex);
  }

  private makeTexture(): DataTexture {
    const tex = new DataTexture(this.rgba, SCREEN_W, SCREEN_H, RGBAFormat, UnsignedByteType);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = this.filter;
    tex.magFilter = this.filter;
    tex.needsUpdate = true;
    return tex;
  }

  setFilter(filter: MagnificationTextureFilter): void {
    this.filter = filter;
    this.tex.minFilter = filter;
    this.tex.magFilter = filter;
    this.tex.needsUpdate = true;
  }

  /** Map a single index buffer through `palette` (256×RGB, 0..63) into the RGBA texture (row 0 = top, ×4). */
  update(index: Uint8Array, palette: Uint8Array): void {
    for (let i = 0; i < SCREEN_W * SCREEN_H; i++) {
      const c = index[i] ?? 0;
      const d = i * 4;
      this.rgba[d] = (palette[c * 3] ?? 0) * 4;
      this.rgba[d + 1] = (palette[c * 3 + 1] ?? 0) * 4;
      this.rgba[d + 2] = (palette[c * 3 + 2] ?? 0) * 4;
      this.rgba[d + 3] = 255;
    }
    this.reupload();
  }

  /**
   * Composite the cube over the plasma background: where the cube buffer holds CUBE_TRANSPARENT the
   * plasma index (through `plasmaPalette`) shows through; everywhere else the cube index (through
   * `cubePalette`) wins (MAIN.C plz() background, then vect() cube on top). Both buffers are 320×200,
   * row 0 = screen top, no vertical flip.
   */
  composite(
    plasma: Uint8Array,
    plasmaPalette: Uint8Array,
    cube: Uint8Array,
    cubePalette: Uint8Array,
  ): void {
    compositeToRgb(plasma, plasmaPalette, cube, cubePalette, this.rgba);
    this.reupload();
  }

  /** Recreate the texture so the WebGL backend re-uploads (mirrors plasma's setPalettes discipline). */
  private reupload(): void {
    const old = this.tex;
    this.tex = this.makeTexture();
    this.blit.setSource(this.tex);
    old.dispose();
  }

  render(renderer: WebGPURenderer, target: GpuRenderTarget): void {
    renderer.setRenderTarget(target);
    renderer.setClearColor(BLACK, 1);
    renderer.clear();
    this.blit.render(renderer);
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.tex.dispose();
    this.blit.dispose();
  }
}

/** The fixed texture sub-rect mapped onto each face (matches raster.ts TXT), as tile UVs (0..1). */
const TXT_UV: ReadonlyArray<readonly [number, number]> = [
  [64 / TILE_W, 4 / TILE_H],
  [190 / TILE_W, 4 / TILE_H],
  [190 / TILE_W, 60 / TILE_H],
  [64 / TILE_W, 60 / TILE_H],
];

/**
 * Build the cube geometry: each of the 6 faces is two triangles using the original vertex order, with
 * UVs mapping the fixed texture sub-rect into a per-color tile band. The tile atlas stacks the three
 * bands vertically (band c at V ∈ [c/3,(c+1)/3)), so a face samples its own band.
 */
function buildCubeGeometry(): BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const scale = 1 / 125; // cube ±125 → ±1
  for (const face of CUBE_FACES) {
    const v = face.p.map((i) => CUBE_POINTS[i] ?? [0, 0, 0]);
    const band = face.color;
    const bandV = (t: number): number => (band + t) / 3;
    // Triangles (0,1,2) and (0,2,3).
    for (const [a, b, c] of [
      [0, 1, 2],
      [0, 2, 3],
    ] as const) {
      for (const k of [a, b, c]) {
        const p = v[k] ?? [0, 0, 0];
        pos.push((p[0] ?? 0) * scale, (p[1] ?? 0) * scale, (p[2] ?? 0) * scale);
        const t = TXT_UV[k] ?? [0, 0];
        uvs.push(t[0] ?? 0, bandV(t[1] ?? 0));
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return g;
}

/**
 * Modern renderer: the cube as real geometry, the animated sine tile (all three bands stacked) as a
 * texture, rotated by the spline-driven matrix and drawn with a perspective camera at full viewport
 * resolution (LinearFilter). The CPU still drives the authentic rotation/spline; here we feed the
 * resulting orientation as a model matrix and let the GPU rasterise the textured quads sharply.
 */
export class CubeMesh {
  private readonly geometry = buildCubeGeometry();
  private readonly material = new MeshBasicNodeMaterial();
  private readonly mesh: Mesh;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(50, SCREEN_W / SCREEN_H, 0.1, 100);
  private readonly atlas: DataTexture;
  private readonly atlasData: Uint8Array;

  constructor() {
    // RGBA atlas: TILE_W × (TILE_H·3), band c in rows [c·TILE_H,(c+1)·TILE_H).
    this.atlasData = new Uint8Array(TILE_W * TILE_H * 3 * 4);
    this.atlas = new DataTexture(this.atlasData, TILE_W, TILE_H * 3, RGBAFormat, UnsignedByteType);
    this.atlas.colorSpace = SRGBColorSpace;
    this.atlas.needsUpdate = true;
    this.material.colorNode = textureNode(this.atlas, uv());
    this.material.side = DoubleSide;
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.scene.add(this.mesh);
    this.camera.position.set(0, 0, 4);
    this.camera.lookAt(0, 0, 0);
  }

  setLinear(linear: boolean): void {
    const f: MagnificationTextureFilter = linear ? LinearFilter : NearestFilter;
    this.atlas.minFilter = f;
    this.atlas.magFilter = f;
    this.atlas.needsUpdate = true;
  }

  /** Upload the three shaded tile bands into the atlas (each 256×64 index → palette RGB ×4). */
  setTiles(tiles: readonly [Uint8Array, Uint8Array, Uint8Array], palette: Uint8Array): void {
    for (let band = 0; band < 3; band++) {
      const tile = tiles[band] ?? tiles[0];
      for (let y = 0; y < TILE_H; y++) {
        for (let x = 0; x < TILE_W; x++) {
          const c = tile[y * TILE_W + x] ?? 0;
          const d = ((band * TILE_H + y) * TILE_W + x) * 4;
          this.atlasData[d] = (palette[c * 3] ?? 0) * 4;
          this.atlasData[d + 1] = (palette[c * 3 + 1] ?? 0) * 4;
          this.atlasData[d + 2] = (palette[c * 3 + 2] ?? 0) * 4;
          this.atlasData[d + 3] = 255;
        }
      }
    }
    this.atlas.needsUpdate = true;
  }

  /** Set the cube model matrix from the spline rotation (Euler-ish, via the same sine table angles). */
  setOrientation(matrix: Matrix4): void {
    this.mesh.matrix.copy(matrix);
  }

  /**
   * Render the cube into `target`. When `overBackground` is set the colour buffer is preserved (the
   * plasma background was already drawn into the target) and only depth is cleared, so the cube
   * composites on top — MAIN.C vect() drawing over the plz() plasma. Otherwise the target is cleared to
   * black first (the cube alone).
   */
  render(renderer: WebGPURenderer, target: GpuRenderTarget, overBackground = false): void {
    renderer.setRenderTarget(target);
    const prevAutoClear = renderer.autoClear;
    if (overBackground) {
      renderer.autoClear = false;
      renderer.clearDepth();
    } else {
      renderer.setClearColor(BLACK, 1);
      renderer.clear();
    }
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }
}

/**
 * Modern background: the already-shipped GPU plasma field (packages/parts/src/plasma) rendered fullscreen
 * behind the cube. Owns a plasma field node + its render target + a blit; the Effect feeds it the same
 * moveplz phase + plasma palette the authentic CPU background uses, then this draws it into the cube's
 * output target before the cube composites on top (MAIN.C plz() copper background, then vect()).
 */
export class CubeBackground {
  private readonly field = new PlasmaField();
  private readonly fieldTarget = new GpuRenderTargetImpl(PLASMA_W, PLASMA_H);
  private readonly blit = new Blit();

  constructor() {
    this.blit.setSource(this.fieldTarget.texture);
    this.fieldTarget.texture.minFilter = LinearFilter;
    this.fieldTarget.texture.magFilter = LinearFilter;
    this.fieldTarget.texture.needsUpdate = true;
  }

  /** Set the section-0 plasma palette pair (no cross-fade — the cube part uses the RGB palette). */
  setPalette(rgb: Uint8Array): void {
    this.field.setPalettes(rgb, rgb);
    this.field.setFade(1);
  }

  /** Advance the field phase for this frame (k/l param sets from moveplz/moveplzL). */
  setPhase(
    k: readonly [number, number, number, number],
    l: readonly [number, number, number, number],
  ): void {
    this.field.setPhase(k, l);
  }

  /** Render the plasma field, then blit it fullscreen into `target` (the cube draws on top after). */
  render(renderer: WebGPURenderer, target: GpuRenderTarget): void {
    this.field.render(renderer, this.fieldTarget); // plasma → 320×280 field
    renderer.setRenderTarget(target);
    renderer.setClearColor(BLACK, 1);
    renderer.clear();
    this.blit.render(renderer);
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.field.dispose();
    this.fieldTarget.dispose();
    this.blit.dispose();
  }
}
