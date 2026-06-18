import type { DemoContext, Effect, FrameContext, LoadContext, RenderTarget } from '@sr/engine';
import { LinearFilter, Matrix4, NearestFilter } from 'three';
import {
  CUBE_FACES,
  countConst,
  lightDir,
  PORT_X_BIAS,
  PORT_Y_BIAS,
  rotateProject,
  sortFaces,
} from './cube.js';
import { CubeMesh, RasterSurface } from './nodes.js';
import { buildCubePalette, shadeBand } from './palette.js';
import { rasterCube, SCREEN_H, SCREEN_W } from './raster.js';
import { getspl } from './spline.js';
import {
  buildKosinit,
  buildRata,
  buildSini,
  buildSinit,
  buildSplineCoef,
  RATA_COUNT,
} from './tables.js';
import { buildDist, buildTiles } from './texture.js';

/** authentic = chunky 320×200 nearest upscale; modern = smooth full-viewport textured cube (default). */
export type LookMode = 'authentic' | 'modern';

const SIM_HZ = 70; // original VGA frame cadence (frames++ once per displayed frame); fps-independent here
const SIM_DT = 1 / SIM_HZ;
/** vect() drives the spline as getspl(4·256 + frames·4); the path runs out around control point RATA_COUNT. */
const SPLINE_FRAMES = (RATA_COUNT - 6) * 64; // ≈ how many frames cover the non-tail path

export class Plasmacube implements Effect {
  readonly id = 'plasmacube';

  private ctx: DemoContext | null = null;
  private mode: LookMode = 'modern';

  private readonly sinit = buildSinit();
  private readonly kosinit = buildKosinit(this.sinit);
  private readonly coef = buildSplineCoef();
  private readonly rata = buildRata();
  private readonly sini = buildSini();
  private readonly tiles = buildTiles(this.sini);
  private readonly dist = buildDist(this.sini);
  private readonly basePalette = buildCubePalette();
  private readonly framePalette = new Uint8Array(256 * 3);
  private readonly index = new Uint8Array(SCREEN_W * SCREEN_H);

  private surface: RasterSurface | null = null;
  private cube: CubeMesh | null = null;
  private frames = 0;
  private acc = 0;

  async load(_ctx: LoadContext): Promise<void> {
    // No external assets — tables are code.
  }

  init(ctx: DemoContext): void {
    this.ctx = ctx;
    this.surface = new RasterSurface();
    this.cube = new CubeMesh();
    this.frames = 0;
    this.acc = 0;
    this.applyMode();
  }

  /** dis_setmode equivalent — switch the authentic↔modern look (default modern). */
  setMode(mode: LookMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.applyMode();
  }

  private applyMode(): void {
    this.surface?.setFilter(this.mode === 'authentic' ? NearestFilter : LinearFilter);
    this.cube?.setLinear(this.mode === 'modern');
  }

  update(frame: FrameContext): void {
    this.acc += frame.dt;
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      this.frames++;
      if (this.frames >= SPLINE_FRAMES) this.frames = 0; // loop the fly-in/spin in the standalone lab
    }

    const s = getspl(4 * 256 + this.frames * 4, this.coef, this.rata);
    const kx = s.kx & 1023;
    const ky = s.ky & 1023;
    const kz = s.kz & 1023;
    const m = countConst(kx, ky, kz, this.sinit, this.kosinit);
    const pts = rotateProject(m, s.tx, s.ty, s.dis, PORT_X_BIAS, PORT_Y_BIAS);
    const light = lightDir(s.lsKx, s.lsKy, this.sinit, this.kosinit);
    const visible = sortFaces(pts, light);

    // Per-frame palette: base, then each visible face's band scaled by its light intensity. Visible
    // cube faces always have distinct colour bands (opposite faces are never both front-facing), so a
    // single shaded palette serves the whole frame.
    this.framePalette.set(this.basePalette);
    for (const vf of visible) {
      const face = CUBE_FACES[vf.faceIndex];
      if (face) shadeBand(this.framePalette, this.basePalette, face.color, vf.light);
    }

    if (this.mode === 'authentic') {
      rasterCube(this.index, pts, visible, this.tiles, this.dist, this.frames & 63);
      this.surface?.update(this.index, this.framePalette);
    } else {
      this.cube?.setTiles(this.tiles, this.framePalette);
      this.cube?.setOrientation(this.orientationMatrix(kx, ky, kz));
    }
  }

  /**
   * Build a model matrix for the modern cube from the same sine-table angles the authentic matrix uses
   * (kx/ky/kz over 1024 = a full turn). The exact fixed-point matrix is for the CPU rasteriser; the GPU
   * cube reproduces the orientation as standard rotations (visually identical spin).
   */
  private orientationMatrix(kx: number, ky: number, kz: number): Matrix4 {
    const ang = (k: number): number => (k / 1024) * Math.PI * 2;
    const rx = new Matrix4().makeRotationX(ang(kx));
    const ry = new Matrix4().makeRotationY(ang(ky));
    const rz = new Matrix4().makeRotationZ(ang(kz));
    return rx.multiply(ry).multiply(rz);
  }

  render(_frame: FrameContext, target: RenderTarget): void {
    const renderer = this.ctx?.renderer;
    if (!renderer) return;
    if (this.mode === 'authentic') this.surface?.render(renderer, target.gpu);
    else this.cube?.render(renderer, target.gpu);
  }

  resize(_width: number, _height: number): void {
    // The 320×200 field and the cube's logical size are fixed; the blit/camera fit the target.
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;
    this.cube?.dispose();
    this.cube = null;
    this.ctx = null;
  }
}
