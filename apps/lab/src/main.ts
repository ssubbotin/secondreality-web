import { AudioEngine, type Backend, createRenderer, type Effect, MusicSync } from '@sr/engine';
import { Plasma, TechnoBars } from '@sr/parts';
import { runEffect } from './run-effect.js';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const authBox = document.getElementById('authentic') as HTMLInputElement;

const forced = new URLSearchParams(location.search).get('backend') as Backend | null;
const handle = createRenderer({
  canvas,
  ...(forced !== null && { forceBackend: forced }),
  onDeviceLost: (reason) => {
    hud.textContent = `DEVICE LOST: ${reason}\n(reload to recover)`;
  },
});

// Pick the effect via ?effect=plasma|techno (default techno). Each part pairs with its module:
// MUSIC1 is the techno module; plasma pairs with MUSIC0 (confirm by ear — see plan open item).
const which = new URLSearchParams(location.search).get('effect') ?? 'techno';
const usePlasma = which === 'plasma';
const audio = new AudioEngine({
  workletUrl: '/worklets/player-worklet.js',
  moduleUrl: usePlasma ? '/music/MUSIC0.S3M' : '/music/MUSIC1.S3M',
});
const music = new MusicSync();

// Scope the UI listeners to an AbortController so HMR can remove them in one shot — otherwise each
// reload stacks another listener on the persistent #play / #authentic elements.
const ui = new AbortController();

playBtn.addEventListener(
  'click',
  async () => {
    await audio.start();
    playBtn.textContent = '⏸ playing';
  },
  { signal: ui.signal },
);

try {
  await handle.ready;
} catch (err) {
  hud.textContent = `INIT FAILED: ${err instanceof Error ? err.message : String(err)}`;
  throw err;
}

const effect: Effect & { setMode(m: 'authentic' | 'modern'): void } = usePlasma
  ? new Plasma()
  : new TechnoBars();
authBox.addEventListener(
  'change',
  () => {
    effect.setMode(authBox.checked ? 'authentic' : 'modern');
  },
  { signal: ui.signal },
);

const teardown = await runEffect(effect, { handle, canvas, audio, music });

// Tear down the previous instance before Vite swaps the module, so reloads don't accumulate
// orphaned RAF loops, render targets, or duplicate listeners.
import.meta.hot?.dispose(() => {
  ui.abort();
  teardown();
});
