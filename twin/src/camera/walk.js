// First-person walk mode inside a room: WASD or arrow keys, drag to look, eye height 1.7 m above the room floor,
// position clamped inside the room box. Touch: drag to look, on-screen pad to move.
import * as THREE from 'three';

export const EYE_HEIGHT = 1.7;

export function createWalk({ camera, dom, director }) {
  const keys = new Set();
  const pad = { f: 0, s: 0 };
  let yaw = 0, pitch = 0;
  let box = null;
  let drag = null;
  const w = {
    active: false,
    enable(roomBox) {
      box = roomBox.clone();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      yaw = Math.atan2(-dir.x, -dir.z);
      pitch = 0;
      const p = camera.position.clone();
      p.x = THREE.MathUtils.clamp(p.x, box.min.x + 0.5, box.max.x - 0.5);
      p.z = THREE.MathUtils.clamp(p.z, box.min.z + 0.5, box.max.z - 0.5);
      p.y = box.min.y + EYE_HEIGHT;
      camera.position.copy(p);
      w.active = true;
      director.controls.enabled = false;
      apply();
    },
    disable() {
      if (!w.active) return;
      w.active = false;
      keys.clear();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      director.controls.target.copy(camera.position).addScaledVector(dir, 3);
      director.controls.enabled = true;
    },
    setPad(f, s) { pad.f = f; pad.s = s; },
    update(dt) {
      if (!w.active) return;
      const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3.2 : 1.6) * Math.min(dt, 0.1);
      let f = pad.f, s = pad.s;
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
      if (f || s) {
        const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        camera.position.addScaledVector(fwd, f * speed).addScaledVector(right, s * speed);
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, box.min.x + 0.35, box.max.x - 0.35);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, box.min.z + 0.35, box.max.z - 0.35);
        camera.position.y = box.min.y + EYE_HEIGHT;
      }
      apply();
    },
    get yaw() { return yaw; },
    get box() { return box; },
  };
  function apply() {
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, 0);
  }
  window.addEventListener('keydown', (e) => {
    if (!w.active) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
      keys.add(e.code);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  dom.addEventListener('pointerdown', (e) => { if (w.active) drag = { x: e.clientX, y: e.clientY, yaw, pitch }; });
  window.addEventListener('pointermove', (e) => {
    if (!w.active || !drag) return;
    yaw = drag.yaw - (e.clientX - drag.x) * 0.0045;
    pitch = THREE.MathUtils.clamp(drag.pitch - (e.clientY - drag.y) * 0.0045, -1.2, 1.2);
    apply();
  });
  window.addEventListener('pointerup', () => { drag = null; });
  director.walk = w;
  return w;
}
