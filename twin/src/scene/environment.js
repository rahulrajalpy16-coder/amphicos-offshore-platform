// Sky, sun, hemisphere fill, procedural animated sea (no external textures).
import * as THREE from 'three';
import { canvas } from './textures.js';

export const SUN_DIR = new THREE.Vector3(-0.45, 0.62, 0.64).normalize();
const HORIZON = new THREE.Color('#c6d5df');
const ZENITH = new THREE.Color('#5d8fbf');

function skyCanvas() {
  const W = 2048, H = 1024, c = canvas(W, H), x = c.getContext('2d');
  // upper hemisphere gradient
  const g = x.createLinearGradient(0, 0, 0, H / 2);
  g.addColorStop(0, '#4f86bb');
  g.addColorStop(0.55, '#8db4d4');
  g.addColorStop(0.92, '#c3d4df');
  g.addColorStop(1, '#d4dee4');
  x.fillStyle = g; x.fillRect(0, 0, W, H / 2);
  // lower hemisphere (sea colour for reflections)
  const g2 = x.createLinearGradient(0, H / 2, 0, H);
  g2.addColorStop(0, '#9fb3bf'); g2.addColorStop(0.08, '#3f5a6b'); g2.addColorStop(1, '#1e2f3b');
  x.fillStyle = g2; x.fillRect(0, H / 2, W, H / 2);
  // soft clouds near the horizon
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i++) {
    const cx = r() * W, cy = H * (0.28 + r() * 0.19), rw = 40 + r() * 160, rh = 8 + r() * 20;
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rw);
    gr.addColorStop(0, `rgba(255,255,255,${0.10 + r() * 0.16})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.save(); x.translate(cx, cy); x.scale(1, rh / rw); x.translate(-cx, -cy);
    x.fillStyle = gr; x.fillRect(cx - rw, cy - rw, rw * 2, rw * 2); x.restore();
  }
  // sun glow
  const lon = Math.atan2(SUN_DIR.x, -SUN_DIR.z), lat = Math.asin(SUN_DIR.y);
  const sx = (0.5 + lon / (2 * Math.PI)) * W, sy = (0.5 - lat / Math.PI) * H;
  const sg = x.createRadialGradient(sx, sy, 0, sx, sy, 220);
  sg.addColorStop(0, 'rgba(255,250,235,1)'); sg.addColorStop(0.04, 'rgba(255,248,230,0.95)');
  sg.addColorStop(0.2, 'rgba(255,240,210,0.25)'); sg.addColorStop(1, 'rgba(255,240,210,0)');
  x.fillStyle = sg; x.fillRect(sx - 240, sy - 240, 480, 480);
  return c;
}

export function buildEnvironment(scene, renderer) {
  const group = new THREE.Group();
  group.name = 'environment';

  const skyTex = new THREE.CanvasTexture(skyCanvas());
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  let envRT = null;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envRT = pmrem.fromEquirectangular(skyTex);
    scene.environment = envRT.texture;
    pmrem.dispose();
  }
  scene.fog = new THREE.Fog(HORIZON.getHex(), 1200, 9000);

  const sun = new THREE.DirectionalLight('#fff3e2', 3.0);
  sun.name = 'sun';
  sun.position.copy(SUN_DIR).multiplyScalar(400);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  const sc = sun.shadow.camera;
  sc.left = -175; sc.right = 175; sc.top = 175; sc.bottom = -175; sc.near = 10; sc.far = 900;
  sun.target.position.set(0, 0, 0);
  group.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight('#d6e6f3', '#4c555b', 0.9);
  hemi.name = 'hemi';
  group.add(hemi);

  // interior light pool (moved to the active room, no shadows)
  const interior = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.PointLight('#fff4e4', 0, 40, 1.4);
    p.name = 'interior' + i;
    group.add(p);
    interior.push(p);
  }

  const sea = buildSea();
  group.add(sea.mesh);
  scene.add(group);

  function setShadowFocus(box3) {
    // box3: world Box3 to keep crisp, or null for the whole vessel
    const c = new THREE.Vector3(), s = new THREE.Vector3();
    if (box3) { box3.getCenter(c); box3.getSize(s); } else { c.set(0, 10, 0); s.set(320, 60, 80); }
    const r = box3 ? Math.max(12, s.length() * 0.6) : 175;
    sun.target.position.copy(c);
    sun.position.copy(c).addScaledVector(SUN_DIR, 450);
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
    sc.near = 50; sc.far = 900;
    sc.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
  }
  setShadowFocus(null);

  return {
    group, sun, hemi, interior, sea, setShadowFocus,
    update(dt, t) { sea.uniforms.uTime.value = t; },
    dispose() {
      skyTex.dispose(); if (envRT) envRT.dispose();
      sea.mesh.geometry.dispose(); sea.mesh.material.dispose();
    },
  };
}

function buildSea() {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uSunDir: { value: SUN_DIR.clone() },
    uDeep: { value: new THREE.Color('#0f2a3a') },
    uShallow: { value: new THREE.Color('#2a5566') },
    uSky: { value: HORIZON.clone() },
    uZenith: { value: ZENITH.clone() },
    uHoleMin: { value: new THREE.Vector2(1e6, 1e6) },
    uHoleMax: { value: new THREE.Vector2(1e6, 1e6) },
    uHoleAlpha: { value: 1 },
    uAlpha: { value: 1 },
    uHB: { value: null },
    uHullOn: { value: 0 },
    uHullX: { value: new THREE.Vector2(-150, 150) },
  }]);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    transparent: true,
    depthWrite: true,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uZenith;
      uniform vec2 uHoleMin; uniform vec2 uHoleMax; uniform float uHoleAlpha; uniform float uAlpha;
      uniform sampler2D uHB; uniform float uHullOn; uniform vec2 uHullX;
      varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      vec2 wave(vec2 p, vec2 d, float f, float a, float s) {
        float ph = dot(p, d) * f + uTime * s;
        return d * (a * f * cos(ph));
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec2 p = vWorld.xz;
        if (uHullOn > 0.5) {
          float hu = (p.x - uHullX.x) / (uHullX.y - uHullX.x);
          if (hu > 0.0 && hu < 1.0) {
            float hb = texture2D(uHB, vec2(hu, 0.5)).r * 32.0;
            if (abs(p.y) < hb - 0.25) discard;
          }
        }
        vec2 g = vec2(0.0);
        // 10 directional components with irregular directions plus value-noise ripples (no visible banding)
        float amp = 0.30, fr = 0.035, sp = 0.8;
        for (int i = 0; i < 10; i++) {
          float a = float(i) * 2.399 + 0.6;
          vec2 d = vec2(cos(a), sin(a) * 0.8 + 0.2);
          d = normalize(d);
          g += wave(p, d, fr, amp, sp);
          amp *= 0.62; fr *= 1.55; sp *= 1.22;
        }
        vec2 q = p * 0.35 + vec2(uTime * 0.25, uTime * 0.17);
        g += vec2(vnoise(q) - 0.5, vnoise(q + 17.3) - 0.5) * 0.06;
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vWorld);
        float dist = length(cameraPosition - vWorld);
        n = normalize(mix(n, vec3(0.0, 1.0, 0.0), clamp(dist / 4000.0, 0.0, 0.85)));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 R = reflect(-V, n);
        vec3 sky = mix(uSky, uZenith, clamp(R.y * 1.6, 0.0, 1.0));
        vec3 water = mix(uDeep, uShallow, clamp(0.5 + 0.5 * n.x, 0.0, 1.0) * 0.35);
        vec3 col = mix(water, sky, clamp(fres, 0.0, 1.0));
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(n, H), 0.0), 320.0) * 6.0 + pow(max(dot(n, H), 0.0), 40.0) * 0.12;
        col += vec3(1.0, 0.95, 0.86) * spec;
        float a = uAlpha;
        vec2 e = vec2(4.0);
        vec2 inside = smoothstep(uHoleMin - e, uHoleMin, p) * (1.0 - smoothstep(uHoleMax, uHoleMax + e, p));
        float h = inside.x * inside.y;
        a = mix(a, uHoleAlpha, h);
        col = mix(col, col * 0.8 + vec3(0.02, 0.06, 0.08), h);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  mat.name = 'sea';
  const geo = new THREE.PlaneGeometry(24000, 24000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sea';
  mesh.renderOrder = 1;
  mesh.receiveShadow = false;
  mesh.userData.isSea = true;
  mesh.userData.noCollide = true;
  mesh.frustumCulled = false;
  return {
    mesh, uniforms,
    setHole(minXZ, maxXZ, alpha) {
      if (!minXZ) { uniforms.uHoleMin.value.set(1e6, 1e6); uniforms.uHoleMax.value.set(1e6, 1e6); return; }
      uniforms.uHoleMin.value.copy(minXZ); uniforms.uHoleMax.value.copy(maxXZ); uniforms.uHoleAlpha.value = alpha;
    },
    setAlpha(a) { uniforms.uAlpha.value = a; },
    // mask the sea inside the hull waterplane so no water surface shows inside cut-open spaces
    setHullMask(hbFn, x0, x1, toWorldX) {
      const N = 1024, data = new Uint8Array(N);
      for (let i = 0; i < N; i++) data[i] = Math.max(0, Math.min(255, Math.round(hbFn(x0 + (x1 - x0) * i / (N - 1)) / 32 * 255)));
      const tex = new THREE.DataTexture(data, N, 1, THREE.RedFormat, THREE.UnsignedByteType);
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      uniforms.uHB.value = tex;
      uniforms.uHullOn.value = 1;
      uniforms.uHullX.value.set(toWorldX(x0), toWorldX(x1));
    },
  };
}
