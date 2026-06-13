import { type Backend, createRenderer, startLoop } from '@sr/engine';
import { BoxGeometry, Mesh, PerspectiveCamera, Scene } from 'three';
import { positionLocal, vec4 } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;

// ?backend=webgl2 forces the fallback path for testing the co-primary backend.
const forced = new URLSearchParams(location.search).get('backend') as Backend | null;

const { renderer, backend, ready } = createRenderer({
  canvas,
  ...(forced !== null && { forceBackend: forced }),
  onDeviceLost: (reason) => {
    hud.textContent = `DEVICE LOST: ${reason}\n(reload to recover)`;
  },
});

const scene = new Scene();
const camera = new PerspectiveCamera(60, 1, 0.1, 100);
camera.position.z = 3;

// A TSL node material: authored once, runs as WGSL on WebGPU and GLSL on WebGL2.
const material = new MeshBasicNodeMaterial();
material.colorNode = vec4(positionLocal.add(0.5), 1.0);
const cube = new Mesh(new BoxGeometry(1, 1, 1), material);
scene.add(cube);

function resize() {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

let acc = 0;
let count = 0;

try {
  await ready;
} catch (err) {
  // Surface a renderer-init failure in the HUD (the lab's whole point is diagnostics).
  hud.textContent = `INIT FAILED: ${err instanceof Error ? err.message : String(err)}`;
  throw err; // re-throw so the console still shows a stack
}
resize();

startLoop((dt) => {
  cube.rotation.x += dt * 0.6;
  cube.rotation.y += dt * 0.9;
  renderer.render(scene, camera);

  acc += dt;
  count++;
  if (acc >= 0.5) {
    hud.textContent = `backend: ${backend}\nfps: ${Math.round(count / acc)}`;
    acc = 0;
    count = 0;
  }
});
