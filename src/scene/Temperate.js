// Temperate trees: Scots-pine-like conifers, oaks, silver birch and fluffy bushes.
// Painted-mass approach (Kazuo Oga style): each plant is a few soft lumps with spherified normals,
// vertex-colour light/dark masses, and per-instance colour + size jitter. One InstancedMesh per part
// per species, all on the shared cozyMaterial program.
//
// References studied (shape, bark, growth habit, painting):
//   Scots pine habit + orange upper bark: https://en.wikipedia.org/wiki/Pinus_sylvestris
//   https://www.forestryengland.uk/article/scots-pine , https://dendro.cnre.vt.edu/dendrology/syllabus/factsheet.cfm?ID=112
//   English oak spreading uneven dome, massive low limbs: https://en.wikipedia.org/wiki/Quercus_robur
//   Silver birch white bark, dark base, drooping light canopy:
//   https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/silver-birch
//   Woodland edge = clumps of shrubs, birch, lone oaks, density falling away from the wood:
//   https://www.gov.uk/guidance/edge-design-for-woodland-integration-resilience-and-biodiversity
//   Oga background painting: https://animationobsessive.substack.com/p/what-kazuo-oga-thinks-about-when
//   Anime foliage = clumps + transferred (spherified) normals: https://trungduyng.substack.com/p/tutorial-blender-anime-foliage-pipeline
import { createElement as h, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { scatter, sampleField, clump } from '../world/island.js';
import { smoothstep, mulberry32, valueNoise, clamp } from '../world/noise.js';
import { cozyMaterial } from '../materials/shading.js';
import { merge, makeInstanced, spherifyNormals, triangles, report } from '../lib/geo.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Colour helpers. Hex values are sRGB; vertex colours must be linear (same as THREE.Color does).
// ---------------------------------------------------------------------------------------------
function lin(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function hex(s) {
  const v = parseInt(s.slice(1), 16);
  return [lin(((v >> 16) & 255) / 255), lin(((v >> 8) & 255) / 255), lin((v & 255) / 255)];
}
function mixC(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function mulC(a, k) {
  return [a[0] * k, a[1] * k, a[2] * k];
}
function ramp3(lo, mid, hi, t) {
  return t < 0.5 ? mixC(lo, mid, t * 2) : mixC(mid, hi, (t - 0.5) * 2);
}

const PAL = {
  pineTip: hex('#5f9d66'),
  pineMid: hex('#3e7c57'),
  pineRim: hex('#2c654d'),
  pineUnder: hex('#1c4537'),
  pineBarkLow: hex('#5b3d2e'),
  pineBarkHigh: hex('#c2703f'),
  oakTop: hex('#a2c853'),
  oakMid: hex('#67a03f'),
  oakLow: hex('#3a6c36'),
  oakBarkLow: hex('#4a3d32'),
  oakBark: hex('#76634f'),
  birchTop: hex('#d2e27c'),
  birchMid: hex('#a5c853'),
  birchLow: hex('#6e9c41'),
  birchWhite: hex('#eeeadf'),
  birchGrey: hex('#8c867c'),
  birchBase: hex('#3a3431'),
  birchMark: hex('#2f2a27'),
  bushTop: hex('#89ba4d'),
  bushMid: hex('#5c963f'),
  bushLow: hex('#2f6035'),
  flowerPink: hex('#f4a3c1'),
  flowerWhite: hex('#fff4e3'),
};

// ---------------------------------------------------------------------------------------------
// Pure geometry: non-indexed triangle soup with position, normal, colour (same layout as paint()).
// A vertex is [x, y, z, nx, ny, nz, r, g, b]. tri() orients each face to agree with its normals.
// ---------------------------------------------------------------------------------------------
function newPart() {
  return { p: [], n: [], c: [] };
}
function pushV(P, v, col) {
  P.p.push(v[0], v[1], v[2]);
  P.n.push(v[3], v[4], v[5]);
  const c = col || [v[6], v[7], v[8]];
  P.c.push(c[0], c[1], c[2]);
}
function tri(P, A, B, C, col) {
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
  const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
  const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
  const d = fx * (A[3] + B[3] + C[3]) + fy * (A[4] + B[4] + C[4]) + fz * (A[5] + B[5] + C[5]);
  if (d < 0) {
    const t = B;
    B = C;
    C = t;
  }
  pushV(P, A, col);
  pushV(P, B, col);
  pushV(P, C, col);
}
function norm3(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
function triCount(P) {
  return P.p.length / 9;
}

// Tube along a path of ring centres: pts [{ x, y, z, r, col }]. faceCol(band, k, half) -> colour | null.
function tube(P, pts, seg, faceCol) {
  const rings = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const d = norm3(b.x - a.x, b.y - a.y, b.z - a.z);
    const ref = Math.abs(d[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    // u = d x ref, v = u x d
    const u = norm3(d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]);
    const v = [u[1] * d[2] - u[2] * d[1], u[2] * d[0] - u[0] * d[2], u[0] * d[1] - u[1] * d[0]];
    const q = pts[i];
    const ring = [];
    for (let k = 0; k < seg; k++) {
      const ang = (k / seg) * TAU;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = u[0] * ca + v[0] * sa, ny = u[1] * ca + v[1] * sa, nz = u[2] * ca + v[2] * sa;
      ring.push([q.x + nx * q.r, q.y + ny * q.r, q.z + nz * q.r, nx, ny, nz, q.col[0], q.col[1], q.col[2]]);
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      tri(P, A[k], A[k1], B[k], faceCol ? faceCol(i, k, 0) : null);
      tri(P, A[k1], B[k1], B[k], faceCol ? faceCol(i, k, 1) : null);
    }
  }
}

// Vertical lathe (top -> bottom). A ring with r = 0 is a single fan point.
// ring: { y, r, col, j (radius jitter), dy (height jitter) }. nrm(x, y, z) -> unit normal.
function lathe(P, rings, seg, phase, rand, nrm, mottle) {
  const R = rings.map((ring) => {
    const mk = (x, y, z) => {
      const n = nrm(x, y, z);
      const m = 1 + mottle * (rand() * 2 - 1);
      return [x, y, z, n[0], n[1], n[2], ring.col[0] * m, ring.col[1] * m, ring.col[2] * m];
    };
    if (ring.r === 0) return { apex: mk(0, ring.y, 0) };
    const pts = [];
    for (let k = 0; k < seg; k++) {
      const a = phase + (k / seg) * TAU;
      const rr = ring.r * (1 + (ring.j || 0) * (rand() * 2 - 1));
      const yy = ring.y + (ring.dy || 0) * (rand() * 2 - 1);
      pts.push(mk(Math.cos(a) * rr, yy, Math.sin(a) * rr));
    }
    return { pts };
  });
  for (let i = 0; i < R.length - 1; i++) {
    const A = R[i], B = R[i + 1];
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      if (A.apex) tri(P, A.apex, B.pts[k1], B.pts[k]);
      else if (B.apex) tri(P, A.pts[k], A.pts[k1], B.apex);
      else {
        tri(P, A.pts[k], A.pts[k1], B.pts[k]);
        tri(P, A.pts[k1], B.pts[k1], B.pts[k]);
      }
    }
  }
}

// Icosphere faces as unit-vector triples. detail 0 = 20 faces, 1 = 80.
const ICO_CACHE = {};
function icoFaces(detail) {
  if (ICO_CACHE[detail]) return ICO_CACHE[detail];
  const t = (1 + Math.sqrt(5)) / 2;
  const V = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => norm3(v[0], v[1], v[2]));
  const F = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];
  let faces = [];
  for (let i = 0; i < F.length; i += 3) faces.push([V[F[i]], V[F[i + 1]], V[F[i + 2]]]);
  for (let d = 0; d < detail; d++) {
    const next = [];
    const mid = (a, b) => norm3(a[0] + b[0], a[1] + b[1], a[2] + b[2]);
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    faces = next;
  }
  ICO_CACHE[detail] = faces;
  return faces;
}

// Squashed, jittered icosphere lump. o: { c, s, detail, seed, jit, droop, color(dir, worldY) }.
function lump(P, o) {
  const faces = icoFaces(o.detail);
  const vert = (d) => {
    const k = 1 + o.jit * (valueNoise(d[0] * 2.3 + d[1] * 1.7 + o.seed * 7.13, d[2] * 2.3 - d[1] * 1.1 + o.seed * 3.7, 13) * 2 - 1);
    let dy = d[1];
    let spread = 1;
    if (dy < 0 && o.droop) {
      dy *= 1 + o.droop;
      spread = 1 + o.droop * 0.3 * -d[1];
    }
    const x = o.c[0] + d[0] * o.s[0] * k * spread;
    const y = o.c[1] + dy * o.s[1] * k;
    const z = o.c[2] + d[2] * o.s[2] * k * spread;
    const n = norm3(d[0] / o.s[0], d[1] / o.s[1], d[2] / o.s[2]);
    const col = o.color(d, y);
    return [x, y, z, n[0], n[1], n[2], col[0], col[1], col[2]];
  };
  for (const f of faces) tri(P, vert(f[0]), vert(f[1]), vert(f[2]));
}

// Small octahedron blossom: 8 triangles, normals biased up so it reads as a bright dab of paint.
function blossom(P, c, r, col) {
  const D = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const V = D.map((d) => {
    const n = norm3(d[0] * 0.6, d[1] * 0.6 + 0.8, d[2] * 0.6);
    return [c[0] + d[0] * r, c[1] + d[1] * r * 0.8, c[2] + d[2] * r, n[0], n[1], n[2], col[0], col[1], col[2]];
  });
  const F = [[2, 0, 4], [2, 4, 1], [2, 1, 5], [2, 5, 0], [3, 4, 0], [3, 1, 4], [3, 5, 1], [3, 0, 5]];
  for (const f of F) tri(P, V[f[0]], V[f[1]], V[f[2]]);
}

// Painterly mottling that is identical for vertices shared between faces (no speckle).
function mottle(d, seed, amt) {
  return 1 + amt * (valueNoise(d[0] * 1.9 + seed * 5.1, d[2] * 1.9 + d[1] * 1.3 - seed, 29) * 2 - 1);
}

// ---------------------------------------------------------------------------------------------
// Species models (model units = metres at instance scale 1). Each returns pieces:
// { P, center: [x, y, z] | null, amount } so the THREE stage can spherify then merge.
// ---------------------------------------------------------------------------------------------

// Pine: straight red-brown trunk turning orange up high, 4 drooping tiers of dark blue-green clumps,
// narrow top. Scots pine bark: grey-brown low, orange-red in the upper crown.
function pineModel(detail) {
  const rand = mulberry32(4101);
  const seg = detail ? 8 : 7;
  const trunk = newPart();
  tube(trunk, [
    { x: 0, y: -1.6, z: 0, r: 0.34, col: PAL.pineBarkLow },
    { x: 0, y: 10.6, z: 0, r: 0.07, col: PAL.pineBarkHigh },
  ], detail ? 7 : 6);

  const tiers = [
    { rim: 2.3, R: 3.0, apex: 6.1 },
    { rim: 4.3, R: 2.45, apex: 7.9 },
    { rim: 6.3, R: 1.85, apex: 9.7 },
    { rim: 8.2, R: 1.2, apex: 11.8 },
  ];
  const leaves = [];
  tiers.forEach((t, i) => {
    const P = newPart();
    const H = t.apex - t.rim;
    const cy = t.rim + H * 0.35;
    const lift = i * 0.09;
    const nrm = (x, y, z) => norm3(x, (y - cy) * 0.9 + 0.35, z);
    lathe(P, [
      { y: t.apex, r: 0, col: mixC(PAL.pineTip, PAL.pineTip, 0) },
      { y: t.apex - H * 0.5, r: t.R * 0.6, j: 0.14, dy: 0.12, col: mixC(PAL.pineMid, PAL.pineTip, 0.25 + lift) },
      { y: t.rim, r: t.R, j: 0.2, dy: 0.3, col: mixC(PAL.pineRim, PAL.pineMid, lift) },
      { y: t.rim + H * 0.22, r: 0, col: PAL.pineUnder },
    ], seg, i * 1.7 + rand() * 0.6, rand, nrm, 0.05);
    leaves.push({ P, center: [0, cy, 0], amount: 0.35 });
  });
  return { trunk: [{ P: trunk, center: null }], leaves };
}

// Oak: thick short trunk with root flare, two massive low limbs, wide lumpy dome of clumps.
function oakModel(detail) {
  const trunk = newPart();
  tube(trunk, [
    { x: 0, y: -1.6, z: 0, r: 0.85, col: PAL.oakBarkLow },
    { x: 0, y: -0.2, z: 0, r: 0.72, col: PAL.oakBarkLow },
    { x: 0.1, y: 3.0, z: 0.05, r: 0.48, col: PAL.oakBark },
  ], 6);
  const limbs = newPart();
  tube(limbs, [
    { x: 0.05, y: 2.6, z: 0, r: 0.34, col: PAL.oakBark },
    { x: 1.9, y: 5.0, z: 0.7, r: 0.14, col: PAL.oakBark },
  ], 5);
  tube(limbs, [
    { x: 0, y: 2.8, z: 0, r: 0.32, col: PAL.oakBark },
    { x: -1.6, y: 5.2, z: -0.9, r: 0.13, col: PAL.oakBark },
  ], 5);

  const yLo = 3.4, yHi = 7.9;
  const color = (seed) => (d, y) => mulC(ramp3(PAL.oakLow, PAL.oakMid, PAL.oakTop, smoothstep(yLo, yHi, y + d[0] * 0.25)), mottle(d, seed, 0.07));
  const canopy = newPart();
  lump(canopy, { c: [0, 5.6, 0], s: [3.0, 2.2, 2.9], detail: 1, seed: 1, jit: 0.1, color: color(1) });
  const L = detail ? 6 : 4;
  const rand = mulberry32(5203);
  for (let i = 0; i < L; i++) {
    const a = (i / L) * TAU + 0.4 + (rand() - 0.5) * 0.5;
    const rad = 2.35 + rand() * 0.35;
    const sz = 1.55 + rand() * 0.4;
    lump(canopy, {
      c: [Math.cos(a) * rad, 5.0 + (i % 2) * 0.9 + rand() * 0.3, Math.sin(a) * rad],
      s: [sz, sz * 0.82, sz],
      detail: 0,
      seed: 10 + i,
      jit: 0.14,
      color: color(10 + i),
    });
  }
  return {
    trunk: [{ P: trunk, center: null }, { P: limbs, center: null }],
    canopy: [{ P: canopy, center: [0, 5.3, 0], amount: 0.6 }],
  };
}

// Silver birch: slim white trunk, blackish rugged base, crisp dark horizontal marks (per-face colour),
// gentle lean, light airy yellow-green crown of separate drooping clumps.
function birchModel(detail) {
  const rand = mulberry32(6301);
  const top = 9.4;
  const bend = (y) => Math.pow(Math.max(y, 0) / top, 2);
  const ys = [-1.5, 0.6, 1.8, 2.06, 3.5, 3.74, 5.2, 5.42, top];
  const pts = ys.map((y, i) => ({
    x: 0.4 * bend(y),
    y,
    z: 0.12 * bend(y),
    r: y <= 0 ? 0.22 : 0.19 - 0.13 * (y / top),
    col: i === 0 ? PAL.birchBase : i === 1 ? PAL.birchGrey : PAL.birchWhite,
  }));
  const markBands = { 2: 1, 4: 1, 6: 1 };
  const marks = {};
  const faceCol = (band, k, half) => {
    if (!markBands[band]) return null;
    const key = band * 100 + k * 2 + half;
    if (marks[key] === undefined) marks[key] = rand() < 0.62;
    return marks[key] ? PAL.birchMark : null;
  };
  const trunk = newPart();
  tube(trunk, pts, detail ? 6 : 5, faceCol);

  const canopy = newPart();
  const L = detail ? 5 : 4;
  for (let i = 0; i < L; i++) {
    const f = i / (L - 1);
    const y = 5.3 + f * 4.4;
    const a = i * 2.4 + 0.5;
    const off = (1 - f) * 0.9 + 0.25;
    const sxz = 1.45 - 0.35 * f;
    lump(canopy, {
      c: [0.4 * bend(y) + Math.cos(a) * off, y, 0.12 * bend(y) + Math.sin(a) * off],
      s: [sxz, sxz * 1.3, sxz],
      detail: 0,
      seed: 30 + i,
      jit: 0.12,
      droop: 0.35,
      color: (d, wy) => mulC(ramp3(PAL.birchLow, PAL.birchMid, PAL.birchTop, smoothstep(4.0, 11.0, wy + d[1] * 0.6)), mottle(d, 30 + i, 0.06)),
    });
  }
  return {
    trunk: [{ P: trunk, center: null }],
    canopy: [{ P: canopy, center: [0.3, 7.6, 0.05], amount: 0.45 }],
  };
}

// Bushes: clusters of squashed lumps. Flowering variant carries pink/white blossoms (dog-rose / hawthorn feel).
function bushColor(seed) {
  return (d, y) => mulC(ramp3(PAL.bushLow, PAL.bushMid, PAL.bushTop, smoothstep(-0.1, 1.25, y + d[0] * 0.1)), mottle(d, seed, 0.08));
}
function bushPlainModel() {
  const P = newPart();
  lump(P, { c: [0, 0.55, 0], s: [0.95, 0.72, 0.95], detail: 0, seed: 50, jit: 0.13, color: bushColor(50) });
  const sizes = [0.72, 0.62, 0.66];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.3;
    const s = sizes[i];
    lump(P, { c: [Math.cos(a) * 0.78, 0.38, Math.sin(a) * 0.78], s: [s, s * 0.75, s], detail: 0, seed: 51 + i, jit: 0.15, color: bushColor(51 + i) });
  }
  return [{ P, center: [0, 0.3, 0], amount: 0.7 }];
}
function bushFlowerModel() {
  const P = newPart();
  const lumps = [
    { c: [0, 0.5, 0], s: [0.85, 0.66, 0.85] },
    { c: [Math.cos(0.4) * 0.7, 0.35, Math.sin(0.4) * 0.7], s: [0.65, 0.49, 0.65] },
    { c: [Math.cos(3.0) * 0.7, 0.33, Math.sin(3.0) * 0.7], s: [0.58, 0.44, 0.58] },
  ];
  lumps.forEach((l, i) => lump(P, { c: l.c, s: l.s, detail: 0, seed: 60 + i, jit: 0.13, color: bushColor(60 + i) }));
  const F = newPart();
  const rand = mulberry32(7307);
  for (let i = 0; i < 5; i++) {
    const l = lumps[i % 3];
    const a = rand() * TAU;
    const up = 0.35 + rand() * 0.5;
    const d = norm3(Math.cos(a) * (1 - up), up, Math.sin(a) * (1 - up));
    const c = [l.c[0] + d[0] * l.s[0] * 0.97, l.c[1] + d[1] * l.s[1] * 0.97, l.c[2] + d[2] * l.s[2] * 0.97];
    blossom(F, c, 0.16, i % 5 < 3 ? PAL.flowerPink : PAL.flowerWhite);
  }
  return [{ P, center: [0, 0.3, 0], amount: 0.7 }, { P: F, center: null }];
}

