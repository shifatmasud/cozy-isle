// Ground cover: long curly fluffy grass, wildflower drifts and western sword ferns (Polystichum munitum).
//
// How it is built (6 draw calls, one cozyMaterial program variant shared by every part):
//   grass-tall   3 tall blades per tuft that arch up and curl over at the tip (meadow "long grass").
//   grass-fluffy 5 blades per tuft: 2 tall curling blades + 3 short splayed ones (the soft fluffy base).
//   fern         rosette of arching single-pinnate fronds, alternate leaflets with a small lobe at the
//                distal base (the "sword hilt"), dark glossy green, flatter in deep shade, upright in sun.
//   flower-stem  thin stem + one leaf, shared by every species.
//   flower-star  6-petal star heads: oxeye daisy (white, gold eye), meadow buttercup (yellow), cornflower (blue).
//   flower-ball  soft round / spike heads: red clover (pink globe), tufted vetch (purple one-sided spike).
// Q.grass is the number of grass BLADES (tufts = blades / 3 or 5). Q.flowers = heads, Q.ferns = rosettes.
// Detail (tall-blade segments, fronds per fern) is picked from the file's triangle budget per tier.
// Grass and fern blades are single cards rendered double sided: the convex/upper side is the front face and
// its normal is spherified outward, so lit tops read warm and bright while undersides and tuft cores fall
// into the shared cool blue-violet shadow tint (the Ghibli "light crown, cool core" tuft).
import { createElement as h, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { scatter, sampleField, clump } from '../world/island.js';
import { mulberry32, valueNoise, smoothstep, clamp, lerp } from '../world/noise.js';
import { VIEWS } from '../world/views.js';
import { cozyMaterial } from '../materials/shading.js';
import { makeInstanced, spherifyNormals, triangles, report } from '../lib/geo.js';

const TAU = Math.PI * 2;

// Triangle budget for this file per tier (CONTRACT.md: low 75k, medium 160k). high is not contracted.
const FILE_BUDGET = { low: 75000, medium: 160000, high: 420000 };
const SAFETY = 0.99;
const GRASS_SHARE = 0.6; // most of the budget goes to grass: it is what the camera stops look at

// Head geometry sits high in its own local space so the shared sway (uSway * local y) can be matched to the
// stem top exactly: head sway = stem sway / Y0 gives identical wind displacement for head and stem tip.
const STAR_Y0 = 6;
const BALL_Y0 = 10;
const STEM_SWAY = 0.1;

// ---------- colour ----------
// Mirrors the palette in scene/Terrain.js so grass roots melt into the painted ground.
const PAL = {
  meadow: new THREE.Color('#8cc152'),
  meadowLight: new THREE.Color('#b9da6a'),
  forest: new THREE.Color('#4d7d38'),
  tropical: new THREE.Color('#62b04a'),
  desert: new THREE.Color('#dba56a'),
  sand: new THREE.Color('#f3e0a8'),
  rock: new THREE.Color('#8f928a'),
  seabed: new THREE.Color('#ecdcaa'),
  deep: new THREE.Color('#5f938e'),
};
const STRAW = new THREE.Color('#c9b469');
const STEM = new THREE.Color('#5f9a3b');
const FERN_SUN = new THREE.Color('#3a7a33');
const FERN_SHADE = new THREE.Color('#255a37');
const EYE = new THREE.Color('#ffc93a');
const tmpC = new THREE.Color();

function addW(out, c, w) {
  out.r += c.r * w;
  out.g += c.g * w;
  out.b += c.b * w;
  return w;
}

function groundColor(b, x, z, out) {
  const n = valueNoise(x * 0.07, z * 0.07, 77);
  out.setRGB(0, 0, 0);
  let w = 0;
  w += addW(out, PAL.meadow, b.meadow * (1 - n * 0.6));
  w += addW(out, PAL.meadowLight, b.meadow * n * 0.6);
  w += addW(out, PAL.forest, b.forest);
  w += addW(out, PAL.tropical, b.tropical);
  w += addW(out, PAL.desert, b.desert);
  w += addW(out, PAL.sand, b.beach);
  w += addW(out, PAL.rock, b.rock);
  tmpC.copy(PAL.seabed).lerp(PAL.deep, smoothstep(2, 20, -b.h));
  w += addW(out, tmpC, b.under);
  if (w > 0) out.multiplyScalar(1 / w);
  else out.copy(PAL.meadow);
  return out;
}

// +-hue and +-value jitter (contract: about +-8%).
function jitter(c, rand, hue = 0.014, val = 0.08) {
  c.offsetHSL((rand() - 0.5) * 2 * hue, 0, 0);
  c.multiplyScalar(1 + (rand() - 0.5) * 2 * val);
  return c;
}

// ---------- rotation helpers (match makeInstanced: Euler(tx, r, tz), order XYZ = Rx * Ry * Rz) ----------
// World vector of local (0, len, 0) after the instance rotation.
function rotUp(tx, r, tz, len) {
  const x = -len * Math.sin(tz);
  const y = len * Math.cos(tz);
  const x1 = x * Math.cos(r);
  const z1 = -x * Math.sin(r);
  return [x1, y * Math.cos(tx) - z1 * Math.sin(tx), y * Math.sin(tx) + z1 * Math.cos(tx)];
}

// Yaw restricted to two 120 degree arcs (|cos r| >= 0.5) so a world-space lean (lx, lz) can be solved for
// any instance. The plants are radially irregular, so the restriction is invisible.
function pickYaw(rand) {
  return (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * (TAU / 3);
}
// Tilts that make the local up axis point along (lx, 1, lz) in world space for yaw r.
function leanFor(r, lx, lz) {
  const cr = Math.cos(r);
  const tz = Math.asin(clamp(-lx / cr, -0.8, 0.8));
  const tx = Math.asin(clamp((lz - Math.sin(tz) * Math.sin(r)) / Math.cos(tz), -0.8, 0.8));
  return { tx, tz };
}

// ---------- geometry ----------
class Builder {
  constructor() {
    this.p = [];
    this.c = [];
  }
  // Winding is chosen so the face normal points along `out`: that side becomes the front face.
  tri(a, b, c, ca, cb, cc, out) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    let B = b, C = c, CB = cb, CC = cc;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) {
      B = c; C = b; CB = cc; CC = cb;
    }
    this.p.push(a[0], a[1], a[2], B[0], B[1], B[2], C[0], C[1], C[2]);
    this.c.push(ca[0], ca[1], ca[2], CB[0], CB[1], CB[2], CC[0], CC[1], CC[2]);
  }
  count() {
    return this.p.length / 9;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

const UP = [0, 1, 0];
// Segment heading angles (fraction of total curl) for 2- and 3-segment blades. The last segment heads past
// horizontal, so the blade arches up and curls over at the tip.
const BLADE_SEG = {
  2: { len: [0.62, 0.38], bend: [0.12, 0.85] },
  3: { len: [0.42, 0.33, 0.25], bend: [0.06, 0.42, 0.95] },
};

// One blade: ribbon of (nseg - 1) quads + a pointed tip triangle = 2 * nseg - 1 triangles.
// Colour multiplier: 1 at the root (= terrain colour from the instance) rising to a brighter, warmer tip.
function addBlade(B, o) {
  const fx = Math.cos(o.a);
  const fz = Math.sin(o.a);
  const S = BLADE_SEG[o.nseg] || BLADE_SEG[2];
  const nodes = [[fx * o.r0, 0, fz * o.r0]];
  let x = nodes[0][0];
  let y = 0;
  let z = nodes[0][2];
  for (let j = 0; j < S.len.length; j++) {
    const th = o.lean + o.curl * S.bend[j];
    const l = S.len[j] * o.len;
    x += fx * Math.sin(th) * l;
    y += Math.cos(th) * l;
    z += fz * Math.sin(th) * l;
    nodes.push([x, y, z]);
  }
  const last = nodes.length - 1;
  const L = [];
  const R = [];
  const C = [];
  for (let j = 0; j <= last; j++) {
    const t = j / last;
    const g = 1 + 0.36 * Math.pow(t, 1.2);
    C.push([g * 1.02, g * 1.04, 1 + 0.04 * t]);
    if (j < last) {
      const w = o.width * 0.5 * (1 - 0.5 * t);
      const ph = o.a + o.twist * j;
      const wx = -Math.sin(ph) * w;
      const wz = Math.cos(ph) * w;
      L.push([nodes[j][0] - wx, nodes[j][1], nodes[j][2] - wz]);
      R.push([nodes[j][0] + wx, nodes[j][1], nodes[j][2] + wz]);
    }
  }
  for (let j = 0; j < last - 1; j++) {
    B.tri(L[j], R[j], R[j + 1], C[j], C[j], C[j + 1], UP);
    B.tri(L[j], R[j + 1], L[j + 1], C[j], C[j + 1], C[j + 1], UP);
  }
  B.tri(L[last - 1], R[last - 1], nodes[last], C[last - 1], C[last - 1], C[last], UP);
}

export function bladeTris(nseg) {
  return 2 * nseg - 1;
}
export function tuftTris(kind, tallSeg) {
  return kind === 3 ? 3 * bladeTris(tallSeg) : 2 * bladeTris(tallSeg) + 3 * bladeTris(2);
}

// kind 3: three tall curling blades. kind 5: two tall curling blades + three short splayed blades.
function tuftGeometry(kind, tallSeg, seed) {
  const rand = mulberry32(seed);
  const B = new Builder();
  const n = kind === 3 ? 3 : 5;
  const a0 = rand() * TAU;
  for (let i = 0; i < n; i++) {
    const tall = kind === 3 || i < 2;
    const a = a0 + (i / n) * TAU + (rand() - 0.5) * 0.7;
    if (tall) {
      addBlade(B, {
        a, r0: 0.03, lean: 0.08 + rand() * 0.12, curl: 1.5 + rand() * 0.55,
        len: 0.74 + rand() * 0.16, width: 0.07 + rand() * 0.016, twist: (rand() - 0.5) * 0.5, nseg: tallSeg,
      });
    } else {
      addBlade(B, {
        a, r0: 0.05, lean: 0.5 + rand() * 0.3, curl: 0.75 + rand() * 0.4,
        len: 0.36 + rand() * 0.1, width: 0.062 + rand() * 0.012, twist: (rand() - 0.5) * 0.4, nseg: 2,
      });
    }
  }
  const g = B.geometry();
  spherifyNormals(g, new THREE.Vector3(0, -0.35, 0), 0.5);
  return g;
}

// Sword fern frond: rachis integrated as an arch (rises at th0 from vertical, bends by k), 8 alternate
// pinnae (4 per side) as narrow forward-pointing leaflets with a lobe at the distal base, plus a tip.
// 9 triangles per frond.
export const FROND_TRIS = 9;
function addFrond(B, a, th0, k, L) {
  const fx = Math.cos(a);
  const fz = Math.sin(a);
  const px = -fz;
  const pz = fx;
  const S = 24;
  const pts = [[0, 0, 0]];
  let x = 0;
  let y = 0;
  let z = 0;
  for (let s = 0; s < S; s++) {
    const t = (s + 0.5) / S;
    const th = th0 + k * Math.pow(t, 1.6);
    const dl = L / S;
    x += fx * Math.sin(th) * dl;
    y += Math.cos(th) * dl;
    z += fz * Math.sin(th) * dl;
    pts.push([x, y, z]);
  }
  const P = (t) => {
    const u = clamp(t, 0, 1) * S;
    const i = Math.min(S - 1, Math.floor(u));
    const f = u - i;
    const p0 = pts[i];
    const p1 = pts[i + 1];
    return [lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f), lerp(p0[2], p1[2], f)];
  };
  const shade = (t, edge) => {
    const m = 0.7 + 0.42 * t + (edge ? 0.12 : 0);
    return [m, m * 1.03, m * 0.96];
  };
  for (let j = 0; j < 8; j++) {
    const t = 0.14 + j * 0.09;
    const side = j % 2 === 0 ? 1 : -1;
    const env = Math.sin(Math.PI * clamp(t / 1.02, 0, 1));
    const len = L * 0.17 * (0.45 + 0.55 * env) * (1 - 0.3 * t);
    const a0 = P(t - 0.045);
    const a1 = P(t + 0.045);
    const tb = P(t + 0.09);
    const lobe = [a1[0] + side * px * len * 0.2, a1[1] + 0.012 * L, a1[2] + side * pz * len * 0.2];
    const tip = [tb[0] + side * px * len, tb[1] - 0.15 * len, tb[2] + side * pz * len];
    B.tri(a0, lobe, tip, shade(t - 0.045, false), shade(t + 0.045, false), shade(t + 0.09, true), UP);
  }
  const b0 = P(0.86);
  const b1 = P(1);
  const w = 0.035 * L;
  B.tri(
    [b0[0] - px * w, b0[1], b0[2] - pz * w], [b0[0] + px * w, b0[1], b0[2] + pz * w], b1,
    shade(0.86, false), shade(0.86, false), [1.12, 1.24, 0.92], UP
  );
}

function fernGeometry(fronds, seed) {
  const rand = mulberry32(seed);
  const B = new Builder();
  const a0 = rand() * TAU;
  for (let i = 0; i < fronds; i++) {
    const inner = i % 2 === 0;
    const a = a0 + (i / fronds) * TAU + (rand() - 0.5) * 0.45;
    const th0 = inner ? 0.3 + rand() * 0.2 : 0.62 + rand() * 0.25;
    const k = 1.0 + rand() * 0.45;
    const L = (inner ? 0.86 : 1.0) * (0.9 + rand() * 0.2);
    addFrond(B, a, th0, k, L);
  }
  const g = B.geometry();
  spherifyNormals(g, new THREE.Vector3(0, -0.3, 0), 0.35);
  return g;
}

// Stem (1 thin triangle, unit height, scaled by sy) + one lance leaf. 2 triangles.
export const STEM_TRIS = 2;
function stemGeometry() {
  const B = new Builder();
  B.tri([-0.011, 0, 0], [0.011, 0, 0], [0, 1, 0], [0.78, 0.8, 0.78], [0.78, 0.8, 0.78], [1.06, 1.08, 1.0], [0, 0, 1]);
  B.tri([0, 0.2, 0], [0, 0.34, 0], [0.085, 0.36, 0.025], [0.9, 0.92, 0.9], [1, 1, 1], [1.12, 1.14, 1.0], UP);
  const g = B.geometry();
  spherifyNormals(g, new THREE.Vector3(0, -2, 0), 0.3);
  return g;
}

// 6-petal star with a gold eye that fades into the petals; local radius 1 at y = STAR_Y0. 6 triangles.
export const STAR_TRIS = 6;
function starGeometry() {
  const B = new Builder();
  const eye = [EYE.r * 1.05, EYE.g * 1.05, EYE.b * 1.05];
  const rim = [1.05, 1.05, 1.05];
  const c = [0, STAR_Y0 + 0.03, 0];
  const w = 0.36;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const p0 = [Math.cos(a - w), STAR_Y0 + 0.16, Math.sin(a - w)];
    const p1 = [Math.cos(a + w), STAR_Y0 + 0.16, Math.sin(a + w)];
    B.tri(c, p0, p1, eye, rim, rim, UP);
  }
  const g = B.geometry();
  spherifyNormals(g, new THREE.Vector3(0, STAR_Y0 - 0.9, 0), 0.45);
  return g;
}

