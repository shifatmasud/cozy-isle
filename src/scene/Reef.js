// Reef.js: the southern lagoon and reef crest below the water (around x 30, z 122).
// Staghorn thickets, brain-coral domes, table corals on stalks, purple sea fans facing the current,
// bubble anemones, tube sponges, coral-crusted rock bommies with soft-coral fingers,
// starfish / urchin / shell scatters on the sand, swaying turtle-grass meadows with sand halos
// round each patch reef, and small schools of reef fish swimming slow loops.
// 10 draw calls: painted-skin corals, fans, anemones, seagrass and fish through the shared leafMaterial program,
// sand critters through cozyMaterial (no new shader programs). Hidden when the camera is > ~150 m away.
// Note: island.js zeroes `tropical` wherever `under` is 1, so the reef uses its own sector mask
// on BIOME_ANGLE.tropical plus the field's `d` (coast distance) to find the lagoon, crest and fore reef.
import { createElement as h, useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cozyMaterial, leafMaterial, shared } from '../materials/shading.js';
import { paintTexture, brush } from '../materials/leafTex.js';
import { paint, paintUV, merge, makeInstanced, spherifyNormals, report, triangles } from '../lib/geo.js';
import { scatter, sampleField, clump, BIOME_ANGLE } from '../world/island.js';
import { mulberry32, smoothstep, valueNoise, clamp, lerp } from '../world/noise.js';

const TAU = Math.PI * 2;
const FOCUS_X = 30;
const FOCUS_Z = 122;
const TROP_ANG = BIOME_ANGLE.tropical;
const CEILING = -0.32; // nothing of the reef may reach above y = -0.3
// The fans grow broadside to the current: local +z (fan normal) faces the shared uWind direction (1, 0.35).
const FAN_YAW = Math.atan2(1.0, 0.35);

// ---------------------------------------------------------------- pure placement (no three.js) ----

function sectorW(x, z) {
  const a = Math.atan2(z, x);
  const d = Math.atan2(Math.sin(a - TROP_ANG), Math.cos(a - TROP_ANG));
  return Math.exp(-(d * d) / (2 * 0.42 * 0.42));
}

// Dense garden where the Reef view looks, thinner reef further along the lagoon.
function focusW(x, z) {
  const dx = x - FOCUS_X;
  const dz = z - FOCUS_Z;
  return 0.22 + 0.78 * Math.exp(-(dx * dx + dz * dz) / (2 * 38 * 38));
}

function bandW(v, a, b, soft) {
  return smoothstep(a - soft, a + soft, v) * smoothstep(b + soft, b - soft, v);
}

// Reef zonation by coast distance d: lagoon (sand, seagrass, patch reefs), crest (~1.33), fore reef drop-off.
function zoneOf(d) {
  return d < 1.27 ? 'lagoon' : d < 1.375 ? 'crest' : 'fore';
}

function reefOK(b) {
  return b.under > 0.5 && b.h < -0.75 && b.h > -9 && b.d > 1.0 && b.d < 1.425;
}

function gauss(rand) {
  return Math.sqrt(-2 * Math.log(1 - rand() * 0.9999)) * Math.cos(TAU * rand());
}

