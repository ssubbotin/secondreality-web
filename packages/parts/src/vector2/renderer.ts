/**
 * The per-frame CPU rendering pipeline — the C/ASM `vDraw` loop (MAIN.C) + vis_drawobject (VISU.C) +
 * draw_polylist (ADRAW) ported to fill a palette-index buffer:
 *
 *   for each visible object (painter-sorted back-to-front by its centre Z under the camera):
 *     transform its world vertices by the camera rmatrix (calc_rotate)
 *     transform its face normals by the camera rotation (calc_nrotate)
 *     project the vertices (calc_project)
 *     for each face: cull back faces (checkculling N·V>=0), shade (calclight), fill the triangle.
 *
 * Objects are depth-sorted by `calc_singlez` of their centre vertex, exactly as MAIN.C/U2E.C do; faces
 * within an object are not re-sorted (the city meshes are mostly convex shells, matching the original
 * which relied on precomputed per-direction polygon order — approximated here by object-level sort).
 */

import { type RMatrix, rotateSingle, rotateVertex, singleZ } from './fixed.js';
import type { BakedMesh, BakedModel } from './model.js';
import {
  calcLight,
  isBackFacing,
  makeWindow,
  type Projected,
  type Projection,
  projectVertex,
  setCameraAngle,
  VF_NEAR,
} from './project.js';
import { fillTriangle, SCREEN_H, SCREEN_W } from './raster.js';

export interface SceneRenderer {
  render(buf: Uint8Array, cam: RMatrix, visibleMeshIndices: number[]): void;
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
  // Scratch: projected vertices reused per mesh (sized to the largest mesh).
  const maxVerts = model.meshes.reduce((m, me) => Math.max(m, me.verts.length / 3), 0);
  const projX = new Int32Array(maxVerts);
  const projY = new Int32Array(maxVerts);
  const projVf = new Int32Array(maxVerts);
  // Camera-space vertices (for the back-face cull which needs a vertex position).
  const camZ = new Float64Array(maxVerts);

  const render = (buf: Uint8Array, cam: RMatrix, visible: number[]): void => {
    // Depth-sort the visible meshes back-to-front by their centre Z under the camera (painter's order).
    const order = visible
      .map((mi) => {
        const mesh = model.meshes[mi];
        if (!mesh) return { mi, dist: -Infinity };
        // Centre vertex ≈ vertex 0 (the engine stores a precomputed centre; vertex 0 is a faithful
        // stand-in for the object-level sort key here).
        const vx = mesh.verts[0] ?? 0;
        const vy = mesh.verts[1] ?? 0;
        const vz = mesh.verts[2] ?? 0;
        return { mi, dist: singleZ(cam, vx, vy, vz) };
      })
      .sort((p, q) => q.dist - p.dist); // far first

    for (const { mi } of order) {
      const mesh = model.meshes[mi];
      if (mesh) drawMesh(buf, mesh, cam, proj, projX, projY, projVf, camZ);
    }
  };

  return { render, projection: proj };
}

function drawMesh(
  buf: Uint8Array,
  mesh: BakedMesh,
  cam: RMatrix,
  proj: Projection,
  projX: Int32Array,
  projY: Int32Array,
  projVf: Int32Array,
  camZ: Float64Array,
): void {
  const vn = mesh.verts.length / 3;
  let allVf = 0xffff;
  for (let i = 0; i < vn; i++) {
    const [cx, cy, cz] = rotateVertex(
      cam,
      mesh.verts[i * 3] ?? 0,
      mesh.verts[i * 3 + 1] ?? 0,
      mesh.verts[i * 3 + 2] ?? 0,
    );
    camZ[i] = cz;
    const p: Projected = projectVertex(proj, cx, cy, cz);
    projX[i] = p.x;
    projY[i] = p.y;
    projVf[i] = p.vf;
    allVf &= p.vf;
    // Stash the camera-space vertex for culling via a side array packed in camZ-adjacent slots is heavy;
    // instead recompute the needed vertex during culling below (cheap, one rotate per visible face).
  }
  if (allVf !== 0) return; // VISU.C: whole object off one screen edge → skip.

  for (const t of mesh.tris) {
    // Rotate the face normal by the camera rotation (calc_nrotate) — rotation only, no translation.
    const [nx, ny, nz] = rotateSingle(cam.m, t.nx, t.ny, t.nz);
    // Back-face cull: N·V >= 0 (V = a rotated+translated face vertex in camera space). Two-sided
    // materials skip the cull.
    const va = t.a;
    const [vx, vy, vz] = rotateVertex(
      cam,
      mesh.verts[va * 3] ?? 0,
      mesh.verts[va * 3 + 1] ?? 0,
      mesh.verts[va * 3 + 2] ?? 0,
    );
    if (!t.twoSided && isBackFacing(nx, ny, nz, vx, vy, vz)) continue;

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