// Soft octahedral dab from y = BALL_Y0 to BALL_Y0 + 2 (clover globe; stretched in y = vetch spike). 8 triangles.
export const BALL_TRIS = 8;
function ballGeometry() {
  const B = new Builder();
  const cy = BALL_Y0 + 1;
  const top = [0, BALL_Y0 + 2, 0];
  const bot = [0, BALL_Y0, 0];
  const ct = [1.12, 1.12, 1.12];
  const cm = [1, 1, 1];
  const cb = [0.72, 0.72, 0.76];
  const eq = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    eq.push([Math.cos(a), cy, Math.sin(a)]);
  }
  for (let i = 0; i < 4; i++) {
    const p = eq[i];
    const q = eq[(i + 1) % 4];
    const outT = [(p[0] + q[0]) / 3, 1 / 3, (p[2] + q[2]) / 3];
    const outB = [(p[0] + q[0]) / 3, -1 / 3, (p[2] + q[2]) / 3];
    B.tri(top, p, q, ct, cm, cm, outT);
    B.tri(bot, p, q, cb, cm, cm, outB);
  }
  const g = B.geometry();
  spherifyNormals(g, new THREE.Vector3(0, cy, 0), 1);
  return g;
}

// ---------- placement fields ----------
// Grass belongs where the camera stops look: a disc around each stop's target (the camera orbits it) plus a
// wedge along the opening sightline from the camera to the target.
function makeFocus() {
  const zones = [];
  for (const id of Object.keys(VIEWS)) {
    const v = VIEWS[id];
    if (v.underwater || v.radius > 150) continue;
    const tx = v.target[0];
    const tz = v.target[2];
    const sp = Math.sin(v.phi);
    const cx = tx + v.radius * sp * Math.cos(v.theta);
    const cz = tz + v.radius * sp * Math.sin(v.theta);
    const dist = Math.hypot(tx - cx, tz - cz) || 1;
    zones.push({ tx, tz, cx, cz, ux: (tx - cx) / dist, uz: (tz - cz) / dist, dist, core: Math.min(v.radius, 60) });
  }
  return function focus(x, z) {
    let f = 0;
    for (let i = 0; i < zones.length; i++) {
      const q = zones[i];
      const dx = x - q.tx;
      const dz = z - q.tz;
      const far = q.dist * 1.5 + q.core;
      if (dx * dx + dz * dz > far * far) continue;
      const d = Math.sqrt(dx * dx + dz * dz);
      const core = smoothstep(q.core, q.core * 0.25, d) * 0.75;
      const px = x - q.cx;
      const pz = z - q.cz;
      const along = px * q.ux + pz * q.uz;
      const lat = Math.abs(px * q.uz - pz * q.ux);
      const wedge = along <= 0 ? 0
        : smoothstep(4, 16, along) * smoothstep(q.dist * 1.5, q.dist * 1.05, along) *
          smoothstep(along * 0.75 + 4, along * 0.35 + 1, lat);
      if (core > f) f = core;
      if (wedge > f) f = wedge;
    }
    return f;
  };
}