function pickWeighted(cum, rand) {
  const r = rand() * cum[cum.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function jitter(rand, i) {
  return { i, dh: (rand() - 0.5) * 0.045, ds: (rand() - 0.5) * 0.12, dl: (rand() - 0.5) * 0.11 };
}

// share: fraction of Q.coral. pref: weight per reef zone. s: instance scale range. spread: offset from the
// patch centre in patch radii. sink: how far the base is pushed into the sand (per unit scale).
export const SPECIES = {
  staghorn: { share: 0.18, pref: { lagoon: 0.45, crest: 1, fore: 0.35 }, s: [0.9, 1.7], spread: 0.75, sink: 0.06, pal: 4 },
  brain: { share: 0.16, pref: { lagoon: 1, crest: 0.6, fore: 0.3 }, s: [0.7, 1.8], spread: 0.8, sink: 0.05, pal: 4 },
  table: { share: 0.09, pref: { lagoon: 0.15, crest: 0.8, fore: 1 }, s: [0.8, 1.9], spread: 0.9, sink: 0.04, pal: 4 },
  fan: { share: 0.12, pref: { lagoon: 0.2, crest: 0.9, fore: 1 }, s: [0.8, 1.55], spread: 0.9, sink: 0.04, pal: 5 },
  anemone: { share: 0.1, pref: { lagoon: 1, crest: 0.45, fore: 0.1 }, s: [0.8, 1.6], spread: 0.7, sink: 0.03, pal: 4 },
  sponge: { share: 0.1, pref: { lagoon: 0.7, crest: 1, fore: 0.6 }, s: [0.8, 1.6], spread: 0.8, sink: 0.04, pal: 4 },
  bommie: { share: 0.1, pref: { lagoon: 1, crest: 0.7, fore: 0.3 }, s: [1.0, 2.5], spread: 0.35, sink: 0.12, pal: 3 },
};
export const CRITTER_SHARE = 0.15; // starfish + urchin + shells scatters, also a fraction of Q.coral
export const SEAGRASS_TUFTS = 0.15; // painted cards of 7 ribbon blades (2 crossed bent cards) per Q.seagrass

// Fish species for the schools: colour, body scale, typical group size.
export const FISH_SPECIES = [
  { c: '#6fe0d2', s: 0.75, g: 14 }, // blue-green chromis, hovering in clouds over the staghorn
  { c: '#ffd84a', s: 1.05, g: 8 }, // yellow tangs
  { c: '#ff9a6a', s: 0.8, g: 12 }, // orange-pink anthias
  { c: '#8aa2ff', s: 0.85, g: 10 }, // periwinkle damsels
  { c: '#7fe0a8', s: 1.9, g: 4 }, // a few big slow parrotfish
];

export function reefCounts(Q) {
  const c = {};
  for (const k of Object.keys(SPECIES)) c[k] = Math.max(0, Math.round(Q.coral * SPECIES[k].share));
  c.critters = Math.max(0, Math.round(Q.coral * CRITTER_SHARE));
  c.seagrass = Math.max(0, Math.round(Q.seagrass * SEAGRASS_TUFTS));
  c.fish = Math.max(0, Q.fish | 0);
  return c;
}

function placePatches(n) {
  const rand = mulberry32(6102);
  const names = Object.keys(SPECIES);
  return scatter({
    count: n,
    seed: 6101,
    tries: 160,
    bounds: 200,
    accept: (b, x, z) => {
      if (!reefOK(b) || b.h > -1.3) return 0;
      const w = sectorW(x, z) * bandW(b.d, 1.06, 1.405, 0.02) * focusW(x, z);
      return w * (0.35 + 0.65 * smoothstep(0.35, 0.65, clump(x, z, 0.06, 61)));
    },
  }).map((p) => {
    const aff = {};
    for (const k of names) aff[k] = Math.pow(rand(), 1.5);
    const ci = {};
    for (const k of names) ci[k] = Math.floor(rand() * 16);
    return { x: p.x, z: p.z, h: p.y, zone: zoneOf(p.b.d), R: 1.6 + p.rnd * 2.6, aff, ci };
  });
}

function placeSpecies(name, n, patches, tops, seed) {
  const sp = SPECIES[name];
  const out = [];
  if (n <= 0 || !patches.length) return out;
  const rand = mulberry32(seed);
  const cum = [];
  let acc = 0;
  for (const p of patches) {
    acc += sp.pref[p.zone] * (0.25 + p.aff[name]) + 1e-6;
    cum.push(acc);
  }
  const top = tops[name];
  for (let t = 0; t < n * 10 && out.length < n; t++) {
    const p = patches[pickWeighted(cum, rand)];
    const x = p.x + gauss(rand) * p.R * sp.spread;
    const z = p.z + gauss(rand) * p.R * sp.spread;
    const b = sampleField(x, z);
    if (!reefOK(b) || sp.pref[zoneOf(b.d)] < 0.12) continue;
    let s = lerp(sp.s[0], sp.s[1], Math.pow(rand(), 1.4));
    const y = b.h - sp.sink * s;
    const sy = 0.85 + rand() * 0.3;
    const room = (CEILING - y) / (top * sy);
    if (room < sp.s[0] * 0.55) continue;
    s = Math.min(s, room);
    // Colour stays coherent inside a patch (single-genotype stands), with a few odd ones out.
    const ci = (p.ci[name] + (rand() < 0.28 ? 1 + Math.floor(rand() * 3) : 0)) % sp.pal;
    const it = {
      x,
      y,
      z,
      r: rand() * TAU,
      tx: (rand() - 0.5) * 0.16,
      tz: (rand() - 0.5) * 0.16,
      s,
      sx: 0.9 + rand() * 0.2,
      sy,
      sz: 0.9 + rand() * 0.2,
      c: jitter(rand, ci),
    };
    if (name === 'fan') {
      it.r = FAN_YAW + (rand() - 0.5) * 0.6;
      it.tx = (rand() - 0.5) * 0.1;
      it.tz = (rand() - 0.5) * 0.1;
    }
    if (name === 'bommie') {
      it.sx = 0.85 + rand() * 0.5;
      it.sz = 0.85 + rand() * 0.5;
      it.tx *= 0.5;
      it.tz *= 0.5;
    }
    out.push(it);
  }
  return out;
}

function placeMeadows(n) {
  return scatter({
    count: n,
    seed: 6201,
    tries: 160,
    bounds: 200,
    accept: (b, x, z) => {
      if (!reefOK(b) || b.h < -5.8 || b.h > -0.9) return 0;
      const w = sectorW(x, z) * bandW(b.d, 1.0, 1.27, 0.02) * focusW(x, z);
      return w * (0.25 + 0.75 * smoothstep(0.4, 0.62, clump(x, z, 0.05, 62)));
    },
  }).map((m) => ({ x: m.x, z: m.z, R: 2.5 + m.rnd * 4.5, ang: m.r, str: 1 + (m.r / TAU) * 0.8, ci: Math.floor(m.rnd * 97) % 3 }));
}

function nearPatches(x, z, reach, patches) {
  const out = [];
  for (const p of patches) {
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz < (reach + p.R) * (reach + p.R)) out.push(p);
  }
  return out;
}

function placeSeagrass(n, meadows, patches, tops) {
  const out = [];
  if (n <= 0 || !meadows.length) return out;
  const rand = mulberry32(6202);
  const cum = [];
  let acc = 0;
  for (const m of meadows) {
    acc += m.R * m.R * m.str;
    cum.push(acc);
  }
  const near = meadows.map((m) => nearPatches(m.x, m.z, m.R * 3 + 3, patches));
  for (let t = 0; t < n * 5 && out.length < n; t++) {
    const mi = pickWeighted(cum, rand);
    const m = meadows[mi];
    const a = gauss(rand) * m.R * 0.6 * m.str;
    const c = gauss(rand) * m.R * 0.6;
    const ca = Math.cos(m.ang);
    const sa = Math.sin(m.ang);
    const x = m.x + a * ca - c * sa;
    const z = m.z + a * sa + c * ca;
    // Grazing halo: bare sand ring round each patch reef.
    let halo = false;
    for (const p of near[mi]) {
      const dx = p.x - x;
      const dz = p.z - z;
      const rr = p.R * 0.8 + 1.5;
      if (dx * dx + dz * dz < rr * rr) {
        halo = true;
        break;
      }
    }
    if (halo) continue;
    const b = sampleField(x, z);
    if (!reefOK(b) || b.d > 1.3 || b.h < -6.2) continue;
    // Thinner at the meadow edge, a soft painted mass in the middle.
    const edge = Math.hypot(a / (m.str || 1), c) / (m.R * 1.4);
    if (rand() < smoothstep(0.6, 1.2, edge) * 0.7) continue;
    let s = 0.35 + rand() * 0.4 * (1 - 0.4 * Math.min(1, edge));
    const y = b.h - 0.05;
    const room = (CEILING - y) / tops.seagrass;
    if (room < 0.2) continue;
    s = Math.min(s, room);
    out.push({
      x,
      y,
      z,
      r: rand() * TAU,
      tx: (rand() - 0.5) * 0.2,
      tz: (rand() - 0.5) * 0.2,
      s,
      sx: 0.85 + rand() * 0.3,
      sy: 0.85 + rand() * 0.3,
      sz: 0.85 + rand() * 0.3,
      c: jitter(rand, (m.ci + (rand() < 0.2 ? 1 : 0)) % 3),
    });
  }
  return out;
}

function placeCritters(n, meadows, patches, tops) {
  const out = [];
  if (n <= 0 || (!meadows.length && !patches.length)) return out;
  const rand = mulberry32(6301);
  for (let t = 0; t < n * 10 && out.length < n; t++) {
    let x;
    let z;
    if (meadows.length && (rand() < 0.55 || !patches.length)) {
      const m = meadows[Math.floor(rand() * meadows.length)];
      x = m.x + gauss(rand) * m.R * 1.1;
      z = m.z + gauss(rand) * m.R * 1.1;
    } else {
      const p = patches[Math.floor(rand() * patches.length)];
      const a = rand() * TAU;
      const r = p.R * (1.1 + rand() * 0.8);
      x = p.x + Math.cos(a) * r;
      z = p.z + Math.sin(a) * r;
    }
    const b = sampleField(x, z);
    if (!reefOK(b) || b.d > 1.37) continue;
    let s = 0.8 + rand() * 0.6;
    const y = b.h - 0.02;
    const room = (CEILING - y) / tops.critters;
    if (room < 0.5) continue;
    s = Math.min(s, room);
    out.push({ x, y, z, r: rand() * TAU, tx: (rand() - 0.5) * 0.08, tz: (rand() - 0.5) * 0.08, s, c: jitter(rand, Math.floor(rand() * 3)) });
  }
  return out;
}

function planSchools(total, patches) {
  const rand = mulberry32(6401);
  const schools = [];
  if (total <= 0) return schools;
  let anchors = patches.filter((p) => p.zone === 'lagoon' && p.h < -2);
  if (!anchors.length) anchors = patches.slice();
  if (!anchors.length) anchors = [{ x: FOCUS_X, z: FOCUS_Z, h: sampleField(FOCUS_X, FOCUS_Z).h, R: 3 }];
  anchors = anchors
    .map((p) => ({ p, d: Math.hypot(p.x - FOCUS_X, p.z - FOCUS_Z) }))
    .sort((a, b) => a.d - b.d)
    .map((e) => e.p);
  // Spread the anchors out so schools do not stack on one bommie.
  const picked = [];
  for (const p of anchors) {
    if (picked.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > 7)) picked.push(p);
  }
  let left = total;
  let k = 0;
  while (left > 0) {
    const sp = FISH_SPECIES[k % FISH_SPECIES.length];
    const n = Math.max(1, Math.min(left, sp.g + Math.round((rand() - 0.5) * 4)));
    const a = picked[k % picked.length];
    const x = a.x + (rand() - 0.5) * 4;
    const z = a.z + (rand() - 0.5) * 4;
    const big = sp.s > 1.5;
    const ax = (2.5 + rand() * 3.5) * (big ? 1.4 : 1);
    const az = 2 + rand() * 3;
    const psi = rand() * TAU;
    const cp = Math.cos(psi);
    const spn = Math.sin(psi);
    // Highest sea floor under the whole loop, so the school never dips into the crest.
    let floorMax = -99;
    for (let i = 0; i < 12; i++) {
      const th = (i / 12) * TAU;
      const ex = ax * Math.cos(th) * 1.2;
      const ez = az * Math.sin(th) * 1.2;
      floorMax = Math.max(floorMax, sampleField(x + ex * cp - ez * spn, z + ex * spn + ez * cp).h);
    }
    const lo = floorMax + 0.75;
    const hi = -0.75;
    const y = Math.min(hi, lo + rand() * Math.max(0, hi - lo) * 0.7);
    const omega = (0.16 + rand() * 0.16) * (rand() < 0.5 ? -1 : 1) * (big ? 0.55 : 1);
    const fish = [];
    const loose = big ? 2.2 : n > 6 ? 1 : 1.6;
    for (let i = 0; i < n; i++) {
      fish.push({
        lag: rand() * (big ? 0.9 : 0.5),
        ox: gauss(rand) * 0.45 * loose,
        oy: gauss(rand) * 0.22 * loose,
        oz: gauss(rand) * 0.3 * loose,
        ph: rand() * TAU,
        s: sp.s * (0.85 + rand() * 0.3),
      });
    }
    schools.push({ c: sp.c, x, z, y, floor: floorMax, ax, az, cp, sp: spn, omega, phase: rand() * TAU, beat: big ? 4 : 8 + rand() * 3, fish });
    left -= n;
    k++;
  }
  return schools;
}

