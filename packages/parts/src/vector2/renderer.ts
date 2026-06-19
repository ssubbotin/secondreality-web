/**
 * The per-frame CPU rendering pipeline — U2E.C's draw loop + vis_drawobject (VISU.C) + draw_polylist
 * (ADRAW) ported to fill a palette-index buffer:
 *
 *   for each enabled object:
 *     compose its accumulated relative matrix r0 with the camera (calc_applyrmatrix → world matrix r)
 *     compute its distance: calc_singlez of its centre vertex (name[1]=='_' → forced far; s01 fly-in → near)
 *   sort objects back-to-front by that distance (the original insertion sort), then per object:
 *     transform its object-local vertices by r (calc_rotate)
 *     transform each face normal by r's rotation (calc_nrotate)
 *     project the vertices (calc_project)
 *     for each face: cull back faces (checkculling N·V>=0), shade (calclight), fill the triangle.
 *
 * Faces within an object are not re-sorted (the city meshes are mostly convex shells; the original relied
 * on precomputed per-direction polygon order — approximated here by object-level Z-sort, as before).
 */

import { applyRMatrix, type RMatrix, rotateSingle, rotateVertex, singleZ } from './fixed.js';
import type { BakedMesh, BakedModel, BakedObject } from './model.js';
import {
  calcLight,
  makeWindow,
  type Projected,
  type Projection,
  projectVertex,
  setCameraAngle,
  VF_NEAR,
} from './project.js';
import { fillTriangle, SCREEN_H, SCREEN_W } from './raster.js';

/** U2E.C ship fly-in window: while currframe ∈ (1800,2200) ≈ frameIndex ∈ (900,1100) the `s01` ship is
 * forced dist=1 (drawn nearest, on top). */
const S01_FRAME_MIN = 900;
const S01_FRAME_MAX = 1100;
const S01_NAME = '"s01"';
const FAR_DIST = 1000000000;
const NEAR_DIST = 1;

export interface SceneRenderer {
  /** Render one frame's visible objects (mesh + per-object matrix) against the camera. */
  render(buf: Uint8Array, cam: RMatrix, objects: readonly BakedObject[], frameIndex?: number): void;
  readonly projection: Projection;
}

/** Build the projection from the baked window + fov (vid_window + vid_cameraangle). */
function buildProjection(model: BakedModel): Projection {
  const [x1, x2, y1, y2, z1, z2] = model.window;
  const proj = makeWindow(x1, x2, y1, y2, z1, z2);
  setCameraAngle(proj, model.fov);
  return proj;
}

/** Create a renderer bound to a baked model. Reuses scratch buffers across frames (no per-frame alloc). */
export function createSceneRenderer(model: BakedModel): SceneRenderer {
  const proj = buildProjection(model);
  // Scratch: projected + camera-space vertices reused per mesh (sized to the largest mesh).
  const maxVerts = model.meshes.reduce((m, me) => Math.max(m, me.verts.length / 3), 0);
  const projX = new Int32Array(maxVerts);
  const projY = new Int32Array(maxVerts);
  const projVf = new Int32Array(maxVerts);
  const camX = new Float64Array(maxVerts);
  const camY = new Float64Array(maxVerts);
  const camZ = new Float64Array(maxVerts);

  const render = (
    buf: Uint8Array,
    cam: RMatrix,
    objects: readonly BakedObject[],
    frameIndex = -1,
  ): void => {
    const s01Window = frameIndex > S01_FRAME_MIN && frameIndex < S01_FRAME_MAX;

    // Compose each object with the camera + compute its painter distance (U2E.C ordernum / dist loop).
    const order = objects
      .map((ob) => {
        const mesh = model.meshes[ob.mesh];
        const r = applyRMatrix({ m: ob.m, x: ob.x, y: ob.y, z: ob.z }, cam);
        let dist: number;
        if (ob.far) {
          dist = FAR_DIST;
        } else if (!mesh) {
          dist = -Infinity;
        } else {
          const cv = mesh.centerVertex;
          dist = singleZ(
            r,
            mesh.verts[cv * 3] ?? 0,
            mesh.verts[cv * 3 + 1] ?? 0,
            mesh.verts[cv * 3 + 2] ?? 0,
          );
          if (s01Window && mesh.name === S01_NAME) dist = NEAR_DIST;
        }
        return { mesh, r, dist };
      })
      .sort((p, q) => q.dist - p.dist); // far first

    for (const { mesh, r } of order) {
      if (mesh) drawMesh(buf, mesh, r, proj, projX, projY, projVf, camX, camY, camZ);
    }
  };

  return { render, projection: proj };
}

function drawMesh(
  buf: Uint8Array,
  mesh: BakedMesh,
  r: RMatrix,
  proj: Projection,
  projX: Int32Array,
  projY: Int32Array,
  projVf: Int32Array,
  camX: Float64Array,
  camY: Float64Array,
  camZ: Float64Array,
): void {
  const vn = mesh.verts.length / 3;
  let allVf = 0xffff;
  for (let i = 0; i < vn; i++) {
    const [cx, cy, cz] = rotateVertex(
      r,
      mesh.verts[i * 3] ?? 0,
      mesh.verts[i * 3 + 1] ?? 0,
      mesh.verts[i * 3 + 2] ?? 0,
    );
    camX[i] = cx;
    camY[i] = cy;
    camZ[i] = cz;
    const p: Projected = projectVertex(proj, cx, cy, cz);
    projX[i] = p.x;
    projY[i] = p.y;
    projVf[i] = p.vf;
    allVf &= p.vf;
  }
  if (allVf !== 0) return; // VISU.C: whole object off one screen edge → skip.

  const nrm = mesh.normals;
  for (const t of mesh.tris) {
    // Rotate the stored face normal by the camera+object rotation (calc_nrotate) — rotation only.
    const [nx, ny, nz] = rotateSingle(
      r.m,
      nrm[t.n * 3] ?? 0,
      nrm[t.n * 3 + 1] ?? 0,
      nrm[t.n * 3 + 2] ?? 0,
    );
    // Back-face cull: N·V >= 0 (V = a rotated+translated face vertex in camera space). Two-sided
    // materials skip the cull.
    if (!t.twoSided) {
      const dot = nx * (camX[t.a] ?? 0) + ny * (camY[t.a] ?? 0) + nz * (camZ[t.a] ?? 0);
      if (dot >= 0) continue;
    }

    // Skip faces touching the near plane (any vertex VF_NEAR → undefined screen coords).
    const fa = projVf[t.a] ?? 0;
    const fb = projVf[t.b] ?? 0;
    const fc = projVf[t.c] ?? 0;
    if ((fa | fb | fc) & VF_NEAR) continue;

    const color = (t.baseColor + calcLight(nx, ny, nz, t.shadeBits)) & 0xff;
    fillTriangle(
      buf,
      color,
      { x: projX[t.a] ?? 0, y: projY[t.a] ?? 0 },
      { x: projX[t.b] ?? 0, y: projY[t.b] ?? 0 },
      { x: projX[t.c] ?? 0, y: projY[t.c] ?? 0 },
    );
  }
}

export { SCREEN_H, SCREEN_W };