function landOK(b) {
  return b.h > 0.35 && b.under < 0.05;
}
// Dense in meadows, lighter in tropics, thin in forest shade, sparse dry tufts in desert; none on beach/rock/water.
function grassLand(b) {
  if (!landOK(b)) return 0;
  const g = b.meadow * 1.0 + b.tropical * 0.6 + b.forest * 0.32 + b.desert * 0.16;
  return clamp(g, 0, 1) * smoothstep(0.7, 0.4, b.slope) * (1 - smoothstep(0.15, 0.5, b.beach));
}
function flowerLand(b) {
  if (!landOK(b) || b.h < 0.45) return 0;
  const g = b.meadow + b.tropical * 0.4 + b.forest * 0.1;
  return clamp(g, 0, 1) * smoothstep(0.6, 0.35, b.slope) * (1 - smoothstep(0.1, 0.4, b.beach));
}
// Sword fern: moist forest understory, forest edges (where birch stands), foot of slopes rather than peaks.
// Uses the forest SHARE of the land biomes (the absolute weight is small on the steep forested mountain).
function fernLand(b) {
  if (!landOK(b) || b.h < 0.8 || b.h > 44) return 0;
  const landW = b.meadow + b.tropical + b.forest + b.desert;
  if (landW < 0.05) return 0;
  const f = b.forest / landW;
  const dry = smoothstep(0.15, 0.4, b.desert / landW);
  const g = smoothstep(0.12, 0.55, f) * (1 - 0.6 * b.tropical / landW) * (1 - dry) * smoothstep(0.15, 0.45, landW);
  return g * smoothstep(0.78, 0.45, b.slope) * (1 - 0.5 * smoothstep(25, 40, b.h));
}
// Accept helper: cheap field test first, then the camera focus, then the noise (ocean samples cost nothing).
function gated(land, b, x, z, useFocus, lo, noise) {
  const g = land(b);
  if (g <= 0) return 0;
  let f = 1;
  if (useFocus) {
    f = useFocus(x, z);
    if (f <= 0) return 0;
  }
  return g * f * (lo + (1 - lo) * noise(x, z));
}
const grassPatch = (x, z) => smoothstep(0.38, 0.6, clump(x, z, 0.045, 11));
const flowerPatch = (x, z) => smoothstep(0.42, 0.62, clump(x, z, 0.035, 41));
const fernColony = (x, z) => smoothstep(0.4, 0.62, clump(x, z, 0.05, 31));

