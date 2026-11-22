// Tropical plants: coconut palms, low palms, banana mats, monstera clumps and desert cacti.
// Painted-mass approach: each plant is a few soft sheets and tubes with baked vertex-colour masses
// (light rachis / midribs, warm saturated blades, cool grooves), per-instance colour + size jitter,
// and natural groups (palm groves on the shore, banana mats with suckers, monstera under them,
// saguaros spaced out over the desert with barrel and prickly-pear patches between).
// One InstancedMesh per part per species, all on the shared cozyMaterial program (Front + Double).
//
// References studied (shape, growth habit):
//   Coconut palm: slim ringed stem (leaf scars), curving/leaning toward the sea, crown of long pinnate
//   fronds with folded leaflets, nuts clustered under the crown:
//   https://en.wikipedia.org/wiki/Coconut , https://www.gardenia.net/plant/cocos-nucifera-coconut-tree-everything-you-need-to-know
//   https://www.vedantu.com/biology/coconut-palm-plant , https://onenaturalist.blog/picture-coconut-tree-anatomy-symbolism-guide/
//   Banana: pseudostem of tightly wrapped leaf sheaths, leaf = sheath + short petiole + huge blade
//   with a strong midrib, blades tear between veins in wind, the bunch hangs from the top on a
//   curved stalk with a purple bud; plants grow as mats with suckers:
//   https://en.wikipedia.org/wiki/Musa_(plant) , https://www.naturalfibercompany.com/blogs/banana-fiber-sustainable-textiles/what-is-a-banana-pseudostem
//   https://www.researchgate.net/publication/264117620_Banana_morphology-part_II_The_aerial_Shoot
//   Monstera: heart-shaped leaves on long petioles, slits from the margin toward the midrib that let
//   light reach lower leaves: https://lifetips.alibaba.com/plant-care/parts-of-a-monstera-plant
//   Saguaro: ribbed column, arms bend out then turn up, flowers on the crown and arm tips:
//   https://en.wikipedia.org/wiki/Saguaro , https://smartscience.blog/skeleton-saguaro-cactus-guide
//   Prickly pear pads (cladodes) stacked at angles with tunas on the rims; ribbed barrel cactus:
//   https://opuntiads.com/oblog/cactus-shapes/ , https://www.cactusoutlet.com/blogs/blog/devils-tongue-cactus
//   Painting: Kazuo Oga style simplification to soft masses (see Temperate.js / Terrain.js notes).
import { createElement as h, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { scatter, sampleField, normalAt, clump, shapeAt, BIOME_ANGLE } from '../world/island.js';
import { smoothstep, mulberry32, valueNoise } from '../world/noise.js';
import { cozyMaterial } from '../materials/shading.js';
import { paint, merge, makeInstanced, spherifyNormals, triangles, report } from '../lib/geo.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Small vector + colour helpers (colours: sRGB hex -> linear rgb arrays, like THREE.Color).
// ---------------------------------------------------------------------------------------------
function lin(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function hex(s) {
  const v = parseInt(s.slice(1), 16);
  return [lin(((v >> 16) & 255) / 255), lin(((v >> 8) & 255) / 255), lin((v & 255) / 255)];
}
function mixC(a, b, t) {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
function mulC(a, k) {
  return [a[0] * k, a[1] * k, a[2] * k];
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

const P = {
  // palm
  trunk: hex('#a89478'),
  trunkRing: hex('#8a7862'),
  trunkBase: hex('#7a6a5c'),
  trunkTop: hex('#8f8656'),
  nutGreen: hex('#7d8f36'),
  nutBrown: hex('#8f6a3a'),
  rachis: hex('#cfc56c'),
  frond: hex('#4e9c3c'),
  frondYoung: hex('#7dbe4c'),
  frondOld: hex('#8ea23e'),
  frondTip: hex('#3c7f3a'),
  // banana
  stem: hex('#7fa74c'),
  stemDark: hex('#5d7d3c'),
  sheathDry: hex('#9c8350'),
  midrib: hex('#d6de8c'),
  blade: hex('#5cb046'),
  bladeYoung: hex('#92d05c'),
  bladeOld: hex('#8aa642'),
  bladeDry: hex('#bc9e56'),
  bladeEdge: hex('#489a3c'),
  fruit: hex('#b7ca50'),
  fruitRipe: hex('#dccf60'),
  bud: hex('#7c2f50'),
  // monstera
  mPetiole: hex('#5f9c42'),
  mVein: hex('#6fb653'),
  mLeaf: hex('#2f7f3c'),
  mLeafYoung: hex('#58a845'),
  mEdge: hex('#28703a'),
  // cactus
  cCrest: hex('#7aa45a'),
  cGroove: hex('#3e6c4c'),
  cTop: hex('#9cbc6a'),
  cBase: hex('#5b7a4a'),
  saguaroFlower: hex('#f6f0d6'),
  barrelCrest: hex('#86a75c'),
  barrelGroove: hex('#4a7552'),
  barrelSpine: hex('#c4a35a'),
  yellowFlower: hex('#f4cf48'),
  pad: hex('#86aa58'),
  padLight: hex('#a8c470'),
  padDark: hex('#5f8a4c'),
  tuna: hex('#c8466e'),
  pinkFlower: hex('#f08aa8'),
};

// ---------------------------------------------------------------------------------------------
// Geometry builder: indexed, smooth normals, then non-indexed (position, normal, color) so pieces
// merge with paint()-ed primitives.
// ---------------------------------------------------------------------------------------------
class Builder {
  constructor() {
    this.p = [];
    this.c = [];
    this.i = [];
  }
  v(p, c) {
    this.p.push(p[0], p[1], p[2]);
    this.c.push(c[0], c[1], c[2]);
    return this.p.length / 3 - 1;
  }
  tri(a, b, c) {
    this.i.push(a, b, c);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeVertexNormals();
    const out = g.toNonIndexed();
    g.dispose();
    return out;
  }
}

// Connect two rows of vertex indices: equal length -> quads, next row of 1 -> fan to a tip.
function connectRows(B, A, C) {
  if (C.length === A.length) {
    for (let k = 0; k < A.length - 1; k++) {
      const a = A[k];
      const b = A[k + 1];
      const c = C[k];
      const d = C[k + 1];
      B.tri(a, c, b);
      B.tri(b, c, d);
    }
  } else if (C.length === 1) {
    for (let k = 0; k < A.length - 1; k++) B.tri(A[k], C[0], A[k + 1]);
  }
}

// Ring tube along a path (parallel-transported frame). rib 0..1 alternates vertex radius for ribs.
// colorFn(i, k, n) -> rgb. apex: length of the closing cone past the last ring (0 = open).
function tube(B, pts, radii, S, colorFn, opt = {}) {
  const n = pts.length;
  const rib = opt.rib || 0;
  let u = null;
  let T = [0, 1, 0];
  const rings = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    T = norm(sub(b, a));
    if (!u) {
      const ref = Math.abs(T[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
      u = norm(cross(T, ref));
    } else {
      u = norm(sub(u, scl(T, dot(u, T))));
    }
    const w = cross(u, T);
    const ring = [];
    for (let k = 0; k < S; k++) {
      const ang = (k / S) * TAU + (opt.twist || 0) * i;
      const rr = radii[i] * (rib && k % 2 ? 1 - rib : 1);
      const p = add(pts[i], add(scl(u, Math.cos(ang) * rr), scl(w, Math.sin(ang) * rr)));
      ring.push(B.v(p, colorFn(i, k, n)));
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < S; k++) {
      const k2 = (k + 1) % S;
      const a = rings[i][k];
      const b = rings[i][k2];
      const c = rings[i + 1][k];
      const d = rings[i + 1][k2];
      B.tri(a, c, b);
      B.tri(b, c, d);
    }
  }
  if (opt.apex) {
    const ap = B.v(add(pts[n - 1], scl(T, opt.apex)), opt.apexColor || colorFn(n - 1, 0, n));
    const top = rings[n - 1];
    for (let k = 0; k < S; k++) B.tri(top[k], ap, top[(k + 1) % S]);
  }
  return rings;
}

// Pinnate / paddle leaf strip with a raised midrib and edges folded down (inverted V).
// spec: { base, az, e0, droop, L, ts: [0..1 row stations], wl: [left half-widths], wr: [right], fold,
//         color(row, part) part 0 = left edge, 1 = rib, 2 = right edge, tipColor }
// The last station is a single tip vertex.
function leafStrip(B, spec) {
  const hd = [Math.cos(spec.az), 0, Math.sin(spec.az)];
  const side = [-Math.sin(spec.az), 0, Math.cos(spec.az)];
  const n = spec.ts.length;
  let p = spec.base.slice();
  let prev = null;
  for (let s = 0; s < n; s++) {
    const t = spec.ts[s];
    if (s > 0) {
      const tm = (spec.ts[s - 1] + t) * 0.5;
      const e = spec.e0 - spec.droop * Math.pow(tm, spec.droopPow || 1.4);
      const step = spec.L * (t - spec.ts[s - 1]);
      p = add(p, add(scl(hd, Math.cos(e) * step), [0, Math.sin(e) * step, 0]));
    }
    let row;
    if (s === n - 1) {
      row = [B.v(p, spec.tipColor)];
    } else {
      const e = spec.e0 - spec.droop * Math.pow(t, spec.droopPow || 1.4);
      const f = add(scl(hd, Math.cos(e)), [0, Math.sin(e), 0]);
      const up = norm(cross(side, f));
      const cf = Math.cos(spec.fold);
      const sf = Math.sin(spec.fold);
      const wl = spec.wl[s];
      const wr = spec.wr[s];
      const L = add(p, add(scl(side, -wl * cf), scl(up, -wl * sf)));
      const R = add(p, add(scl(side, wr * cf), scl(up, -wr * sf)));
      row = [B.v(L, spec.color(s, 0)), B.v(p, spec.color(s, 1)), B.v(R, spec.color(s, 2))];
    }
    if (prev) connectRows(B, prev, row);
    prev = row;
  }
}

function icoPiece(radius, color, center, sx = 1, sy = 1, sz = 1) {
  const g = paint(new THREE.IcosahedronGeometry(radius, 0), color);
  spherifyNormals(g, new THREE.Vector3(), 1);
  g.scale(sx, sy, sz);
  g.translate(center[0], center[1], center[2]);
  return g;
}
function tetraPiece(radius, color, center) {
  const g = paint(new THREE.TetrahedronGeometry(radius, 0), color);
  spherifyNormals(g, new THREE.Vector3(), 0.7);
  g.rotateX(0.6);
  g.translate(center[0], center[1], center[2]);
  return g;
}
function toColor(rgb) {
  const c = new THREE.Color();
  c.setRGB(rgb[0], rgb[1], rgb[2]);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Coconut palm: curved ringed trunk (+ coconuts) and a crown of 7 arching fronds.
// Local frame: trunk leans toward +x; the placement yaw turns +x to face the sea.
// ---------------------------------------------------------------------------------------------
const PALM_H = 8.0;
const PALM_BEND = 0.17;
function palmPoint(t) {
  return [PALM_BEND * PALM_H * Math.pow(t, 1.8), PALM_H * t, 0];
}
const PALM_TOP = palmPoint(1);

function palmTrunkGeometry() {
  const B = new Builder();
  const ts = [0, 0.04, 0.2, 0.4, 0.6, 0.8, 1];
  const pts = ts.map((t) => palmPoint(t));
  pts[0] = [0, -0.4, 0];
  // Swollen bole at the base, slim and even up the stem, a slight crownshaft bulge.
  const radii = ts.map((t) => 0.19 + 0.17 * Math.pow(1 - t, 5) + (t > 0.95 ? 0.03 : 0));
  tube(
    B,
    pts,
    radii,
    6,
    (i, k, n) => {
      const t = i / (n - 1);
      let c = mixC(P.trunkBase, P.trunk, smoothstep(0, 0.35, t));
      c = mixC(c, P.trunkTop, smoothstep(0.8, 1, t));
      // leaf-scar rings: alternate ring rows light/dark
      if (i % 2) c = mixC(c, P.trunkRing, 0.6);
      return mulC(c, 0.94 + 0.12 * valueNoise(k * 1.3, i * 2.1, 81));
    },
    { apex: 0.18, apexColor: P.trunkTop }
  );
  const trunk = B.geometry();
  const T = PALM_TOP;
  const nuts = [
    icoPiece(0.17, '#ffffff', [T[0] + 0.22, T[1] - 0.22, 0.1], 1, 1.1, 1),
    icoPiece(0.16, '#ffffff', [T[0] - 0.05, T[1] - 0.26, 0.24], 1, 1.1, 1),
  ];
  const cn = [P.nutGreen, mixC(P.nutGreen, P.nutBrown, 0.6)];
  nuts.forEach((g, j) => {
    const cl = g.attributes.color;
    for (let i = 0; i < cl.count; i++) cl.setXYZ(i, cn[j][0], cn[j][1], cn[j][2]);
  });
  return merge([trunk, ...nuts]);
}

// Frond layout: young fronds stand up near the top, old ones hang low (one yellowing olive frond).
const PALM_FRONDS = [
  { az: 0.2, e0: 0.95, droop: 1.35, L: 3.4, age: 0 },
  { az: 1.1, e0: 0.45, droop: 1.75, L: 4.0, age: 0.5 },
  { az: 2.05, e0: 0.15, droop: 1.95, L: 4.2, age: 0.7 },
  { az: 2.95, e0: 0.72, droop: 1.5, L: 3.8, age: 0.3 },
  { az: 3.85, e0: 0.28, droop: 1.9, L: 4.1, age: 0.6 },
  { az: 4.75, e0: 0.58, droop: 1.6, L: 3.9, age: 0.4 },
  { az: 5.55, e0: -0.08, droop: 2.0, L: 4.0, age: 1 },
];

function frondColors(age) {
  const blade = age >= 1 ? P.frondOld : mixC(P.frondYoung, P.frond, smoothstep(0, 0.5, age));
  return (s, part, n) => {
    const t = s / (n - 1);
    if (part === 1) return mixC(P.rachis, blade, 0.25 + 0.5 * t);
    // leaflets: alternate rows a touch darker so the pinnate rhythm reads
    const c = mixC(blade, P.frondTip, smoothstep(0.5, 1, t) * 0.6);
    return s % 2 ? mulC(c, 0.88) : c;
  };
}

function addFrond(B, base, f, opt) {
  const segs = opt.segs;
  const ts = [];
  for (let s = 0; s <= segs; s++) ts.push(s / segs);
  const wl = [];
  const wr = [];
  for (let s = 0; s < segs; s++) {
    const t = ts[s];
    const w = s === 0 ? opt.W * 0.12 : opt.W * Math.pow(Math.sin(Math.PI * Math.min(0.97, 0.12 + t * 0.95)), 0.6);
    // feathered silhouette: leaflet groups alternate long / short
    wl.push(w * (s % 2 ? 0.8 : 1));
    wr.push(w * (s % 2 ? 1 : 0.82));
  }
  const col = frondColors(f.age);
  leafStrip(B, {
    base,
    az: f.az,
    e0: f.e0,
    droop: f.droop,
    L: f.L * opt.lenK,
    ts,
    wl,
    wr,
    fold: opt.fold,
    color: (s, part) => col(s, part, segs + 1),
    tipColor: mulC(P.frondTip, f.age >= 1 ? 1.25 : 1),
  });
}

function palmFrondGeometry() {
  const B = new Builder();
  const base = add(PALM_TOP, [0, 0.12, 0]);
  for (const f of PALM_FRONDS) addFrond(B, base, f, { segs: 5, W: 0.56, fold: 0.62, lenK: 1 });
  const g = B.geometry();
  // soft painted crown: blend normals toward a sphere around the crown
  spherifyNormals(g, new THREE.Vector3(base[0], base[1] - 0.6, base[2]), 0.35);
  g.computeBoundingSphere();
  return g;
}

// Low palm: short stump with a fountain of fronds from near the ground.
const LOW_FRONDS = [
  { az: 0.3, e0: 1.3, droop: 1.6, L: 2.0, age: 0 },
  { az: 1.35, e0: 1.05, droop: 1.9, L: 2.4, age: 0.4 },
  { az: 2.4, e0: 1.2, droop: 1.7, L: 2.2, age: 0.2 },
  { az: 3.4, e0: 0.95, droop: 2.0, L: 2.5, age: 0.6 },
  { az: 4.4, e0: 1.25, droop: 1.75, L: 2.1, age: 0.1 },
  { az: 5.4, e0: 0.85, droop: 2.1, L: 2.4, age: 1 },
];
function lowPalmGeometry() {
  const B = new Builder();
  tube(
    B,
    [[0, -0.2, 0], [0, 0.42, 0]],
    [0.22, 0.15],
    5,
    (i) => (i ? P.trunkTop : P.trunkBase),
    { apex: 0.12, apexColor: P.trunkTop }
  );
  const base = [0, 0.45, 0];
  for (const f of LOW_FRONDS) addFrond(B, base, f, { segs: 4, W: 0.4, fold: 0.55, lenK: 1 });
  const g = B.geometry();
  spherifyNormals(g, new THREE.Vector3(0, 0.3, 0), 0.4);
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------
// Banana: pseudostem of wrapped sheaths, 6 paddle leaves + a rolled young leaf; optional bunch.
// ---------------------------------------------------------------------------------------------
const BAN_TOP = 2.45;
function bananaStemGeometry() {
  const B = new Builder();
  const ys = [-0.15, 0.8, 1.7, BAN_TOP];
  const rs = [0.2, 0.16, 0.14, 0.125];
  tube(
    B,
    ys.map((y) => [0, y, 0]),
    rs,
    6,
    (i, k) => {
      const t = i / 3;
      let c = mixC(P.stemDark, P.stem, smoothstep(0, 0.7, t));
      // dry brown outer sheaths peel near the base; pale streaks where sheaths overlap
      const n = valueNoise(k * 1.7 + 3, i * 1.9, 83);
      c = mixC(c, P.sheathDry, smoothstep(0.45, 0.8, n) * (1 - t) * 0.9);
      return k % 3 === 0 ? mulC(c, 1.12) : c;
    },
    { apex: 0.12, apexColor: P.stem }
  );
  return B.geometry();
}

const BAN_LEAVES = [
  { az: 0.3, e0: 1.25, droop: 0.75, L: 2.0, age: 0 },
  { az: 1.4, e0: 0.95, droop: 1.25, L: 2.3, age: 0.3 },
  { az: 2.5, e0: 0.75, droop: 1.55, L: 2.4, age: 0.5 },
  { az: 3.6, e0: 1.05, droop: 1.1, L: 2.2, age: 0.2 },
  { az: 4.6, e0: 0.5, droop: 1.95, L: 2.3, age: 0.8 },
  { az: 5.6, e0: 0.35, droop: 2.35, L: 2.1, age: 1 },
];
const BAN_TS = [0, 0.16, 0.3, 0.46, 0.62, 0.78, 0.92, 1];
const BAN_W = [0.04, 0.06, 0.85, 1, 1, 0.95, 0.68];

function bananaLeafGeometry() {
  const B = new Builder();
  const rand = mulberry32(8301);
  for (const lf of BAN_LEAVES) {
    const W = 0.33;
    const wl = [];
    const wr = [];
    for (let s = 0; s < BAN_W.length; s++) {
      const w = W * BAN_W[s];
      // torn edges: alternate rows lose a strip on one side or the other
      const tearL = s >= 3 && (s + (lf.age > 0.5 ? 1 : 0)) % 2 === 0 ? 0.62 + rand() * 0.2 : 1;
      const tearR = s >= 3 && (s + (lf.age > 0.5 ? 0 : 1)) % 2 === 0 ? 0.62 + rand() * 0.2 : 1;
      wl.push(w * (lf.age < 0.1 ? 1 : tearL));
      wr.push(w * (lf.age < 0.1 ? 1 : tearR));
    }
    const blade = mixC(P.bladeYoung, P.blade, smoothstep(0, 0.4, lf.age));
    const bl = lf.age >= 0.8 ? mixC(P.blade, P.bladeOld, 0.7) : blade;
    const base = [Math.cos(lf.az) * 0.08, BAN_TOP + 0.05 + (1 - lf.age) * 0.1, Math.sin(lf.az) * 0.08];
    leafStrip(B, {
      base,
      az: lf.az,
      e0: lf.e0,
      droop: lf.droop,
      L: lf.L,
      ts: BAN_TS,
      wl,
      wr,
      fold: 0.28,
      color: (s, part) => {
        if (s < 2) return P.stem;
        if (part === 1) return P.midrib;
        let c = s % 2 ? mixC(bl, P.bladeEdge, 0.5) : bl;
        if (lf.age >= 0.8) c = mixC(c, P.bladeDry, smoothstep(4, 6, s) * 0.85);
        return c;
      },
      tipColor: lf.age >= 0.8 ? P.bladeDry : P.bladeEdge,
    });
  }
  // rolled young "cigar" leaf standing straight up from the centre
  leafStrip(B, {
    base: [0, BAN_TOP + 0.1, 0],
    az: 0.9,
    e0: 1.45,
    droop: 0.15,
    L: 1.0,
    ts: [0, 0.6, 1],
    wl: [0.05, 0.06],
    wr: [0.05, 0.06],
    fold: 0.9,
    color: () => P.bladeYoung,
    tipColor: P.bladeYoung,
  });
  return B.geometry();
}

function bananaBunchGeometry() {
  const B = new Builder();
  // curved stalk out of the crown and down
  tube(B, [[0.05, BAN_TOP + 0.05, 0], [0.5, BAN_TOP - 0.1, 0], [0.72, 1.9, 0]], [0.04, 0.04, 0.035], 4, () => P.stemDark);
  // bunch of hands: ribbed, fat in the middle, green-yellow
  tube(
    B,
    [[0.73, 1.95, 0], [0.75, 1.6, 0], [0.75, 1.25, 0], [0.73, 1.0, 0]],
    [0.1, 0.21, 0.19, 0.11],
    6,
    (i, k) => (k % 2 ? P.fruit : mixC(P.fruit, P.fruitRipe, 0.4 + i * 0.15)),
    { rib: 0.14, apex: 0.08, apexColor: P.stemDark }
  );
  const g = B.geometry();
  const bud = paint(new THREE.OctahedronGeometry(0.1, 0), '#ffffff');
  spherifyNormals(bud, new THREE.Vector3(), 1);
  bud.scale(1, 1.7, 1);
  bud.translate(0.72, 0.72, 0);
  const cl = bud.attributes.color;
  for (let i = 0; i < cl.count; i++) cl.setXYZ(i, P.bud[0], P.bud[1], P.bud[2]);
  return merge([g, bud]);
}

// ---------------------------------------------------------------------------------------------
// Monstera clump: 4 heart-shaped split leaves on long petioles.
// Leaf in local space: forward +x from the petiole junction, cardioid margin, 4 lobes per side with
// slits between them that narrow toward the midrib.
// ---------------------------------------------------------------------------------------------
const MON_LEAVES = [
  { az: 0.2, ph: 0.62, hr: 0.32, L: 0.8, pitch: 0.55, young: 0 },
  { az: 1.75, ph: 0.88, hr: 0.36, L: 0.95, pitch: 0.42, young: 0 },
  { az: 3.3, ph: 0.5, hr: 0.42, L: 0.75, pitch: 0.7, young: 1 },
  { az: 4.75, ph: 0.98, hr: 0.24, L: 0.9, pitch: 0.36, young: 0 },
];
function monsteraLeaf(L, young) {
  const B = new Builder();
  const K = 4;
  const thMax = 0.86 * Math.PI;
  const gap = 0.07;
  const leaf = young ? P.mLeafYoung : P.mLeaf;
  const vein = young ? mixC(P.mVein, P.mLeafYoung, 0.4) : P.mVein;
  const r = (th) => L * (0.5 * Math.pow(1 + Math.cos(th), 0.9) + 0.03);
  const bend = (u, z) => -0.2 * (z * z) / L - 0.16 * Math.pow(Math.max(0, u - 0.35 * L), 2) / L;
  const margin = (th, sd) => {
    const rr = r(th);
    const u = rr * Math.cos(th);
    const z = sd * rr * Math.sin(th) * 0.95;
    return [u, bend(u, z), z];
  };
  const inner = (th) => {
    const u = Math.max(0.04 * L, 0.9 * r(th) * Math.cos(th));
    return [u, 0.012 * L, 0];
  };
  for (const sd of [-1, 1]) {
    for (let k = 0; k < K; k++) {
      const a = (k / K) * thMax + (k > 0 ? gap * 0.5 : 0);
      const b = ((k + 1) / K) * thMax - gap * 0.5;
      const ia = B.v(inner(a), vein);
      const ib = B.v(inner(b), vein);
      const oa = B.v(margin(a, sd), k % 2 ? leaf : mixC(leaf, P.mEdge, 0.5));
      const ob = B.v(margin(b, sd), k % 2 ? mixC(leaf, P.mEdge, 0.5) : leaf);
      B.tri(ia, oa, ib);
      B.tri(ib, oa, ob);
    }
  }
  return B.geometry();
}
function monsteraGeometry() {
  const parts = [];
  const pet = new Builder();
  const m = new THREE.Matrix4();
  const ry = new THREE.Matrix4();
  const rz = new THREE.Matrix4();
  for (const lf of MON_LEAVES) {
    const J = [Math.cos(lf.az) * lf.hr, lf.ph, Math.sin(lf.az) * lf.hr];
    // petiole: thin V-strip from the ground to the junction, with a slight outward arc
    const b0 = [Math.cos(lf.az) * 0.04, -0.05, Math.sin(lf.az) * 0.04];
    const side = [-Math.sin(lf.az) * 0.024, 0, Math.cos(lf.az) * 0.024];
    const r0 = [pet.v(sub(b0, side), P.mPetiole), pet.v(add(b0, [0, 0.02, 0]), P.mPetiole), pet.v(add(b0, side), P.mPetiole)];
    const r1 = [
      pet.v(sub(J, scl(side, 0.6)), P.mPetiole),
      pet.v(add(J, [0, 0.015, 0]), mixC(P.mPetiole, P.mVein, 0.5)),
      pet.v(add(J, scl(side, 0.6)), P.mPetiole),
    ];
    connectRows(pet, r0, r1);
    const g = monsteraLeaf(lf.L, lf.young);
    rz.makeRotationZ(-lf.pitch);
    ry.makeRotationY(-lf.az);
    m.makeTranslation(J[0], J[1], J[2]).multiply(ry).multiply(rz);
    g.applyMatrix4(m);
    parts.push(g);
  }
  parts.push(pet.geometry());
  const g = merge(parts);
  spherifyNormals(g, new THREE.Vector3(0, 0.2, 0), 0.25);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Cacti: saguaro (two variants: 1 arm, 3 arms), barrel, prickly pear.
// ---------------------------------------------------------------------------------------------
function cactusColor(i, k, n, crest, groove) {
  const t = i / Math.max(1, n - 1);
  let c = k % 2 ? groove : crest;
  c = mixC(mixC(P.cBase, c, 0.35 + 0.65 * smoothstep(0, 0.3, t)), P.cTop, smoothstep(0.75, 1, t) * 0.5);
  return c;
}
function saguaroGeometry(arms) {
  const B = new Builder();
  const ys = [-0.15, 1.2, 2.6, 3.9, 4.6];
  const rs = [0.36, 0.34, 0.33, 0.31, 0.25];
  tube(B, ys.map((y) => [0, y, 0]), rs, 10, (i, k, n) => cactusColor(i, k, n, P.cCrest, P.cGroove), {
    rib: 0.14,
    apex: 0.28,
    apexColor: P.cTop,
  });
  const flowers = [tetraPiece(0.09, '#ffffff', [0.05, 4.85, 0.04]), tetraPiece(0.08, '#ffffff', [-0.08, 4.8, -0.06])];
  for (const a of arms) {
    const d = [Math.cos(a.az), 0, Math.sin(a.az)];
    const pt = (out, y) => [d[0] * out, a.y + y, d[2] * out];
    const pts = [pt(0.12, 0), pt(0.52, 0.06), pt(0.68 * a.reach, 0.5), pt(0.7 * a.reach, a.up)];
    tube(B, pts, [0.19, 0.19, 0.18, 0.16], 6, (i, k, n) => cactusColor(i + 1, k, n + 1, P.cCrest, P.cGroove), {
      rib: 0.1,
      apex: 0.18,
      apexColor: P.cTop,
    });
    if (a.flower) flowers.push(tetraPiece(0.07, '#ffffff', add(pts[3], [0, 0.22, 0])));
  }
  const g = B.geometry();
  for (const f of flowers) {
    const cl = f.attributes.color;
    for (let i = 0; i < cl.count; i++) cl.setXYZ(i, P.saguaroFlower[0], P.saguaroFlower[1], P.saguaroFlower[2]);
  }
  return merge([g, ...flowers]);
}
const SAGUARO_A = [{ az: 0.3, y: 1.9, reach: 1, up: 1.5, flower: true }];
const SAGUARO_B = [
  { az: 0.2, y: 1.7, reach: 1.05, up: 1.7, flower: true },
  { az: 3.4, y: 2.4, reach: 0.9, up: 1.2, flower: false },
  { az: 1.9, y: 3.0, reach: 0.8, up: 0.9, flower: true },
];

function barrelGeometry() {
  const B = new Builder();
  const prof = [[-0.08, 0.36], [0.25, 0.42], [0.56, 0.38], [0.8, 0.24]];
  tube(
    B,
    prof.map((p) => [0, p[0], 0]),
    prof.map((p) => p[1]),
    10,
    (i, k, n) => {
      let c = k % 2 ? P.barrelGroove : P.barrelCrest;
      // spiny crown: warm ochre spines show around the top
      c = mixC(c, P.barrelSpine, i === n - 1 && k % 2 === 0 ? 0.55 : 0);
      return mixC(P.cBase, c, 0.4 + 0.6 * (i / (n - 1)));
    },
    { rib: 0.16, apex: 0.08, apexColor: P.barrelSpine }
  );
  const g = B.geometry();
  const fl = [];
  for (let j = 0; j < 4; j++) {
    const a = (j / 4) * TAU + 0.4;
    fl.push(tetraPiece(0.075, '#ffffff', [Math.cos(a) * 0.15, 0.86, Math.sin(a) * 0.15]));
  }
  for (const f of fl) {
    const cl = f.attributes.color;
    for (let i = 0; i < cl.count; i++) cl.setXYZ(i, P.yellowFlower[0], P.yellowFlower[1], P.yellowFlower[2]);
  }
  return merge([g, ...fl]);
}

// pads: [x, y, z, yaw, roll, size]
const PEAR_PADS = [
  [0, 0.36, 0, 0, 0.05, 1],
  [0.28, 0.32, 0.12, 0.8, 0.45, 0.9],
  [0.06, 0.98, 0.02, 0.2, -0.3, 0.85],
  [0.52, 0.86, 0.2, 0.9, 0.55, 0.75],
  [-0.28, 0.82, -0.06, -0.3, -0.7, 0.75],
];
function pearGeometry() {
  const parts = [];
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (const [x, y, z, yaw, roll, s] of PEAR_PADS) {
    const g = paint(new THREE.IcosahedronGeometry(1, 0), '#ffffff');
    spherifyNormals(g, new THREE.Vector3(), 0.85);
    const p = g.attributes.position;
    const cl = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      // lighter rim on top of the pad, darker toward the joint
      const c = mixC(P.padDark, mixC(P.pad, P.padLight, smoothstep(0.3, 1, p.getY(i))), smoothstep(-1, 0.1, p.getY(i)));
      cl.setXYZ(i, c[0], c[1], c[2]);
    }
    e.set(0, yaw, roll);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(0.3 * s, 0.38 * s, 0.075 * s));
    g.applyMatrix4(m);
    parts.push(g);
  }
  const tunas = [
    [[0.0, 1.33, 0.02], P.tuna],
    [[0.16, 1.28, 0.02], P.tuna],
    [[0.66, 1.12, 0.26], P.tuna],
    [[-0.44, 1.07, -0.08], P.yellowFlower],
  ];
  for (const [c, col] of tunas) {
    const g = tetraPiece(0.065, '#ffffff', c);
    const cl = g.attributes.color;
    for (let i = 0; i < cl.count; i++) cl.setXYZ(i, col[0], col[1], col[2]);
    parts.push(g);
  }
  return merge(parts);
}

// ---------------------------------------------------------------------------------------------
// Placement (scatter / sampleField / normalAt only).
// ---------------------------------------------------------------------------------------------
function sector(ang, c, w) {
  const d = Math.atan2(Math.sin(ang - c), Math.cos(ang - c));
  return Math.exp(-(d * d) / (2 * w * w));
}

const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();
// Yaw about local up, then tilt the up axis to `dir` (x, y, z).
function orient(it, dir, yaw) {
  _n.set(dir[0], dir[1], dir[2]).normalize();
  _q.setFromUnitVectors(_up, _n);
  _qy.setFromAxisAngle(_up, yaw);
  _q.multiply(_qy);
  _e.setFromQuaternion(_q, 'XYZ');
  it.tx = _e.x;
  it.r = _e.y;
  it.tz = _e.z;
  return it;
}
function groundTilt(nrm, follow, lean, rand) {
  return [nrm[0] * follow + (rand() - 0.5) * lean, 1, nrm[2] * follow + (rand() - 0.5) * lean];
}

// Coconut palms: groves along the tropical shore (and the odd one on eastern beaches), leaning seaward.
export function placePalms(N) {
  if (N <= 0) return [];
  const rand = mulberry32(7102);
  const pts = scatter({
    count: N,
    seed: 7101,
    tries: 80,
    accept: (b, x, z) => {
      if (b.under > 0.05 || b.h < 0.45 || b.slope > 0.38 || b.d < 0.5 || b.d > 0.985) return 0;
      const ang = shapeAt(x, z).ang;
      const tw = sector(ang, BIOME_ANGLE.tropical, 0.55);
      const grove = smoothstep(0.36, 0.62, clump(x, z, 0.06, 41));
      const shore = smoothstep(0.58, 0.8, b.d);
      const east = 0.1 * b.beach * sector(ang, BIOME_ANGLE.meadow, 0.6);
      return Math.min(1, (tw * shore * 1.5 + east) * (0.2 + 0.8 * grove));
    },
  });
  const out = [];
  for (const p of pts) {
    const nrm = normalAt(p.x, p.z, 1.5);
    const rl = Math.hypot(p.x, p.z) || 1;
    let sx = p.x / rl + nrm[0] * 3;
    let sz = p.z / rl + nrm[2] * 3;
    const sl = Math.hypot(sx, sz) || 1;
    sx /= sl;
    sz /= sl;
    const lean = 0.05 + rand() * 0.16 + smoothstep(0.82, 0.97, p.b.d) * 0.14;
    const it = {
      x: p.x,
      y: p.b.h - 0.12,
      z: p.z,
      s: 0.78 + rand() * 0.5,
      sx: 0.92 + rand() * 0.16,
      sy: 0.86 + rand() * 0.26,
      sz: 0.92 + rand() * 0.16,
      j: rand(),
      dry: p.b.beach,
    };
    out.push(orient(it, [sx * Math.sin(lean), Math.cos(lean), sz * Math.sin(lean)], Math.atan2(-sz, sx) + (rand() - 0.5) * 0.5));
  }
  return out;
}

// Low palms: bushy fountains in the tropical back-shore and under the tall palms.
export function placeLowPalms(N) {
  if (N <= 0) return [];
  const rand = mulberry32(7202);
  const pts = scatter({
    count: N,
    seed: 7201,
    tries: 60,
    accept: (b, x, z) => {
      if (b.under > 0.05 || b.h < 0.5 || b.slope > 0.45 || b.d < 0.4 || b.d > 0.97) return 0;
      const tw = sector(shapeAt(x, z).ang, BIOME_ANGLE.tropical, 0.55);
      const patch = smoothstep(0.38, 0.64, clump(x, z, 0.07, 43));
      return Math.min(1, tw * smoothstep(0.42, 0.68, b.d) * (0.15 + 0.85 * patch) * 1.4);
    },
  });
  return pts.map((p) => {
    const nrm = normalAt(p.x, p.z, 1.5);
    const it = { x: p.x, y: p.b.h - 0.08, z: p.z, s: 0.7 + rand() * 0.65, sy: 0.85 + rand() * 0.3, j: rand(), dry: p.b.beach * 0.6 };
    return orient(it, groundTilt(nrm, 0.4, 0.12, rand), rand() * TAU);
  });
}

// Banana mats: a mother plant with 0-3 suckers, inland in the tropics; about half the mothers fruit.
export function placeBananas(N) {
  if (N <= 0) return { plants: [], bunches: [] };
  const rand = mulberry32(7302);
  const centres = scatter({
    count: Math.ceil(N / 2.4),
    seed: 7301,
    tries: 90,
    accept: (b, x, z) => {
      if (b.under > 0.02 || b.h < 0.8 || b.slope > 0.35 || b.d > 0.9) return 0;
      const jungle = smoothstep(0.4, 0.62, clump(x, z, 0.05, 47));
      return smoothstep(0.22, 0.55, b.tropical) * (0.12 + 0.88 * jungle);
    },
  });
  const plants = [];
  const bunches = [];
  for (const c of centres) {
    if (plants.length >= N) break;
    const kids = 1 + Math.floor(rand() * 3.6);
    for (let k = 0; k < kids && plants.length < N; k++) {
      const ang = rand() * TAU;
      const dist = k === 0 ? 0 : 0.9 + rand() * 1.2;
      const x = c.x + Math.cos(ang) * dist;
      const z = c.z + Math.sin(ang) * dist;
      const f = k === 0 ? c.b : sampleField(x, z);
      if (k > 0 && (f.under > 0.05 || f.h < 0.6 || f.slope > 0.45)) continue;
      const s = k === 0 ? 1.0 + rand() * 0.3 : 0.5 + rand() * 0.42;
      const it = { x, y: f.h - 0.05, z, s, sy: 0.9 + rand() * 0.25, j: rand(), dry: 0 };
      orient(it, [(rand() - 0.5) * 0.12, 1, (rand() - 0.5) * 0.12], rand() * TAU);
      plants.push(it);
      if (k === 0 && rand() < 0.6) bunches.push(it);
    }
  }
  return { plants, bunches };
}

// Monstera clumps on the jungle floor, gathered in the same patches as the bananas.
export function placeMonstera(N) {
  if (N <= 0) return [];
  const rand = mulberry32(7402);
  const pts = scatter({
    count: N,
    seed: 7401,
    tries: 60,
    accept: (b, x, z) => {
      if (b.under > 0.02 || b.h < 0.7 || b.slope > 0.4 || b.d > 0.92) return 0;
      const jungle = smoothstep(0.4, 0.6, clump(x, z, 0.05, 47));
      return smoothstep(0.2, 0.5, b.tropical) * (0.1 + 0.9 * jungle);
    },
  });
  return pts.map((p) => {
    const nrm = normalAt(p.x, p.z, 1.2);
    const it = { x: p.x, y: p.b.h - 0.03, z: p.z, s: 0.8 + rand() * 0.9, j: rand(), dry: 0 };
    return orient(it, groundTilt(nrm, 0.6, 0.1, rand), rand() * TAU);
  });
}

// Cacti in the west desert: saguaros spread out on the flats, barrel + prickly pear in patches.
export function placeCacti(N) {
  if (N <= 0) return { sagA: [], sagB: [], barrel: [], pear: [] };
  const rand = mulberry32(7502);
  const nSag = Math.round(N * 0.34);
  const nBar = Math.round(N * 0.33);
  const nPear = N - nSag - nBar;
  const base = (b, x, z) => {
    if (b.under > 0.01 || b.h < 1.1 || b.slope > 0.3 || b.d > 0.9 || b.rock > 0.3) return 0;
    return smoothstep(0.25, 0.6, b.desert) * smoothstep(0.3, 0.55, sector(shapeAt(x, z).ang, BIOME_ANGLE.desert, 0.5));
  };
  const sag = scatter({ count: nSag, seed: 7501, tries: 80, accept: (b, x, z) => base(b, x, z) * 0.85 });
  const bar = scatter({
    count: nBar,
    seed: 7503,
    tries: 80,
    accept: (b, x, z) => base(b, x, z) * (0.1 + 0.9 * smoothstep(0.4, 0.62, clump(x, z, 0.08, 53))),
  });
  const pear = scatter({
    count: nPear,
    seed: 7504,
    tries: 80,
    accept: (b, x, z) => base(b, x, z) * (0.1 + 0.9 * smoothstep(0.4, 0.62, clump(x, z, 0.08, 57))),
  });
  const sagA = [];
  const sagB = [];
  for (const p of sag) {
    const young = rand() < 0.3;
    const it = { x: p.x, y: p.b.h - 0.05, z: p.z, s: young ? 0.6 + rand() * 0.2 : 0.95 + rand() * 0.45, sx: 0.9 + rand() * 0.2, sz: 0.9 + rand() * 0.2, j: rand(), dry: 0 };
    orient(it, [(rand() - 0.5) * 0.06, 1, (rand() - 0.5) * 0.06], rand() * TAU);
    (young || rand() < 0.45 ? sagA : sagB).push(it);
  }
  const ground = (p, sMin, sRange) => {
    const nrm = normalAt(p.x, p.z, 1.0);
    const it = { x: p.x, y: p.b.h - 0.04, z: p.z, s: sMin + rand() * sRange, j: rand(), dry: 0 };
    return orient(it, groundTilt(nrm, 0.5, 0.1, rand), rand() * TAU);
  };
  return {
    sagA,
    sagB,
    barrel: bar.map((p) => ground(p, 0.6, 0.9)),
    pear: pear.map((p) => ground(p, 0.7, 0.8)),
  };
}

// Per-instance tint: +-8% warm/cool hue drift and value, sun-bleached yellowing on the beach.
const _col = new THREE.Color();
function tint(it) {
  const j = it.j;
  const k = j - 0.5;
  const v = 0.92 + ((j * 7.31) % 1) * 0.16;
  const dry = (it.dry || 0) * 0.12;
  _col.setRGB((1 + k * 0.14 + dry) * v, (1 + (((j * 3.17) % 1) - 0.5) * 0.06) * v, (1 - k * 0.14 - dry * 1.5) * v);
  return _col;
}

// ---------------------------------------------------------------------------------------------
// Build everything.
// ---------------------------------------------------------------------------------------------
export function buildTropical(Q) {
  const DS = THREE.DoubleSide;
  const mats = {
    palmTrunk: cozyMaterial({ sway: 0.012, wrap: 0.45, rim: 0.12, aoScale: 0.09 }),
    palmFrond: cozyMaterial({ sway: 0.012, wrap: 0.8, rim: 0.4, aoScale: 0.09, side: DS }),
    lowPalm: cozyMaterial({ sway: 0.05, wrap: 0.8, rim: 0.35, aoScale: 0.35, side: DS }),
    bananaStem: cozyMaterial({ sway: 0.025, wrap: 0.55, rim: 0.2, aoScale: 0.2 }),
    bananaLeaf: cozyMaterial({ sway: 0.025, wrap: 0.8, rim: 0.4, aoScale: 0.2, side: DS }),
    monstera: cozyMaterial({ sway: 0.06, wrap: 0.75, rim: 0.3, aoScale: 0.45, side: DS }),
    cactus: cozyMaterial({ sway: 0, wrap: 0.5, rim: 0.2, aoScale: 0.25 }),
  };
  const palms = placePalms(Q.palms | 0);
  const lowPalms = placeLowPalms(Q.lowPalms | 0);
  const ban = placeBananas(Q.banana | 0);
  const mon = placeMonstera(Q.monstera | 0);
  const cac = placeCacti(Q.cactus | 0);

  const parts = [
    { name: 'palmTrunk', geo: palmTrunkGeometry(), mat: mats.palmTrunk, items: palms },
    { name: 'palmFronds', geo: palmFrondGeometry(), mat: mats.palmFrond, items: palms },
    { name: 'lowPalm', geo: lowPalmGeometry(), mat: mats.lowPalm, items: lowPalms },
    { name: 'bananaStem', geo: bananaStemGeometry(), mat: mats.bananaStem, items: ban.plants },
    { name: 'bananaLeaves', geo: bananaLeafGeometry(), mat: mats.bananaLeaf, items: ban.plants },
    { name: 'bananaBunch', geo: bananaBunchGeometry(), mat: mats.bananaStem, items: ban.bunches },
    { name: 'monstera', geo: monsteraGeometry(), mat: mats.monstera, items: mon },
    { name: 'saguaroA', geo: saguaroGeometry(SAGUARO_A), mat: mats.cactus, items: cac.sagA },
    { name: 'saguaroB', geo: saguaroGeometry(SAGUARO_B), mat: mats.cactus, items: cac.sagB },
    { name: 'barrel', geo: barrelGeometry(), mat: mats.cactus, items: cac.barrel },
    { name: 'pear', geo: pearGeometry(), mat: mats.cactus, items: cac.pear },
  ];
  let draws = 0;
  let tris = 0;
  const meshes = [];
  for (const p of parts) {
    if (!p.geo.boundingSphere) p.geo.computeBoundingSphere();
    if (p.items.length === 0) continue;
    const mesh = makeInstanced(p.geo, p.mat, p.items, tint);
    mesh.name = 'tropical-' + p.name;
    meshes.push(mesh);
    draws += 1;
    tris += triangles(p.geo) * p.items.length;
  }
  return { parts, mats, meshes, draws, tris };
}

export default function Tropical({ Q, tier }) {
  const built = useMemo(() => buildTropical(Q), [Q.palms, Q.lowPalms, Q.banana, Q.monstera, Q.cactus, tier]);

  useEffect(() => {
    report('tropical', { draws: built.draws, triangles: built.tris, programs: 2 });
  }, [built]);
  useEffect(
    () => () => {
      for (const p of built.parts) p.geo.dispose();
      for (const k of Object.keys(built.mats)) built.mats[k].dispose();
      for (const m of built.meshes) m.dispose();
    },
    [built]
  );

  return h('group', { name: 'tropical' }, ...built.meshes.map((m) => h('primitive', { key: m.name, object: m })));
}
