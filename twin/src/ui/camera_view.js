// Live CCTV pictures from the twin itself: renders the 3D scene from a camera component's position and
// orientation into a small render target and copies it to the HMI canvas. Only active while an HMI that asks
// for it is open; renders are throttled (about 2 fps, slower if the GPU is slow) and the last picture is
// reused between renders. Exposed to HMI modules as ctx.renderCameraView(cameraComponentId, canvas, view).
import * as THREE from 'three';
import { facingToWorld } from '../core/coords.js';

export function createCameraViews({ renderer, scene, world, db }) {
  const compById = new Map(db.components.map((c) => [c.id, c]));
  const W = 320, H = 180;
  const target = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });
  const cam = new THREE.PerspectiveCamera(60, W / H, 0.05, 3000);
  const pixels = new Uint8Array(W * H * 4);
  const cache = new Map(); // cameraId -> { image: ImageData, at }
  const work = document.createElement('canvas');
  work.width = W; work.height = H;
  const wctx = work.getContext('2d');
  let active = false;
  let lastRenderAt = 0;
  let lastCost = 0;
  let renders = 0;

  function poseFor(c, view) {
    const obj = world.components.get(c.id);
    const pos = new THREE.Vector3();
    if (obj) new THREE.Box3().setFromObject(obj).getCenter(pos);
    const fwd = facingToWorld(c.facing).clone();
    const pan = THREE.MathUtils.degToRad((view && view.pan) || 0);
    const tilt = THREE.MathUtils.degToRad((view && view.tilt) || -12);
    fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), -pan);
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    fwd.applyAxisAngle(right, tilt).normalize();
    cam.position.copy(pos).addScaledVector(fwd, 0.35);
    cam.fov = THREE.MathUtils.clamp(62 / Math.max(1, (view && view.zoom) || 1), 6, 75);
    cam.updateProjectionMatrix();
    cam.lookAt(cam.position.clone().add(fwd));
    cam.updateMatrixWorld();
  }

  function renderNow(c, view) {
    const t0 = performance.now();
    poseFor(c, view);
    const prevFocus = (world.state && world.state.focusRooms) || [];
    if (world.setFocusRooms && c.room) world.setFocusRooms([...new Set([...prevFocus, c.room])]);
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
    renderer.setRenderTarget(prevTarget);
    if (world.setFocusRooms) world.setFocusRooms(prevFocus);
    const img = wctx.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // flip rows
    lastCost = performance.now() - t0;
    lastRenderAt = performance.now();
    renders++;
    return img;
  }

  // Draws the latest picture of cameraId into canvas; returns false when no picture exists yet (the module
  // then draws its procedural fallback).
  function renderCameraView(cameraId, canvas, view) {
    if (!active) return false;
    const c = compById.get(cameraId);
    if (!c) return false;
    const now = performance.now();
    const minGap = Math.max(450, lastCost * 6);
    let entry = cache.get(cameraId);
    const key = JSON.stringify(view || {});
    if ((!entry || entry.key !== key || now - entry.at > 500) && now - lastRenderAt > minGap) {
      try { entry = { image: renderNow(c, view), at: now, key }; cache.set(cameraId, entry); } catch (e) { console.warn('[cctv] render failed', e); return false; }
    }
    if (!entry) return false;
    wctx.putImageData(entry.image, 0, 0);
    const g = canvas.getContext('2d');
    g.drawImage(work, 0, 0, canvas.width, canvas.height);
    return true;
  }

  return {
    renderCameraView,
    setActive(on) { active = !!on; if (!on) cache.clear(); },
    get active() { return active; },
    get renders() { return renders; },
  };
}
