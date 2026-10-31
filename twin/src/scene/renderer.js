// Renderer factory. createRenderer({ container?, canvas?, quality? })
// -> { renderer, scene, camera, resize(), render(), setQuality(q), quality }
import * as THREE from 'three';
import { setMaxAnisotropy } from './textures.js';

// maxPixels caps the drawing buffer (width x height x pixelRatio squared), so Retina laptops and 4K screens draw a
// sensible number of pixels while the interface stays sharp. Exhibition mode caps it further for large displays.
export const QUALITY = {
  high: { pixelRatio: 2, shadows: true, shadowSize: 4096, maxPixels: 3.7e6 },
  medium: { pixelRatio: 1.25, shadows: true, shadowSize: 2048, maxPixels: 2.4e6 },
  low: { pixelRatio: 0.85, shadows: false, shadowSize: 1024, maxPixels: 1.3e6 },
};
export const EXHIBITION_PIXELS = 2.2e6;

export function createRenderer(opts = {}) {
  const container = opts.container || document.body;
  const canvas = opts.canvas || null;
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas || undefined,
    antialias: true,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true,
    preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
  });
  if (!canvas) container.appendChild(renderer.domElement);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bcd0de');
  scene.fog = new THREE.Fog('#c3d3de', 900, 6500);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20000);
  camera.position.set(260, 120, 300);
  camera.lookAt(0, 10, 0);

  const api = {
    renderer, scene, camera, quality: opts.quality || 'medium', exhibition: false,
    setExhibition(on) { api.exhibition = !!on; api.resize(); },
    resize() {
      const el = renderer.domElement.parentElement || container;
      const w = (el && el.clientWidth) || window.innerWidth;
      const h = (el && el.clientHeight) || window.innerHeight;
      const Q = QUALITY[api.quality] || QUALITY.medium, budget = api.exhibition ? Math.min(Q.maxPixels, EXHIBITION_PIXELS) : Q.maxPixels;
      const pr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, Q.pixelRatio, Math.sqrt(budget / Math.max(1, w * h))));
      if (Math.abs(renderer.getPixelRatio() - pr) > 0.01) renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    },
    render() { renderer.render(scene, camera); },
    setQuality(q) {
      const Q = QUALITY[q] || QUALITY.medium;
      api.quality = QUALITY[q] ? q : 'medium';
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pixelRatio));
      renderer.shadowMap.enabled = Q.shadows;
      scene.traverse((o) => {
        if (o.isDirectionalLight && o.castShadow) {
          if (o.shadow.mapSize.x !== Q.shadowSize) {
            o.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
            if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
          }
        }
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of ms) m.needsUpdate = true;
        }
      });
      api.resize();
      if (api.onQuality) api.onQuality(api.quality);
    },
  };
  api.setQuality(api.quality);
  if (opts.autoResize !== false) window.addEventListener('resize', () => api.resize());
  return api;
}
