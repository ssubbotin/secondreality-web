import { Blit } from '@sr/engine';
import {
  BufferGeometry,
  Color,
  DataTexture,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type MagnificationTextureFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import {
  attribute,
  positionLocal,
  smoothstep,
  texture as textureNode,
  varying,
  vec2,
  vec4,
} from 'three/tsl';
import {
  AdditiveBlending,
  type RenderTarget as GpuRenderTarget,
  MeshBasicNodeMaterial,
  type WebGPURenderer,
} from 'three/webgpu';
import { SCREEN_H, SCREEN_W } from './raster.js';
import { FIELD_H, STARS_WINDOW, type StarState } from './star-sim.js';

/**
 * Authentic renderer: maps the 320×200 palette-index buffer through the 6-bit VGA palette (×4) into an
 * RGBA DataTexture and blits it to the supplied target. The DataTexture is tagged sRGB so the bytes land
 * verbatim; rows are flipped on write because the index buffer is top-row-first while three's uv origin is
 * bottom-left. The palette is scaled by `fade` (0..1) so the start-of-part fade-in matches the original's
 * DAC ramp while keeping the bytes byte-faithful at fade==1 (see palette.ts / star-sim `palfadeScale`).
 * NOTE: the texture is mutated + re-uploaded every frame; if a WebGL2/Firefox driver freezes the upload (as
 * the plasma palette LUT did), fall back to recreating the DataTexture each frame. Verify in the lab.
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

  update(index: Uint8Array, fade: number): void {
    for (let row = 0; row < SCREEN_H; row++) {
      const src = row * SCREEN_W;
      const dst = (SCREEN_H - 1 - row) * SCREEN_W; // flip vertically
      for (let col = 0; col < SCREEN_W; col++) {
        const c = index[src + col] ?? 0;
        const d = (dst + col) * 4;
        this.rgba[d] = (((this.palette[c * 3] ?? 0) * 4 * fade) | 0) & 0xff;
        this.rgba[d + 1] = (((this.palette[c * 3 + 1] ?? 0) * 4 * fade) | 0) & 0xff;
        this.rgba[d + 2] = (((this.palette[c * 3 + 2] ?? 0) * 4 * fade) | 0) & 0xff;
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

/** A live star + its delayed mirror can both plot, so reserve twice the window per frame. */
const DOT_COUNT = STARS_WINDOW * 2;
/** Soft-dot half-size in 320×200 space (tune by eye); the ortho camera scales it to the viewport. */
const DOT_RADIUS = 1.4;
const BLACK = new Color(0, 0, 0);

/** Build a 256×1 sRGB palette LUT from 6-bit VGA RGB (×4), as the plasma/techno/dot-tunnel LUTs do. */
function paletteTexture(palette: Uint8Array): DataTexture {
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    data[i * 4] = (palette[i * 3] ?? 0) * 4;
    data[i * 4 + 1] = (palette[i * 3 + 1] ?? 0) * 4;
    data[i * 4 + 2] = (palette[i * 3 + 2] ?? 0) * 4;
    data[i * 4 + 3] = 255;
  }
  const tex = new DataTexture(data, 256, 1, RGBAFormat, UnsignedByteType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Modern renderer: each plotted star (and its delayed reflection) is an additive soft-disc billboard. The
 * CPU computes every dot's centre + palette band per frame and uploads them as instanced attributes; the
 * vertex node billboards the centre, the fragment node shades a round disc through the sRGB palette LUT.
 * Background (band 0) maps to palette index 0 = black, so under additive blending it contributes nothing.
 * An orthographic camera framing 0..320 × 0..200 (Y-down) matches the original screen space; the reflection
 * dots are placed at the mirrored screen row (199 − py), exactly as `StarRaster` composites them.
 *
 * Parked behind the shipped raster path (as dot-tunnel's DotCloud is) because the WebGL2 node backend does
 * not reliably deliver per-instance attributes; kept ready for the post-chain/bloom pass.
 */
export class StarCloud {
  private readonly centers = new Float32Array(DOT_COUNT * 2);
  private readonly band = new Float32Array(DOT_COUNT);
  private readonly aCenter = new InstancedBufferAttribute(this.centers, 2);
  private readonly aBand = new InstancedBufferAttribute(this.band, 1);
  private readonly geometry = new InstancedBufferGeometry();
  private readonly material = new MeshBasicNodeMaterial();
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 320, 0, 200, -1, 1);
  private readonly quad = new BufferGeometry();
  private readonly lut: DataTexture;
  private drawn = 0;

  constructor(palette: Uint8Array) {
    this.lut = paletteTexture(palette);

    // Unit quad (two triangles); positionLocal.xy is the dot-local corner in [-1,1].
    this.quad.setAttribute(
      'position',
      new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3),
    );
    this.quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.geometry.index = this.quad.index;
    this.geometry.attributes = this.quad.attributes;
    this.geometry.instanceCount = 0;
    this.aCenter.setUsage(DynamicDrawUsage);
    this.aBand.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('aCenter', this.aCenter);
    this.geometry.setAttribute('aBand', this.aBand);

    const center = attribute('aCenter', 'vec2');
    const corner = positionLocal.xy;
    this.material.positionNode = vec4(
      center.x.add(corner.x.mul(DOT_RADIUS)),
      center.y.add(corner.y.mul(DOT_RADIUS)),
      0,
      1,
    );
    const vBand = varying(attribute('aBand', 'float'));
    const vCorner = varying(corner);
    const disc = smoothstep(1.0, 0.5, vCorner.length()); // 1 at centre → 0 at the rim
    const col = textureNode(this.lut, vec2(vBand.add(0.5).div(256), 0.5));
    this.material.colorNode = vec4(col.rgb.mul(disc), disc);
    this.material.transparent = true;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.material.blending = AdditiveBlending;

    const mesh = new Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /** Fill the instance attributes from the rendered 320×200 index buffer (the StarRaster output). */
  update(index: Uint8Array, _s: StarState): void {
    let n = 0;
    for (let row = 0; row < SCREEN_H && n < DOT_COUNT; row++) {
      const base = row * SCREEN_W;
      for (let col = 0; col < SCREEN_W && n < DOT_COUNT; col++) {
        const c = index[base + col] ?? 0;
        if (c === 0) continue;
        this.centers[n * 2] = col;
        this.centers[n * 2 + 1] = row;
        this.band[n] = c;
        n++;
      }
    }
    this.drawn = n;
    this.geometry.instanceCount = n;
    this.aCenter.needsUpdate = true;
    this.aBand.needsUpdate = true;
  }

  /** Number of dots drawn last update (top half is the live field; FIELD_H..199 is the reflection). */
  get count(): number {
    return this.drawn;
  }

  /** Convenience for the y split between live field and reflection (rows ≥ FIELD_H are the mirror). */
  get fieldHeight(): number {
    return FIELD_H;
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
    this.quad.dispose();
    this.material.dispose();
    this.lut.dispose();
  }
}
