/* =========================================================
   F-14 TOMCAT — real airframe (GLB) + scroll-driven wing sweep
   The wing panels are split out of the airframe at load time and
   re-parented onto pivots so they can sweep like the real thing.
   ========================================================= */
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const DEG = Math.PI / 180;

/* Catmull-Rom through scalar control points */
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/* Orbital camera keyframes: radius, azimuth (0 = nose-on), elevation */
const KEYFRAMES = [
  { p: 0.000, r: 31, az: 38, el: 11, tgt: [0, 0.40, 0.20] },
  { p: 0.112, r: 30, az: 20, el: 6, tgt: [0, 0.35, 0.20] },
  { p: 0.224, r: 28, az: -40, el: 10, tgt: [0, 0.20, 0.00] },
  { p: 0.300, r: 27, az: -52, el: 24, tgt: [0, 0.10, 0.00] },
  { p: 0.360, r: 37, az: -14, el: 52, tgt: [0, 0.10, 0.00] },
  { p: 0.440, r: 36, az: 6, el: 44, tgt: [0, 0.10, 0.00] },
  { p: 0.520, r: 27, az: 34, el: 15, tgt: [-2.6, 0.20, -0.60] },
  { p: 0.620, r: 26, az: 92, el: 8, tgt: [-2.4, 0.20, -1.00] },
  { p: 0.712, r: 28, az: 150, el: 6, tgt: [0, 0.30, 0.40] },
  { p: 0.854, r: 32, az: 235, el: -8, tgt: [0, 0.10, -0.60] },
  { p: 0.962, r: 36, az: 340, el: 4, tgt: [0, 0.50, 0.00] },
  { p: 1.000, r: 30, az: 350, el: 9, tgt: [0, 0.50, 0.00] }
];

function sampleKeyframes(p) {
  let i = 0;
  while (i < KEYFRAMES.length - 2 && p > KEYFRAMES[i + 1].p) i++;
  const a = KEYFRAMES[i], b = KEYFRAMES[i + 1];
  const t = clamp((p - a.p) / (b.p - a.p), 0, 1);
  const k0 = KEYFRAMES[Math.max(0, i - 1)];
  const k3 = KEYFRAMES[Math.min(KEYFRAMES.length - 1, i + 2)];
  const out = {};
  for (const key of ['r', 'az', 'el']) out[key] = cr(k0[key], a[key], b[key], k3[key], t);
  out.tgt = [0, 1, 2].map((c) => cr(k0.tgt[c], a.tgt[c], b.tgt[c], k3.tgt[c], t));
  return out;
}

/* ---------------------------------------------------------
   environment
   --------------------------------------------------------- */
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,228,190,1)');
  g.addColorStop(0.22, 'rgba(255,150,70,.65)');
  g.addColorStop(1, 'rgba(255,96,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeEnv(renderer) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.00, '#010308');
  g.addColorStop(0.34, '#061019');
  g.addColorStop(0.46, '#122a36');
  g.addColorStop(0.495, '#4e3024');
  g.addColorStop(0.515, '#c95a2b');
  g.addColorStop(0.55, '#1c1512');
  g.addColorStop(0.72, '#060c10');
  g.addColorStop(1.00, '#020507');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);

  const sun = ctx.createRadialGradient(742, 250, 0, 742, 250, 165);
  sun.addColorStop(0, 'rgba(255,244,224,.8)');
  sun.addColorStop(0.2, 'rgba(255,180,110,.4)');
  sun.addColorStop(1, 'rgba(255,110,40,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 1024, 512);

  const bounce = ctx.createRadialGradient(240, 300, 0, 240, 300, 260);
  bounce.addColorStop(0, 'rgba(70,150,175,.3)');
  bounce.addColorStop(1, 'rgba(70,150,175,0)');
  ctx.fillStyle = bounce;
  ctx.fillRect(0, 0, 1024, 512);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(tex).texture;
  tex.dispose();
  pmrem.dispose();
  return env;
}

/* ---------------------------------------------------------
   wing extraction
   local mesh space: X = length, Y = span, Z = up
   --------------------------------------------------------- */
const WING = {
  pivotX: 17.0,
  pivotY: 29.5,
  pivotZ: 2.5,
  /* outer-panel planform in (x, |y|) — traced from the airframe */
  poly: [[41.0, 27.5], [0.5, 97.5], [-17.5, 97.5], [-2.0, 27.5]]
};

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const hit = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