// Everything the reef places, from the tier counts. tops: local top height per geometry (for the -0.3 ceiling).
export function planReef(Q, tops) {
  const counts = reefCounts(Q);
  const patches = placePatches(Math.max(6, Math.round(Q.coral / 5)));
  const items = {};
  let seed = 7001;
  for (const k of Object.keys(SPECIES)) items[k] = placeSpecies(k, counts[k], patches, tops, seed++);
  const meadows = placeMeadows(Math.max(6, Math.round(counts.seagrass / 22)));
  items.seagrass = placeSeagrass(counts.seagrass, meadows, patches, tops);
  items.critters = placeCritters(counts.critters, meadows, patches, tops);
  const schools = planSchools(counts.fish, patches);
  return { counts, patches, meadows, items, schools };
}


// ---- painted reef textures (copied verbatim into Reef.js) ----
function hsl(h, s, l, a = 1) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

// Brain coral skin (repeat): meandering valleys in cool violet, warm sunlit ridges with rim highlights.
function drawBrain(ctx, S, rand) {
  ctx.fillStyle = hsl(40, 45, 80);
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) brush.dab(ctx, rand() * S, rand() * S, S * (0.05 + rand() * 0.1), hsl(30 + rand() * 25, 50, 70 + rand() * 18), 0.35);
  const walk = (x, y, a, n, col, w) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      let px = x, py = y, pa = a;
      const r2 = mulberrySeed(n * 13 + Math.floor(x));
      ctx.beginPath();
      ctx.moveTo(px + ox, py + oy);
      for (let k = 0; k < n; k++) {
        pa += (r2() - 0.5) * 0.9;
        px += Math.cos(pa) * S * 0.018;
        py += Math.sin(pa) * S * 0.018;
        ctx.lineTo(px + ox, py + oy);
      }
      ctx.stroke();
    }
  };
  const seeds = [];
  for (let i = 0; i < 40; i++) seeds.push([rand() * S, rand() * S, rand() * 6.28, 30 + Math.floor(rand() * 40)]);
  for (const s of seeds) walk(s[0], s[1], s[2], s[3], hsl(265, 28, 58, 0.85), S * 0.022); // valleys
  for (const s of seeds) walk(s[0], s[1], s[2], s[3], hsl(255, 32, 40, 0.9), S * 0.008); // groove core
  ctx.save();
  ctx.translate(-S * 0.012, -S * 0.012);
  for (const s of seeds) walk(s[0], s[1], s[2], s[3], hsl(45, 90, 96, 0.7), S * 0.007); // lit ridge edge
  ctx.restore();
}

// Tiny deterministic generator for redrawing the same path at wrap offsets.
function mulberrySeed(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Coral skin (repeat) for staghorn, table, sponges, bommies: warm wash with polyp cups and cool flecks.
function drawCoralSkin(ctx, S, rand) {
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, hsl(42, 60, 90));
  g.addColorStop(1, hsl(30, 40, 78));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 80; i++) brush.dab(ctx, rand() * S, rand() * S, S * (0.04 + rand() * 0.08), rand() < 0.35 ? hsl(255, 30, 70) : hsl(38, 70, 88), 0.3);
  for (let i = 0; i < 420; i++) {
    const x = rand() * S, y = rand() * S, r = S * (0.009 + rand() * 0.012);
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      brush.dab(ctx, x + ox, y + oy, r * 1.6, hsl(45, 85, 95), 0.7); // lit cup rim
      brush.dab(ctx, x + ox + r * 0.3, y + oy + r * 0.3, r, hsl(262, 28, 50), 0.75); // shaded cup
    }
  }
}