// Clumps: scatter() picks patch centres, then each centre spawns children around it (checked with
// sampleField). Gives tussock patches, flower drifts and fern colonies with clearings between them.
export function clustersInto(out, { total, per, radius, seed, tries, center, child, make }) {
  if (total <= 0) return out;
  const goal = out.length + total;
  const centres = scatter({ count: Math.ceil((total / per) * 1.25), seed, tries, accept: center });
  const rand = mulberry32(seed * 7 + 3);
  for (let pass = 0; pass < 4 && out.length < goal && centres.length; pass++) {
    const n = pass === 0 ? per : Math.ceil(per * 0.5);
    for (let ci = 0; ci < centres.length && out.length < goal; ci++) {
      const c = centres[ci];
      for (let i = 0; i < n && out.length < goal; i++) {
        const ang = rand() * TAU;
        const r = radius * Math.pow(rand(), 0.65);
        const x = c.x + Math.cos(ang) * r;
        const z = c.z + Math.sin(ang) * r;
        const b = sampleField(x, z);
        const p = child(b, x, z, c);
        if (p > 0 && rand() < p) out.push(make(b, x, z, c, rand));
      }
    }
  }
  return out;
}

function biomeMix(b) {
  const s = b.meadow + b.tropical + b.forest + b.desert + 1e-4;
  return { m: b.meadow / s, t: b.tropical / s, f: b.forest / s, d: b.desert / s };
}