function buildModels(detail) {
  const pine = pineModel(detail);
  const oak = oakModel(detail);
  const birch = birchModel(detail);
  return {
    pineTrunk: pine.trunk,
    pineLeaves: pine.leaves,
    oakTrunk: oak.trunk,
    oakCanopy: oak.canopy,
    birchTrunk: birch.trunk,
    birchCanopy: birch.canopy,
    bushPlain: bushPlainModel(),
    bushFlower: bushFlowerModel(),
  };
}

// ---------------------------------------------------------------------------------------------
// Placement: scatter() + sampleField() + clump(), greedy spacing on a shared grid.
// ---------------------------------------------------------------------------------------------
function makeGrid(cell) {
  const map = new Map();
  let maxR = 0;
  return {
    add(x, z, r) {
      const k = Math.floor(x / cell) + ',' + Math.floor(z / cell);
      let a = map.get(k);
      if (!a) map.set(k, (a = []));
      a.push(x, z, r);
      if (r > maxR) maxR = r;
    },
    free(x, z, r) {
      const reach = Math.ceil((r + maxR) / cell);
      const ix = Math.floor(x / cell), iz = Math.floor(z / cell);
      for (let j = iz - reach; j <= iz + reach; j++) {
        for (let i = ix - reach; i <= ix + reach; i++) {
          const a = map.get(i + ',' + j);
          if (!a) continue;
          for (let q = 0; q < a.length; q += 3) {
            const dx = a[q] - x, dz = a[q + 1] - z, rr = a[q + 2] + r;
            if (dx * dx + dz * dz < rr * rr) return false;
          }
        }
      }
      return true;
    },
  };
}

