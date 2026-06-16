import type { Effect } from '@sr/engine';
import { Plasma, Rotozoomer, TechnoBars } from '@sr/parts';

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
  techno: { label: 'Techno bars', create: () => new TechnoBars(), moduleUrl: MUSIC1, seek: 15 },
  rotozoomer: { label: 'Rotozoomer', create: () => new Rotozoomer(), moduleUrl: MUSIC0, seek: 0 },
  plasma: { label: 'Plasma', create: () => new Plasma(), moduleUrl: MUSIC0, seek: 0 },
};

export const DEFAULT_EFFECT = 'techno';

/** Resolve a `?effect=` id to a known effect, falling back to the default. */
export function resolveEffect(id: string | null): string {
  return id !== null && id in EFFECTS ? id : DEFAULT_EFFECT;
}
