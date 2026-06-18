import { describe, expect, it } from 'vitest';
import {
  bandForZ,
  createStarState,
  PALFADE_MAX,
  STARLIMIT0,
  STARS_TOTAL,
  STARS_WINDOW,
  stepStars,
} from './star-sim.js';
import { buildMuldivX, buildMuldivY } from './tables.js';

const mdx = buildMuldivX();
const mdy = buildMuldivY();

describe('ddstars star-sim', () => {
  it('allocates 1024 stars and seeds z descending (z = (1024 − rank) & 0xFF)', () => {
    const s = createStarState();
    expect(s.z).toHaveLength(STARS_TOTAL);
    // init loop: cx = STARS_TOTAL..1, z = (cx-1) & 0xFF for star index (STARS_TOTAL - cx).
    expect(s.z[0]).toBe((STARS_TOTAL - 1) & 0xff); // first star: cx=1024 → z = 1023 & 255 = 255
    expect(s.z[1]).toBe((STARS_TOTAL - 2) & 0xff); // 1022 & 255 = 254
  });

  it('starts with starlimit at STARLIMIT0 minus the 100 warm-up ticks init runs', () => {
    const s = createStarState();
    // init_stars runs staradd 100 times (the @@sa warm-up), each decrementing starlimit.
    expect(s.starlimit).toBe(STARLIMIT0 - 100);
  });

  it('ages every star by 2 (8-bit wrap) each tick, regardless of the active-window gate', () => {
    const s = createStarState();
    const z0 = s.z[5] ?? 0;
    stepStars(s, mdx, mdy);
    expect(s.z[5]).toBe((z0 - 2) & 0xff);
  });

  it('respawns a star with fresh random x,y when its z byte borrows past 0', () => {
    const s = createStarState();
    // Force a star to z=0 so the next −2 borrows (0 → 254 with carry).
    s.z[3] = 0;
    const x0 = s.x[3];
    const y0 = s.y[3];
    stepStars(s, mdx, mdy);
    expect(s.z[3]).toBe(254); // (0 − 2) & 0xFF = 254 (wrapped, re-enters at far depth)
    // x,y were re-randomised (vanishingly unlikely to be identical to both old values)
    expect(s.x[3] !== x0 || s.y[3] !== y0).toBe(true);
    expect(s.x[3]).toBeGreaterThanOrEqual(-512);
    expect(s.x[3]).toBeLessThanOrEqual(511);
  });

  it('projects an active star with screen = (coord · muldiv[z]) >> 14 + (160,100) and clips off-screen', () => {
    const s = createStarState();
    // Make star 0 active and on-screen: open the window and place a known x,y,z.
    s.starlimit = 0; // all window stars active
    // pick z so it survives the −2 then projects on-screen (y must be negative to land in the top 100 rows)
    s.z[0] = 60 + 2; // after −2 → z=60
    s.x[0] = 40;
    s.y[0] = -50;
    stepStars(s, mdx, mdy);
    const z = 60;
    const expX = ((40 * (mdx[z] ?? 0)) >> 14) + 160;
    const expY = ((-50 * (mdy[z] ?? 0)) >> 14) + 100;
    // Find star 0 in the plotted output.
    let found = -1;
    for (let i = 0; i < s.count; i++) {
      if (s.starIndex[i] === 0) found = i;
    }
    expect(found).toBeGreaterThanOrEqual(0);
    expect(s.sx[found]).toBe(expX);
    expect(s.sy[found]).toBe(expY);
    expect(expX).toBeGreaterThanOrEqual(0);
    expect(expX).toBeLessThanOrEqual(319);
    expect(expY).toBeGreaterThanOrEqual(0);
    expect(expY).toBeLessThanOrEqual(99); // y is clipped to the top 100 rows
  });

  it('does not plot stars outside the active window (rank > 512 − starlimit)', () => {
    const s = createStarState();
    s.starlimit = STARS_WINDOW; // gate fully closed → only bp == STARS_WINDOW (rank 0) can pass
    // even rank 0 needs to be on-screen; just assert at most one star is plotted
    s.z.fill(60 + 2);
    s.x.fill(0);
    s.y.fill(0);
    stepStars(s, mdx, mdy);
    expect(s.count).toBeLessThanOrEqual(1);
  });

  it('depth bands: z<110 → 3 (near), 110≤z<180 → 2 (mid), z≥180 → 1 (far)', () => {
    expect(bandForZ(50)).toBe(3);
    expect(bandForZ(109)).toBe(3);
    expect(bandForZ(110)).toBe(2);
    expect(bandForZ(179)).toBe(2);
    expect(bandForZ(180)).toBe(1);
    expect(bandForZ(255)).toBe(1);
  });

  it('ramps palfade 0→PALFADE_MAX over the first PALFADE_MAX ticks then holds', () => {
    const s = createStarState();
    expect(s.palfade).toBe(0);
    for (let i = 0; i < PALFADE_MAX; i++) stepStars(s, mdx, mdy);
    expect(s.palfade).toBe(PALFADE_MAX);
    // palfadeScale is 1 at the endpoint.
    stepStars(s, mdx, mdy);
    expect(s.palfade).toBe(PALFADE_MAX); // held (does not grow past the max)
  });

  it('processes only the STARS_WINDOW stars in the plot loop (the late staradd2 phase is out of scope)', () => {
    const s = createStarState();
    s.starlimit = 0;
    s.z.fill(60 + 2);
    s.x.fill(0);
    s.y.fill(0);
    stepStars(s, mdx, mdy);
    // All plotted stars land at the centre (x=y=0 → 160,100 clipped to 99) and come from rank < window.
    for (let i = 0; i < s.count; i++) {
      expect(s.starIndex[i]).toBeLessThan(STARS_WINDOW);
    }
  });
});