const BOUNDS = 165;

function landOK(b, beachMax, tropMax) {
  return b.h > 1.6 && b.under < 0.01 && b.beach < beachMax && b.slope < 0.7 && b.rock < 0.45 && b.desert < 0.3 && b.tropical < tropMax;
}

function pineAccept(b, x, z) {
  if (!landOK(b, 0.2, 0.35) || b.h > 46) return 0;
  const f = smoothstep(0.08, 0.28, b.forest);
  const alt = smoothstep(9, 14, b.h) * smoothstep(10, -30, z) * (1 - b.desert);
  const grove = smoothstep(0.33, 0.43, clump(x, z, 0.03, 11)); // clearings where the clump noise is low
  const steep = smoothstep(0.7, 0.5, b.slope);
  const tree = smoothstep(46, 38, b.h);
  return Math.min(1, Math.max(f, alt * 0.8)) * grove * steep * tree;
}
function oakEdgeAccept(b, x, z) {
  if (!landOK(b, 0.18, 0.4)) return 0;
  const f = b.forest;
  const margin = smoothstep(0.02, 0.1, f) * smoothstep(0.34, 0.16, f);
  const patch = 0.45 + 0.55 * smoothstep(0.4, 0.6, clump(x, z, 0.05, 21));
  return margin * patch * smoothstep(0.7, 0.45, b.slope);
}
// Open meadow: small oak groves plus hedgerow-style singles.
function oakMeadowAccept(b, x, z) {
  if (!landOK(b, 0.15, 0.35) || b.forest > 0.1) return 0;
  const grove = smoothstep(0.5, 0.62, clump(x, z, 0.045, 23));
  const single = 0.3 * smoothstep(0.28, 0.48, clump(x, z, 0.03, 25));
  return b.meadow * Math.max(grove, single) * smoothstep(0.6, 0.4, b.slope);
}
function oakHillAccept(b) {
  if (!landOK(b, 0.1, 0.3)) return 0;
  return b.meadow > 0.5 && b.slope < 0.4 && b.forest < 0.1 ? 1 : 0;
}
function birchAccept(b, x, z) {
  if (!landOK(b, 0.18, 0.35)) return 0;
  const f = b.forest;
  const edge = smoothstep(0.02, 0.1, f) * smoothstep(0.5, 0.25, f);
  const glade = 0.5 * b.meadow * smoothstep(0.58, 0.66, clump(x, z, 0.05, 39)); // little copses out in the meadow
  const copse = smoothstep(0.44, 0.56, clump(x, z, 0.08, 37));
  return Math.max(edge, glade) * copse * smoothstep(0.7, 0.5, b.slope);
}
function bushAccept(b, x, z) {
  if (!(b.h > 1.1 && b.under < 0.01 && b.slope < 0.7 && b.rock < 0.45 && b.desert < 0.3 && b.beach < 0.5)) return 0;
  const f = b.forest;
  const edge = smoothstep(0.02, 0.1, f) * smoothstep(0.45, 0.2, f);
  const under = 0.35 * smoothstep(0.15, 0.3, f);
  const shore = smoothstep(0.03, 0.12, b.beach) * smoothstep(0.5, 0.3, b.beach) * 0.9;
  const meadow = 0.07 * b.meadow;
  const notTrop = 1 - smoothstep(0.25, 0.45, b.tropical);
  const patch = 0.5 + 0.5 * smoothstep(0.4, 0.6, clump(x, z, 0.06, 41));
  return Math.max(edge, under, shore, meadow) * notTrop * patch * smoothstep(0.7, 0.5, b.slope);
}

