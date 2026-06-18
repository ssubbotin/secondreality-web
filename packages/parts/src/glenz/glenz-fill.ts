import type { Vertex2 } from './vec.js';

// Faithful reproduction of the GLENZ additive scanline filler (NEW.ASM: ng_init / add-edges /
// ng_pass2 / ng_pass3). Each polygon contributes its edges; per scanline the active edges are sorted by
// X and the running colour is XORed by each edge's colour at its crossing (so overlapping convex faces
// combine their colour bits — the additive/transparent glenz look — and coincident edges cancel). The
// accumulated colour byte is then ORed over the background into the 320x200 8-bit index buffer (pass3's
// `or ah,fs:[di]`). The palette (palette.ts) brightens the more (and higher) bits the byte carries.

export const SCREEN_W = 320;
export const SCREEN_H = 200;

/** A screen-space polygon to fill: a colour byte plus its CCW vertex ring. */
export interface GlenzPolygon {
  color: number;
  pts: readonly Vertex2[];
}

interface Edge {
  /** X at the current scanline, fixed-point 16.16 (NE_X). */
  x: number;
  /** X increment per scanline, fixed-point 16.16 (NE_DX). */
  dx: number;
  /** First and last scanline (NE_Y1, NE_Y2). */
  y1: number;
  y2: number;
  /** Colour bits XORed at this edge's crossing (NE_COLOR). */
  color: number;
}

/** A per-scanline colour-change event: at screen column `x` the running colour XORs `color`. */
interface Change {
  x: number;
  color: number;
}

export class GlenzFill {
  // Edges bucketed by their top scanline (NEW.ASM nep[]).
  private readonly buckets: Edge[][] = Array.from({ length: SCREEN_H }, () => []);

  /**
   * Render the polygon list over `bg` into `out` (both 320x200, 8-bit). `out` is overwritten with a copy
   * of `bg` then the additive fill is ORed in.
   */
  render(out: Uint8Array, bg: Uint8Array, polys: readonly GlenzPolygon[]): void {
    out.set(bg);
    for (const b of this.buckets) b.length = 0;

    // --- add edges (NEW.ASM __newgroup ax=2) ---
    for (const poly of polys) {
      const n = poly.pts.length;
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const a = poly.pts[i];
        const c = poly.pts[(i + 1) % n];
        if (!a || !c) continue;
        this.addEdge(a.sx, a.sy, c.sx, c.sy, poly.color);
      }
    }

    // --- pass2 + pass3 fused: per scanline build the change list and OR runs over the background ---
    const active: Edge[] = [];
    const changes: Change[] = [];
    for (let y = 0; y < SCREEN_H; y++) {
      // Activate edges that begin on this scanline.
      const bucket = this.buckets[y];
      if (bucket) for (const e of bucket) active.push(e);
      // Drop edges that have ended (y >= y2).
      for (let i = active.length - 1; i >= 0; i--) {
        const e = active[i];
        if (!e || y >= e.y2) active.splice(i, 1);
      }
      if (active.length === 0) continue;

      // Insertion-sort active edges by current X (NEW.ASM ng_pass2 sort).
      active.sort((p, q) => p.x - q.x);

      // Emit colour-change events left->right; coincident X XOR directly (de-dup into one event).
      changes.length = 0;
      for (const e of active) {
        let xc = e.x >> 16; // integer screen column (NE_X high word)
        if (xc > 319) xc = 319;
        if (xc < 1) xc = 1; // NEW.ASM clips X to [1,319]
        const last = changes[changes.length - 1];
        if (last && last.x === xc) last.color ^= e.color;
        else changes.push({ x: xc, color: e.color });
        e.x += e.dx; // advance for the next scanline
      }

      // pass3: walk runs, OR the running colour over the background.
      const rowBase = y * SCREEN_W;
      let running = 0;
      for (let k = 0; k < changes.length - 1; k++) {
        const ch = changes[k];
        const next = changes[k + 1];
        if (!ch || !next) continue;
        running ^= ch.color;
        if (running === 0) continue;
        const x0 = Math.max(0, ch.x);
        const x1 = Math.min(SCREEN_W, next.x);
        for (let x = x0; x < x1; x++) {
          const idx = rowBase + x;
          out[idx] = (out[idx] ?? 0) | running;
        }
      }
    }
  }

  /** Push one edge into its top-scanline bucket (NEW.ASM add-edges + y1<0 clip + horizontal skip). */
  private addEdge(ax: number, ay: number, cx: number, cy: number, color: number): void {
    let x0 = ax;
    let y0 = ay;
    let x1 = cx;
    let y1 = cy;
    if (y0 > y1) {
      // store top->bottom
      x0 = cx;
      y0 = cy;
      x1 = ax;
      y1 = ay;
    }
    if (y0 === y1) return; // skip horizontal edges
    const dy = y1 - y0;
    const dx = Math.trunc(((x1 - x0) << 16) / dy); // 16.16 slope (asm idiv)
    let xfix = x0 << 16;
    let top = y0;
    if (top < 0) {
      if (y1 <= 0) return; // entirely above the screen
      xfix += dx * -top; // advance X to scanline 0
      top = 0;
    }
    if (top >= SCREEN_H) return;
    const bucket = this.buckets[top];
    if (bucket) bucket.push({ x: xfix, dx, y1: top, y2: Math.min(y1, SCREEN_H), color });
  }
}
