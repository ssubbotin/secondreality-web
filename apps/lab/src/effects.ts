import type { Effect } from '@sr/engine';
import {
  Alku1,
  Comanche,
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
} from '@sr/parts';

/** Every part implements Effect plus the authentic/modern mode toggle. */
export type ModeEffect = Effect & { setMode(m: 'authentic' | 'modern'): void };

export interface EffectDef {
  label: string;
  create: () => ModeEffect;
  /** Public URL of the module this part plays. */
  moduleUrl: string;
  /** Start position within that module, in seconds (see the design doc for derivation). */
  seek: number;
}

const MUSIC0 = '/music/MUSIC0.S3M';
const MUSIC1 = '/music/MUSIC1.S3M';

export const EFFECTS: Record<string, EffectDef> = {
  // Seeks derived from the released demo (run in DOSBox, audio cross-correlated to the modules):
  // techno is ~77s into MUSIC1; rotozoomer ~85s into MUSIC0. Plasma shares MUSIC0 but its exact spot
  // was ambiguous (rendered rotozoomed at a module transition), so it stays 0 — distinct from rotozoomer.
  dottunnel: { label: 'Dot tunnel', create: () => new DotTunnel(), moduleUrl: MUSIC0, seek: 30 },
  techno: { label: 'Techno bars', create: () => new TechnoBars(), moduleUrl: MUSIC1, seek: 77 },
  rotozoomer: { label: 'Rotozoomer', create: () => new Rotozoomer(), moduleUrl: MUSIC0, seek: 85 },
  plasma: { label: 'Plasma', create: () => new Plasma(), moduleUrl: MUSIC0, seek: 0 },
  // Parts #14/#10/#15/#17. Faithful per-part module+seek offsets (cross-correlated from the released
  // demo, as for techno/rotozoomer) are still TODO — these seeks are placeholder previews.
  plasmacube: { label: 'Plasmacube', create: () => new Plasmacube(), moduleUrl: MUSIC0, seek: 0 },
  ddstars: { label: 'Desert Dream stars', create: () => new DDStars(), moduleUrl: MUSIC0, seek: 0 },
  minivectorballs: {
    label: 'MiniVectorBalls',
    create: () => new MiniVectorBalls(),
    moduleUrl: MUSIC0,
    seek: 0,
  },
  comanche: { label: '3D sinus field', create: () => new Comanche(), moduleUrl: MUSIC0, seek: 0 },
  glenz: { label: 'Glenz vectors', create: () => new Glenz(), moduleUrl: MUSIC0, seek: 0 },
  endpic: { label: 'End picture flash', create: () => new Endpic(), moduleUrl: MUSIC1, seek: 0 },
  alku1: { label: 'Opening texts I', create: () => new Alku1(), moduleUrl: MUSIC0, seek: 0 },
  panic: { label: 'Panic fake', create: () => new Panic(), moduleUrl: MUSIC0, seek: 0 },
  lens: { label: 'Lens', create: () => new Lens(), moduleUrl: MUSIC0, seek: 0 },
  forest: { label: 'Mountain scroller', create: () => new Forest(), moduleUrl: MUSIC0, seek: 0 },
};

export const DEFAULT_EFFECT = 'techno';

/** Resolve a `?effect=` id to a known effect, falling back to the default. */
export function resolveEffect(id: string | null): string {
  return id !== null && id in EFFECTS ? id : DEFAULT_EFFECT;
}
