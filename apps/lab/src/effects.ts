import type { Effect } from '@sr/engine';
import {
  Alku1,
  Alku2,
  Alku3,
  Comanche,
  Credits,
  DDStars,
  DotTunnel,
  Endpic,
  Forest,
  Glenz,
  Lens,
  MiniVectorBalls,
  Panic,
  Plasma,
  Plasmacube,
  Rotozoomer,
  TechnoBars,
  Vector1,
  Vector2,
  Water,
} from '@sr/parts';
import { SEEK_OFFSETS } from './seek-offsets.js';

/** Every part implements Effect plus the authentic/modern mode toggle. */
export type ModeEffect = Effect & { setMode(m: 'authentic' | 'modern'): void };

export interface EffectDef {
  label: string;
  create: () => ModeEffect;
  /** Public URL of the module this part plays. */
  moduleUrl: string;
  /** Start position within that module, in seconds (see seek-offsets.ts for the derivation). */
  seek: number;
}

/** Pull a part's `{ moduleUrl, seek }` out of the derived seek table (throws on a missing id). */
function seekOf(id: string): { moduleUrl: string; seek: number } {
  const o = SEEK_OFFSETS[id];
  if (o === undefined) throw new Error(`seekOf: no seek offset for '${id}'`);
  return { moduleUrl: o.moduleUrl, seek: o.seek };
}

/**
 * Per-part module + start position recovered from the original DIS sequencing (MAIN/U2.ASM part order
 * and restartmus calls; S3M order/tempo timing). See seek-offsets.ts for the full derivation and the
 * per-part `note` (which module, and whether the seconds are exact or approximate). Keep these in sync
 * with that table: the map here is just wiring.
 */
export const EFFECTS: Record<string, EffectDef> = {
  // Intro section — MUSIC0 played from order 0 (orders are 8.00s apart at spd6/120BPM).
  alku1: { label: 'Opening texts I', create: () => new Alku1(), ...seekOf('alku1') },
  alku2: { label: 'Opening texts II', create: () => new Alku2(), ...seekOf('alku2') },
  alku3: { label: 'Opening texts III', create: () => new Alku3(), ...seekOf('alku3') },
  vector1: { label: 'Space battle', create: () => new Vector1(), ...seekOf('vector1') },
  endpic: { label: 'End picture flash', create: () => new Endpic(), ...seekOf('endpic') },

  // Middle section — MUSIC1 (restartmus ax=1,bx=0), parts hand off at the +++ markers in execution order.
  glenz: { label: 'Glenz vectors', create: () => new Glenz(), ...seekOf('glenz') },
  dottunnel: { label: 'Dot tunnel', create: () => new DotTunnel(), ...seekOf('dottunnel') },
  techno: { label: 'Techno bars', create: () => new TechnoBars(), ...seekOf('techno') },
  panic: { label: 'Panic fake', create: () => new Panic(), ...seekOf('panic') },
  forest: { label: 'Mountain scroller', create: () => new Forest(), ...seekOf('forest') },
  lens: { label: 'Lens', create: () => new Lens(), ...seekOf('lens') },
  rotozoomer: { label: 'Rotozoomer', create: () => new Rotozoomer(), ...seekOf('rotozoomer') },
  plasma: { label: 'Plasma', create: () => new Plasma(), ...seekOf('plasma') },
  plasmacube: { label: 'Plasmacube', create: () => new Plasmacube(), ...seekOf('plasmacube') },
  minivectorballs: {
    label: 'MiniVectorBalls',
    create: () => new MiniVectorBalls(),
    ...seekOf('minivectorballs'),
  },
  water: { label: 'Water scroll', create: () => new Water(), ...seekOf('water') },
  comanche: { label: '3D sinus field', create: () => new Comanche(), ...seekOf('comanche') },

  // Tail section — MUSIC0 again (exact restartmus order anchors; credits continues from there).
  vector2: { label: 'KewlComplex city', create: () => new Vector2(), ...seekOf('vector2') },
  ddstars: { label: 'Desert Dream stars', create: () => new DDStars(), ...seekOf('ddstars') },
  credits: { label: 'Credits scroll', create: () => new Credits(), ...seekOf('credits') },
};

export const DEFAULT_EFFECT = 'techno';

/** Resolve a `?effect=` id to a known effect, falling back to the default. */
export function resolveEffect(id: string | null): string {
  return id !== null && id in EFFECTS ? id : DEFAULT_EFFECT;
}