function sink(b, base) {
  return b.h - base - b.slope * 1.6;
}

// Returns instance items for every mesh. Pure apart from the shared island field.
function placeAll(Q) {
  const canopy = makeGrid(4);
  const trunks = makeGrid(4);
  const out = { pine: [], oak: [], birch: [], bushPlain: [], bushFlower: [] };

  // Pines first: dense forest and high northern ground, with clearings.
  const pc = scatter({ count: Math.ceil(Q.pine * 2.6), seed: 101, tries: 40, bounds: BOUNDS, accept: pineAccept });
  for (const c of pc) {
    if (out.pine.length >= Q.pine) break;
    const b = c.b;
    const s = (0.66 + c.rnd * 0.36) * (1 - 0.3 * smoothstep(22, 44, b.h));
    const r = 1.4 * s;
    if (!canopy.free(c.x, c.z, r)) continue;
    canopy.add(c.x, c.z, r);
    trunks.add(c.x, c.z, 0.35 * s);
    const j = (c.rnd * 7.31) % 1;
    out.pine.push({
      x: c.x, y: sink(b, 0.15), z: c.z, r: c.r, s, sy: 0.92 + j * 0.2,
      tx: (j - 0.5) * 0.06, tz: (((c.rnd * 13.7) % 1) - 0.5) * 0.06,
      t: -0.15 - 0.55 * smoothstep(15, 40, b.h) + (j - 0.5) * 0.6, v: 0.9 + ((c.rnd * 5.3) % 1) * 0.16,
    });
  }

  // Landmark oaks: the highest meadow hilltops, far apart, big.
  const L = Math.max(2, Math.round(Q.oak * 0.06));
  const hill = scatter({ count: L * 12, seed: 202, tries: 30, bounds: BOUNDS, accept: oakHillAccept }).sort((a, b) => b.y - a.y);
  const lone = [];
  for (const c of hill) {
    if (lone.length >= L) break;
    if (lone.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 30)) continue;
    const s = 1.3 + c.rnd * 0.25;
    if (!canopy.free(c.x, c.z, 3.0 * s)) continue;
    canopy.add(c.x, c.z, 3.0 * s);
    trunks.add(c.x, c.z, 0.8 * s);
    lone.push(c);
    out.oak.push({ x: c.x, y: sink(c.b, 0.2), z: c.z, r: c.r, s, sy: 0.95 + c.rnd * 0.1, tx: 0, tz: 0, t: 0.35, v: 1.04 });
  }
  // Birch copses on the forest edge: close-packed little groups that lean.
  const bc = scatter({ count: Math.ceil(Q.birch * 3), seed: 304, tries: 50, bounds: BOUNDS, accept: birchAccept });
  for (const c of bc) {
    if (out.birch.length >= Q.birch) break;
    const b = c.b;
    const s = 0.68 + c.rnd * 0.34;
    const r = 0.85 * s;
    if (!canopy.free(c.x, c.z, r)) continue;
    canopy.add(c.x, c.z, r);
    trunks.add(c.x, c.z, 0.25 * s);
    const j = (c.rnd * 11.3) % 1;
    out.birch.push({
      x: c.x, y: sink(b, 0.1), z: c.z, r: c.r, s, sy: 0.9 + j * 0.25,
      tx: (j - 0.5) * 0.16, tz: (((c.rnd * 4.7) % 1) - 0.5) * 0.16,
      t: 0.25 + (j - 0.5) * 0.6, v: 0.94 + ((c.rnd * 7.9) % 1) * 0.12,
    });
  }

  // Margin oaks (about half), then meadow groves and singles; leftovers go back to the margin.
  const rest = Q.oak - out.oak.length;
  const marginC = scatter({ count: Math.ceil(rest * 2.5), seed: 203, tries: 50, bounds: BOUNDS, accept: oakEdgeAccept });
  const meadowC = scatter({ count: Math.ceil(rest * 4), seed: 207, tries: 50, bounds: BOUNDS, accept: oakMeadowAccept });
  const marginQuota = out.oak.length + Math.ceil(rest * 0.5);
  const addOak = (c) => {
    const b = c.b;
    const s = 0.72 + c.rnd * 0.34;
    const r = 2.6 * s;
    if (!canopy.free(c.x, c.z, r)) return;
    canopy.add(c.x, c.z, r);
    trunks.add(c.x, c.z, 0.8 * s);
    const j = (c.rnd * 9.17) % 1;
    out.oak.push({
      x: c.x, y: sink(b, 0.2), z: c.z, r: c.r, s, sy: 0.88 + j * 0.24,
      tx: (j - 0.5) * 0.07, tz: (((c.rnd * 3.3) % 1) - 0.5) * 0.07,
      t: 0.1 + 0.35 * b.meadow + (j - 0.5) * 0.6, v: 0.92 + ((c.rnd * 6.1) % 1) * 0.15,
    });
  };
  let mi = 0;
  for (; mi < marginC.length && out.oak.length < marginQuota; mi++) addOak(marginC[mi]);
  for (let k = 0; k < meadowC.length && out.oak.length < Q.oak; k++) addOak(meadowC[k]);
  for (; mi < marginC.length && out.oak.length < Q.oak; mi++) addOak(marginC[mi]);

  // Bushes: seeds from scatter, each grows a little cluster of 1-3 neighbours.
  const bushes = makeGrid(3);
  const N = Q.bushes;
  const seeds = scatter({ count: Math.ceil(N * 0.9), seed: 405, tries: 30, bounds: BOUNDS, accept: bushAccept });
  const rand = mulberry32(406);
  let total = 0;
  const tryBush = (x, z, b, s) => {
    const r = 0.75 * s;
    if (!trunks.free(x, z, r * 0.6) || !bushes.free(x, z, r * 0.7)) return false;
    bushes.add(x, z, r);
    const shore = smoothstep(0.03, 0.12, b.beach) * smoothstep(0.5, 0.3, b.beach);
    const pf = clamp(0.08 + 0.35 * b.meadow + 0.25 * shore - 0.25 * b.forest, 0.04, 0.55);
    const family = Math.floor(rand() * 3) - 1; // -1 cool blue-green, 0 mid, 1 warm yellow-green
    const item = {
      x, y: b.h - 0.1 - b.slope * 1.0, z, r: rand() * TAU, s, sy: 0.85 + rand() * 0.3,
      tx: (rand() - 0.5) * 0.12, tz: (rand() - 0.5) * 0.12,
      t: family * 0.75 + (rand() - 0.5) * 0.3, v: 0.9 + rand() * 0.16,
    };
    (rand() < pf ? out.bushFlower : out.bushPlain).push(item);
    total++;
    return true;
  };
  for (const c of seeds) {
    if (total >= N) break;
    const s0 = 0.6 + c.rnd * 0.5;
    if (!tryBush(c.x, c.z, c.b, s0)) continue;
    const extra = 1 + (rand() < 0.5 ? 1 : 0) + (rand() < 0.2 ? 1 : 0);
    for (let e = 0; e < extra && total < N; e++) {
      const a = rand() * TAU;
      const d = (1.0 + rand() * 0.8) * s0;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      const b = sampleField(x, z);
      if (!(b.h > 1.1 && b.under < 0.01 && b.slope < 0.7 && b.beach < 0.5 && b.rock < 0.45)) continue;
      tryBush(x, z, b, s0 * (0.65 + rand() * 0.35));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// THREE stage.
// ---------------------------------------------------------------------------------------------
function toGeometry(pieces) {
  const list = pieces.map((pc) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pc.P.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pc.P.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(pc.P.c, 3));
    if (pc.center) spherifyNormals(g, new THREE.Vector3(pc.center[0], pc.center[1], pc.center[2]), pc.amount);
    return g;
  });
  const g = merge(list);
  list.forEach((x) => x.dispose());
  return g;
}