// Purple sea fan lace (alpha): fan silhouette, thick radiating branches, fine cross lattice.
function drawFan(ctx, S, rand) {
  const cx = S / 2, by = S * 0.98;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, by);
  ctx.bezierCurveTo(cx - S * 0.2, S * 0.8, cx - S * 0.56, S * 0.35, cx - S * 0.38, S * 0.1);
  ctx.bezierCurveTo(cx - S * 0.2, -S * 0.02, cx + S * 0.2, -S * 0.02, cx + S * 0.38, S * 0.1);
  ctx.bezierCurveTo(cx + S * 0.56, S * 0.35, cx + S * 0.2, S * 0.8, cx, by);
  ctx.clip();
  for (let i = 0; i < 40; i++) brush.dab(ctx, rand() * S, rand() * S, S * 0.08, hsl(290, 40, 60), 0.18);
  // lattice: two families of gently curved lines
  for (let fam = 0; fam < 2; fam++) {
    for (let i = -20; i < 40; i++) {
      const x0 = i * S * 0.035;
      ctx.strokeStyle = hsl(285 + rand() * 20, 40, 55 + rand() * 20, 0.9);
      ctx.lineWidth = S * (0.006 + rand() * 0.006);
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const y = S - (k / 12) * S;
        const x = fam ? x0 + (S - y) * 0.55 + Math.sin(k * 0.9 + i * 2.1) * S * 0.012 : S - x0 - (S - y) * 0.55 + Math.sin(k * 1.3 + i * 1.7) * S * 0.012;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  // main branches from the holdfast
  const branch = (x, y, a, len, w, d) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    ctx.strokeStyle = hsl(285, 45, 42);
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + x2) / 2 + (rand() - 0.5) * len * 0.3, (y + y2) / 2, x2, y2);
    ctx.stroke();
    ctx.strokeStyle = hsl(40, 80, 92, 0.6);
    ctx.lineWidth = w * 0.35;
    ctx.stroke();
    if (d > 0) {
      branch(x2, y2, a - 0.25 - rand() * 0.25, len * 0.72, w * 0.7, d - 1);
      branch(x2, y2, a + 0.25 + rand() * 0.25, len * 0.72, w * 0.7, d - 1);
    }
  };
  branch(cx, by, -Math.PI / 2, S * 0.22, S * 0.032, 5);
  // light from above, cool violet in the lower half
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, 'rgba(255,240,210,0.35)');
  g.addColorStop(0.6, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(70,60,140,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

// Turtle-grass card (alpha): 7 ribbon blades from the bottom centre, midrib, sunlit yellow tips, blue base.
function drawSeagrass(ctx, S, rand) {
  for (let i = 0; i < 7; i++) {
    const x0 = S * (0.38 + rand() * 0.24);
    const lean = (i / 6 - 0.5) * S * 0.7 + (rand() - 0.5) * S * 0.1;
    const top = S * (0.02 + rand() * 0.2);
    const w = S * (0.045 + rand() * 0.02);
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      pts.push([x0 + lean * t * t + Math.sin(t * 3 + i) * S * 0.02, S - (S - top) * t]);
    }
    const hue = 75 + rand() * 25;
    for (let k = 0; k < 16; k++) {
      const t = k / 16;
      const [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
      const ww = w * (1 - 0.3 * t) * (k === 15 ? 0.6 : 1);
      ctx.strokeStyle = t < 0.2 ? hsl(185, 30, 28 + 40 * t) : hsl(hue - 30 + 25 * t, 38 + 20 * t, 30 + 40 * t);
      ctx.lineWidth = ww;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    // midrib + lit edge
    ctx.lineWidth = Math.max(1, w * 0.12);
    ctx.strokeStyle = hsl(70, 70, 82, 0.6);
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x - w * 0.25, y) : ctx.moveTo(x - w * 0.25, y)));
    ctx.stroke();
    ctx.strokeStyle = hsl(160, 40, 22, 0.5);
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    // epiphyte specks near the tip
    for (let k = 0; k < 4; k++) {
      const p = pts[10 + Math.floor(rand() * 6)];
      brush.dab(ctx, p[0] + (rand() - 0.5) * w * 0.6, p[1], w * 0.18, hsl(45, 60, 85), 0.7);
    }
  }
}

// Fish body, for a sphere stretched along x (nose = top of canvas, back = left/right edges,
// belly = centre column, flanks at 1/4 and 3/4). Neutral values so the instance colour tints it.
function drawFish(ctx, S, rand) {
  const g = ctx.createLinearGradient(0, 0, S, 0);
  g.addColorStop(0, hsl(240, 25, 45));
  g.addColorStop(0.25, hsl(40, 40, 82));
  g.addColorStop(0.5, hsl(45, 70, 97));
  g.addColorStop(0.75, hsl(40, 40, 82));
  g.addColorStop(1, hsl(240, 25, 45));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // two dark bands and a pale band
  for (const [y, w, c] of [[0.3, 0.07, hsl(250, 35, 30, 0.85)], [0.38, 0.05, hsl(45, 90, 97, 0.9)], [0.62, 0.06, hsl(250, 35, 30, 0.8)]]) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(0, S * y);
    for (let x = 0; x <= S; x += S / 16) ctx.lineTo(x, S * (y + 0.015 * Math.sin(x * 0.05)));
    ctx.lineTo(S, S * (y + w));
    for (let x = S; x >= 0; x -= S / 16) ctx.lineTo(x, S * (y + w + 0.015 * Math.sin(x * 0.05 + 1)));
    ctx.fill();
  }
  // scale dabs
  for (let i = 0; i < 160; i++) brush.dab(ctx, rand() * S, S * (0.15 + rand() * 0.75), S * 0.015, hsl(45, 80, 96), 0.25);
  // eyes on both flanks
  for (const u of [0.25, 0.75]) {
    brush.dab(ctx, S * u, S * 0.1, S * 0.05, hsl(45, 80, 97), 1);
    brush.dab(ctx, S * u, S * 0.1, S * 0.03, hsl(250, 40, 12), 1);
    brush.dab(ctx, S * u - S * 0.01, S * 0.09, S * 0.008, '#ffffff', 1);
  }
  // tail region (bottom strip): fin rays
  ctx.fillStyle = hsl(40, 70, 88);
  ctx.fillRect(0, S * 0.92, S, S * 0.08);
  for (let x = 0; x < S; x += S / 24) brush.stroke(ctx, x, S, 0, S * 0.08, 2, hsl(30, 50, 60, 0.6), 0);
}

// Anemone dome (sphere uv): fat tentacles radiating down from the crown, glowing bulb tips.
function drawAnemone(ctx, S, rand) {
  ctx.fillStyle = hsl(330, 25, 45);
  ctx.fillRect(0, 0, S, S);
  const n = 26;
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < n; i++) {
      const x = ((i + row * 0.5 + rand() * 0.3) / n) * S;
      const y0 = S * (0.98 - row * 0.12);
      const len = -S * (0.45 + rand() * 0.25);
      const w = S / n * 0.8;
      const gg = ctx.createLinearGradient(0, y0, 0, y0 + len);
      gg.addColorStop(0, hsl(300, 25, 45));
      gg.addColorStop(1, hsl(40, 65, 78));
      ctx.strokeStyle = hsl(270, 30, 30, 0.7);
      ctx.lineWidth = w * 1.15;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.quadraticCurveTo(x + (rand() - 0.5) * w * 2, y0 + len * 0.5, x + (rand() - 0.5) * w, y0 + len);
      ctx.stroke();
      ctx.strokeStyle = gg;
      ctx.lineWidth = w * 0.85;
      ctx.stroke();
      brush.dab(ctx, x, y0 + len, w * 0.75, hsl(45, 90, 92), 1); // bulb tip
      brush.dab(ctx, x - w * 0.2, y0 + len - w * 0.2, w * 0.3, '#ffffff', 0.9);
    }
  }
}

