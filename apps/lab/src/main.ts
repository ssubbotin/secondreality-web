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
const params = new URLSearchParams(location.search);
const which = params.get('effect') ?? 'techno';

// Each part starts the track at its own position. PLACEHOLDERS — the original syncs parts to the
// song's +++ order markers, not a seek table, so these need deriving/tuning. Override live with ?seek=.
const SEEK_SECONDS: Record<string, number> = { techno: 0, plasma: 0, rotozoomer: 0 };
const seekParam = params.get('seek');
const startSeconds = seekParam !== null ? Number(seekParam) : (SEEK_SECONDS[which] ?? 0);

const audio = new AudioEngine({
  workletUrl: '/worklets/player-worklet.js',
  moduleUrl: which === 'techno' ? '/music/MUSIC1.S3M' : '/music/MUSIC0.S3M',
  startSeconds,
});
const music = new MusicSync();

// Scope the UI listeners to an AbortController so HMR can remove them in one shot — otherwise each
// reload stacks another listener on the persistent elements.
const ui = new AbortController();

// ?debug=true reveals the dev UI (play button, authentic toggle, part selector); default is minimal.
const debug = new URLSearchParams(location.search).has('debug');

// Audio needs a user gesture in normal browsers (autoplay policy keeps the AudioContext suspended).
// We still try on load — that preloads the worklet/module and actually autoplays in permissive
// contexts (installed PWA, high media-engagement, dev). If it stays blocked, a one-time hint asks for
// a click; the first interaction resumes it. The sim is the music's slave, so it's frozen until then.
let hint: HTMLElement | null = null;
const startAudio = async (): Promise<void> => {
  await audio.start();
  if (audio.isRunning) {
    playBtn.textContent = '⏸ playing';
    hint?.remove();
    hint = null;
  }
};
document.addEventListener('pointerdown', () => void startAudio(), { signal: ui.signal });

try {
  await handle.ready;
} catch (err) {
  hud.textContent = `INIT FAILED: ${err instanceof Error ? err.message : String(err)}`;
  throw err;
}

const effect: Effect & { setMode(m: 'authentic' | 'modern'): void } =
  which === 'plasma' ? new Plasma() : which === 'rotozoomer' ? new Rotozoomer() : new TechnoBars();

// The part selector is always on — it's the dev navigation between effects.
const partsMenu = renderPartsMenu(which);

// The rest of the dev controls (play button, authentic toggle) are revealed only with ?debug=true.
if (debug) {
  (globalThis as typeof globalThis & { srAudio?: AudioEngine }).srAudio = audio; // dev probe
  document.getElementById('ui')?.style.setProperty('display', 'block');
  authBox.addEventListener(
    'change',
    () => effect.setMode(authBox.checked ? 'authentic' : 'modern'),
    { signal: ui.signal },
  );
}

const teardown = await runEffect(effect, { handle, canvas, audio, music });

// Tear down the previous instance before Vite swaps the module, so reloads don't accumulate
// orphaned RAF loops, render targets, or duplicate listeners.
import.meta.hot?.dispose(() => {
  ui.abort();
  teardown();
  partsMenu.remove();
});
