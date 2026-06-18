// The two glenz solids, transcribed verbatim from GLENZ/MAIN.C. Each is a "spiked cube": the 8 cube
// corners (indices 0..7) plus 6 axis spikes (indices 8..13), drawn as 24 triangular faces (4 per cube
// face, fanning to the matching spike). GLENZ actually draws the C arrays `points[]`/`epolys[]` (the main
// solid) and `pointsb[]`/`epolysb[]` (the smaller second solid). AOBJ.INC/ADATA.INC describe the unused
// NRS far-data object format, not this geometry.

/** MAIN.C `#define ZZZ 50` — main-solid coordinate scale. */
export const ZZZ = 50;
/** MAIN.C `#define QQQ 99` — second-solid coordinate scale. */
export const QQQ = 99;

export type Vec3 = readonly [number, number, number];

/** One triangular face: the original `flag` word (0x40xx, a hue/colour hint) plus 3 vertex indices. */
export interface Face {
  readonly flag: number;
  readonly v: readonly [number, number, number];
}

export interface Solid {
  readonly vertices: readonly Vec3[];
  readonly faces: readonly Face[];
}

// MAIN.C points[] (14 vertices). 8 cube corners at ±100, then spikes 8..13 at 0/±170.
const MAIN_VERTICES: readonly Vec3[] = [
  [-100 * ZZZ, -100 * ZZZ, -100 * ZZZ],
  [100 * ZZZ, -100 * ZZZ, -100 * ZZZ],
  [100 * ZZZ, 100 * ZZZ, -100 * ZZZ],
  [-100 * ZZZ, 100 * ZZZ, -100 * ZZZ],
  [-100 * ZZZ, -100 * ZZZ, 100 * ZZZ],
  [100 * ZZZ, -100 * ZZZ, 100 * ZZZ],
  [100 * ZZZ, 100 * ZZZ, 100 * ZZZ],
  [-100 * ZZZ, 100 * ZZZ, 100 * ZZZ],
  [0 * ZZZ, 0 * ZZZ, -170 * ZZZ],
  [0 * ZZZ, 0 * ZZZ, 170 * ZZZ],
  [170 * ZZZ, 0 * ZZZ, 0 * ZZZ],
  [-170 * ZZZ, 0 * ZZZ, 0 * ZZZ],
  [0 * ZZZ, 170 * ZZZ, 0 * ZZZ],
  [0 * ZZZ, -170 * ZZZ, 0 * ZZZ],
];

// MAIN.C epolys[] — 24 triangles `{3, flag, v0, v1, v2}` (the trailing 0 terminator is dropped).
const MAIN_FACES: readonly Face[] = [
  { flag: 0x4002, v: [0, 1, 8] },
  { flag: 0x4004, v: [1, 2, 8] },
  { flag: 0x4006, v: [2, 3, 8] },
  { flag: 0x4008, v: [3, 0, 8] },

  { flag: 0x400a, v: [2, 1, 10] },
  { flag: 0x400c, v: [1, 5, 10] },
  { flag: 0x400e, v: [5, 6, 10] },
  { flag: 0x4010, v: [6, 2, 10] },

  { flag: 0x4012, v: [2, 6, 12] },
  { flag: 0x4014, v: [6, 7, 12] },
  { flag: 0x4016, v: [7, 3, 12] },
  { flag: 0x4018, v: [3, 2, 12] },

  { flag: 0x401a, v: [0, 3, 11] },
  { flag: 0x401c, v: [3, 7, 11] },
  { flag: 0x401e, v: [7, 4, 11] },
  { flag: 0x4020, v: [4, 0, 11] },

  { flag: 0x4022, v: [5, 1, 13] },
  { flag: 0x4024, v: [1, 0, 13] },
  { flag: 0x4026, v: [0, 4, 13] },
  { flag: 0x4028, v: [4, 5, 13] },

  { flag: 0x402a, v: [5, 4, 9] },
  { flag: 0x402c, v: [4, 7, 9] },
  { flag: 0x402e, v: [7, 6, 9] },
  { flag: 0x4030, v: [6, 5, 9] },
];

export const MAIN_SOLID: Solid = { vertices: MAIN_VERTICES, faces: MAIN_FACES };

// MAIN.C pointsb[] (14 vertices, QQQ scale; cube corners at ±60, spikes at 0/±105).
const SMALL_VERTICES: readonly Vec3[] = [
  [-60 * QQQ, -60 * QQQ, -60 * QQQ],
  [60 * QQQ, -60 * QQQ, -60 * QQQ],
  [60 * QQQ, 60 * QQQ, -60 * QQQ],
  [-60 * QQQ, 60 * QQQ, -60 * QQQ],
  [-60 * QQQ, -60 * QQQ, 60 * QQQ],
  [60 * QQQ, -60 * QQQ, 60 * QQQ],
  [60 * QQQ, 60 * QQQ, 60 * QQQ],
  [-60 * QQQ, 60 * QQQ, 60 * QQQ],
  [0, 0, -105 * QQQ],
  [0, 0, 105 * QQQ],
  [105 * QQQ, 0, 0],
  [-105 * QQQ, 0, 0],
  [0, 105 * QQQ, 0],
  [0, -105 * QQQ, 0],
];

// MAIN.C epolysb[] — same topology as epolys[], alternating 0x4004/0x4002 hue flags.
const SMALL_FACES: readonly Face[] = [
  { flag: 0x4004, v: [0, 1, 8] },
  { flag: 0x4002, v: [1, 2, 8] },
  { flag: 0x4004, v: [2, 3, 8] },
  { flag: 0x4002, v: [3, 0, 8] },

  { flag: 0x4004, v: [2, 1, 10] },
  { flag: 0x4002, v: [1, 5, 10] },
  { flag: 0x4004, v: [5, 6, 10] },
  { flag: 0x4002, v: [6, 2, 10] },

  { flag: 0x4004, v: [2, 6, 12] },
  { flag: 0x4002, v: [6, 7, 12] },
  { flag: 0x4004, v: [7, 3, 12] },
  { flag: 0x4002, v: [3, 2, 12] },

  { flag: 0x4004, v: [0, 3, 11] },
  { flag: 0x4002, v: [3, 7, 11] },
  { flag: 0x4004, v: [7, 4, 11] },
  { flag: 0x4002, v: [4, 0, 11] },

  { flag: 0x4004, v: [5, 1, 13] },
  { flag: 0x4002, v: [1, 0, 13] },
  { flag: 0x4004, v: [0, 4, 13] },
  { flag: 0x4002, v: [4, 5, 13] },

  { flag: 0x4004, v: [5, 4, 9] },
  { flag: 0x4002, v: [4, 7, 9] },
  { flag: 0x4004, v: [7, 6, 9] },
  { flag: 0x4002, v: [6, 5, 9] },
];

export const SMALL_SOLID: Solid = { vertices: SMALL_VERTICES, faces: SMALL_FACES };