const tint = new THREE.Color();
function instanceColor(it) {
  const t = it.t || 0;
  const v = it.v || 1;
  return tint.setRGB(v * (1 + 0.07 * t), v * (1 + 0.02 * t), v * (1 - 0.1 * t));
}

function build(Q, tier) {
  const detail = tier === 'low' ? 0 : 1;
  const models = buildModels(detail);
  const items = placeAll(Q);

  // One shared program; uniforms differ. Trunk and crown of a tree share sway so they bend together.
  const treeSway = 0.006;
  const bark = cozyMaterial({ sway: treeSway, wrap: 0.45, rim: 0.12, aoScale: 0.12 });
  const leaf = cozyMaterial({ sway: treeSway, wrap: 0.78, rim: 0.35, aoScale: 0.07 });
  const bush = cozyMaterial({ sway: 0.03, wrap: 0.8, rim: 0.3, aoScale: 0.4 });

  const parts = [
    ['pineTrunk', models.pineTrunk, bark, items.pine],
    ['pineLeaves', models.pineLeaves, leaf, items.pine],
    ['oakTrunk', models.oakTrunk, bark, items.oak],
    ['oakCanopy', models.oakCanopy, leaf, items.oak],
    ['birchTrunk', models.birchTrunk, bark, items.birch],
    ['birchCanopy', models.birchCanopy, leaf, items.birch],
    ['bushPlain', models.bushPlain, bush, items.bushPlain],
    ['bushFlower', models.bushFlower, bush, items.bushFlower],
  ];
  const meshes = [];
  let tris = 0;
  for (const [name, pieces, mat, list] of parts) {
    if (!list.length) continue;
    const geo = toGeometry(pieces);
    const mesh = makeInstanced(geo, mat, list, instanceColor);
    mesh.name = 'temperate-' + name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    meshes.push(mesh);
    tris += triangles(geo) * list.length;
  }
  const counts = { pine: items.pine.length, oak: items.oak.length, birch: items.birch.length, bushes: items.bushPlain.length + items.bushFlower.length };
  return { meshes, materials: [bark, leaf, bush], info: { draws: meshes.length, triangles: tris, programs: 1, counts } };
}

export default function Temperate({ Q, tier }) {
  const built = useMemo(() => build(Q, tier), [Q, tier]);
  useEffect(() => {
    report('temperate', built.info);
    return () => {
      for (const m of built.meshes) {
        m.geometry.dispose();
        m.dispose();
      }
      for (const m of built.materials) m.dispose();
    };
  }, [built]);
  return h(
    'group',
    { name: 'temperate' },
    built.meshes.map((m) => h('primitive', { key: m.name, object: m }))
  );
}
