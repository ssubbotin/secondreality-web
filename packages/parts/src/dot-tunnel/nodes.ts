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
import { type CircleTable, pround } from './tables.js';
import type { TunnelState } from './tunnel-sim.js';

/**
 * Authentic renderer: maps the 320×200 palette-index buffer through the 6-bit VGA palette (×4) into an
 * RGBA DataTexture and blits it to the supplied target. The DataTexture is tagged sRGB so the bytes
 * land verbatim; rows are flipped on write because the index buffer is top-row-first while three's uv
 * origin is bottom-left. NOTE: the texture is mutated + re-uploaded (`needsUpdate`) every frame — if a
 * WebGL2/Firefox driver freezes the upload (as the plasma palette LUT did), fall back to recreating the
 * DataTexture each frame (proven by plasma's setPalettes). Verify in the lab on Firefox.
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

/** Drawn ring depth range (TUN10.PAS draw loop x = 80 downto 4) and dot count per ring. */
const RING_LO = 4;
const RING_HI = 80;
const DOTS_PER_RING = 64;
const DOT_COUNT = (RING_HI - RING_LO + 1) * DOTS_PER_RING; // 77 × 64 = 4928
/** Soft-dot half-size in 320×200 space (tune by eye); the ortho camera scales it to the viewport. */
const DOT_RADIUS = 1.6;
const BLACK = new Color(0, 0, 0);

/** Build a 256×1 sRGB palette LUT from 6-bit VGA RGB (×4), as the plasma/techno LUTs do. */
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
 * Modern renderer: each of the 4928 dots is an additive soft-disc billboard. The CPU computes every
 * dot's centre (circle table + ring offset) and colour index per frame and uploads them as instanced
 * attributes; the vertex node billboards the centre, the fragment node shades a round disc through the
 * sRGB palette LUT. Unlit rings (bbc < 64) map to palette index 0 = black, so under additive blending
 * they contribute nothing — no discard needed. Overlapping dots brighten, giving the glow (a true bloom
 * pass lands with the shared post chain later). An orthographic camera framing 0..320 × 0..200 (Y-down)
 * matches the original screen space.
 */
export class DotCloud {
  private readonly centers = new Float32Array(DOT_COUNT * 2);
  private readonly bbc = new Float32Array(DOT_COUNT);
  private readonly aCenter = new InstancedBufferAttribute(this.centers, 2);
  private readonly aBbc = new InstancedBufferAttribute(this.bbc, 1);
  private readonly geometry = new InstancedBufferGeometry();
  private readonly material = new MeshBasicNodeMaterial();
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 320, 0, 200, -1, 1);
  private readonly lut: DataTexture;

  constructor(
    palette: Uint8Array,
    private readonly circle: CircleTable,
    private readonly sade: Int32Array,
  ) {
    this.lut = paletteTexture(palette);

    // Unit quad (two triangles); positionLocal.xy is the dot-local corner in [-1,1].
    const quad = new BufferGeometry();
    quad.setAttribute(
      'position',
      new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3),
    );
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.geometry.index = quad.index;
    this.geometry.attributes = quad.attributes;
    this.geometry.instanceCount = DOT_COUNT;
    this.aCenter.setUsage(DynamicDrawUsage);
    this.aBbc.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('aCenter', this.aCenter);
    this.geometry.setAttribute('aBbc', this.aBbc);

    const center = attribute('aCenter', 'vec2');
    const corner = positionLocal.xy;
    this.material.positionNode = vec4(
      center.x.add(corner.x.mul(DOT_RADIUS)),
      center.y.add(corner.y.mul(DOT_RADIUS)),
      0,
      1,
    );
    const vBbc = varying(attribute('aBbc', 'float'));
    const vCorner = varying(corner);
    const disc = smoothstep(1.0, 0.55, vCorner.length()); // 1 at centre → 0 at the rim
    const col = textureNode(this.lut, vec2(vBbc.add(0.5).div(256), 0.5));
    this.material.colorNode = vec4(col.rgb.mul(disc), 1);
    this.material.transparent = true;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.material.blending = AdditiveBlending;

    const mesh = new Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /** Compute each dot's centre + colour from the sim state and upload (CPU mirror of the raster loop). */
  update(s: TunnelState): void {
    const ref5x = s.cx[5] ?? 0;
    const ref5y = s.cy[5] ?? 0;
    let i = 0;
    for (let x = RING_HI; x >= RING_LO; x--) {
      const offX = (s.cx[x] ?? 0) - ref5x;
      const offY = (s.cy[x] ?? 0) - ref5y;
      const c = (s.cc[x] ?? 0) + pround(x / 1.3);
      const row0 = (this.sade[x] ?? 0) * 64;
      for (let a = 0; a < DOTS_PER_RING; a++) {
        this.centers[i * 2] = (this.circle.x[row0 + a] ?? 0) + offX;
        this.centers[i * 2 + 1] = (this.circle.y[row0 + a] ?? 0) + offY;
        this.bbc[i] = c;
        i++;
      }
    }
    this.aCenter.needsUpdate = true;
    this.aBbc.needsUpdate = true;
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
    this.lut.dispose();
  }
}