function splitWings(mesh) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const index = geo.index;
  const triCount = (index ? index.count : pos.count) / 3;

  const fixedIdx = [], leftIdx = [], rightIdx = [];
  let wingTris = 0;

  /* connected components: glove-mounted stores must not sweep with the wing */
  const vCount = pos.count;
  const uf = new Int32Array(vCount);
  for (let i = 0; i < vCount; i++) uf[i] = i;
  const find = (x) => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) uf[b] = a; };
  for (let t = 0; t < triCount; t++) {
    const ia = index ? index.getX(t * 3) : t * 3;
    const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    union(ia, ib); union(ib, ic);
  }
  const boxes = new Map();
  for (let i = 0; i < vCount; i++) {
    const r = find(i);
    let b = boxes.get(r);
    if (!b) { b = { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9, minZ: 1e9, maxZ: -1e9 }; boxes.set(r, b); }
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x;
    if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y;
    if (z < b.minZ) b.minZ = z; if (z > b.maxZ) b.maxZ = z;
  }
  const storeRoots = new Set();
  for (const [r, b] of boxes) {
    const sx = b.maxX - b.minX, sy = b.maxY - b.minY, sz = b.maxZ - b.minZ;
    const cy = (b.minY + b.maxY) / 2, cx = (b.minX + b.maxX) / 2;
    if (Math.abs(cy) > 29 && Math.abs(cy) < 39 && sy < 4 && sx > 10 && sz < 6 && cx > -8) storeRoots.add(r);
  }

  for (let t = 0; t < triCount; t++) {
    const ia = index ? index.getX(t * 3) : t * 3;
    const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;

    /* a triangle belongs to the wing if ANY of its corners is on the panel,
       so the root edge stays continuous instead of combing */
    let onWing = false;
    let side = 0;
    const isStore = storeRoots.has(find(ia));
    for (const v of [ia, ib, ic]) {
      const vx = pos.getX(v), vy = pos.getY(v);
      if (pointInPoly(vx, Math.abs(vy), WING.poly)) {
        onWing = true;
        side = vy >= 0 ? 1 : -1;
        break;
      }
    }

    if (onWing && !isStore) {
      wingTris++;
      (side > 0 ? rightIdx : leftIdx).push(ia, ib, ic);
    } else {
      fixedIdx.push(ia, ib, ic);
    }
  }

  function subGeometry(indices) {
    const g = new THREE.BufferGeometry();
    for (const name in geo.attributes) g.setAttribute(name, geo.attributes[name]);
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    g.boundingSphere = geo.boundingSphere ? geo.boundingSphere.clone() : null;
    return g;
  }

  const parent = mesh.parent;
  mesh.updateMatrix();

  const holder = new THREE.Group();
  holder.name = 'airframe';
  holder.matrixAutoUpdate = false;
  holder.matrix.copy(mesh.matrix);
  parent.add(holder);
  parent.remove(mesh);

  const fixed = new THREE.Mesh(subGeometry(fixedIdx), mesh.material);
  fixed.name = 'airframe-fixed';
  fixed.frustumCulled = false;
  holder.add(fixed);

  const pivotR = new THREE.Group();
  pivotR.name = 'wing-pivot-right';
  pivotR.position.set(WING.pivotX, WING.pivotY, WING.pivotZ);
  holder.add(pivotR);
  const wingR = new THREE.Mesh(subGeometry(rightIdx), mesh.material);
  wingR.position.set(-WING.pivotX, -WING.pivotY, -WING.pivotZ);
  wingR.frustumCulled = false;
  pivotR.add(wingR);

  const pivotL = new THREE.Group();
  pivotL.name = 'wing-pivot-left';
  pivotL.position.set(WING.pivotX, -WING.pivotY, WING.pivotZ);
  holder.add(pivotL);
  const wingL = new THREE.Mesh(subGeometry(leftIdx), mesh.material);
  wingL.position.set(-WING.pivotX, WING.pivotY, -WING.pivotZ);
  wingL.frustumCulled = false;
  pivotL.add(wingL);

  /* replacement Sidewinders, fixed to the glove and always pointing forward */
  const matStoreBody = new THREE.MeshStandardMaterial({ color: 0xd2d8dc, metalness: 0.35, roughness: 0.5 });
  const matStoreDark = new THREE.MeshStandardMaterial({ color: 0x1b1f22, metalness: 0.6, roughness: 0.4 });

  function buildSidewinder() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 23, 14), matStoreBody);
    body.rotation.z = -Math.PI / 2;
    g.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.15, 4.6, 14), matStoreDark);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 13.8;
    g.add(nose);

    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.22, 2.9), matStoreBody);
      fin.position.x = -8.6;
      fin.position.y = Math.cos(i * Math.PI / 2) * 1.85;
      fin.position.z = Math.sin(i * Math.PI / 2) * 1.85;
      fin.rotation.x = i * Math.PI / 2;
      g.add(fin);
    }
    return g;
  }

  for (const side of [1, -1]) {
    const missile = buildSidewinder();
    missile.position.set(18, 33.2 * side, 1.0);
    holder.add(missile);

    const pylon = new THREE.Mesh(new THREE.BoxGeometry(6, 0.35, 0.35), matDarkStore());
    pylon.position.set(18, 33.2 * side, 2.3);
    holder.add(pylon);
  }

  function matDarkStore() {
    return new THREE.MeshStandardMaterial({ color: 0x2a3034, metalness: 0.5, roughness: 0.55 });
  }

  if (new URLSearchParams(location.search).has('paint')) {
    fixed.material = new THREE.MeshBasicMaterial({ color: 0x2c3a42 });
    wingR.material = new THREE.MeshBasicMaterial({ color: 0xff4d2e, side: THREE.DoubleSide });
    wingL.material = new THREE.MeshBasicMaterial({ color: 0x37ffa0, side: THREE.DoubleSide });
  }

  console.info(`[F-14] wing split: ${wingTris} tris of ${triCount}; fixed stores: ${storeRoots.size}`);
  return { pivotR, pivotL };
}

