import { AudioEngine, type Backend, createRenderer, type Effect, MusicSync } from '@sr/engine';
import { Plasma, Rotozoomer, TechnoBars } from '@sr/parts';
import { renderPartsMenu } from './parts-menu.js';
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

// Pick the effect via ?effect=plasma|rotozoomer|techno (default techno). MUSIC1 is the techno
// module; the other parts pair with MUSIC0 (confirm by ear — see plan open items).
const which = new URLSearchParams(location.search).get('effect') ?? 'techno';
const audio = new AudioEngine({
  workletUrl: '/worklets/player-worklet.js',
  moduleUrl: which === 'techno' ? '/music/MUSIC1.S3M' : '/music/MUSIC0.S3M',
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

const effect: Effect & { setMode(m: 'authentic' | 'modern'): void } =
  which === 'plasma' ? new Plasma() : which === 'rotozoomer' ? new Rotozoomer() : new TechnoBars();
authBox.addEventListener(
  'change',
  () => {
    effect.setMode(authBox.checked ? 'authentic' : 'modern');
  },
  { signal: ui.signal },
);

const teardown = await runEffect(effect, { handle, canvas, audio, music });
const partsMenu = renderPartsMenu(which);

// Tear down the previous instance before Vite swaps the module, so reloads don't accumulate
// orphaned RAF loops, render targets, or duplicate listeners.
import.meta.hot?.dispose(() => {
  ui.abort();
  teardown();
  partsMenu.remove();
});
