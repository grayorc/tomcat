/* =========================================================
   TOMCAT.SBS — interface, scroll choreography, instruments
   ========================================================= */
import { createStage } from './scene.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const params = new URLSearchParams(location.search);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

const body = document.body;
const boot = $('#boot');
const bootBar = $('#bootBar');
const bootPct = $('#bootPct');
const progressBar = $('#progressBar');
const railFill = $('#railFill');
const tmTrack = $('#tmTrack');
const tmMach = $('#tmMach');
const tmAlt = $('#tmAlt');
const tmSweep = $('#tmSweep');
const tmSector = $('#tmSector');
const nav = $('#nav');

/* ---------------------------------------------------------
   stage
   --------------------------------------------------------- */
let stage = null;
try {
  stage = createStage($('#stage'));
} catch (err) {
  console.warn('3D stage unavailable:', err);
}
if (!stage) body.classList.add('no-webgl');
if (params.has('wings')) body.classList.add('wings-debug');

let stageReady = false;
const bootStart = performance.now();
if (stage && stage.ready) {
  stage.ready.then(() => { stageReady = true; });
} else {
  stageReady = true;
}

/* ---------------------------------------------------------
   boot
   --------------------------------------------------------- */
let booted = false;
function finishBoot(instant = false) {
  if (booted) return;
  booted = true;
  if (instant) {
    boot.classList.add('done');
    boot.style.transitionDuration = '0s';
    boot.style.display = 'none';
  } else {
    boot.classList.add('done');
    setTimeout(() => { boot.style.display = 'none'; }, 1200);
  }
  body.classList.remove('is-locked');
  body.classList.add('ready');
}

if (params.has('noboot')) {
  finishBoot(true);
} else {
  body.classList.add('is-locked');
  let v = 0;
  const waitForModel = () => {
    if (stageReady || performance.now() - bootStart > 6000) finishBoot(false);
    else setTimeout(waitForModel, 90);
  };
  const tickBoot = () => {
    v = Math.min(100, v + (100 - v) * 0.085 + 0.5);
    if (bootBar) bootBar.style.width = v.toFixed(1) + '%';
    if (bootPct) bootPct.textContent = String(Math.round(v)).padStart(3, '0');
    if (v < 99.4) requestAnimationFrame(tickBoot);
    else waitForModel();
  };
  requestAnimationFrame(tickBoot);
  /* hard safety: never trap the visitor behind the loader */
  setTimeout(() => finishBoot(false), 4200);
}

/* ---------------------------------------------------------
   reveals + counters
   --------------------------------------------------------- */
const nf = (dec) => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: dec, maximumFractionDigits: dec
});

function animateCount(el) {
  const target = parseFloat(el.dataset.count);
  const dec = parseInt(el.dataset.dec || '0', 10);
  if (!isFinite(target)) return;
  const dur = 1500;
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  const step = (now) => {
    const t = clamp((now - start) / dur, 0, 1);
    el.textContent = nf(dec).format(target * ease(t));
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = nf(dec).format(target);
  };
  requestAnimationFrame(step);
}

const io = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add('in');
    $$('[data-count]', entry.target).forEach(animateCount);
    io.unobserve(entry.target);
  }
}, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });

$$('.reveal').forEach((el) => {
  const d = parseInt(el.dataset.delay || '0', 10);
  el.style.setProperty('--d', d * 85 + 'ms');
  io.observe(el);
});

/* counters that sit outside a .reveal */
$$('[data-count]').forEach((el) => {
  if (!el.closest('.reveal')) io.observe(el.parentElement);
});

/* ---------------------------------------------------------
   wing sweep console
   --------------------------------------------------------- */
const range = $('#sweepRange');
const roSweep = $('#roSweep');
const roSpan = $('#roSpan');
const roAspect = $('#roAspect');
const roDrag = $('#roDrag');
const bpState = $('#bpState');
const wingR = $('#wingR');
const wingL = $('#wingL');
const needle = $('#sweepNeedle');
const presets = $$('.geo__presets button');

let sweepValue = 20;
let manual = false;
let manualAt = 0;

/* sweep schedule across the page: 20° on the deck, 68° for the dash */
const SWEEP_KEYS = [
  [0.00, 20], [0.22, 20], [0.30, 23], [0.336, 22],
  [0.390, 44], [0.440, 62], [0.470, 68], [0.620, 68],
  [0.740, 46], [0.860, 26], [1.00, 20]
];

