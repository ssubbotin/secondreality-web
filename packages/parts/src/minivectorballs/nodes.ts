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
import { type BallsState, DOTNUM, projectBall, SHADOW_INDEX } from './balls-sim.js';
import { SCREEN_H, SCREEN_W } from './raster.js';
import type { DepthTables } from './tables.js';

/**
 * Authentic renderer: maps the 320×200 palette-index buffer through the 6-bit VGA palette (×4) into an
 * RGBA DataTexture and blits it to the supplied target. Tagged sRGB so the bytes land verbatim; rows are
 * flipped on write because the index buffer is top-row-first while three's uv origin is bottom-left.
 * (Identical, proven approach to the dot-tunnel RasterSurface — also drives the modern mode via the
 * filter toggle, see MiniVectorBalls.update.)
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

/** Up to one disc per ball + one per shadow (2·512 instances). */
const INSTANCE_COUNT = DOTNUM * 2;
/** Soft-dot half-size in 320×200 space (tune by eye); the ortho camera scales it to the viewport. */
const BALL_RADIUS = 2.4;
const SHADOW_RADIUS = 1.6;
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
 * Modern renderer: each visible ball is an additive soft-disc billboard shaded through the sRGB palette
 * LUT by its depth-table colour byte; each visible shadow is a dimmer disc (palette index 87). The CPU
 * projects every ball each frame (mirror of the raster loop) and uploads per-instance centre + radius +
 * colour index as instanced attributes; the vertex node billboards the centre, the fragment node shades
 * a round disc. Off-screen instances collapse to radius 0 (degenerate quad) so they draw nothing. An
 * orthographic camera framing 0..320 × 0..200 (Y-down) matches the original screen space. (Parked
 * alongside RasterSurface for the GPU pass; the Effect currently drives the proven raster path for both
 * modes — see MiniVectorBalls.update — toggling only the upscale filter, exactly as shipped dot-tunnel.)
 */
export class BallCloud {
  private readonly centers = new Float32Array(INSTANCE_COUNT * 2);
  private readonly radii = new Float32Array(INSTANCE_COUNT);
  private readonly colorIdx = new Float32Array(INSTANCE_COUNT);
  private readonly aCenter = new InstancedBufferAttribute(this.centers, 2);
  private readonly aRadius = new InstancedBufferAttribute(this.radii, 1);
  private readonly aColor = new InstancedBufferAttribute(this.colorIdx, 1);
  private readonly geometry = new InstancedBufferGeometry();
  private readonly quad = new BufferGeometry();
  private readonly material = new MeshBasicNodeMaterial();
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, SCREEN_W, SCREEN_H, 0, -1, 1);
  private readonly lut: DataTexture;

  constructor(
    palette: Uint8Array,
    private readonly depth: DepthTables,
  ) {
    this.lut = paletteTexture(palette);

    this.quad.setAttribute(
      'position',
      new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3),
    );
    this.quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.geometry.index = this.quad.index;
    this.geometry.attributes = this.quad.attributes;
    this.geometry.instanceCount = INSTANCE_COUNT;
    this.aCenter.setUsage(DynamicDrawUsage);
    this.aRadius.setUsage(DynamicDrawUsage);
    this.aColor.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('aCenter', this.aCenter);
    this.geometry.setAttribute('aRadius', this.aRadius);
    this.geometry.setAttribute('aColor', this.aColor);

    const center = attribute('aCenter', 'vec2');
    const radius = attribute('aRadius', 'float');
    const corner = positionLocal.xy;
    this.material.positionNode = vec4(
      center.x.add(corner.x.mul(radius)),
      center.y.add(corner.y.mul(radius)),
      0,
      1,
    );
    const vColor = varying(attribute('aColor', 'float'));
    const vCorner = varying(corner);
    const disc = smoothstep(1.0, 0.35, vCorner.length()); // 1 at centre → 0 at rim
    const col = textureNode(this.lut, vec2(vColor.add(0.5).div(256), 0.5));
    this.material.colorNode = vec4(col.rgb.mul(disc), disc);
    this.material.transparent = true;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.material.blending = AdditiveBlending;

    const mesh = new Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /** Project every ball (mirror of the raster loop) and upload the disc instances. */
  update(s: BallsState): void {
    let i = 0;
    for (let id = 0; id < DOTNUM; id++) {
      const r = projectBall(s, id);
      const shadowOn = r.visible;
      const ballOn = r.visible && r.ballVisible;
      // shadow disc
      this.centers[i * 2] = r.screenX + 0.5;
      this.centers[i * 2 + 1] = r.shadowRow + 0.5;
      this.radii[i] = shadowOn ? SHADOW_RADIUS : 0;
      this.colorIdx[i] = SHADOW_INDEX;
      i++;
      // ball disc (centre of the 4×3 sprite ≈ sx+1.5, by+1)
      this.centers[i * 2] = r.screenX + 1.5;
      this.centers[i * 2 + 1] = r.ballRow + 1;
      this.radii[i] = ballOn ? BALL_RADIUS : 0;
      this.colorIdx[i] = this.depth.row1[r.depthIdx * 4 + 1] ?? 0; // brightest sprite byte
      i++;
    }
    this.aCenter.needsUpdate = true;
    this.aRadius.needsUpdate = true;
    this.aColor.needsUpdate = true;
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
