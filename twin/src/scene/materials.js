// Shared material registry.
// STRUCTURE materials (hull, decks, superstructure, topsides, room shells) take the
// cutaway clipping planes and render back faces in a section colour.
// EQUIPMENT materials (components and room fittings) are never clipped.
import * as THREE from 'three';
import * as TX from './textures.js';

const mats = new Map();
export const structureSet = new Set();   // clipped by cutaway
export const xraySet = new Set();        // made translucent by setXRay
export const blinkSet = new Set();       // emissive pulsing in update()

const CUT_COLOR = new THREE.Color('#8e918d');   // back faces: steel primer grey (open surfaces and cut edges)
export const cutUniforms = { cutColor: { value: CUT_COLOR } };

function patchCut(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.cutColor = cutUniforms.cutColor;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 cutColor;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n if (!gl_FrontFacing) { diffuseColor.rgb = cutColor; }');
  };
  mat.customProgramCacheKey = () => 'cutface';
}

function std(name, p, { structure = false, xray = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1, ...p });
  m.name = name;
  if (structure) {
    m.side = THREE.DoubleSide;
    m.shadowSide = THREE.FrontSide;
    patchCut(m);
    structureSet.add(m);
    if (xray) xraySet.add(m);
  }
  mats.set(name, m);
  return m;
}