// ---------------------------------------------------------------- geometry (three.js) ----
// Every coral part is built with paintUV so it can carry a painted skin through the shared leafMaterial program.
// Shapes are smooth: vertex normals plus partial spherifyNormals, so the low segment counts never read as facets.

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const n3 = (x, y, z, seed) => valueNoise(x + y * 0.73, z - y * 0.61, seed);

function displace(g, fn) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const o = fn(p.getX(i), p.getY(i), p.getZ(i), i);
    p.setXYZ(i, o[0], o[1], o[2]);
  }
  p.needsUpdate = true;
  return g;
}

// fn(x, y, z, r, g, b) -> [r, g, b]. Works on paint()/paintUV()ed geometry.
function shade(g, fn) {
  const p = g.attributes.position;
  const c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const o = fn(p.getX(i), p.getY(i), p.getZ(i), c.getX(i), c.getY(i), c.getZ(i));
    c.setXYZ(i, o[0], o[1], o[2]);
  }
  c.needsUpdate = true;
  return g;
}

function scaleUV(g, su, sv, ou = 0, ov = 0) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  uv.needsUpdate = true;
  return g;
}

function mixC(r, g, b, col, t) {
  return [r + (col.r - r) * t, g + (col.g - g) * t, b + (col.b - b) * t];
}

function orientTo(g, from, dir) {
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
}

const dirFrom = (az, tilt) => V3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt));

// Value ramp: cool violet at the base, warm lit tops (multiplies the instance colour).
function rampY(g, y0, y1, lo = 0.6, tipCol = null, tipFrom = 9, tipTo = 10, tipAmt = 0) {
  const tip = tipCol ? new THREE.Color(tipCol) : null;
  return shade(g, (x, y, z, r, gg, b) => {
    const t = smoothstep(y0, y1, y);
    const v = lo + (1 - lo) * t;
    let c = [r * v * (1 - 0.06 * (1 - t)), gg * v, b * v * (1 + 0.12 * (1 - t))];
    if (tip) c = mixC(c[0], c[1], c[2], tip, smoothstep(tipFrom, tipTo, y) * tipAmt);
    return c;
  });
}

// Staghorn (Acropora cervicornis): 3 antler limbs, each forking into 2 upturned, tapering fingers with pale
// rounded growing tips. 9 smooth 6-sided tubes = 108 triangles; spherified so the thicket shades as one mass.
function staghornGeo() {
  const rand = mulberry32(11);
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const az = (i / 3) * TAU + rand() * 0.7;
    const tilt = 0.35 + rand() * 0.35;
    const d = dirFrom(az, tilt);
    const len = 0.3 + rand() * 0.12;
    const base = V3(Math.cos(az) * 0.04, -0.04, Math.sin(az) * 0.04);
    const limb = new THREE.CylinderGeometry(0.046, 0.062, len, 6, 1, true);
    limb.translate(0, len / 2, 0);
    parts.push(scaleUV(paintUV(orientTo(limb, base, d), '#ffffff'), 2, 1.5));
    const end = base.clone().addScaledVector(d, len * 0.94);
    for (let k = 0; k < 2; k++) {
      const sgn = k === 0 ? 1 : -1;
      const az2 = az + sgn * (0.45 + rand() * 0.35);
      const tilt2 = Math.max(0.1, tilt - 0.2 + rand() * 0.25);
      const flen = 0.26 + rand() * 0.16;
      const finger = new THREE.CylinderGeometry(0.018, 0.047, flen, 6, 1, true);
      finger.translate(0, flen / 2, 0);
      parts.push(scaleUV(paintUV(orientTo(finger, end, dirFrom(az2, tilt2)), '#ffffff'), 2, 1.5));
    }
  }
  const g = merge(parts);
  rampY(g, 0.0, 0.45, 0.6, '#fff4dc', 0.36, 0.72, 0.7);
  spherifyNormals(g, V3(0, 0.15, 0), 0.4);
  return g;
}

// Brain coral: a squat, softly lumpy dome; the painted meander skin carries the grooves. 100 triangles.
function brainGeo() {
  const g = new THREE.SphereGeometry(0.5, 10, 5, 0, TAU, 0, Math.PI * 0.58);
  displace(g, (x, y, z) => {
    const k = 0.92 + 0.16 * n3(x * 3.2, y * 3.2, z * 3.2, 71);
    return [x * k * 1.02, y * k * 0.78 + 0.075, z * k];
  });
  g.computeVertexNormals();
  const p = scaleUV(paintUV(g, '#ffffff'), 3, 1.6);
  rampY(p, 0.0, 0.4, 0.62);
  spherifyNormals(p, V3(0, -0.1, 0), 0.5);
  return p;
}

function wavyPlate(rTop, rBot, thick, seg, cx, cy, cz, wave, ph) {
  const g = new THREE.CylinderGeometry(rTop, rBot, thick, seg, 1, false);
  displace(g, (x, y, z) => {
    const a = Math.atan2(z, x);
    const r = Math.hypot(x, z);
    const k = 1 + 0.1 * Math.sin(a * 3 + ph) + 0.06 * Math.sin(a * 5 + ph * 2.3);
    const u = r / rTop;
    return [x * k + cx, y + cy + wave * Math.sin(a * 2 + ph) * u + 0.05 * u * rTop, z * k + cz];
  });
  g.computeVertexNormals();
  return scaleUV(paintUV(g, '#ffffff'), 3, 1);
}

// Table coral (Acropora hyacinthus): wide wavy plate with a pale growing rim on a short stalk, plus a smaller
// tier to one side. 16 + 56 + 40 = 112 triangles.
function tableGeo() {
  const stalk = new THREE.CylinderGeometry(0.05, 0.09, 0.36, 8, 1, true);
  stalk.translate(0, 0.16, 0);
  const g = merge([
    paintUV(stalk, '#ffffff'),
    wavyPlate(0.62, 0.52, 0.07, 14, 0.06, 0.37, 0, 0.035, 0.7),
    wavyPlate(0.34, 0.28, 0.05, 10, 0.3, 0.22, -0.2, 0.02, 2.1),
  ]);
  const rim = new THREE.Color('#f4fbff');
  shade(g, (x, y, z, r, gg, b) => {
    const v = 0.58 + 0.42 * smoothstep(0.14, 0.42, y);
    return mixC(r * v, gg * v, b * v * 1.05, rim, smoothstep(0.45, 0.66, Math.hypot(x - 0.06, z)) * 0.45);
  });
  spherifyNormals(g, V3(0, 0.1, 0), 0.2);
  return g;
}

