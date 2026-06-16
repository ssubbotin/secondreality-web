import { AudioEngine, type Backend, createRenderer, MusicSync } from '@sr/engine';
import { EFFECTS, type ModeEffect, resolveEffect } from './effects.js';
import { type PartsMenu, renderPartsMenu } from './parts-menu.js';
import { createEffectHost } from './run-effect.js';

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

// Pick the effect via ?effect=plasma|rotozoomer|techno (default techno); see effects.ts for the
// module + seek per part. ?seek= overrides the *initial* position for debugging.
const params = new URLSearchParams(location.search);
let currentId = resolveEffect(params.get('effect'));
// resolveEffect guarantees currentId is a valid key in EFFECTS.
const currentDef =
  EFFECTS[currentId] ??
  (() => {
    throw new Error(`unknown effect: ${currentId}`);
  })();
const seekParam = params.get('seek');
const startSeconds = seekParam !== null ? Number(seekParam) : currentDef.seek;

const audio = new AudioEngine({
  workletUrl: '/worklets/player-worklet.js',
  moduleUrl: currentDef.moduleUrl,
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
  music.setZplusTable(audio.zplusTable); // module decoded — phase musplus by its +++ markers
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

const host = createEffectHost({ handle, canvas, audio, music });

// Declared up front so switchTo can reference it; assigned just below, before any click can fire.
let partsMenu: PartsMenu;

// Switch effects in-app: keep the AudioContext alive, swap the module only when it changes, seek to
// the part's position, swap the effect, and update the URL + menu highlight. The click is the gesture
// that starts audio the first time.
// Serialises rapid switches: a superseded switchTo bails after its awaits so a stale loadModule
// can't clobber the module/zplus table or the URL/highlight. (host.setEffect has its own token for
// the effect itself.)
let switchToken = 0;
const switchTo = async (id: string, push = true): Promise<void> => {
  const def = EFFECTS[id];
  if (!def) return;
  const mine = ++switchToken;
  await audio.start(); // idempotent; resolves only once the worklet node is ready
  if (audio.currentModuleUrl !== def.moduleUrl) {
    await audio.loadModule(def.moduleUrl, def.seek);
    if (mine !== switchToken) return; // a newer switch superseded this one
    music.setZplusTable(audio.zplusTable);
  } else {
    audio.seek(def.seek);
  }
  await host.setEffect(def.create());
  if (mine !== switchToken) return; // stale: host.setEffect already disposed our effect
  currentId = id;
  if (push) history.pushState({ id }, '', `?effect=${id}`); // popstate already moved the URL
  partsMenu.setActive(id);
};

// The part selector is always on — it's the dev navigation between effects.
partsMenu = renderPartsMenu(currentId, (id) => void switchTo(id));

// Back/forward re-runs the switch from the URL — without pushing a new entry.
window.addEventListener(
  'popstate',
  () => void switchTo(resolveEffect(new URLSearchParams(location.search).get('effect')), false),
  { signal: ui.signal },
);

// The rest of the dev controls (play button, authentic toggle) are revealed only with ?debug=true.
if (debug) {
  (globalThis as typeof globalThis & { srAudio?: AudioEngine }).srAudio = audio; // dev probe
  document.getElementById('ui')?.style.setProperty('display', 'block');
  authBox.addEventListener(
    'change',
    () => {
      const cur = host.current() as ModeEffect | null;
      cur?.setMode(authBox.checked ? 'authentic' : 'modern');
    },
    { signal: ui.signal },
  );
}

await host.setEffect(currentDef.create());

// Best-effort autostart: try audio on load. Browsers keep the AudioContext suspended until a user
// gesture, so this only *sounds* immediately where the browser permits (high media-engagement, dev);
// otherwise it preloads the worklet/module and the first click (canvas or a part) starts playback.
void startAudio();

// Tear down before Vite swaps the module, so reloads don't accumulate orphaned RAF loops,
// render targets, or duplicate listeners.
import.meta.hot?.dispose(() => {
  ui.abort();
  host.dispose();
  partsMenu.remove();
});