/* ---------------------------------------------------------
   stage
   --------------------------------------------------------- */
export function createStage(canvas) {
  const isMobile = matchMedia('(max-width: 900px)').matches || matchMedia('(pointer: coarse)').matches;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const paramsDebug = new URLSearchParams(location.search).has('debug');
  const wingsDebug = new URLSearchParams(location.search).has('wings');
  const debugSweep = parseFloat(new URLSearchParams(location.search).get('sweep') || '20');
  const debugBelow = new URLSearchParams(location.search).has('below');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: !isMobile, powerPreference: 'high-performance',
      alpha: false, stencil: false
    });
  } catch (e) {
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.97;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04070a);
  scene.fog = new THREE.FogExp2(0x04070a, 0.0115);

  const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(19, 5.9, 24);

  const env = makeEnv(renderer);
  scene.environment = env;

  /* lights */
  const key = new THREE.DirectionalLight(0xfff1de, 2.8);
  key.position.set(14, 18, 12);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x6fd8c0, 0.85);
  rim.position.set(-16, 5, -14);
  scene.add(rim);

  const warm = new THREE.DirectionalLight(0xff7a38, 0.45);
  warm.position.set(-8, -8, 10);
  scene.add(warm);

  scene.add(new THREE.HemisphereLight(0x8db6c4, 0x0a0f12, 0.85));

  const fill = new THREE.DirectionalLight(0xbfd8e8, 0.7);
  fill.position.set(-2, 2, 20);
  scene.add(fill);

  /* follows the camera so the visible side is never a silhouette */
  const camFill = new THREE.DirectionalLight(0xd6ecff, 0.7);
  scene.add(camFill);
  scene.add(camFill.target);

  /* ---------------------------------------------------------
     environment geometry
     --------------------------------------------------------- */
  const grid = new THREE.GridHelper(320, 80, 0x2a5b64, 0x123038);
  grid.position.y = -9.42;
  grid.material.transparent = true;
  grid.material.opacity = 0.2;
  grid.material.depthWrite = false;
  grid.name = 'grid';
  scene.add(grid);

  const starCount = isMobile ? 380 : 900;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 110 + Math.random() * 130;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 1.3 - 0.3);
    starPos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
    starPos[i * 3 + 1] = Math.cos(ph) * r * 0.7 + 10;
    starPos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0x9fd6e2, size: 0.85, sizeAttenuation: true,
    transparent: true, opacity: 0.55, depthWrite: false, fog: false
  }));
  stars.name = 'stars';
  scene.add(stars);

  const dustCount = isMobile ? 80 : 200;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 46;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 26;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 46;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xffc9a0, size: 0.13, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  }));
  dust.name = 'dust';
  scene.add(dust);

  /* ---------------------------------------------------------
     post
     --------------------------------------------------------- */
  let composer = null;
  if (wingsDebug) scene.add(new THREE.AmbientLight(0xffffff, 2.2));
  if (!isMobile && !wingsDebug) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.26, 0.55, 0.95
    ));
    composer.addPass(new OutputPass());
  }

  /* ---------------------------------------------------------
     aircraft
     --------------------------------------------------------- */
  const jet = new THREE.Group();
  jet.name = 'jet';
  scene.add(jet);

  let pivotR = null, pivotL = null;
  const glowTex = makeGlowTexture();
  const flames = [];
  let readyResolve;
  const ready = new Promise((res) => { readyResolve = res; });

  const loader = new GLTFLoader();
  loader.load('./assets/models/f14.glb?v=2', (gltf) => {
    const root = gltf.scene;

    /* tone the paint down a touch so it doesn't clip under the key light */
    const seen = new Set();
    root.traverse((o) => {
      if (!o.isMesh || !o.material || seen.has(o.material)) return;
      seen.add(o.material);
      if (o.material.envMapIntensity !== undefined) o.material.envMapIntensity = 0.8;
      if (o.material.color) o.material.color.multiplyScalar(0.88);
      o.material.needsUpdate = true;
    });

    /* landing gear up, probe stowed */
    root.traverse((o) => {
      if (o.name && /gearOn/i.test(o.name)) o.visible = false;
    });

    const airframe = root.getObjectByName('Object_4') || root.getObjectByName('f14a-airframe_0');
    let airframeMesh = null;
    root.traverse((o) => {
      if (!airframeMesh && o.isMesh && /airframe/i.test(o.name || '') === false && o.geometry &&
          o.geometry.attributes.position && o.geometry.attributes.position.count > 20000) {
        airframeMesh = o;
      }
    });
    if (!airframeMesh) {
      root.traverse((o) => {
        if (o.isMesh && !airframeMesh && o.geometry.attributes.position.count > 10000) airframeMesh = o;
      });
    }

    if (airframeMesh) {
      const split = splitWings(airframeMesh);
      pivotR = split.pivotR;
      pivotL = split.pivotL;
    }

    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const scale = 19.2 / Math.max(size.x, size.z);
    root.scale.setScalar(scale);
    root.rotation.y = -Math.PI / 2;
    root.updateMatrixWorld(true);

    const box2 = new THREE.Box3().setFromObject(root);
    const center = box2.getCenter(new THREE.Vector3());
    root.position.sub(center);
    root.updateMatrixWorld(true);

    jet.add(root);

    /* afterburner glow at the nozzles */
    const nozzleZ = -9.1;
    for (const s of [1, -1]) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xffb070, blending: THREE.AdditiveBlending,
        depthWrite: false, transparent: true, opacity: 0.75
      }));
      sprite.scale.set(2.6, 2.6, 1);
      sprite.name = 'burner';
      sprite.position.set(1.55 * s, 0.05, nozzleZ);
      jet.add(sprite);

      const pl = new THREE.PointLight(0xff7a2e, 4.0, 14, 2);
      pl.position.set(1.55 * s, 0.05, nozzleZ);
      jet.add(pl);

      flames.push({ sprite, pl });
    }

    const maps = [];
    root.traverse((o) => {
      if (o.isMesh && o.material && o.material.map) maps.push(o.material.name || 'mat');
    });
    console.info('[F-14] loaded', { size: size.toArray().map((n) => +n.toFixed(1)), scale, texturedMaterials: new Set(maps).size });
    readyResolve(true);
  }, undefined, (err) => {
    console.error('[F-14] load failed', err);
    readyResolve(false);
  });

  /* ---------------------------------------------------------
     state + loop
     --------------------------------------------------------- */
  let targetProgress = 0;
  let progress = 0;
  let sweep = 20;
  let sweepTarget = 20;
  const pointer = new THREE.Vector2(0, 0);
  const pointerTarget = new THREE.Vector2(0, 0);
  const camPos = new THREE.Vector3(20, 5.4, 23);
  const camTgt = new THREE.Vector3(0, 0.4, 0);
  const tmpPos = new THREE.Vector3();
  const tmpTgt = new THREE.Vector3();
  let running = true;
  let visible = true;
  let lastFrame = 0;
  let raf = 0;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.fov = w / h < 0.85 ? 46 : 36;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    renderer.setSize(w, h, false);
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    }
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!running || !visible) return;

    if (!lastFrame) lastFrame = now;
    let dt = (now - lastFrame) / 1000;
    lastFrame = now;
    if (!(dt > 0) || !Number.isFinite(dt)) dt = 0.016;
    dt = Math.min(0.05, dt);
    const time = now / 1000;

    progress += (targetProgress - progress) * Math.min(1, dt * 3.6);
    pointer.x += (pointerTarget.x - pointer.x) * Math.min(1, dt * 3.2);
    pointer.y += (pointerTarget.y - pointer.y) * Math.min(1, dt * 3.2);
    sweep += (sweepTarget - sweep) * Math.min(1, dt * 4.2);

    const p = reduceMotion ? targetProgress : progress;
    if (wingsDebug) {
      sweepTarget = debugSweep;
      camera.position.set(0, debugBelow ? -46 : 46, 0.01);
      camera.lookAt(0, 0, 0);
    }
    const kf = sampleKeyframes(p);
    const azr = kf.az * DEG, elr = kf.el * DEG;
    const cosEl = Math.cos(elr);
    const breathe = reduceMotion ? 0 : 1;
    const dist = kf.r * (camera.aspect < 0.9 ? 1.95 : 1);

    tmpPos.set(
      kf.tgt[0] + dist * Math.sin(azr) * cosEl + pointer.x * 0.9 * breathe + Math.sin(time * 0.21) * 0.16 * breathe,
      kf.tgt[1] + dist * Math.sin(elr) + pointer.y * -0.55 * breathe + Math.sin(time * 0.17 + 1.4) * 0.1 * breathe,
      kf.tgt[2] + dist * Math.cos(azr) * cosEl
    );
    tmpTgt.set(kf.tgt[0] + pointer.x * 0.35, kf.tgt[1] + pointer.y * -0.22 - (camera.aspect < 0.9 ? 2.2 : 0), kf.tgt[2]);
    if (camera.aspect > 0.95) tmpTgt.x -= 3.0 * (1 - smoothstep(0.10, 0.26, p));

    const damp = Math.min(1, dt * 5.5);
    camPos.lerp(tmpPos, damp);
    camTgt.lerp(tmpTgt, damp);
    if (!wingsDebug) {
      camera.position.copy(camPos);
      camera.lookAt(camTgt);
    }

    if (!reduceMotion) camera.rotateZ(Math.sin(time * 0.19) * 0.008 + pointer.x * 0.012);

    if (!reduceMotion) {
      jet.rotation.z = Math.sin(time * 0.31) * 0.026 + pointer.x * 0.04;
      jet.rotation.x = Math.sin(time * 0.23 + 1.2) * 0.013 - pointer.y * 0.025;
      jet.rotation.y = Math.sin(time * 0.11) * 0.03 + (p - 0.5) * 0.08;
      jet.position.y = Math.sin(time * 0.42) * 0.05;
    }

    /* the wing sweep itself: model rest pose is 20° */
    const delta = (sweep - 20) * DEG;
    if (pivotR) pivotR.rotation.z = delta;
    if (pivotL) pivotL.rotation.z = -delta;

    const flick = 0.86 + Math.sin(time * 47) * 0.06 + Math.sin(time * 23.3) * 0.05;
    for (const f of flames) {
      f.sprite.material.opacity = (0.45 + flick * 0.3) * (0.55 + (sweep - 20) / 48 * 0.45);
      f.pl.intensity = 2.6 + flick * 2.6;
    }

    dust.rotation.y = time * 0.008;
    stars.rotation.y = time * 0.0025;

    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) lastFrame = 0;
  });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    running = false;
    document.body.classList.add('no-webgl');
  }, false);

  raf = requestAnimationFrame(frame);

  if (paramsDebug) {
    window.__tomcat = {
      scene, camera, jet, renderer, THREE,
      state: {
        get progress() { return progress; },
        get target() { return targetProgress; },
        get camPos() { return camPos.toArray(); },
        get sweep() { return sweep; },
        get pivots() { return { r: pivotR && pivotR.rotation.z, l: pivotL && pivotL.rotation.z }; }
      }
    };
  }

  return {
    ready,
    setProgress(v) { targetProgress = clamp(v, 0, 1); },
    setPointer(x, y) { pointerTarget.set(x, y); },
    setSweep(deg) { sweepTarget = clamp(deg, 20, 68); },
    getSweep() { return sweep; },
    dispose() {
      cancelAnimationFrame(raf);
      running = false;
      window.removeEventListener('resize', resize);
      renderer.dispose();
    }
  };
}