// Purple sea fan (Gorgonia ventalina): one large gently cupped card carrying the painted lace and branches,
// broadside to the current. 32 + 12 = 44 triangles. Alpha-cut, double sided.
function fanGeo() {
  const g = new THREE.PlaneGeometry(1.0, 1.0, 4, 4);
  displace(g, (x, y, z) => [x, y + 0.5, 0.18 * x * x + 0.05 * (y + 0.5) * (y + 0.5)]);
  g.computeVertexNormals();
  const fan = paintUV(g, '#ffffff');
  rampY(fan, 0.0, 0.8, 0.7);
  spherifyNormals(fan, V3(0, 0.45, -0.6), 0.35);
  const stalk = new THREE.CylinderGeometry(0.014, 0.026, 0.06, 6, 1, true);
  stalk.translate(0, 0.0, 0);
  const st = scaleUV(paintUV(stalk, '#9a8aa8'), 0.02, 0.05, 0.5, 0.0);
  return merge([fan, st]);
}

// Bubble anemone: short column under a soft dome; the painted skin gives fat tentacles with glowing bulb tips,
// and every other vertex is pushed out so the silhouette stays tufty. 16 + 80 = 96 triangles. Sways.
function anemoneGeo() {
  const col = new THREE.CylinderGeometry(0.15, 0.13, 0.1, 8, 1, true);
  col.translate(0, 0.04, 0);
  const W = 10;
  const H = 4;
  const g = new THREE.SphereGeometry(0.22, W, H, 0, TAU, 0, Math.PI * 0.62);
  displace(g, (x, y, z, i) => {
    const iy = Math.floor(i / (W + 1));
    const ix = i % (W + 1);
    const k = iy > 0 && iy < H && (ix + iy) % 2 === 1 ? 1.22 : 1.0;
    return [x * k, y * k * 0.85 + 0.05, z * k];
  });
  g.computeVertexNormals();
  const dome = scaleUV(paintUV(g, '#ffffff'), 2, 1);
  const c = scaleUV(paintUV(col, '#c9a0b8'), 2, 0.1, 0, 0.0);
  const m = merge([c, dome]);
  rampY(m, -0.02, 0.2, 0.62);
  spherifyNormals(m, V3(0, 0.02, 0), 0.55);
  return m;
}

// Tube sponges: 4 flared tubes leaning out from one base, each with a dark recessed opening.
// 4 x (16 + 8) = 96 triangles.
function spongeGeo() {
  const tubes = [
    [0, 0, 0.62, 0.075],
    [0.13, 0.06, 0.45, 0.065],
    [-0.09, 0.11, 0.38, 0.06],
    [0.02, -0.13, 0.3, 0.055],
  ];
  const parts = [];
  for (const [x, z, hgt, r] of tubes) {
    const lean = Math.hypot(x, z) > 0 ? 0.14 : 0;
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(z * lean * 6, 0, -x * lean * 6));
    m.setPosition(x, 0, z);
    const tube = new THREE.CylinderGeometry(r * 1.25, r, hgt, 8, 1, true);
    tube.translate(0, hgt / 2, 0);
    tube.applyMatrix4(m);
    const cap = new THREE.CircleGeometry(r * 0.98, 8);
    cap.rotateX(-Math.PI / 2);
    cap.translate(0, hgt - 0.02, 0);
    cap.applyMatrix4(m);
    const t = scaleUV(paintUV(tube, '#ffffff'), 1.5, 2);
    shade(t, (px, py, pz, cr, cg, cb) => {
      const v = 0.58 + 0.42 * smoothstep(0.0, hgt, py);
      return [cr * v, cg * v, cb * v * 1.06];
    });
    parts.push(t, paintUV(cap, '#4a3550'));
  }
  const g = merge(parts);
  spherifyNormals(g, V3(0, 0.1, 0), 0.3);
  return g;
}

// Reef rock bommie: a lumpy flattened boulder in cool violet-grey with green algae on top and pink
// crustose-coralline patches, crowned by two cream soft-coral fingers. 80 + 24 = 104 triangles.
function bommieGeo() {
  const g = new THREE.IcosahedronGeometry(0.6, 1);
  displace(g, (x, y, z) => {
    const k = 0.84 + 0.3 * n3(x * 2.2 + 3, y * 2.2, z * 2.2, 81);
    let Y = y * k * 0.62 + 0.14;
    if (Y < 0) Y *= 0.4;
    return [x * k * 1.05, Y, z * k];
  });
  g.computeVertexNormals();
  const rock = scaleUV(paintUV(g, '#8c88a6'), 2, 2);
  spherifyNormals(rock, V3(0, 0.05, 0), 0.9);
  const algae = new THREE.Color('#97b27e');
  const coralline = new THREE.Color('#e2a0b8');
  shade(rock, (x, y, z, r, gg, b) => {
    let c = mixC(r, gg, b, algae, smoothstep(0.18, 0.45, y) * 0.75);
    if (n3(x * 4, y * 4, z * 4, 82) > 0.62) c = mixC(c[0], c[1], c[2], coralline, 0.7);
    const v = 0.72 + 0.28 * smoothstep(0.0, 0.3, y);
    return [c[0] * v, c[1] * v, c[2] * v];
  });
  const fingers = [];
  const spots = [
    [0.12, 0.4, 0.05, 0.28, 0.25],
    [-0.1, 0.38, -0.08, 0.24, -0.3],
  ];
  for (const [x, y, z, len, lean] of spots) {
    const f = new THREE.CylinderGeometry(0.03, 0.07, len, 6, 1, true);
    f.translate(0, len / 2, 0);
    orientTo(f, V3(x, y, z), V3(lean, 1, lean * 0.6));
    const pf = paintUV(f, '#f3dfae');
    shade(pf, (px, py, pz, cr, cg, cb) => {
      const v = 0.7 + 0.3 * smoothstep(y, y + len, py);
      return [cr * v, cg * v, cb * v];
    });
    spherifyNormals(pf, V3(x, y, z), 0.4);
    fingers.push(pf);
  }
  return merge([rock, ...fingers]);
}