let built = false;
export function initMaterials(T = 16, depth = 28) {
  if (built) return;
  built = true;
  const hull = TX.hullTextures(T, depth);
  const S = { structure: true }, SX = { structure: true, xray: true };
  // hull and decks
  std('hull', { map: hull.map, bumpMap: hull.bump, bumpScale: 0.6, roughness: 0.62, metalness: 0.25 }, SX);
  std('hullTop', { color: '#22303d', roughness: 0.6, metalness: 0.25 }, SX);
  std('hullInner', { color: '#8d8f88', roughness: 0.85 }, SX);
  std('deck', { map: TX.deckTexture(), roughness: 0.88, metalness: 0.1 }, SX);
  std('deckGreen', { color: '#3e7a4c', roughness: 0.8 }, SX);
  std('deckYellow', { color: '#e1b12c', roughness: 0.7 }, SX);
  std('deckWhite', { color: '#e8e8e2', roughness: 0.7 }, SX);
  std('deckRed', { color: '#a83a2d', roughness: 0.7 }, SX);
  // superstructure
  std('accom', { map: TX.facadeTexture(), roughness: 0.55, metalness: 0.05 }, SX);
  std('accomPlain', { color: '#e9ebe8', roughness: 0.55, metalness: 0.05 }, SX);
  std('accomTrim', { color: '#c7cbcb', roughness: 0.55 }, SX);
  std('bridgeGlass', { color: '#1d2e3c', roughness: 0.08, metalness: 0.9, envMapIntensity: 1.4 }, SX);
  std('superGrey', { color: '#c3c8ca', roughness: 0.6, metalness: 0.15 }, S);
  std('funnel', { color: '#d9dcdb', roughness: 0.55 }, S);
  std('funnelBand', { color: '#1f3b64', roughness: 0.55 }, S);
  std('sooty', { color: '#2a2b2b', roughness: 0.9 }, S);
  // topsides steel
  std('steel', { color: '#b7bcbe', roughness: 0.6, metalness: 0.3 }, S);
  std('steelDark', { color: '#5a6167', roughness: 0.6, metalness: 0.35 }, S);
  std('steelBlue', { color: '#41698e', roughness: 0.55, metalness: 0.3 }, S);
  std('yellow', { color: '#dfb12a', roughness: 0.55, metalness: 0.2 }, S);
  std('white', { color: '#e6e7e3', roughness: 0.5, metalness: 0.1 }, S);
  std('red', { color: '#b3362c', roughness: 0.55 }, S);
  std('green', { color: '#3d8a57', roughness: 0.6 }, S);
  std('blue', { color: '#3b6eb0', roughness: 0.55 }, S);
  std('orange', { color: '#f06a1a', roughness: 0.45 }, S);
  std('pipe', { color: '#8d949a', roughness: 0.45, metalness: 0.4 }, S);
  std('pipeDark', { color: '#5e656b', roughness: 0.5, metalness: 0.4 }, S);
  std('insul', { color: '#c6cacc', roughness: 0.32, metalness: 0.75 }, S);
  std('chain', { color: '#3b3a35', roughness: 0.7, metalness: 0.6 }, S);
  std('rope', { color: '#d9d1b8', roughness: 0.9 }, S);
  std('hose', { color: '#1c1d1e', roughness: 0.75 }, S);
  std('container1', { color: '#2f6fa8', roughness: 0.6 }, S);
  std('container2', { color: '#b8462e', roughness: 0.6 }, S);
  std('container3', { color: '#d9d9d2', roughness: 0.6 }, S);
  const gt = TX.gratingTexture();
  std('grating', { map: gt, color: '#a5a8a2', alphaTest: 0.5, alphaToCoverage: true, roughness: 0.7, metalness: 0.4 }, S);
  M('grating').userData.tile = 0.5;
  std('heli', { map: TX.helideckTexture(), roughness: 0.8 }, S);
  std('net', { map: gt, color: '#4d4d40', alphaTest: 0.5, alphaToCoverage: true, roughness: 0.9 }, S);
  M('net').userData.tile = 0.3;
  // room shells (structure)
  std('wallPanel', { map: TX.panelWallTexture(), roughness: 0.7 }, SX);
  std('wallER', { map: TX.stiffenedWallTexture(), roughness: 0.7, metalness: 0.15 }, SX);
  std('floorRaised', { map: TX.raisedFloorTexture(), roughness: 0.6 }, SX);
  std('floorER', { map: TX.erFloorTexture(), roughness: 0.8, metalness: 0.15 }, SX);
  std('floorPlain', { color: '#8e9692', roughness: 0.75 }, SX);
  std('ceiling', { map: TX.ceilingTexture(), roughness: 0.8 }, SX);
  std('doorSteel', { color: '#8c9aa3', roughness: 0.5, metalness: 0.3 }, S);
  // cut caps (shown only during cutaway)
  const hatch = new THREE.MeshStandardMaterial({ map: TX.hatchTexture(), roughness: 0.8, side: THREE.DoubleSide });
  hatch.name = 'cutCap'; mats.set('cutCap', hatch);

  // ---------- equipment (never clipped) ----------
  const E = (n, p) => std(n, p);
  E('cab', { color: '#d4d6d2', roughness: 0.5, metalness: 0.15 });
  E('cabDark', { color: '#3c444b', roughness: 0.5, metalness: 0.2 });
  E('cabGrey', { color: '#9aa1a5', roughness: 0.5, metalness: 0.2 });
  E('cabOld', { color: '#c9c4b0', roughness: 0.62, metalness: 0.1 });  // older beige panels
  E('accent', { color: '#3baee6', roughness: 0.45, metalness: 0.1 });   // Amphicos blue trim on retrofit items
  E('navy', { color: '#1f3b64', roughness: 0.5, metalness: 0.15 });
  E('engine', { color: '#6e7f79', roughness: 0.48, metalness: 0.35 });
  E('engineDark', { color: '#3e4643', roughness: 0.55, metalness: 0.35 });
  E('alternator', { color: '#56697a', roughness: 0.5, metalness: 0.3 });
  E('steelBare', { color: '#9ea4a7', roughness: 0.38, metalness: 0.8 });
  E('chrome', { color: '#d3d7d9', roughness: 0.16, metalness: 1.0 });
  E('black', { color: '#17191a', roughness: 0.6, metalness: 0.2 });
  E('rubber', { color: '#1b1b1b', roughness: 0.9 });
  E('copper', { color: '#b8733d', roughness: 0.35, metalness: 0.9 });
  E('lagging', { color: '#cfcdc3', roughness: 0.85, metalness: 0.0 });
  E('laggingAlu', { color: '#c9cdd0', roughness: 0.35, metalness: 0.75 });
  E('eqYellow', { color: '#dcae28', roughness: 0.55, metalness: 0.2 });
  E('eqRed', { color: '#b3332a', roughness: 0.5, metalness: 0.15 });
  E('eqOrange', { color: '#e8701e', roughness: 0.5 });
  E('eqWhite', { color: '#ecedea', roughness: 0.45, metalness: 0.05 });
  E('eqGrate', { map: TX.gratingOpaqueTexture(), color: '#ffffff', roughness: 0.7, metalness: 0.35 });
  M('eqGrate').userData.tile = 0.5;
  E('tray', { color: '#a9adad', roughness: 0.45, metalness: 0.7 });
  E('cableBlack', { color: '#1f2021', roughness: 0.7 });
  E('cableOrange', { color: '#c8642a', roughness: 0.6 });
  E('cableBlue', { color: '#2d5ea0', roughness: 0.6 });
  E('fibreYellow', { color: '#e0c23c', roughness: 0.5 });
  E('pipeSW', { color: '#3c8d4e', roughness: 0.5, metalness: 0.2 });   // sea water
  E('pipeFW', { color: '#3d6db5', roughness: 0.5, metalness: 0.2 });   // fresh water
  E('pipeFO', { color: '#6b4a2e', roughness: 0.5, metalness: 0.2 });   // fuel oil
  E('pipeLO', { color: '#c99a2e', roughness: 0.5, metalness: 0.2 });   // lube oil
  E('pipeAir', { color: '#9fb8c8', roughness: 0.5, metalness: 0.2 });  // compressed air
  E('pipeFire', { color: '#b5332b', roughness: 0.5, metalness: 0.2 }); // fire main
  E('pipeSteam', { color: '#c8cbcd', roughness: 0.4, metalness: 0.5 });
  E('pipeIG', { color: '#7b8a6a', roughness: 0.55, metalness: 0.25 }); // inert gas (representative)
  E('duct', { color: '#b6babb', roughness: 0.4, metalness: 0.7 });
  E('glassClear', { color: '#c9dbe3', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false });
  M('glassClear').userData.noShadow = true;
  E('glass', { color: '#0c1116', roughness: 0.08, metalness: 0.6 });
  E('screenOff', { color: '#07090b', roughness: 0.15, metalness: 0.4 });
  E('plateWhite', { color: '#f3f3ee', roughness: 0.5 });
  E('lampWhite', { color: '#ffffff', emissive: '#fff6e6', emissiveIntensity: 1.6, roughness: 0.4 });
  const led = (n, c, i = 2.2, blink = false) => { const m = E(n, { color: c, emissive: c, emissiveIntensity: i, roughness: 0.3 }); if (blink) blinkSet.add(m); return m; };
  led('ledGreen', '#38e06b'); led('ledRed', '#ff4a3d'); led('ledAmber', '#ffb020'); led('ledBlue', '#3aa0ff'); led('ledWhite', '#f4f4f4', 1.4);
  led('ledGreenBlink', '#38e06b', 2.2, true); led('ledAmberBlink', '#ffb020', 2.2, true);
  led('beaconRed', '#ff3020', 2.5, true); led('beaconAmber', '#ffaa10', 2.5, true); led('beaconBlue', '#2a8cff', 2.5, true);
  E('lens', { color: '#c94a2a', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 });
  E('flame', { color: '#ff9a33', emissive: '#ff7a1a', emissiveIntensity: 3, roughness: 1 });
}

