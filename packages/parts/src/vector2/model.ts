/**
 * The baked runtime model: city geometry + camera flythrough + per-object animation in a compact,
 * JSON-serialisable shape the Effect loads at startup. Produced by `bake.ts` from the VISU compiled-object
 * chunks (U2E.001..042) + U2E.0AB (animation) + U2E.00M (object index table), and consumed by the renderer.
 *
 * Geometry is kept in OBJECT-LOCAL engine space (the chunk vertices verbatim) with the stored OPT.C face
 * normals; each frame carries the camera matrix plus, per visible object, the co[] slot's accumulated
 * relative matrix (r0). The renderer composites `r0` with the camera exactly as U2E.C does
 * (`calc_applyrmatrix`), so animated objects (BuildingH, cars, signs) move while static ones use identity.
 */

export interface BakedTri {
  a: number;
  b: number;
  c: number;
  /** Index into the mesh's `normals` (the stored OPT.C face normal). */
  n: number;
  baseColor: number;
  shadeBits: number;
  twoSided: boolean;
}

export interface BakedMesh {
  name: string;
  /** Flat [x,y,z, ...] object-local integer vertices (chunk VERT, verbatim). */
  verts: number[];
  /** Flat [x,y,z, ...] stored face/gouraud normals (chunk NORM, 16-bit, length UNIT). */
  normals: number[];
  tris: BakedTri[];
  /** ORD0 centre vertex index — the object's painter-sort key (U2E.C `o->pl[0][1]`). */
  centerVertex: number;
}

/** One visible object instance for a frame: which mesh, and its accumulated relative matrix (r0). */
export interface BakedObject {
  /** Index into `meshes`. */
  mesh: number;
  /** Accumulated relative rmatrix m[0..8] + position; identity for static objects. */
  m: number[];
  x: number;
  y: number;
  z: number;
  /**
   * Painter-sort flag from U2E.C: when true this is a leading `_`-flagged ground/platform object whose
   * distance is forced to 1000000000L (drawn first / farthest). Otherwise the object sorts by its centre
   * vertex Z under the camera.
   */
  far: boolean;
  /** co[] table index this instance came from (for the `s01` fly-in special case + debugging). */
  co: number;
}

export interface BakedFrame {
  /** Camera rmatrix m[0..8] + position. */
  m: number[];
  x: number;
  y: number;
  z: number;
  /** Visible object instances this frame (mesh + per-object animation matrix). */
  objects: BakedObject[];
}

export interface BakedModel {
  /** Field-of-view angle held for the flythrough (U2E: 0x1C00). */
  fov: number;
  /** vid_window clip rect [x1,x2,y1,y2,z1,z2]. */
  window: [number, number, number, number, number, number];
  meshes: BakedMesh[];
  frames: BakedFrame[];
}
