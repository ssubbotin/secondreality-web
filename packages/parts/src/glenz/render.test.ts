import { describe, expect, it } from 'vitest';
import { MAIN_SOLID } from './geometry.js';
import { GlenzFill, SCREEN_H, SCREEN_W } from './glenz-fill.js';
import { buildSolidPolygons, projectSolid } from './render.js';
import { createGlenzState, stepGlenz } from './sim.js';

describe('projectSolid — the MAIN.C per-solid pipeline (rotate, scale+translate, project)', () => {
  it('projects the main solid to on-screen vertices at a representative frame', () => {
    const s = createGlenzState();
    for (let i = 0; i < 700; i++) stepGlenz(s);
    const proj = projectSolid(MAIN_SOLID, s.rx, s.ry, s.rz, s.xscale, s.yscale, s.zscale, {
      ox: s.oxp,
      oy: s.ypos + 1500 + s.oyp,
      oz: 7500 + s.ozp,
    });
    expect(proj).toHaveLength(14);
    // Vertices land within (or near) the 320x200 field — the solid is framed on screen.
    let onScreen = 0;
    for (const p of proj) {
      if (p.sx >= -200 && p.sx <= 520 && p.sy >= -200 && p.sy <= 400) onScreen++;
    }
    expect(onScreen).toBe(14);
  });
});

describe('buildSolidPolygons — facing cull + colour (demo_glz) into GlenzPolygon list', () => {
  it('emits only front faces, each carrying a non-zero colour byte', () => {
    const s = createGlenzState();
    for (let i = 0; i < 700; i++) stepGlenz(s);
    const proj = projectSolid(MAIN_SOLID, s.rx, s.ry, s.rz, s.xscale, s.yscale, s.zscale, {
      ox: s.oxp,
      oy: s.ypos + 1500 + s.oyp,
      oz: 7500 + s.ozp,
    });
    const polys = buildSolidPolygons(MAIN_SOLID, proj, s.lightshift);
    // A convex solid shows roughly half its faces; expect at least a few, at most all 24.
    expect(polys.length).toBeGreaterThan(0);
    expect(polys.length).toBeLessThanOrEqual(24);
    for (const p of polys) {
      expect(p.color).toBeGreaterThan(0);
      expect(p.pts).toHaveLength(3);
    }
  });

  it('renders into the index buffer without throwing, marking lit pixels', () => {
    const s = createGlenzState();
    for (let i = 0; i < 700; i++) stepGlenz(s);
    const proj = projectSolid(MAIN_SOLID, s.rx, s.ry, s.rz, s.xscale, s.yscale, s.zscale, {
      ox: s.oxp,
      oy: s.ypos + 1500 + s.oyp,
      oz: 7500 + s.ozp,
    });
    const polys = buildSolidPolygons(MAIN_SOLID, proj, s.lightshift);
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    const bg = new Uint8Array(SCREEN_W * SCREEN_H);
    new GlenzFill().render(out, bg, polys);
    let lit = 0;
    for (const v of out) if (v > 0) lit++;
    expect(lit).toBeGreaterThan(100); // the solid covers a meaningful area
  });
});