function makeTuft(b, x, z, rand) {
  const w = biomeMix(b);
  const bio = w.m * 1.25 + w.t * 1.0 + w.f * 0.72 + w.d * 0.6;
  const wave = 0.78 + 0.5 * clump(x, z, 0.022, 21);
  const col = groundColor(b, x, z, new THREE.Color());
  const dry = clamp(w.d * 1.2, 0, 0.85);
  if (dry > 0) col.lerp(STRAW, dry);
  col.offsetHSL(0, 0.04, 0);
  jitter(col, rand);
  const r = pickYaw(rand);
  // Wind-combed lean along uWind (+x, a little +z) plus a random wobble.
  const lean = leanFor(r, 0.11 + (rand() - 0.5) * 0.2, 0.04 + (rand() - 0.5) * 0.2);
  return {
    x, y: b.h - 0.05 - b.slope * 0.3, z, r, tx: lean.tx, tz: lean.tz,
    s: bio * wave * (0.78 + 0.44 * rand()), sy: 0.85 + 0.35 * rand(), c: col, score: w.m + 0.35 * rand(),
  };
}

export const SPECIES = [
  { name: 'daisy', head: 'star', w: 0.3, color: '#fbf7ea', h: [0.5, 0.8], k: [0.055, 0.075], sy: 1 },
  { name: 'buttercup', head: 'star', w: 0.25, color: '#ffd23f', h: [0.42, 0.72], k: [0.042, 0.055], sy: 1 },
  { name: 'cornflower', head: 'star', w: 0.13, color: '#5b84e8', h: [0.5, 0.75], k: [0.048, 0.062], sy: 1 },
  { name: 'clover', head: 'ball', w: 0.18, color: '#f08bb6', h: [0.28, 0.45], k: [0.042, 0.055], sy: 1.15 },
  { name: 'vetch', head: 'ball', w: 0.14, color: '#9a6ad8', h: [0.38, 0.6], k: [0.026, 0.034], sy: 2.6 },
];
function pickSpecies(u) {
  let acc = 0;
  for (const sp of SPECIES) {
    acc += sp.w;
    if (u < acc) return sp;
  }
  return SPECIES[SPECIES.length - 1];
}