function sweepForProgress(p) {
  for (let i = 0; i < SWEEP_KEYS.length - 1; i++) {
    const a = SWEEP_KEYS[i], b = SWEEP_KEYS[i + 1];
    if (p <= b[0] || i === SWEEP_KEYS.length - 2) {
      const t = clamp((p - a[0]) / (b[0] - a[0] || 1), 0, 1);
      const e = t * t * (3 - 2 * t);
      return a[1] + (b[1] - a[1]) * e;
    }
  }
  return 20;
}

/* gauge ticks */
const gaugeTicks = $('#gaugeTicks');
if (gaugeTicks) {
  const NS = 'http://www.w3.org/2000/svg';
  for (let a = 20; a <= 68; a += 8) {
    const rad = a * Math.PI / 180;
    const line = document.createElementNS(NS, 'line');
    const long = a === 20 || a === 68 || a === 44;
    line.setAttribute('x1', (434 + Math.cos(rad) * (long ? 52 : 56)).toFixed(2));
    line.setAttribute('y1', (435 + Math.sin(rad) * (long ? 52 : 56)).toFixed(2));
    line.setAttribute('x2', (434 + Math.cos(rad) * 60).toFixed(2));
    line.setAttribute('y2', (435 + Math.sin(rad) * 60).toFixed(2));
    line.setAttribute('stroke', 'rgba(116,228,196,.4)');
    line.setAttribute('stroke-width', long ? '1' : '.6');
    gaugeTicks.appendChild(line);
  }
}

function sweepSpan(deg) {
  const a = deg * Math.PI / 180;
  const c20 = Math.cos(20 * Math.PI / 180);
  const c68 = Math.cos(68 * Math.PI / 180);
  const t = (Math.cos(a) - c68) / (c20 - c68);
  return 11.65 + (19.55 - 11.65) * clamp(t, 0, 1);
}

function paintSweep(deg) {
  const s = deg;
  sweepValue = s;
  if (roSweep) roSweep.innerHTML = s.toFixed(1) + '<i>°</i>';
  const span = sweepSpan(s);
  if (roSpan) roSpan.innerHTML = span.toFixed(2) + '<i>M</i>';
  if (roAspect) roAspect.innerHTML = (span * span / 54.5).toFixed(2) + '<i>—</i>';
  if (roDrag) roDrag.innerHTML = (1 - 0.29 * ((s - 20) / 48)).toFixed(2) + '<i>—</i>';
  if (tmSweep) tmSweep.innerHTML = s.toFixed(1) + '<span>°</span>';
  if (bpState) {
    const phase = s < 34 ? 'LOITER' : s < 56 ? 'CRUISE' : 'DASH';
    bpState.textContent = 'SWEEP ' + s.toFixed(1) + '° / ' + phase + (manual ? ' · MANUAL' : ' · SCROLL-LINKED');
  }
  if (wingR) wingR.setAttribute('transform', `rotate(${(s - 20).toFixed(2)} 434 435)`);
  if (wingL) wingL.setAttribute('transform', `rotate(${(-(s - 20)).toFixed(2)} 246 435)`);
  if (needle) needle.setAttribute('transform', `rotate(${s.toFixed(2)} 434 435)`);
  presets.forEach((b) => b.classList.toggle('is-active', Math.abs(parseFloat(b.dataset.sweep) - s) < 1.2));
}

function commandSweep(deg, fromUser = false) {
  const v = clamp(deg, 20, 68);
  if (fromUser) {
    manual = true;
    manualAt = performance.now();
  }
  if (stage) stage.setSweep(v);
  if (range && fromUser) range.value = v;
  if (fromUser) paintSweep(v);
}

if (range) {
  range.addEventListener('input', () => commandSweep(parseFloat(range.value), true));
}
presets.forEach((btn) => {
  btn.addEventListener('click', () => {
    const v = parseFloat(btn.dataset.sweep);
    if (range) range.value = v;
    commandSweep(v, true);
  });
});

/* keep the console in sync with the actual 3D wing (which eases into place) */
let lastPaint = 0;
function syncConsole(now) {
  if (stage && now - lastPaint > 33) {
    lastPaint = now;
    const s = stage.getSweep();
    if (Math.abs(s - sweepValue) > 0.04) paintSweep(s);
  }
  requestAnimationFrame(syncConsole);
}
requestAnimationFrame(syncConsole);