export function M(name) {
  const m = mats.get(name);
  if (!m) throw new Error('unknown material ' + name);
  return m;
}
export function hasMat(name) { return mats.has(name); }

// Panel face materials with their own texture (cached by texture)
const faceCache = new Map();
export function faceMat(tex, emissiveTex = null, { roughness = 0.5, metalness = 0.15, emissiveIntensity = 1.4 } = {}) {
  const key = tex.uuid + (emissiveTex ? emissiveTex.uuid : '');
  let m = faceCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex, roughness, metalness });
    if (emissiveTex) { m.emissiveMap = emissiveTex; m.emissive = new THREE.Color('#ffffff'); m.emissiveIntensity = emissiveIntensity; }
    m.name = 'face';
    faceCache.set(key, m);
  }
  return m;
}

// Unique screen material (one per screen mesh) so HMI textures can be swapped per display.
export function screenMat(tex) {
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  m.name = 'screen';
  m.userData.isScreen = true;
  return m;
}

// ---------- highlight / dim variants ----------
const variantCache = new Map();
export function highlightVariant(mat, colorHex, strength = 0.45) {
  const key = mat.uuid + ':hl:' + colorHex + ':' + strength;
  let v = variantCache.get(key);
  if (!v) {
    v = mat.clone();
    v.name = mat.name + ':hl';
    if (mat.userData.isScreen) { v.color = new THREE.Color(1, 1, 1); }
    else if (v.emissive) {
      // subtle lift: keep the material's own emission (LEDs, lamps) and add a small system-colour term
      const c = new THREE.Color(colorHex);
      const own = mat.emissive.clone().multiplyScalar(mat.emissiveMap ? 0 : (mat.emissiveIntensity || 0));
      v.emissive = own.add(c.multiplyScalar(strength));
      v.emissiveIntensity = 1;
      v.emissiveMap = null;
    }
    v.userData.base = mat;
    variantCache.set(key, v);
  }
  return v;
}
export function dimVariant(mat) {
  const key = mat.uuid + ':dim';
  let v = variantCache.get(key);
  if (!v) {
    v = mat.clone();
    v.name = mat.name + ':dim';
    v.transparent = true;
    v.opacity = 0.35;
    v.depthWrite = false;
    if (v.color && !mat.userData.isScreen) v.color = v.color.clone().lerp(new THREE.Color('#9aa3a8'), 0.35);
    v.userData.base = mat;
    variantCache.set(key, v);
  }
  return v;
}

export function setClipping(planes) {
  for (const m of structureSet) {
    m.clippingPlanes = planes && planes.length ? planes : null;
    m.clipIntersection = true;
    m.clipShadows = true;
    m.needsUpdate = true;
  }
}

export function setXRayMaterials(on, opacity = 0.14) {
  for (const m of xraySet) {
    m.transparent = on;
    m.opacity = on ? opacity : 1;
    m.depthWrite = !on;
    m.needsUpdate = true;
  }
}

export function updateBlink(elapsed) {
  const on = (Math.sin(elapsed * 4.0) > 0) ? 1 : 0.1;
  const slow = 0.5 + 0.5 * Math.sin(elapsed * 2.2);
  for (const m of blinkSet) {
    if (m.name.startsWith('beacon')) m.emissiveIntensity = 0.4 + 3.2 * Math.pow(slow, 3);
    else m.emissiveIntensity = 2.2 * on;
  }
}

export function disposeMaterials() {
  for (const m of mats.values()) m.dispose();
  for (const m of faceCache.values()) m.dispose();
  for (const m of variantCache.values()) m.dispose();
  mats.clear(); faceCache.clear(); variantCache.clear(); structureSet.clear(); xraySet.clear(); blinkSet.clear();
  built = false;
}