function makeFlower(b, x, z, sp, rand) {
  const H = lerp(sp.h[0], sp.h[1], rand()) * (0.85 + 0.3 * clump(x, z, 0.03, 61));
  const r = pickYaw(rand);
  const sl = leanFor(r, 0.08 + (rand() - 0.5) * 0.24, 0.03 + (rand() - 0.5) * 0.24);
  const y = b.h - 0.04 - b.slope * 0.25;
  const top = rotUp(sl.tx, r, sl.tz, H);
  const k = lerp(sp.k[0], sp.k[1], rand());
  const hr = pickYaw(rand);
  // Heads turn toward the late-morning sun (+x, +z); vetch spikes nod more.
  const nod = sp.name === 'vetch' ? 0.35 : 0;
  const hl = leanFor(hr, 0.2 + (rand() - 0.5) * (0.35 + nod), 0.18 + (rand() - 0.5) * (0.35 + nod));
  const y0 = sp.head === 'star' ? STAR_Y0 : BALL_Y0;
  const off = rotUp(hl.tx, hr, hl.tz, y0 * k * sp.sy);
  const stemCol = jitter(STEM.clone(), rand);
  const headCol = jitter(new THREE.Color(sp.color), rand, 0.012, 0.08);
  return {
    kind: sp.head,
    stem: { x, y, z, r, tx: sl.tx, tz: sl.tz, s: 1, sy: H, c: stemCol },
    head: {
      x: x + top[0] - off[0], y: y + top[1] - off[1], z: z + top[2] - off[2],
      r: hr, tx: hl.tx, tz: hl.tz, s: k, sy: sp.sy, c: headCol,
    },
  };
}