// Star of `arms` points: one fan of triangles from a raised centre. 10 triangles for 5 arms.
function starfishGeo(R, r, hgt) {
  const pos = [];
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU;
    const rr = k % 2 === 0 ? R : r;
    pts.push([Math.cos(a) * rr, k % 2 === 0 ? 0.012 : 0.004, Math.sin(a) * rr]);
  }
  for (let k = 0; k < 10; k++) {
    const a = pts[k];
    const b = pts[(k + 1) % 10];
    pos.push(0, hgt, 0, b[0], b[1], b[2], a[0], a[1], a[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Stellated octahedron: 8 spikes. 24 triangles.
function urchinGeo(core, spike) {
  const base = new THREE.OctahedronGeometry(core, 0);
  const p = base.attributes.position;
  const pos = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const apex = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    apex.copy(a).add(b).add(c).normalize().multiplyScalar(spike);
    for (const [u, w] of [[a, b], [b, c], [c, a]]) pos.push(u.x, u.y, u.z, w.x, w.y, w.z, apex.x, apex.y, apex.z);
  }
  base.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Sand scatter: cushion starfish, a long-spined urchin, a conch and a clam. 10 + 24 + 15 + 20 = 69 triangles.
function crittersGeo() {
  const star = paint(starfishGeo(0.16, 0.055, 0.035), '#ff7a45');
  const tipC = new THREE.Color('#ffb066');
  shade(star, (x, y, z, r, g, b) => mixC(r, g, b, tipC, smoothstep(0.08, 0.16, Math.hypot(x, z)) * 0.6));
  spherifyNormals(star, V3(0, -0.15, 0), 0.8);

  const urchin = urchinGeo(0.055, 0.15);
  urchin.translate(0.42, 0.06, 0.18);
  const ur = paint(urchin, '#4b3a7a');
  const spineC = new THREE.Color('#8a72c8');
  shade(ur, (x, y, z, r, g, b) => mixC(r, g, b, spineC, smoothstep(0.08, 0.14, Math.hypot(x - 0.42, y - 0.06, z - 0.18)) * 0.7));

  const conch = new THREE.ConeGeometry(0.045, 0.13, 5, 1, false);
  conch.rotateZ(Math.PI / 2);
  conch.rotateY(0.7);
  conch.translate(-0.3, 0.04, 0.32);
  const co = paint(conch, '#f7d7b5');
  spherifyNormals(co, V3(-0.3, 0.0, 0.32), 0.5);

  const clam = new THREE.SphereGeometry(0.06, 5, 3);
  clam.scale(1, 0.42, 0.85);
  clam.translate(0.12, 0.022, -0.38);
  const cl = paint(clam, '#ffe3ea');

  const g = merge([star, ur, co, cl]);
  // Small things sit at local y ~ 0 where the shared AO term is 0.6: lift their paint to compensate.
  const c = g.attributes.color;
  for (let i = 0; i < c.array.length; i++) c.array[i] *= 1.4;
  c.needsUpdate = true;
  return g;
}

// Turtle-grass clump: 2 crossed, outward-bending cards each carrying 7 painted ribbon blades.
// 2 x 8 = 16 triangles. Alpha-cut, double sided, sways with the shared current.
function seagrassGeo() {
  const parts = [];
  for (let j = 0; j < 2; j++) {
    const g = new THREE.PlaneGeometry(0.9, 1, 1, 4);
    displace(g, (x, y, z) => {
      const t = y + 0.5;
      return [x, t, 0.22 * t * t + 0.06 * Math.abs(x)];
    });
    g.rotateY(j * Math.PI * 0.5 + 0.3);
    g.computeVertexNormals();
    const p = paintUV(g, '#ffffff');
    rampY(p, 0.0, 0.7, 0.55);
    // Normals lean up and out so the blades light like one soft tuft.
    spherifyNormals(p, V3(0, -0.4, 0), 0.6);
    parts.push(p);
  }
  return merge(parts);
}

// Reef fish: a deep, laterally compressed smooth body (nose +x) with the painted bands, eyes and pale belly,
// plus a forked tail sampling the painted fin strip. 64 + 4 = 68 triangles.
function fishGeo() {
  const body = new THREE.SphereGeometry(1, 8, 4);
  body.rotateZ(-Math.PI / 2);
  body.scale(0.12, 0.072, 0.034);
  displace(body, (x, y, z) => [x > 0 ? x * 1.1 : x, y, z]);
  body.computeVertexNormals();
  const b = paintUV(body, '#ffffff');
  const root = [-0.105, 0, 0];
  const top = [-0.2, 0.062, 0];
  const bot = [-0.2, -0.062, 0];
  const notch = [-0.172, 0, 0];
  const pos = [];
  const zz = 0.002;
  const face = (p0, p1, p2, dz) => pos.push(p0[0], p0[1], p0[2] + dz, p1[0], p1[1], p1[2] + dz, p2[0], p2[1], p2[2] + dz);
  face(root, top, notch, zz);
  face(root, notch, bot, zz);
  face(root, notch, top, -zz);
  face(root, bot, notch, -zz);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = new Float32Array(24);
  for (let i = 0; i < 12; i++) {
    uv[i * 2] = 0.25 + (pos[i * 3 + 1] / 0.062) * 0.1;
    uv[i * 2 + 1] = 0.02 + ((-0.105 - pos[i * 3]) / 0.095) * 0.05;
  }
  tail.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  tail.computeVertexNormals();
  return merge([b, paintUV(tail, '#ffffff')]);
}

// ---------------------------------------------------------------- build + animate ----

const PALETTES = {
  staghorn: ['#f2a07b', '#e8c27a', '#c9a3e6', '#f4b6c2'],
  brain: ['#e2cb6a', '#bcd77a', '#eeb07a', '#cfa6e0'],
  table: ['#93d5c0', '#f0c483', '#b0a6ee', '#f2a38f'],
  fan: ['#c48cf0', '#d79cf0', '#a890ec', '#f0a0cc', '#f6cf78'],
  anemone: ['#ffb0c4', '#ffcf90', '#d4ec90', '#e4b4ff'],
  sponge: ['#ffd04f', '#b57be0', '#ff8f5c', '#ff7aa2'],
  bommie: ['#f4f0ff', '#fff4ec', '#eef6ff'],
  critters: ['#ffffff', '#fff2e6', '#f3f0ff'],
  seagrass: ['#ffffff', '#f4ffe0', '#e8fff2'],
};

// Painted maps: key, draw, size, repeat. Sizes kept small for the phone (about 3.3 MB of texture in total).
const TEX = {
  skin: ['reef-skin', drawCoralSkin, 256, true],
  brain: ['reef-brain', drawBrain, 256, true],
  fan: ['reef-fan', drawFan, 512, false],
  anemone: ['reef-anemone', drawAnemone, 256, true],
  grass: ['reef-seagrass', drawSeagrass, 512, false],
  fish: ['reef-fish', drawFish, 256, false],
};

function buildReef(Q) {
  const tex = {};
  for (const k of Object.keys(TEX)) {
    const [key, draw, size, repeat] = TEX[k];
    tex[k] = paintTexture(key, draw, { size, seed: 31, repeat });
  }
  const F = THREE.FrontSide;
  const mats = {
    coral: leafMaterial({ map: tex.skin, wrap: 0.65, rim: 0.3, trans: 0.1, cut: 0.3, aoScale: 0.9, side: F }),
    brain: leafMaterial({ map: tex.brain, wrap: 0.65, rim: 0.3, trans: 0.05, cut: 0.3, aoScale: 0.9, side: F }),
    fan: leafMaterial({ map: tex.fan, wrap: 0.8, rim: 0.45, trans: 0.5, cut: 0.45, aoScale: 0.6, sway: 0.05 }),
    anemone: leafMaterial({ map: tex.anemone, wrap: 0.75, rim: 0.35, trans: 0.3, cut: 0.3, aoScale: 1.6, sway: 0.35, side: F }),
    grass: leafMaterial({ map: tex.grass, wrap: 0.85, rim: 0.3, trans: 0.45, cut: 0.5, aoScale: 0.5, sway: 0.16 }),
    fish: leafMaterial({ map: tex.fish, wrap: 0.6, rim: 0.45, trans: 0.1, cut: 0.3, aoScale: 0, side: F }),
    critters: cozyMaterial({ wrap: 0.65, rim: 0.3, aoScale: 0.9 }),
  };
  // aoScale 0 leaves the shared AO at its 0.6 floor; lift the fish base tint so they stay bright.
  mats.fish.uniforms.uColor.value.setScalar(1.5);

  const geos = {
    staghorn: staghornGeo(),
    brain: brainGeo(),
    table: tableGeo(),
    fan: fanGeo(),
    anemone: anemoneGeo(),
    sponge: spongeGeo(),
    bommie: bommieGeo(),
    critters: crittersGeo(),
    seagrass: seagrassGeo(),
    fish: fishGeo(),
  };
  const tops = {};
  for (const k of Object.keys(geos)) {
    geos[k].computeBoundingBox();
    tops[k] = Math.max(0.05, geos[k].boundingBox.max.y);
  }

  const plan = planReef(Q, tops);
  const scratch = new THREE.Color();
  const colorOf = (pal) => (it) => {
    scratch.set(pal[it.c.i % pal.length]);
    scratch.offsetHSL(it.c.dh, it.c.ds, it.c.dl);
    return scratch;
  };

  // Staghorn, table, sponge and bommie share one material (same map), but stay separate meshes (one per species).
  const matFor = { staghorn: 'coral', brain: 'brain', table: 'coral', fan: 'fan', anemone: 'anemone', sponge: 'coral', bommie: 'coral', critters: 'critters', seagrass: 'grass' };
  const meshes = [];
  const parts = {};
  for (const k of Object.keys(matFor)) {
    const items = plan.items[k];
    parts[k] = items.length;
    if (!items.length) continue;
    const mesh = makeInstanced(geos[k], mats[matFor[k]], items, colorOf(PALETTES[k]));
    mesh.name = 'reef-' + k;
    meshes.push(mesh);
  }

  // Fish: one InstancedMesh, matrices rewritten each frame while the camera is near the reef.
  const fishList = [];
  for (const sc of plan.schools) for (const f of sc.fish) fishList.push({ sc, f });
  let fishMesh = null;
  if (fishList.length) {
    const init = fishList.map(({ sc }) => ({ x: sc.x, y: sc.y, z: sc.z, s: 1 }));
    const fc = new THREE.Color();
    fishMesh = makeInstanced(geos.fish, mats.fish, init, (it, i) => {
      const { sc, f } = fishList[i];
      fc.set(sc.c);
      fc.offsetHSL(Math.sin(f.ph * 3.1) * 0.02, 0, Math.cos(f.ph * 2.3) * 0.05);
      return fc;
    });
    fishMesh.name = 'reef-fish';
    fishMesh.frustumCulled = false;
    fishMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    meshes.push(fishMesh);
  }
  parts.fish = fishList.length;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  let primed = false;

  function updateFish(t) {
    for (let i = 0; i < fishList.length; i++) {
      const { sc, f } = fishList[i];
      const sgn = sc.omega < 0 ? -1 : 1;
      const th = sc.phase + sc.omega * t - f.lag * sgn;
      const ct = Math.cos(th);
      const st = Math.sin(th);
      const wob = 1 + 0.18 * Math.sin(2 * th + sc.phase);
      const ex = sc.ax * ct * wob;
      const ez = sc.az * st * wob;
      const cx = sc.x + ex * sc.cp - ez * sc.sp;
      const cz = sc.z + ex * sc.sp + ez * sc.cp;
      const dx0 = -sc.ax * st * sgn;
      const dz0 = sc.az * ct * sgn;
      let tx = dx0 * sc.cp - dz0 * sc.sp;
      let tz = dx0 * sc.sp + dz0 * sc.cp;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const breathe = 1 + 0.15 * Math.sin(t * 0.5 + f.ph);
      const side = f.ox * breathe;
      const ahead = f.oz * breathe + 0.12 * Math.sin(t * 1.3 + f.ph);
      const px = cx - tz * side + tx * ahead;
      const pz = cz + tx * side + tz * ahead;
      const py = clamp(sc.y + f.oy * breathe + 0.12 * Math.sin(t * 0.8 + f.ph), sc.floor + 0.3, -0.42 - 0.08 * f.s);
      const yaw = Math.atan2(-tz, tx) + 0.16 * Math.sin(t * sc.beat + f.ph);
      e.set(0, yaw, 0.08 * Math.sin(t * 0.8 + f.ph + 1.3));
      q.setFromEuler(e);
      p.set(px, py, pz);
      s.setScalar(f.s);
      m4.compose(p, q, s);
      fishMesh.setMatrixAt(i, m4);
    }
    fishMesh.instanceMatrix.needsUpdate = true;
  }

  function animate(t, camera) {
    if (!fishMesh) return;
    const dx = camera.position.x - FOCUS_X;
    const dz = camera.position.z - FOCUS_Z;
    const near = dx * dx + dz * dz < 170 * 170 && camera.position.y < 70;
    if (!near && primed) return;
    updateFish(t);
    primed = true;
  }

  let tris = 0;
  for (const m of meshes) tris += triangles(m.geometry) * m.count;

  function dispose() {
    for (const m of meshes) if (m.dispose) m.dispose();
    for (const k of Object.keys(geos)) geos[k].dispose();
    for (const k of Object.keys(mats)) mats[k].dispose();
  }

  return { meshes, draws: meshes.length, triangles: tris, parts, animate, dispose };
}

export default function Reef({ Q, tier }) {
  const reef = useMemo(() => buildReef(Q), [Q.coral, Q.seagrass, Q.fish]);
  const group = useRef(null);

  useEffect(() => {
    report('Reef.js', { draws: reef.draws, triangles: reef.triangles, programs: 2, tier, counts: reef.parts });
  }, [reef, tier]);
  useEffect(() => () => reef.dispose(), [reef]);

  useFrame((state) => {
    const cam = state.camera.position;
    // Hide the whole reef (0 draws) when the camera is more than ~150 m from it.
    const far = Math.hypot(cam.x - FOCUS_X, cam.z - FOCUS_Z) > 150 + Math.max(0, cam.y - 40);
    if (group.current) group.current.visible = !far;
    if (!far) reef.animate(shared.uTime.value, state.camera);
  });

  return h('group', { name: 'reef', ref: group }, reef.meshes.map((m) => h('primitive', { key: m.name, object: m })));
}
