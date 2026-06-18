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
  MeshBasicNodeMaterial,
  type WebGPURenderer,
} from 'three/webgpu';
import { CUBE_FACES, CUBE_POINTS } from './cube.js';
import { SCREEN_H, SCREEN_W } from './raster.js';
import { TILE_H, TILE_W } from './texture.js';

const BLACK = new Color(0, 0, 0);

/**
 * Authentic renderer: the CPU cube rasteriser fills a 320×200 8-bit index buffer; this surface maps it
 * through the (per-frame shaded) VGA palette (×4) into an RGBA DataTexture and blits it to the supplied
 * target. The texture data is recreated each frame (the proven cross-backend path — three's WebGL
 * backend doesn't reliably re-upload a mutated DataTexture), tagged sRGB so the 6-bit→8-bit bytes land
 * verbatim. Rows are flipped on write because the index buffer is top-row-first while three's uv origin
 * is bottom-left.
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

  /** Map the index buffer through `palette` (256×RGB, 0..63) into the RGBA texture (flipped, ×4). */
  update(index: Uint8Array, palette: Uint8Array): void {
    for (let row = 0; row < SCREEN_H; row++) {
      const src = row * SCREEN_W;
      const dst = (SCREEN_H - 1 - row) * SCREEN_W; // flip vertically
      for (let col = 0; col < SCREEN_W; col++) {
        const c = index[src + col] ?? 0;
        const d = (dst + col) * 4;
        this.rgba[d] = (palette[c * 3] ?? 0) * 4;
        this.rgba[d + 1] = (palette[c * 3 + 1] ?? 0) * 4;
        this.rgba[d + 2] = (palette[c * 3 + 2] ?? 0) * 4;
        this.rgba[d + 3] = 255;
      }
    }
    // Recreate the texture so the WebGL backend re-uploads (mirrors plasma's setPalettes discipline).
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

  render(renderer: WebGPURenderer, target: GpuRenderTarget): void {
    renderer.setRenderTarget(target);
    renderer.setClearColor(BLACK, 1);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }
}