function makeFern(b, x, z, rand) {
  const w = biomeMix(b);
  const shade = clamp(w.f, 0, 1);
  const col = FERN_SUN.clone().lerp(FERN_SHADE, shade * 0.7);
  jitter(col, rand);
  const r = rand() * TAU;
  return {
    x, y: b.h - 0.04 - b.slope * 0.3, z, r,
    tx: (rand() - 0.5) * 0.12, tz: (rand() - 0.5) * 0.12,
    s: (0.9 + 0.55 * rand()) * (0.95 + 0.3 * shade),
    // Deep shade: fronds spread nearly flat. More light: more upright (Polystichum munitum habit).
    sy: lerp(1.08, 0.78, shade) * (0.92 + 0.16 * rand()),
    c: col,
  };
}

// ---------- build (pure: no React) ----------
export function buildGroundCover(Q, tier) {
  const budget = FILE_BUDGET[tier] || FILE_BUDGET.low;
  const target = Math.floor(budget * SAFETY);
  const focus = makeFocus();

  // Grass: Q.grass blades -> 30% in 3-blade tall tufts, 70% in 5-blade fluffy tufts.
  const blades = Math.max(0, Math.floor(Q.grass || 0));
  let n3 = Math.round((blades * 0.3) / 3);
  let n5 = Math.round((blades * 0.7) / 5);
  const grassCap = target * GRASS_SHARE;
  const tallSeg = n3 * tuftTris(3, 3) + n5 * tuftTris(5, 3) <= grassCap ? 3 : 2;
  const want = n3 * tuftTris(3, tallSeg) + n5 * tuftTris(5, tallSeg);
  if (want > grassCap) {
    const k = grassCap / want;
    n3 = Math.floor(n3 * k);
    n5 = Math.floor(n5 * k);
  }
  const N = n3 + n5;
  const tufts = [];
  const childG = (b) => {
    const g = grassLand(b);
    return g > 0.04 ? 0.25 + 0.75 * g : 0;
  };
  const tuftMake = (b, x, z, c, rand) => makeTuft(b, x, z, rand);
  clustersInto(tufts, {
    total: Math.round(N * 0.5), per: 8, radius: 2.6, seed: 101, tries: 60,
    center: (b, x, z) => gated(grassLand, b, x, z, focus, 0.45, grassPatch),
    child: childG, make: tuftMake,
  });
  clustersInto(tufts, {
    total: N - tufts.length, per: 8, radius: 2.6, seed: 202, tries: 40,
    center: (b, x, z) => gated(grassLand, b, x, z, null, 0.12, grassPatch),
    child: childG, make: tuftMake,
  });
  // Exact split: the most meadow-like spots get the tall curling 3-blade tufts.
  const order = tufts.map((t, i) => i).sort((a, b) => tufts[b].score - tufts[a].score);
  const tall3 = [];
  const fluffy5 = [];
  const n3Real = Math.round((tufts.length * n3) / Math.max(1, N));
  for (let i = 0; i < order.length; i++) (i < n3Real ? tall3 : fluffy5).push(tufts[order[i]]);

  // Flowers: drifts of mostly one species (15% strays), half of them in the camera-stop zones.
  const flowersWanted = Math.max(0, Math.floor(Q.flowers || 0));
  const flowers = [];
  const childF = (b, x, z, c) => {
    const f = flowerLand(b);
    return f > 0.05 ? 0.3 + 0.7 * f : 0;
  };
  const flowerMake = (b, x, z, c, rand) => {
    const sp = rand() < 0.15 ? pickSpecies(rand()) : pickSpecies(c.rnd);
    return makeFlower(b, x, z, sp, rand);
  };
  clustersInto(flowers, {
    total: Math.round(flowersWanted * 0.55), per: 14, radius: 3.4, seed: 303, tries: 60,
    center: (b, x, z) => gated(flowerLand, b, x, z, focus, 0.3, flowerPatch),
    child: childF, make: flowerMake,
  });
  clustersInto(flowers, {
    total: flowersWanted - flowers.length, per: 14, radius: 3.4, seed: 404, tries: 40,
    center: (b, x, z) => gated(flowerLand, b, x, z, null, 0.1, flowerPatch),
    child: childF, make: flowerMake,
  });
  const stems = [];
  const stars = [];
  const balls = [];
  for (const f of flowers) {
    stems.push(f.stem);
    (f.kind === 'star' ? stars : balls).push(f.head);
  }

  const grassTris = tall3.length * tuftTris(3, tallSeg) + fluffy5.length * tuftTris(5, tallSeg);
  const flowerTris = stems.length * STEM_TRIS + stars.length * STAR_TRIS + balls.length * BALL_TRIS;

  // Ferns: fronds per rosette from what is left of the budget (8..16), count capped to stay inside it.
  const fernsWanted = Math.max(0, Math.floor(Q.ferns || 0));
  const left = Math.max(0, target - grassTris - flowerTris);
  const fronds = clamp(Math.floor(left / Math.max(1, fernsWanted * FROND_TRIS)), 8, 16);
  const fernCap = Math.min(fernsWanted, Math.floor(left / (fronds * FROND_TRIS)));
  const ferns = [];
  clustersInto(ferns, {
    total: fernCap, per: 4, radius: 2.8, seed: 505, tries: 300,
    center: (b, x, z) => {
      const g = gated(fernLand, b, x, z, null, 0.35, fernColony);
      return g > 0 ? Math.min(1, g * 2.5) * (0.75 + 0.25 * focus(x, z)) : 0;
    },
    child: (b) => {
      const f = fernLand(b);
      return f > 0.05 ? 0.4 + 0.6 * f : 0;
    },
    make: (b, x, z, c, rand) => makeFern(b, x, z, rand),
  });

  // ---------- meshes ----------
  const side = THREE.DoubleSide;
  const grassMat = cozyMaterial({ color: '#ffffff', sway: 0.3, wrap: 0.85, rim: 0.35, aoScale: 4.0, side });
  const fernMat = cozyMaterial({ color: '#ffffff', sway: 0.09, wrap: 0.6, rim: 0.4, aoScale: 1.2, side });
  const stemMat = cozyMaterial({ color: '#ffffff', sway: STEM_SWAY, wrap: 0.75, rim: 0.2, aoScale: 2.0, side });
  const starMat = cozyMaterial({ color: '#ffffff', sway: STEM_SWAY / STAR_Y0, wrap: 0.9, rim: 0.3, aoScale: 0.1, side });
  const ballMat = cozyMaterial({ color: '#ffffff', sway: STEM_SWAY / BALL_Y0, wrap: 0.8, rim: 0.3, aoScale: 0.1, side });
  const materials = [grassMat, fernMat, stemMat, starMat, ballMat];

  const meshes = [];
  const geometries = [];
  const counts = {};
  let tris = 0;
  const colorOf = (it) => it.c;
  const add = (name, makeGeo, mat, items) => {
    counts[name] = items.length;
    if (!items.length) return;
    const g = makeGeo();
    geometries.push(g);
    const m = makeInstanced(g, mat, items, colorOf);
    m.name = name;
    meshes.push(m);
    tris += triangles(g) * items.length;
  };
  add('grass-tall', () => tuftGeometry(3, tallSeg, 7), grassMat, tall3);
  add('grass-fluffy', () => tuftGeometry(5, tallSeg, 19), grassMat, fluffy5);
  add('fern', () => fernGeometry(fronds, 23), fernMat, ferns);
  add('flower-stem', stemGeometry, stemMat, stems);
  add('flower-star', starGeometry, starMat, stars);
  add('flower-ball', ballGeometry, ballMat, balls);

  const info = {
    draws: meshes.length,
    triangles: tris,
    programs: 1,
    budget,
    detail: { tallSeg, fronds },
    counts: { ...counts, grassBlades: tall3.length * 3 + fluffy5.length * 5 },
  };
  return { meshes, geometries, materials, info };
}

export default function GroundCover({ Q, tier }) {
  const built = useMemo(() => buildGroundCover(Q, tier), [Q, tier]);
  useEffect(() => {
    report('GroundCover.js', built.info);
    return () => {
      for (const m of built.meshes) m.dispose();
      for (const g of built.geometries) g.dispose();
      for (const m of built.materials) m.dispose();
    };
  }, [built]);
  return h(
    'group',
    { name: 'ground-cover' },
    built.meshes.map((m) => h('primitive', { key: m.name, object: m }))
  );
}
