import { AudioEngine, type Backend, createRenderer, MusicSync } from '@sr/engine';
import { TechnoBars } from '@sr/parts';
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

// MUSIC1 (techno module) is the natural pairing for the TECHNO part.
const audio = new AudioEngine({
  workletUrl: '/worklets/player-worklet.js',
  moduleUrl: '/music/MUSIC1.S3M',
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

const effect = new TechnoBars();
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
