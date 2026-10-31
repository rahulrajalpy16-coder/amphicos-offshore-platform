// Tag plate atlas: every component tag is drawn once into a shared canvas atlas,
// plates are small quads whose UVs point into the atlas (one material per page).
import * as THREE from 'three';
import { toTex } from './textures.js';

const PAGE = 2048, SW = 256, SH = 64;
const COLS = PAGE / SW, ROWS = PAGE / SH;

export class TagAtlas {
  constructor() { this.pages = []; this.slots = new Map(); }
  _page() {
    let p = this.pages[this.pages.length - 1];
    if (!p || p.next >= COLS * ROWS) {
      const c = document.createElement('canvas'); c.width = PAGE; c.height = PAGE;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#20262b'; ctx.fillRect(0, 0, PAGE, PAGE);
      const tex = toTex(c, { repeat: false });
      tex.generateMipmaps = true;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.05 });
      mat.name = 'tagplate';
      p = { canvas: c, ctx, tex, mat, next: 0 };
      this.pages.push(p);
    }
    return p;
  }
  // style: 'plate' (white traffolyte, black text) | 'dark' (black, white text) | 'warn' (yellow)
  get(text, style = 'plate') {
    const key = style + '|' + text;
    if (this.slots.has(key)) return this.slots.get(key);
    const p = this._page();
    const i = p.next++;
    const cx = (i % COLS) * SW, cy = Math.floor(i / COLS) * SH;
    const x = p.ctx;
    const bg = style === 'dark' ? '#1d2226' : style === 'warn' ? '#f0c419' : '#f4f4ef';
    const fg = style === 'dark' ? '#f4f4ef' : '#111111';
    x.fillStyle = bg; x.fillRect(cx + 2, cy + 2, SW - 4, SH - 4);
    x.strokeStyle = fg; x.lineWidth = 3; x.strokeRect(cx + 6, cy + 6, SW - 12, SH - 12);
    x.fillStyle = fg;
    let fs = 34;
    x.font = `bold ${fs}px Arial`;
    while (x.measureText(text).width > SW - 26 && fs > 12) { fs -= 2; x.font = `bold ${fs}px Arial`; }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, cx + SW / 2, cy + SH / 2 + 1);
    p.tex.needsUpdate = true;
    const slot = { mat: p.mat, u0: cx / PAGE, u1: (cx + SW) / PAGE, v0: 1 - (cy + SH) / PAGE, v1: 1 - cy / PAGE, aspect: SW / SH };
    this.slots.set(key, slot);
    return slot;
  }
  // geometry for a plate of width w (height from aspect) facing +Z
  plateGeometry(slot, w) {
    const h = w / slot.aspect;
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) ? slot.u1 : slot.u0, uv.getY(i) ? slot.v1 : slot.v0);
    }
    return g;
  }
  dispose() { for (const p of this.pages) { p.tex.dispose(); p.mat.dispose(); } this.pages = []; this.slots.clear(); }
}