/* a manual setting hands control back to scroll after a beat */
function releaseManual() {
  if (manual && performance.now() - manualAt > 5200) {
    manual = false;
    paintSweep(sweepValue);
  }
}
paintSweep(20);

/* ---------------------------------------------------------
   scroll + telemetry
   --------------------------------------------------------- */
const sections = [
  { id: 'top', name: 'DECK' },
  { id: 'doctrine', name: 'DOCTRINE' },
  { id: 'airframe', name: 'AIRFRAME' },
  { id: 'geometry', name: 'GEOMETRY' },
  { id: 'history', name: 'HISTORY' },
  { id: 'squadrons', name: 'SQUADRONS' },
  { id: 'ordnance', name: 'ORDNANCE' },
  { id: 'close', name: 'SUNDOWN' }
];
const railItems = $$('.rail li');
const navLinks = $$('.nav__links a');
let progress = 0;

function sectionAt(y) {
  let current = sections[0];
  for (const s of sections) {
    const el = document.getElementById(s.id);
    if (!el) continue;
    if (el.getBoundingClientRect().top + window.scrollY <= y) current = s;
  }
  return current;
}

function updateScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progress = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;

  if (progressBar) progressBar.style.width = (progress * 100).toFixed(2) + '%';
  if (tmTrack) tmTrack.style.width = (progress * 100).toFixed(2) + '%';
  if (railFill) railFill.style.height = (progress * 100).toFixed(2) + '%';
  nav.classList.toggle('is-scrolled', window.scrollY > 30);

  if (stage) stage.setProgress(progress);

  /* wings fly the scroll: 20° on the deck → 68° for the dash */
  releaseManual();
  if (!manual) commandSweep(sweepForProgress(progress), false);

  const sec = sectionAt(window.scrollY + window.innerHeight * 0.42);
  if (tmSector) tmSector.textContent = 'SECTOR ' + String(sections.indexOf(sec) + 1).padStart(2, '0') + ' / ' + sec.name;
  railItems.forEach((li) => li.classList.toggle('is-active', li.dataset.sec === sec.id));
  navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + sec.id));

  if (tmMach) tmMach.textContent = (0.58 + progress * 1.62).toFixed(2);
  if (tmAlt) {
    const alt = Math.round((8200 + progress * 43800) / 100) * 100;
    tmAlt.innerHTML = alt.toLocaleString('en-US') + '<span>FT</span>';
  }
}

window.addEventListener('scroll', updateScroll, { passive: true });
window.addEventListener('resize', updateScroll, { passive: true });
updateScroll();

/* ---------------------------------------------------------
   pointer: parallax + reticle
   --------------------------------------------------------- */
if (finePointer && !reduceMotion) {
  body.classList.add('has-cursor');
  const cursor = $('#cursor');
  const label = $('#cursorLabel');
  let mx = window.innerWidth / 2, my = window.innerHeight / 2;
  let rx = mx, ry = my, dx = mx, dy = my;

  cursor.classList.add('on');
  window.addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY;
    if (stage) stage.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  const loop = () => {
    rx += (mx - rx) * 0.14;
    ry += (my - ry) * 0.14;
    dx += (mx - dx) * 0.55;
    dy += (my - dy) * 0.55;
    cursor.style.transform = `translate3d(${rx}px,${ry}px,0)`;
    cursor.style.setProperty('--dx', dx + 'px');
    cursor.style.setProperty('--dy', dy + 'px');
    const dot = cursor.querySelector('.cursor__dot');
    dot.style.transform = `translate3d(${dx - rx}px,${dy - ry}px,0)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const hot = (on, text) => {
    cursor.classList.toggle('is-hot', on);
    if (text) label.textContent = text;
  };
  $$('[data-cursor]').forEach((el) => {
    el.addEventListener('mouseenter', () => hot(true, el.dataset.cursor));
    el.addEventListener('mouseleave', () => hot(false));
  });
  $$('a:not([data-cursor]), button:not([data-cursor])').forEach((el) => {
    el.addEventListener('mouseenter', () => hot(true, ''));
    el.addEventListener('mouseleave', () => hot(false));
  });
}

/* ---------------------------------------------------------
   debug / capture helpers
   --------------------------------------------------------- */
if (params.has('p')) {
  const target = clamp(parseFloat(params.get('p')) || 0, 0, 1);
  setTimeout(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: target * max, behavior: 'auto' });
    updateScroll();
  }, params.has('noboot') ? 220 : 1600);
}

/* pause the auto demo when the tab is hidden */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateScroll();
});
