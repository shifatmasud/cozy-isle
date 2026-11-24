// Temperate trees in high-detail Studio Ghibli style: Scots pine, English oak, silver birch, fluffy bushes.
// Detail lives in hand-painted gouache textures (needle fronds, lobed oak leaves, serrated birch leaves on
// hanging twigs, round bush leaves with blossoms, plated / furrowed / white-lenticel bark), painted in code
// with Canvas 2D at load and drawn on smooth geometry with spherified normals through the shared
// leafMaterial program. One InstancedMesh per part per species (8 draws).
//
// How each plant is built (Kazuo Oga background-painting logic: dark mass first, then light steps):
//   Pine  - tapering 8-sided trunk, five drooping needle skirts (alpha-cut ragged needle tips) + spray cards
//           breaking each rim, narrow spire. Lit shoulders, cool blue-violet undersides.
//   Oak   - short massive trunk with root flare and three main limbs into a broad crown of 5-9 leaf clumps:
//           a dark painted core per clump (the shaded pocket) + tilted cluster cards (lit caps, leaves
//           breaking the silhouette). Normals mix clump sphere + crown sphere.
//   Birch - slim, leaning white trunk with black lenticels and a dark base; airy crown of hanging-twig
//           cards, see-through and drooping, yellow-green on top.
//   Bush  - half-sunk painted core + six tilted cluster cards: soft round mounds, some with blossoms.
//
// References studied:
//   Scots pine habit, bark grey-brown low / orange-red high: https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/scots-pine
//   https://www.forestryengland.uk/article/scots-pine , https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderDetails.aspx?taxonid=285005
//   English oak: broad spreading crown, short trunk, deeply furrowed bark, 3-7 rounded lobes per leaf:
//   https://en.wikipedia.org/wiki/Quercus_robur , https://dendro.cnre.vt.edu/dendrology/syllabus/factsheet.cfm?ID=551 , https://www.gardenia.net/plant/quercus-robur
//   Silver birch: drooping twigs, small triangular double-serrated leaves, white bark black and rugged at base:
//   https://en.wikipedia.org/wiki/Betula_pendula , https://www.rhs.org.uk/plants/2261/betula-pendula/details ,
//   https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/silver-birch
//   Oga / Ghibli background painting (gouache, dark-to-light leaf masses, single leaves on the edge, less detail far):
//   https://animationobsessive.substack.com/p/what-kazuo-oga-thinks-about-when , https://www.mclelun.com/2015/10/anime-tree-tutorial.html ,
//   https://www.openculture.com/2021/01/a-look-inside-the-painting-process-of-the-studio-ghibli-artist-kazuo-oga.html
//   Anime foliage = clumps of cards with transferred (spherified) normals: https://trungduyng.substack.com/p/tutorial-blender-anime-foliage-pipeline
import { createElement as h, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { scatter, sampleField, clump } from '../world/island.js';
import { smoothstep, mulberry32, valueNoise, clamp } from '../world/noise.js';
import { leafMaterial } from '../materials/shading.js';
import { paintTexture } from '../materials/leafTex.js';
import { makeInstanced, triangles, report } from '../lib/geo.js';

// =============================================================================================
// Painted textures (gouache style). draw(ctx, S, rand) on a transparent canvas; canvas top = v 1.
// =============================================================================================
const TAU = Math.PI * 2;

function hexRGB(s) {
  const v = parseInt(s.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function mixRGB(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function css(c, a = 1, k = 1) {
  const f = (x) => Math.max(0, Math.min(255, Math.round(x * k)));
  return 'rgba(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ',' + a + ')';
}
// Value ramp through a list of hex stops, t 0..1, plus a little hand-mixed jitter.
function ramp(stops, t, rand, jit = 0.06) {
  const C = stops.map(hexRGB);
  const x = Math.max(0, Math.min(0.9999, t)) * (C.length - 1);
  const i = Math.floor(x);
  const c = mixRGB(C[i], C[i + 1], x - i);
  const k = 1 + (rand() * 2 - 1) * jit;
  return [c[0] * k, c[1] * k, c[2] * (1 + (rand() * 2 - 1) * jit)];
}
// Faint colour under everything so mipmaps fade to green, not black (alpha stays far below the cut).
function underpaint(ctx, S, hex) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = css(hexRGB(hex), 0.09);
  ctx.fillRect(0, 0, S, S);
  ctx.restore();
}
function line(ctx, x0, y0, x1, y1, w, col) {
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}
function blob(ctx, x, y, r, col, rand, lumps = 7) {
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let i = 0; i <= lumps * 4; i++) {
    const a = (i / (lumps * 4)) * TAU;
    const rr = r * (0.82 + 0.18 * Math.abs(Math.sin(a * lumps * 0.5 + r)) + (rand() - 0.5) * 0.08);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// ---------------- Pine: tiered needle band (tileable in u) + two drooping spray sprites ----------------
const PINE_COL = {
  core: '#183a33',
  deep: ['#163630', '#1c4239', '#234c41'],
  back: ['#1f463c', '#285446', '#31604d'],
  mid: ['#2f6251', '#3b7257', '#48825e'],
  lit: ['#5a9462', '#74aa68', '#97c271', '#bfd985'],
  cool: ['#2f4f5e', '#3a5a72', '#475f82'],
};
// A needle frond (Oga-style): a dark drooping mass, hanging shaded needles on its lower edge,
// sunlit needles combed forward along its upper edge, warm highlight strokes near the tip.
// ang: spine start direction (0 = right, canvas y is down). droop bends it downward along its length.
function frond(ctx, x, y, ang, len, droop, wid, pal, rand, lit = 1) {
  const steps = Math.max(8, Math.round(len / 2.6));
  const P = [];
  let px = x, py = y;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = ang + droop * t * t * Math.sign(Math.cos(ang) || 1);
    P.push({ x: px, y: py, a, t, w: wid * Math.pow(1 - t, 0.6) * Math.min(1, 0.25 + t * 6) * (0.75 + 0.25 * Math.sin(t * 9 + x)) + 1.5 });
    px += Math.cos(a) * (len / steps);
    py += Math.sin(a) * (len / steps);
  }
  const side = Math.cos(ang) >= 0 ? 1 : -1; // which normal points down
  const nrm = (p, s) => [Math.cos(p.a + s * side * Math.PI / 2), Math.sin(p.a + s * side * Math.PI / 2)];
  // 1. mass
  ctx.fillStyle = css(ramp(pal.mass, rand(), rand));
  ctx.beginPath();
  P.forEach((p, i) => {
    const n = nrm(p, -1);
    const X = p.x + n[0] * p.w * 0.7, Y = p.y + n[1] * p.w * 0.7;
    if (i === 0) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
  });
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    const n = nrm(p, 1);
    ctx.lineTo(p.x + n[0] * p.w, p.y + n[1] * p.w);
  }
  ctx.closePath();
  ctx.fill();
  ctx.lineCap = 'round';
  // 2. hanging needles on the shaded lower edge
  for (let i = 1; i < P.length; i++) {
    const p = P[i];
    for (let k = 0; k < 2; k++) {
      const n = nrm(p, 1);
      const sx = p.x + n[0] * p.w * 0.2, sy = p.y + n[1] * p.w * 0.2;
      const L = p.w * (0.9 + rand() * 0.6) + 5;
      const a = Math.atan2(n[1], n[0]) * 0.55 + (Math.PI / 2) * 0.45 + (rand() - 0.5) * 0.5 + side * 0.25;
      const c = ramp(rand() < 0.25 ? pal.cool : pal.under, rand(), rand);
      line(ctx, sx, sy, sx + Math.cos(a) * L, sy + Math.sin(a) * L, 1.3 + rand() * 0.8, css(c));
    }
  }
  // 3. sunlit needles combed forward along the upper edge
  for (let i = 1; i < P.length; i++) {
    const p = P[i];
    for (let k = 0; k < 2; k++) {
      const n = nrm(p, -1);
      const off = rand() * p.w * 0.6;
      const sx = p.x + n[0] * off, sy = p.y + n[1] * off;
      const L = p.w * (0.7 + rand() * 0.6) + 4;
      const a = p.a + side * -(0.55 + rand() * 0.5);
      const tone = Math.min(1, (0.25 + 0.75 * p.t) * lit * (0.7 + rand() * 0.5));
      const c = ramp(pal.top, tone, rand);
      line(ctx, sx, sy, sx + Math.cos(a) * L, sy + Math.sin(a) * L + 1.5, 1.2 + rand() * 0.9, css(c));
    }
  }
  // 4. drooping tip tuft and warm highlights
  const e = P[P.length - 1];
  for (let k = 0; k < 6; k++) {
    const a = e.a + (k / 5 - 0.5) * 1.2 + 0.35 * side;
    const L = wid * (0.7 + rand() * 0.5) + 4;
    line(ctx, e.x, e.y, e.x + Math.cos(a) * L, e.y + Math.sin(a) * L + 2, 1.3, css(ramp(pal.top, 0.6 + rand() * 0.4, rand)));
  }
  if (lit > 0.8) {
    for (let i = Math.floor(P.length * 0.35); i < P.length; i += 2) {
      const p = P[i];
      const n = nrm(p, -1);
      const sx = p.x + n[0] * p.w * 0.55, sy = p.y + n[1] * p.w * 0.55;
      const a = p.a - side * 0.4;
      line(ctx, sx, sy, sx + Math.cos(a) * 6, sy + Math.sin(a) * 6, 1.2, css(ramp(PINE_COL.lit, 0.8 + rand() * 0.2, rand)));
    }
  }
}
function wrapX(S, x, fn) {
  fn(x);
  if (x < 140) fn(x + S);
  if (x > S - 140) fn(x - S);
}
const PINE_BAND_H = 250;
const PINE_TIERS = [
  { y: 0.02, n: 11, len: [70, 95], wid: 15, pal: { mass: PINE_COL.deep, under: PINE_COL.deep, top: PINE_COL.back, cool: PINE_COL.deep }, lit: 0.6 },
  { y: 0.16, n: 12, len: [75, 100], wid: 16, pal: { mass: PINE_COL.deep, under: PINE_COL.deep, top: PINE_COL.mid, cool: PINE_COL.cool }, lit: 0.7 },
  { y: 0.32, n: 12, len: [80, 110], wid: 17, pal: { mass: PINE_COL.back, under: PINE_COL.deep, top: PINE_COL.mid, cool: PINE_COL.cool }, lit: 0.85 },
  { y: 0.47, n: 11, len: [85, 115], wid: 18, pal: { mass: PINE_COL.back, under: PINE_COL.back, top: PINE_COL.lit, cool: PINE_COL.cool }, lit: 0.9 },
  { y: 0.6, n: 9, len: [80, 105], wid: 17, pal: { mass: PINE_COL.mid, under: PINE_COL.back, top: PINE_COL.lit, cool: PINE_COL.cool }, lit: 1 },
];
function drawPine(ctx, S, rand) {
  const H = PINE_BAND_H;
  // --- band (rows 0..H): top is the shaded inner skirt, bottom the drooping needle tips ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, S, H);
  ctx.clip();
  ctx.fillStyle = PINE_COL.core;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let x = 0; x <= S; x += 8) ctx.lineTo(x, H * 0.5 + Math.sin((x / S) * TAU * 6) * 10 + Math.sin((x / S) * TAU * 13 + 1) * 6);
  ctx.lineTo(S, 0);
  ctx.closePath();
  ctx.fill();
  PINE_TIERS.forEach((r, ri) => {
    for (let i = 0; i < r.n; i++) {
      const x = ((i + rand() * 0.7 + ri * 0.41) / r.n) * S;
      const y = r.y * H + (rand() - 0.5) * 14;
      const dir = rand() < 0.5 ? -1 : 1;
      const ang = dir > 0 ? 0.35 + rand() * 0.35 : Math.PI - 0.35 - rand() * 0.35;
      const len = r.len[0] + rand() * (r.len[1] - r.len[0]);
      wrapX(S, x, (xx) => frond(ctx, xx, y, ang, len, 0.75, r.wid, r.pal, rand, r.lit));
    }
  });
  ctx.restore();

  // --- two spray sprites (rows 262..506), branch base at the left edge of each cell ---
  const palB = { mass: PINE_COL.deep, under: PINE_COL.deep, top: PINE_COL.mid, cool: PINE_COL.cool };
  const palF = { mass: PINE_COL.back, under: PINE_COL.back, top: PINE_COL.lit, cool: PINE_COL.cool };
  for (let k = 0; k < 2; k++) {
    const x0 = k * 256;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + 4, 262, 248, 244);
    ctx.clip();
    const y0 = 300 + k * 8;
    frond(ctx, x0 + 8, y0 + 26, 0.28, 160, 0.7, 18, palB, rand, 0.7);
    frond(ctx, x0 + 60, y0 + 2, -0.3, 110, 1.0, 16, palB, rand, 0.8);
    frond(ctx, x0 + 8, y0 + 8, 0.08, 210, 0.75, 22, palF, rand, 1);
    frond(ctx, x0 + 90, y0 + 10, -0.15, 100, 1.1, 16, palF, rand, 1);
    frond(ctx, x0 + 120, y0 + 30, 0.45, 80, 0.9, 15, palF, rand, 1);
    ctx.restore();
  }
  underpaint(ctx, S, '#285446');
}

// ---------------- Oak: three lobed-leaf clusters + one dense opaque tile (2 x 2 cells of 256) ----------------
const OAK_COL = {
  deep: ['#1d3d33', '#244a38', '#2d553b'],
  shade: ['#2f5b3f', '#3a6a42', '#467a45'],
  mid: ['#4f8a45', '#5f9a48', '#71a94c'],
  lit: ['#86b852', '#a0c95c', '#bcd86c', '#d9e690'],
  cool: ['#34574f', '#3e5f62', '#4a6676'],
};
// Oak leaf: short stalk, 4 rounded lobes each side, broad rounded tip. Points along +y in local space.
function oakLeaf(ctx, x, y, ang, l, col, vein) {
  const w = l * 0.36;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const lobes = 4;
  const side = (s) => {
    for (let i = 0; i < lobes; i++) {
      const t0 = 0.1 + (i / lobes) * 0.8;
      const t1 = 0.1 + ((i + 0.5) / lobes) * 0.8;
      const t2 = 0.1 + ((i + 1) / lobes) * 0.8;
      const env = Math.sin(Math.PI * (0.25 + 0.75 * t1)) * w;
      ctx.quadraticCurveTo(s * env * 1.25, l * t1, s * env * 0.45, l * t2);
      if (i === lobes - 1) ctx.quadraticCurveTo(s * w * 0.3, l * 1.02, 0, l);
      void t0;
    }
  };
  side(1);
  // back down the other side
  const pts = [];
  for (let i = lobes - 1; i >= 0; i--) {
    const t1 = 0.1 + ((i + 0.5) / lobes) * 0.8;
    const t0 = 0.1 + (i / lobes) * 0.8;
    pts.push([t1, t0]);
  }
  for (const [t1, t0] of pts) {
    const env = Math.sin(Math.PI * (0.25 + 0.75 * t1)) * w;
    ctx.quadraticCurveTo(-env * 1.25, l * t1, -env * 0.45 * (t0 > 0.12 ? 1 : 0.3), l * t0);
  }
  ctx.closePath();
  ctx.fill();
  if (vein) {
    ctx.strokeStyle = vein;
    ctx.lineWidth = Math.max(0.8, l * 0.045);
    ctx.beginPath();
    ctx.moveTo(0, l * 0.04);
    ctx.lineTo(0, l * 0.85);
    ctx.stroke();
  }
  ctx.restore();
}
// Paint a leaf mass the way Oga paints a canopy: a few overlapping sub-clumps, each laid in as a dark
// shape, then shade, mid and sunlit leaves stepping up toward its top-left (sun side), a cool sky-lit
// rim underneath, and single leaves breaking the outline. dense: fill the whole cell (opaque tile).
function leafCluster(ctx, cx, cy, R, rand, leafFn, C, o) {
  const subs = [];
  if (o.dense) {
    const g = 3;
    for (let j = 0; j < g + 1; j++) {
      for (let i = 0; i < g + 1; i++) {
        subs.push({ x: cx - R + (i + (j % 2) * 0.5 + (rand() - 0.5) * 0.3) * (2 * R / g), y: cy - R + (j + (rand() - 0.5) * 0.3) * (2 * R / g), r: (R / g) * (0.85 + rand() * 0.3) });
      }
    }
  } else {
    subs.push({ x: cx, y: cy, r: R * 0.55 });
    const m = o.subs || 6;
    for (let i = 0; i < m; i++) {
      const a = (i / m) * TAU + rand() * 0.6;
      const d = R * (0.38 + rand() * 0.12);
      subs.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.88, r: R * (0.36 + rand() * 0.12) });
    }
  }
  subs.sort((p, q) => q.y - p.y); // lower clumps first; upper clumps overlap them
  const leafAt = (s, ox, oy, rad, pal, tone, size, vein) => {
    const a = rand() * TAU;
    const rr = rad * Math.sqrt(rand());
    const x = s.x + ox * s.r + Math.cos(a) * rr;
    const y = s.y + oy * s.r + Math.sin(a) * rr;
    const out = Math.atan2(y - s.y, x - s.x);
    const dir = Math.atan2(Math.sin(out) * 0.7 + 0.55, Math.cos(out) * 0.7) + (rand() - 0.5) * 1.1;
    const c = ramp(pal, tone, rand);
    leafFn(ctx, x, y, dir - Math.PI / 2, size * (0.8 + rand() * 0.4), css(c), vein ? css(c, 0.9, 0.78) : null);
  };
  const n = o.n / subs.length;
  const sz = o.size;
  for (const s of subs) {
    const k = s.r / (R * 0.45);
    if (!o.dense) blob(ctx, s.x, s.y, s.r * 0.8, css(ramp(C.deep, 0.4, rand)), rand, 6);
    for (let i = 0; i < n * 0.22 * k; i++) leafAt(s, 0, 0.08, s.r, C.deep, rand(), sz, false);
    for (let i = 0; i < n * 0.05 * k; i++) leafAt(s, 0.12, 0.7, s.r * 0.38, C.cool, rand(), sz * 0.95, false);
    for (let i = 0; i < n * 0.25 * k; i++) leafAt(s, -0.05, -0.1, s.r * 0.86, C.shade, rand(), sz, true);
    const lk = o.dense ? 0 : 1; // the opaque core tiles are the shaded inside of the crown: no sunlit leaves
    for (let i = 0; i < n * 0.25 * k * (o.dense ? 0.35 : 1); i++) leafAt(s, -0.15, -0.28, s.r * 0.66, C.mid, rand() * (o.dense ? 0.5 : 1), sz, true);
    for (let i = 0; i < n * 0.17 * k * lk; i++) leafAt(s, -0.25, -0.42, s.r * 0.46, C.lit, 0.2 + rand() * 0.55, sz * 0.95, true);
    for (let i = 0; i < n * 0.07 * k * lk; i++) leafAt(s, -0.32, -0.55, s.r * 0.3, C.lit, 0.75 + rand() * 0.25, sz * 0.9, true);
  }
  // Single leaves breaking the silhouette, lit on top, cool below.
  if (!o.dense) {
    for (let i = 0; i < o.n * 0.06; i++) {
      const a = rand() * TAU;
      const rr = R * (0.9 + rand() * 0.12);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.9;
      const up = Math.sin(a) < -0.2;
      const c = ramp(up ? C.lit : Math.sin(a) > 0.3 ? C.cool : C.shade, up ? 0.5 + rand() * 0.4 : rand(), rand);
      leafFn(ctx, x, y, a - Math.PI / 2 + (rand() - 0.5) * 0.7, sz * 0.9, css(c), css(c, 0.9, 0.8));
    }
  }
}
function cellClip(ctx, x, y, w, hh, pad) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + pad, y + pad, w - pad * 2, hh - pad * 2);
  ctx.clip();
}
function drawOak(ctx, S, rand) {
  const c = S / 2;
  const cells = [[0, 0], [c, 0], [0, c]];
  cells.forEach(([x, y], i) => {
    cellClip(ctx, x, y, c, c, 3);
    leafCluster(ctx, x + c / 2, y + c / 2 + 2, c * 0.35, rand, oakLeaf, OAK_COL, { n: 760 + i * 60, size: c * 0.12, subs: 5 + i });
    ctx.restore();
  });
  // Dense tile (bottom right): fully opaque leaf mass for the canopy cores.
  cellClip(ctx, c, c, c, c, 0);
  ctx.fillStyle = css(hexRGB('#2b5039'));
  ctx.fillRect(c, c, c, c);
  leafCluster(ctx, c + c / 2, c + c / 2, c / 2 + 10, rand, oakLeaf, OAK_COL, { n: 1500, size: c * 0.115, dense: true });
  ctx.restore();
  underpaint(ctx, S, '#2d553b');
}

// ---------------- Birch: two tall hanging-twig sprites (256 x 512 each) ----------------
const BIRCH_COL = {
  deep: ['#2f5a3c', '#3a6941', '#467846'],
  mid: ['#5f9145', '#73a34b', '#87b352'],
  lit: ['#9cc458', '#b4d164', '#cadd76', '#e0e890'],
  cool: ['#4d7470', '#567b7e', '#62828c'],
};
// Small triangular, double-serrated birch leaf on a thin stalk, pointing along +y.
function birchLeaf(ctx, x, y, ang, l, col, vein) {
  const w = l * 0.42;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, l * 0.12);
  const teeth = 5;
  // right edge: broad base then straight-ish to the tip, with small teeth
  for (let i = 0; i <= teeth; i++) {
    const t = i / teeth;
    const yy = l * (0.2 + 0.8 * t);
    const env = w * (t < 0.25 ? 0.6 + 1.6 * t : 1.0 - (t - 0.25) / 0.75) ;
    ctx.lineTo(env * 1.08, yy - l * 0.04);
    ctx.lineTo(env * 0.9, yy);
  }
  ctx.lineTo(0, l);
  for (let i = teeth; i >= 0; i--) {
    const t = i / teeth;
    const yy = l * (0.2 + 0.8 * t);
    const env = w * (t < 0.25 ? 0.6 + 1.6 * t : 1.0 - (t - 0.25) / 0.75);
    ctx.lineTo(-env * 0.9, yy);
    ctx.lineTo(-env * 1.08, yy - l * 0.04);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = vein || col;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, l * (vein ? 0.8 : 0.15));
  ctx.stroke();
  ctx.restore();
}
function hangingTwig(ctx, x, y, ang, len, rand, pal, leafL, density) {
  // A twig that arches outward and then falls in a long pendulous curve; small leaves hang along it,
  // crowded near the top (more light) and thinning, cooler, toward the trailing tip.
  const steps = 24;
  let px = x, py = y, a = ang;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    pts.push([px, py, a, i / steps]);
    a += (Math.PI / 2 + (rand() - 0.5) * 0.15 - a) * 0.17;
    px += Math.cos(a) * (len / steps);
    py += Math.sin(a) * (len / steps);
  }
  ctx.strokeStyle = 'rgba(96,70,58,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.stroke();
  for (let i = 1; i <= steps; i++) {
    const [qx, qy, qa, t] = pts[i];
    if (rand() > density * (1 - 0.45 * t)) continue;
    for (let s = -1; s <= 1; s += 2) {
      if (rand() < 0.35) continue;
      // leaves hang: point mostly down, splayed a little to each side
      const dir = Math.PI / 2 + s * (0.35 + rand() * 0.45) + (qa - Math.PI / 2) * 0.3;
      const tone = Math.min(1, Math.max(0, pal.bias + (1 - t) * 0.55 + (rand() - 0.5) * 0.45));
      const palette = t > 0.6 && rand() < 0.35 ? BIRCH_COL.cool : tone > 0.6 ? pal.lit : pal.mid;
      const c = ramp(palette, tone, rand);
      birchLeaf(ctx, qx, qy, dir - Math.PI / 2, leafL * (0.75 + rand() * 0.4) * (1 - 0.3 * t), css(c), css(c, 0.9, 0.78));
    }
  }
}
// Small airy leaf puffs where the twigs leave the branch (light-to-dark steps, sun at top-left).
function birchPuff(ctx, x, y, r, rand) {
  const steps = [[BIRCH_COL.deep, 0, 0.1, 1, 26], [BIRCH_COL.mid, -0.1, -0.15, 0.8, 22], [BIRCH_COL.lit, -0.25, -0.35, 0.55, 16]];
  for (const [pal, ox, oy, rad, cnt] of steps) {
    for (let i = 0; i < cnt; i++) {
      const a = rand() * TAU;
      const rr = r * rad * Math.sqrt(rand());
      const dir = Math.PI / 2 + (rand() - 0.5) * 2.2;
      const c = ramp(pal, rand(), rand);
      birchLeaf(ctx, x + ox * r + Math.cos(a) * rr, y + oy * r + Math.sin(a) * rr * 0.8, dir - Math.PI / 2, 15 + rand() * 6, css(c), css(c, 0.9, 0.78));
    }
  }
}
function drawBirch(ctx, S, rand) {
  const w = S / 2;
  for (let k = 0; k < 2; k++) {
    const x0 = k * w;
    cellClip(ctx, x0, 0, w, S, 4);
    const cx = x0 + w / 2;
    const dense = k === 1;
    // thin parent branches the twigs hang from (mostly hidden by leaves)
    ctx.strokeStyle = 'rgba(70,58,54,0.9)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.lineWidth = 2.6 - i * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx + (rand() - 0.5) * 20, 14);
      ctx.quadraticCurveTo(cx + (i - 1) * 50, 30 + rand() * 20, cx + (i - 1) * 95, 70 + rand() * 40);
      ctx.stroke();
    }
    const nBack = dense ? 14 : 9;
    for (let i = 0; i < nBack; i++) {
      const sx = cx + (rand() - 0.5) * w * 0.8;
      const dir = sx < cx ? -1 : 1;
      const ang = dir > 0 ? 0.35 + rand() * 0.8 : Math.PI - 0.35 - rand() * 0.8;
      hangingTwig(ctx, sx, 24 + rand() * 70, ang, 250 + rand() * 110, rand, { lit: BIRCH_COL.mid, mid: BIRCH_COL.deep, bias: -0.15 }, 16, dense ? 0.95 : 0.8);
    }
    for (let i = 0; i < (dense ? 6 : 4); i++) birchPuff(ctx, cx + ((i + 0.5) / (dense ? 6 : 4) - 0.5) * w * 0.7 + (rand() - 0.5) * 20, 45 + rand() * (dense ? 170 : 100), dense ? 44 : 34, rand);
    const nFront = dense ? 11 : 8;
    for (let i = 0; i < nFront; i++) {
      const sx = cx + (rand() - 0.5) * w * 0.75;
      const dir = sx < cx ? -1 : 1;
      const ang = dir > 0 ? 0.3 + rand() * 0.8 : Math.PI - 0.3 - rand() * 0.8;
      hangingTwig(ctx, sx, 16 + rand() * 80, ang, 220 + rand() * 150, rand, { lit: BIRCH_COL.lit, mid: BIRCH_COL.mid, bias: 0 }, 18, dense ? 0.95 : 0.85);
    }
    ctx.restore();
  }
  underpaint(ctx, S, '#5d8f47');
}

// ---------------- Bush: plain + flowering clusters (top), plain + flowering dense tiles (bottom) ----------------
const BUSH_COL = {
  deep: ['#1f4132', '#284d37', '#31593b'],
  shade: ['#33613f', '#3d6f43', '#497d47'],
  mid: ['#588f47', '#679f4b', '#77ad50'],
  lit: ['#8fbf58', '#a8cd62', '#c3dc76', '#dbe896'],
  cool: ['#335850', '#3d6063', '#486776'],
};
function roundLeaf(ctx, x, y, ang, l, col, vein) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(l * 0.62, l * 0.12, l * 0.55, l * 0.95, 0, l);
  ctx.bezierCurveTo(-l * 0.55, l * 0.95, -l * 0.62, l * 0.12, 0, 0);
  ctx.fill();
  if (vein) {
    ctx.strokeStyle = vein;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, l * 0.1);
    ctx.lineTo(0, l * 0.75);
    ctx.stroke();
  }
  ctx.restore();
}
function flower(ctx, x, y, r, petal, centre, rand) {
  const a0 = rand() * TAU;
  for (let i = 0; i < 5; i++) {
    const a = a0 + (i / 5) * TAU;
    ctx.fillStyle = petal;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.36, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = centre;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.26, 0, TAU);
  ctx.fill();
}
function flowers(ctx, cx, cy, R, n, rand, dense) {
  const petals = [['#f7b8cf', '#fbd3e0'], ['#fff6ea', '#ffffff'], ['#f3a3bf', '#f9c6d8']];
  for (let i = 0; i < n; i++) {
    let x, y;
    if (dense) {
      x = cx + (rand() * 2 - 1) * R;
      y = cy + (rand() * 2 - 1) * R * 0.9 - R * 0.1;
    } else {
      const a = Math.PI * (1.0 + rand() * 1.0) + (rand() - 0.5) * 0.6; // upper half, sun side
      const rr = R * (0.25 + 0.7 * Math.sqrt(rand()));
      x = cx + Math.cos(a) * rr;
      y = cy + Math.sin(a) * rr * 0.85;
    }
    const p = petals[Math.floor(rand() * petals.length)];
    const shadeSide = y > cy + R * 0.2;
    const col = shadeSide ? '#c9a3c9' : p[rand() < 0.5 ? 0 : 1];
    flower(ctx, x, y, 6 + rand() * 4, col, shadeSide ? '#c7a85a' : '#f2cf5a', rand);
  }
}
function drawBush(ctx, S, rand) {
  const c = S / 2;
  for (let k = 0; k < 2; k++) {
    cellClip(ctx, k * c, 0, c, c, 3);
    leafCluster(ctx, k * c + c / 2, c / 2 + 4, c * 0.36, rand, roundLeaf, BUSH_COL, { n: 900, size: c * 0.085, subs: 6 });
    if (k === 1) flowers(ctx, k * c + c / 2, c / 2 + 4, c * 0.36, 26, rand, false);
    ctx.restore();
    cellClip(ctx, k * c, c, c, c, 0);
    ctx.fillStyle = css(hexRGB('#2c5539'));
    ctx.fillRect(k * c, c, c, c);
    leafCluster(ctx, k * c + c / 2, c + c / 2, c / 2 + 8, rand, roundLeaf, BUSH_COL, { n: 1700, size: c * 0.08, dense: true });
    if (k === 1) flowers(ctx, k * c + c / 2, c + c / 2, c / 2, 30, rand, true);
    ctx.restore();
  }
  underpaint(ctx, S, '#31593b');
}

// ---------------- Bark atlas: three columns (pine, oak, birch), each tileable vertically ----------------
const BARK_W = 512 / 3;
function wrapRect(ctx, x0, w, S, fn) {
  // draw fn at y and y +- S so the column tiles vertically, and at x +- w so it wraps around the trunk
  for (const dx of [0, -w, w]) for (const dy of [0, -S, S]) fn(dx, dy);
}
function drawBark(ctx, S, rand) {
  const w = BARK_W;
  // Pine: flaky plates separated by a dark fissure network; vertex colour makes it grey-brown low, orange-red high.
  cellClip(ctx, 0, 0, w, S, 0);
  ctx.fillStyle = '#4a2c22';
  ctx.fillRect(0, 0, w, S);
  const cw = w / 6, ch = 26;
  for (let j = 0; j < S / ch; j++) {
    for (let i = 0; i < 6; i++) {
      const x = (i + (j % 2) * 0.5 + (rand() - 0.5) * 0.25) * cw;
      const y = (j + (rand() - 0.5) * 0.3) * ch;
      const pw = cw * (0.78 + rand() * 0.2), ph = ch * (0.7 + rand() * 0.25);
      const tone = rand();
      const col = css(mixRGB(hexRGB('#94573a'), hexRGB('#d08a5a'), tone));
      const hi = css(mixRGB(hexRGB('#d8996a'), hexRGB('#f2c08e'), tone), 0.85);
      const lo = 'rgba(70,40,30,0.55)';
      const pts = [];
      for (let q = 0; q < 7; q++) {
        const a = (q / 7) * TAU;
        pts.push([Math.cos(a) * pw * 0.5 * (0.85 + rand() * 0.2), Math.sin(a) * ph * 0.5 * (0.8 + rand() * 0.25)]);
      }
      wrapRect(ctx, 0, w, S, (dx, dy) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        pts.forEach((p0, q) => (q ? ctx.lineTo : ctx.moveTo).call(ctx, x + dx + p0[0], y + dy + p0[1]));
        ctx.closePath();
        ctx.fill();
        line(ctx, x + dx - pw * 0.35, y + dy - ph * 0.3, x + dx + pw * 0.2, y + dy - ph * 0.36, 2, hi);
        line(ctx, x + dx - pw * 0.25, y + dy + ph * 0.36, x + dx + pw * 0.35, y + dy + ph * 0.3, 2.2, lo);
      });
    }
  }
  ctx.restore();

  // Oak: dark grey-brown, deep interlacing vertical furrows with lit ridge tops.
  cellClip(ctx, w, 0, w, S, 0);
  ctx.fillStyle = '#4e4338';
  ctx.fillRect(w, 0, w, S);
  for (let i = 0; i < 26; i++) {
    const x = w + (i / 26) * w + rand() * 4;
    let y = 0;
    while (y < S) {
      const l = 30 + rand() * 60;
      const xo = (rand() - 0.5) * 8;
      const ridge = css(mixRGB(hexRGB('#6f6252'), hexRGB('#9a8a72'), rand()));
      wrapRect(ctx, w, w, S, (dx) => {
        line(ctx, x + dx, y, x + dx + xo, y + l, 3.5 + rand() * 2, ridge);
        line(ctx, x + dx - 1.5, y, x + dx + xo - 1.5, y + l, 1.2, 'rgba(176,160,132,0.6)');
      });
      y += l + rand() * 8;
    }
  }
  for (let i = 0; i < 30; i++) {
    const x = w + rand() * w, y = rand() * S, l = 25 + rand() * 50;
    wrapRect(ctx, w, w, S, (dx, dy) => line(ctx, x + dx, y + dy, x + dx + (rand() - 0.5) * 5, y + dy + l, 2.2, 'rgba(34,28,24,0.9)'));
  }
  // moss tint low on the north side feel
  for (let i = 0; i < 18; i++) brushDab(ctx, w + rand() * w, rand() * S, 6 + rand() * 10, 'rgba(98,122,70,0.35)');
  ctx.restore();

  // Birch: chalky white with peeling warm-grey tone, black lenticel dashes and dark knot "eyes".
  const x2 = 2 * w;
  cellClip(ctx, x2, 0, w, S, 0);
  ctx.fillStyle = '#ece7da';
  ctx.fillRect(x2, 0, w, S);
  for (let i = 0; i < 40; i++) brushDab(ctx, x2 + rand() * w, rand() * S, 8 + rand() * 18, rand() < 0.5 ? 'rgba(214,206,190,0.6)' : 'rgba(250,248,240,0.7)');
  for (let i = 0; i < 95; i++) {
    const x = x2 + rand() * w, y = rand() * S, l = 6 + rand() * 22, t = 1.2 + rand() * 2.4;
    const col = rand() < 0.75 ? 'rgba(38,32,30,0.92)' : 'rgba(120,108,98,0.8)';
    wrapRect(ctx, x2, w, S, (dx, dy) => line(ctx, x + dx, y + dy, x + dx + l, y + dy + (rand() - 0.5) * 2, t, col));
  }
  for (let i = 0; i < 7; i++) {
    const x = x2 + rand() * w, y = rand() * S;
    wrapRect(ctx, x2, w, S, (dx, dy) => {
      ctx.strokeStyle = 'rgba(34,30,28,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + dx - 12, y + dy - 5);
      ctx.quadraticCurveTo(x + dx, y + dy + 7, x + dx + 12, y + dy - 5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(40,34,30,0.95)';
      ctx.beginPath();
      ctx.ellipse(x + dx, y + dy - 2, 3.5, 2.5, 0, 0, TAU);
      ctx.fill();
    });
  }
  ctx.restore();
}
function brushDab(ctx, x, y, r, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU);
  ctx.fill();
}


// =============================================================================================
// Geometry (pure JS, no THREE): non-indexed triangle soup with position, normal, uv and colour.
// A vertex is [x, y, z, nx, ny, nz, u, v, r, g, b]. Colours are linear multipliers of the painted map.
// =============================================================================================
function newPart() {
  return { p: [], n: [], t: [], c: [] };
}
function pushV(P, v) {
  P.p.push(v[0], v[1], v[2]);
  P.n.push(v[3], v[4], v[5]);
  P.t.push(v[6], v[7]);
  P.c.push(v[8], v[9], v[10]);
}
// Orient each face so its winding agrees with its normals (gl_FrontFacing then means "outside").
function tri(P, A, B, C) {
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
  const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
  const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
  const d = fx * (A[3] + B[3] + C[3]) + fy * (A[4] + B[4] + C[4]) + fz * (A[5] + B[5] + C[5]);
  if (d < 0) {
    const t = B;
    B = C;
    C = t;
  }
  pushV(P, A);
  pushV(P, B);
  pushV(P, C);
}
function quad(P, a, b, c, d) {
  tri(P, a, b, c);
  tri(P, a, c, d);
}
function triCount(P) {
  return P.p.length / 9;
}
function norm3(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function vtx(x, y, z, n, u, v, c) {
  return [x, y, z, n[0], n[1], n[2], u, v, c[0], c[1], c[2]];
}
function mul3(a, k) {
  return [a[0] * k, a[1] * k, a[2] * k];
}
function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Atlas rectangles [u0, v0, u1, v1] (v = 1 is the top row of the canvas).
const PAD = 4 / 512;
const CLUSTER_CELLS = [[0, 0], [1, 0], [0, 1]];
function cellRect(i, j) {
  return [i * 0.5 + PAD, 1 - (j + 1) * 0.5 + PAD, i * 0.5 + 0.5 - PAD, 1 - j * 0.5 - PAD];
}
const RECT = {
  pineSpray: (k) => [(k * 256 + 4) / 512, 1 - 506 / 512, (k * 256 + 252) / 512, 1 - 262 / 512],
  birch: (k) => [k * 0.5 + 0.008, 1 - 430 / 512, k * 0.5 + 0.492, 1 - 4 / 512],
  bark: (c) => [c / 3 + 0.006, (c + 1) / 3 - 0.006],
};
const PINE_V = { apex: 0.995, mid: 0.8, rim: 1 - (PINE_BAND_H - 4) / 512 };

// Smooth tube along ring centres pts [{ x, y, z, r, col, lobe }]; seam vertices duplicated for uv.
// u spans one bark column around the trunk, v runs along the length (vScale per metre, map repeats in v).
function tube(P, pts, seg, col, vScale) {
  const [u0, u1] = RECT.bark(col);
  const rings = [];
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const d = norm3(b.x - a.x, b.y - a.y, b.z - a.z);
    const ref = Math.abs(d[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    const u = norm3(...cross3(d, ref));
    const v = cross3(u, d);
    const q = pts[i];
    if (i > 0) len += Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y, q.z - pts[i - 1].z);
    const ring = [];
    for (let k = 0; k <= seg; k++) {
      const ang = (k / seg) * TAU;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const n = [u[0] * ca + v[0] * sa, u[1] * ca + v[1] * sa, u[2] * ca + v[2] * sa];
      const rr = q.r * (1 + (q.lobe || 0) * Math.cos(ang * 5 + 1.3));
      ring.push(vtx(q.x + n[0] * rr, q.y + n[1] * rr, q.z + n[2] * rr, n, u0 + (u1 - u0) * (k / seg), len * vScale, q.col));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < seg; k++) quad(P, A[k], A[k + 1], B[k + 1], B[k]);
  }
}

// Flat leaf card. c centre, R/U unit right/up in the card plane, hw/hh half sizes, rect atlas cell.
// nrm(x, y, z) and col(x, y, z) give the spherified normal and painted-mass colour at each corner.
function card(P, c, R, U, hw, hh, rect, nrm, col) {
  const corner = (sx, sy, u, v) => {
    const x = c[0] + R[0] * hw * sx + U[0] * hh * sy;
    const y = c[1] + R[1] * hw * sx + U[1] * hh * sy;
    const z = c[2] + R[2] * hw * sx + U[2] * hh * sy;
    return vtx(x, y, z, nrm(x, y, z), u, v, col(x, y, z));
  };
  const a = corner(-1, -1, rect[0], rect[1]);
  const b = corner(1, -1, rect[2], rect[1]);
  const d = corner(1, 1, rect[2], rect[3]);
  const e = corner(-1, 1, rect[0], rect[3]);
  quad(P, a, b, d, e);
}
// Card frame facing cn with the painted "up" kept as close to world up as possible.
function cardFrame(cn) {
  let up = [0, 1, 0];
  if (Math.abs(cn[1]) > 0.92) up = [0, 0, 1];
  const k = dot3(up, cn);
  const U = norm3(up[0] - cn[0] * k, up[1] - cn[1] * k, up[2] - cn[2] * k);
  const R = norm3(...cross3(U, cn));
  return { R, U };
}

// Icosphere faces as unit-vector triples (detail 0 = 20 faces).
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

// Soft lumpy leaf core: jittered icosphere whose faces are each textured with a patch of the
// opaque painted leaf tile (planar per face, painted "up" kept up). Vertices shared by faces get the
// same position and normal, so the lump shades as one smooth mass.
function leafCore(P, o) {
  const faces = icoFaces(0);
  const pos = (d) => {
    const k = 1 + o.jit * (valueNoise(d[0] * 2.3 + d[1] * 1.7 + o.seed * 7.13, d[2] * 2.3 - d[1] * 1.1 + o.seed * 3.7, 13) * 2 - 1);
    const flat = d[1] < 0 ? 1 - (o.flat || 0) : 1;
    return [o.c[0] + d[0] * o.s[0] * k, o.c[1] + d[1] * o.s[1] * k * flat, o.c[2] + d[2] * o.s[2] * k];
  };
  const r = o.rect;
  const cu = (r[0] + r[2]) / 2, cv = (r[1] + r[3]) / 2;
  const half = Math.min(r[2] - r[0], r[3] - r[1]) / 2 - 0.004;
  for (const f of faces) {
    const p = f.map(pos);
    const cen = [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3, (p[0][2] + p[1][2] + p[2][2]) / 3];
    const fn = norm3(...cross3([p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]]));
    const { R, U } = cardFrame(fn);
    const loc = p.map((q) => [dot3([q[0] - cen[0], q[1] - cen[1], q[2] - cen[2]], R), dot3([q[0] - cen[0], q[1] - cen[1], q[2] - cen[2]], U)]);
    const ext = Math.max(...loc.map((l) => Math.max(Math.abs(l[0]), Math.abs(l[1]))));
    const sc = Math.min(o.uvPerM, half / Math.max(ext, 1e-3));
    const V = p.map((q, i) => vtx(q[0], q[1], q[2], o.nrm(q[0], q[1], q[2]), cu + loc[i][0] * sc, cv + loc[i][1] * sc, o.col(q[0], q[1], q[2])));
    tri(P, V[0], V[1], V[2]);
  }
}

// Even spread of n directions over a sphere cap (y from yMin to yMax), rotated by phase.
function capDirs(n, yMin, yMax, phase) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = yMax - ((i + 0.5) / n) * (yMax - yMin);
    const r = Math.sqrt(1 - y * y);
    const a = phase + i * 2.39996;
    out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return out;
}

// ---- painted-mass colour helpers (linear multipliers) ----
const WARM = [1.07, 1.03, 0.9];
const COOL = [0.84, 0.92, 1.06];
function shadeCol(light, k) {
  const c = lerp3(COOL, WARM, light);
  return [c[0] * k, c[1] * k, c[2] * k];
}

// ---------------------------------------------------------------------------------------------
// Species models (metres at instance scale 1). Each returns { trunk: Part, leaves: Part }.
// ---------------------------------------------------------------------------------------------

// Scots pine: straight tapering trunk, plated bark grey-brown low and orange-red high; five drooping
// tiers of needle skirts (painted band, ragged needle tips cut out by alpha) with spray cards breaking
// each rim; a narrow spire on top. Tier normals are spherified per tier: lit shoulders, dark undersides.
function pineModel(detail) {
  const rand = mulberry32(4101);
  const trunk = newPart();
  const low = [0.72, 0.66, 0.68];
  const high = [1.12, 0.95, 0.84];
  tube(trunk, [
    { x: 0, y: -1.2, z: 0, r: 0.36, col: low },
    { x: 0, y: 2.6, z: 0, r: 0.27, col: lerp3(low, high, 0.3) },
    { x: 0, y: 7.0, z: 0, r: 0.16, col: high },
    { x: 0, y: 11.6, z: 0, r: 0.04, col: high },
  ], 8, 0, 1 / 6);

  const seg = detail === 0 ? 8 : detail === 1 ? 9 : 11;
  const fins = detail === 2 ? 4 : 3;
  const tiers = [
    { rim: 2.3, R: 3.0, H: 3.0 },
    { rim: 4.3, R: 2.5, H: 2.8 },
    { rim: 6.2, R: 2.0, H: 2.6 },
    { rim: 8.0, R: 1.45, H: 2.4 },
    { rim: 9.7, R: 0.85, H: 2.6 },
  ];
  const leaves = newPart();
  tiers.forEach((t, i) => {
    const apex = t.rim + t.H;
    const cy = t.rim + t.H * 0.35;
    const lift = i / (tiers.length - 1);
    const nrm = (x, y, z) => norm3(x, (y - cy) * 0.9 + 0.35 * t.R, z);
    const col = (x, y, z) => {
      const r = Math.hypot(x, z) / t.R;
      const light = Math.min(1, 0.2 + 0.55 * r + 0.3 * lift);
      return shadeCol(light, (0.72 + 0.3 * r) * (0.88 + 0.16 * lift));
    };
    const reps = Math.max(1, Math.round((TAU * t.R) / 6.5));
    const midY = apex - 0.45 * t.H;
    const phase = rand() * TAU;
    const ring = [];
    for (let k = 0; k < seg; k++) {
      const a = phase + (k / seg) * TAU;
      ring.push({
        a,
        rr: t.R * (1 + (rand() * 2 - 1) * 0.13),
        ry: t.rim + (rand() * 2 - 1) * 0.22,
        mr: 0.55 * t.R * (1 + (rand() * 2 - 1) * 0.06),
      });
    }
    for (let k = 0; k < seg; k++) {
      const A = ring[k], B = ring[(k + 1) % seg];
      const uA = (k / seg) * reps, uB = ((k + 1) / seg) * reps;
      const pt = (q, r, y, u, v) => {
        const x = Math.cos(q.a) * r, z = Math.sin(q.a) * r;
        return vtx(x, y, z, nrm(x, y, z), u, v, col(x, y, z));
      };
      const ap = vtx(0, apex, 0, nrm(0, apex, 0), (uA + uB) / 2, PINE_V.apex, col(0, apex, 0));
      const mA = pt(A, A.mr, midY, uA, PINE_V.mid), mB = pt(B, B.mr, midY, uB, PINE_V.mid);
      const rA = pt(A, A.rr, A.ry, uA, PINE_V.rim), rB = pt(B, B.rr, B.ry, uB, PINE_V.rim);
      tri(leaves, ap, mA, mB);
      quad(leaves, mA, mB, rB, rA);
    }
    // Vertical spray cards sticking out past the rim: droopy needle tips that break the silhouette.
    if (i < tiers.length - 1) {
      for (let j = 0; j < fins; j++) {
        const a = phase + ((j + 0.5) / fins) * TAU + (rand() - 0.5) * 0.6;
        const d = [Math.cos(a), 0, Math.sin(a)];
        const L = 0.45 * t.R + 1.0;
        const inner = 0.55 * t.R;
        const yTop = t.rim + t.H * 0.32;
        const droop = 0.35;
        const cx = d[0] * (inner + L / 2), cz = d[2] * (inner + L / 2);
        const cyc = yTop - L * 0.45 - droop * 0.5;
        const Rv = norm3(d[0], -droop / L, d[2]);
        const U = norm3(...cross3(cross3(Rv, [0, 1, 0]), Rv));
        card(leaves, [cx, cyc, cz], Rv, U[1] < 0 ? [-U[0], -U[1], -U[2]] : U, L / 2, L * 0.49, RECT.pineSpray(j % 2), nrm, col);
      }
    }
  });
  return { trunk, leaves };
}

// English oak: short massive trunk with root flare, three main limbs climbing into the crown, a broad
// cloud-like crown of leaf clumps (painted cores + tilted cluster cards breaking the edge). Normals mix
// each clump's own sphere with the crown's, so every clump has a lit cap and a cool shaded pocket below.
function oakModel(detail) {
  const rand = mulberry32(5203);
  const K = detail === 0 ? 5 : detail === 1 ? 7 : 9;
  const M = detail === 0 ? 5 : detail === 1 ? 6 : 7;
  const trunk = newPart();
  const dark = [0.78, 0.78, 0.82];
  const barkC = [1.0, 0.98, 0.95];
  tube(trunk, [
    { x: 0, y: -1.4, z: 0, r: 0.95, col: dark, lobe: 0.16 },
    { x: 0, y: -0.1, z: 0, r: 0.78, col: dark, lobe: 0.12 },
    { x: 0.05, y: 1.4, z: 0.03, r: 0.6, col: barkC, lobe: 0.05 },
    { x: 0.1, y: 3.0, z: 0.05, r: 0.5, col: barkC },
  ], 10, 1, 1 / 11);

  const C = [0, 6.0, 0];
  const CR = [4.4, 3.2, 4.4];
  const clumps = [{ c: [0.2, 7.3, -0.1], r: 2.45 }];
  for (let i = 0; i < K - 1; i++) {
    const a = (i / (K - 1)) * TAU + 0.4 + (rand() - 0.5) * 0.4;
    const upper = K > 5 && i % 3 === 2;
    const rad = upper ? 1.5 + rand() * 0.3 : 2.35 + rand() * 0.35;
    const r = upper ? 1.8 + rand() * 0.2 : 2.0 + rand() * 0.3;
    clumps.push({ c: [Math.cos(a) * rad, upper ? 6.7 + rand() * 0.4 : 4.9 + (i % 2) * 0.7 + rand() * 0.3, Math.sin(a) * rad], r });
  }
  // Main limbs from the top of the trunk toward three of the clumps.
  for (let i = 0; i < 3; i++) {
    const tgt = clumps[1 + Math.floor((i * (K - 1)) / 3)].c;
    const s = [0.08, 2.7, 0.04];
    const m = lerp3(s, tgt, 0.45);
    m[1] += 0.25;
    const e = lerp3(s, tgt, 0.8);
    tube(trunk, [
      { x: s[0], y: s[1], z: s[2], r: 0.34, col: barkC },
      { x: m[0], y: m[1], z: m[2], r: 0.21, col: barkC },
      { x: e[0], y: e[1], z: e[2], r: 0.09, col: barkC },
    ], 6, 1, 1 / 11);
  }

  const leaves = newPart();
  clumps.forEach((cl, ci) => {
    const nrm = (x, y, z) => {
      const a = norm3(x - cl.c[0], (y - cl.c[1]) * 1.15, z - cl.c[2]);
      const b = norm3((x - C[0]) / CR[0], (y - C[1]) / CR[1], (z - C[2]) / CR[2]);
      return norm3(a[0] * 0.62 + b[0] * 0.38, a[1] * 0.62 + b[1] * 0.38 + 0.05, a[2] * 0.62 + b[2] * 0.38);
    };
    const col = (x, y, z) => {
      const out = Math.hypot((x - C[0]) / CR[0], (y - C[1]) / CR[1], (z - C[2]) / CR[2]);
      const ao = smoothstep(0.45, 1.05, out);
      const top = smoothstep(cl.c[1] - cl.r, cl.c[1] + cl.r * 0.8, y);
      const light = Math.min(1, 0.15 + 0.5 * top + 0.35 * smoothstep(C[1] - 2.5, C[1] + 2.5, y));
      return shadeCol(light, 0.62 + 0.42 * ao);
    };
    leafCore(leaves, { c: cl.c, s: [cl.r * 0.8, cl.r * 0.74, cl.r * 0.8], jit: 0.1, flat: 0.15, seed: 10 + ci, rect: cellRect(1, 1), uvPerM: 0.5 / 2.4, nrm, col: (x, y, z) => mul3(col(x, y, z), 0.9) });
    const away = norm3(cl.c[0] - C[0], 0.3, cl.c[2] - C[2]);
    const dirs = capDirs(M, -0.45, 0.9, rand() * TAU);
    dirs.forEach((d0, j) => {
      let d = d0;
      if (ci > 0 && dot3(d, away) < -0.25) d = norm3(-d[0], d[1], -d[2]);
      const th = Math.atan2(d[2], d[0]);
      const tg = norm3(...cross3(d, [Math.cos(th + 1.3), 0.4, Math.sin(th + 1.3)]));
      const tilt = 0.6 + rand() * 0.3; // radians away from facing straight out
      const cn = norm3(d[0] * Math.cos(tilt) + tg[0] * Math.sin(tilt), d[1] * Math.cos(tilt) + tg[1] * Math.sin(tilt), d[2] * Math.cos(tilt) + tg[2] * Math.sin(tilt));
      const { R, U } = cardFrame(cn);
      const cc = [cl.c[0] + d[0] * cl.r * 0.68, cl.c[1] + d[1] * cl.r * 0.62, cl.c[2] + d[2] * cl.r * 0.68];
      const hs = cl.r * (0.74 + rand() * 0.12);
      const q = CLUSTER_CELLS[(ci + j) % 3];
      card(leaves, cc, R, U, hs, hs, cellRect(q[0], q[1]), nrm, col);
    });
  });
  return { trunk, leaves };
}

// Silver birch: slim, gently leaning white trunk (black lenticels, dark rugged base), two thin limbs,
// and an airy crown of hanging-twig cards (see-through, drooping), lighter yellow-green on top.
function birchModel(detail) {
  const rand = mulberry32(6301);
  const N = detail === 0 ? 12 : detail === 1 ? 14 : 18;
  const top = 10.0;
  const bend = (y) => Math.pow(Math.max(y, 0) / top, 2);
  const bx = (y) => 0.4 * bend(y);
  const bz = (y) => 0.12 * bend(y);
  const trunk = newPart();
  const ys = [-1.2, 1.0, 3.4, 5.8, 8.0, top];
  tube(trunk, ys.map((y) => ({
    x: bx(y), y, z: bz(y),
    r: y <= 0 ? 0.22 : 0.19 - 0.15 * (y / top),
    col: y < 0 ? [0.4, 0.38, 0.38] : y < 1.5 ? [0.7, 0.68, 0.68] : [1, 1, 1],
  })), 8, 2, 1 / 3.3);
  for (let i = 0; i < 2; i++) {
    const y0 = 5.2 + i * 1.5;
    const a = i * 2.6 + 0.6;
    tube(trunk, [
      { x: bx(y0), y: y0, z: bz(y0), r: 0.07, col: [0.95, 0.95, 0.95] },
      { x: bx(y0) + Math.cos(a) * 1.4, y: y0 + 1.1, z: bz(y0) + Math.sin(a) * 1.4, r: 0.025, col: [0.85, 0.85, 0.85] },
    ], 5, 2, 1 / 3.3);
  }
  const cc = [bx(7.8), 7.8, bz(7.8)];
  const nrm = (x, y, z) => {
    const a = norm3((x - cc[0]) / 1.8, (y - cc[1]) / 2.6, (z - cc[2]) / 1.8);
    return norm3(a[0] * 0.8, a[1] * 0.8 + 0.2, a[2] * 0.8);
  };
  const col = (x, y, z) => {
    const out = Math.hypot((x - cc[0]) / 1.9, (z - cc[2]) / 1.9);
    const light = Math.min(1, smoothstep(5.0, 11.0, y) * 0.8 + 0.25 * Math.min(1, out));
    return shadeCol(light, 0.72 + 0.32 * light);
  };
  const leaves = newPart();
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const yTop = 6.4 + f * 4.5 + (rand() - 0.5) * 0.4;
    const a = i * 2.39996 + 0.5;
    const off = (1 - f) * 1.5 + 0.5 + rand() * 0.35;
    const w = (3.3 - 1.2 * f) * (0.9 + rand() * 0.2);
    const hgt = w * 1.72;
    const d = [Math.cos(a), 0, Math.sin(a)];
    const turn = (rand() < 0.5 ? -1 : 1) * (0.7 + rand() * 0.6);
    const cn = norm3(d[0] * Math.cos(turn) - d[2] * Math.sin(turn), 0.12, d[0] * Math.sin(turn) + d[2] * Math.cos(turn));
    const fr = cardFrame(cn);
    // lean the hanging card so its bottom swings out from the trunk
    const U = norm3(fr.U[0] - d[0] * 0.25, fr.U[1], fr.U[2] - d[2] * 0.25);
    const R = norm3(...cross3(U, cn));
    const ctr = [bx(yTop) + d[0] * off - U[0] * hgt * 0.5, yTop - U[1] * hgt * 0.5, bz(yTop) + d[2] * off - U[2] * hgt * 0.5];
    card(leaves, ctr, R, U, w / 2, hgt / 2, RECT.birch(i % 3 === 0 || f > 0.7 ? 1 : 0), nrm, col);
  }
  return { trunk, leaves };
}

// Bushes: soft round mound = painted leaf core half sunk in the ground + four tilted cluster cards
// around it. The flowering variant uses the blossom cells of the same atlas.
function bushModel(bloom) {
  const rand = mulberry32(bloom ? 7307 : 7301);
  const P = newPart();
  const c = [0, 0.32, 0];
  const S = [1.0, 0.78, 1.0];
  const nrm = (x, y, z) => norm3(x / S[0], (y - 0.05) / S[1] + 0.15, z / S[2]);
  const col = (x, y, z) => {
    const t = smoothstep(-0.25, 1.05, y);
    return shadeCol(t, 0.6 + 0.45 * t);
  };
  leafCore(P, { c, s: [S[0] * 0.72, S[1] * 0.72, S[2] * 0.72], jit: 0.1, flat: 0.3, seed: bloom ? 61 : 51, rect: cellRect(bloom ? 1 : 0, 1), uvPerM: 0.5 / 1.3, nrm, col });
  capDirs(6, -0.05, 0.9, bloom ? 1.1 : 0.3).forEach((d) => {
    const th = Math.atan2(d[2], d[0]);
    const tg = [-Math.sin(th), 0, Math.cos(th)];
    const tilt = 0.6 + rand() * 0.3;
    const cn = norm3(d[0] * Math.cos(tilt) + tg[0] * Math.sin(tilt), d[1] * Math.cos(tilt), d[2] * Math.cos(tilt) + tg[2] * Math.sin(tilt));
    const { R, U } = cardFrame(cn);
    const cc = [c[0] + d[0] * S[0] * 0.6, c[1] + d[1] * S[1] * 0.6, c[2] + d[2] * S[2] * 0.6];
    card(P, cc, R, U, 0.66, 0.66, cellRect(bloom ? 1 : 0, 0), nrm, col);
  });
  return P;
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
  if (!landOK(b, 0.2, 0.35) || b.h > 32) return 0; // treeline: pines stop where the snow starts
  const f = smoothstep(0.08, 0.28, b.forest);
  const alt = smoothstep(9, 14, b.h) * smoothstep(10, -30, z) * (1 - b.desert);
  const grove = smoothstep(0.33, 0.43, clump(x, z, 0.03, 11)); // clearings where the clump noise is low
  const steep = smoothstep(0.7, 0.5, b.slope);
  const tree = smoothstep(32, 27, b.h);
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
  if (!(b.h > 1.1 && b.h < 28 && b.under < 0.01 && b.slope < 0.7 && b.rock < 0.45 && b.desert < 0.3 && b.beach < 0.5)) return 0;
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
function partGeometry(P) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(P.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(P.t, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(P.c, 3));
  g.computeBoundingSphere();
  return g;
}

function setWrap(t, s, w) {
  if (t.wrapS !== s || t.wrapT !== w) {
    t.wrapS = s;
    t.wrapT = w;
    t.needsUpdate = true;
  }
}
// Five 512 x 512 painted maps (about 1.4 MB each on the GPU with mipmaps), cached by key across mounts.
function paintedMaps() {
  const pine = paintTexture('temperate-pine', drawPine, { size: 512, seed: 11, repeat: true });
  setWrap(pine, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping);
  const bark = paintTexture('temperate-bark', drawBark, { size: 512, seed: 15, repeat: true });
  setWrap(bark, THREE.ClampToEdgeWrapping, THREE.RepeatWrapping);
  return {
    pine,
    bark,
    oak: paintTexture('temperate-oak', drawOak, { size: 512, seed: 12 }),
    birch: paintTexture('temperate-birch', drawBirch, { size: 512, seed: 13 }),
    bush: paintTexture('temperate-bush', drawBush, { size: 512, seed: 14 }),
  };
}

const tint = new THREE.Color();
function instanceColor(it) {
  const t = it.t || 0;
  const v = it.v || 1;
  return tint.setRGB(v * (1 + 0.07 * t), v * (1 + 0.02 * t), v * (1 - 0.1 * t));
}

function build(Q, tier) {
  const detail = tier === 'low' ? 0 : tier === 'medium' ? 1 : 2;
  const maps = paintedMaps();
  const pine = pineModel(detail);
  const oak = oakModel(detail);
  const birch = birchModel(detail);
  const items = placeAll(Q);

  // All on the shared leafMaterial program (DoubleSide, instanced, instance colour): one GPU program.
  // Trunk and crown of a tree share sway so they bend together.
  const treeSway = 0.006;
  const bark = leafMaterial({ map: maps.bark, sway: treeSway, wrap: 0.45, rim: 0.12, trans: 0, cut: 0.5, aoScale: 0.12 });
  const pineMat = leafMaterial({ map: maps.pine, sway: treeSway, wrap: 0.7, rim: 0.3, trans: 0.25, cut: 0.5, aoScale: 0.05 });
  const oakMat = leafMaterial({ map: maps.oak, sway: treeSway, wrap: 0.72, rim: 0.3, trans: 0.35, cut: 0.5, aoScale: 0.07 });
  const birchMat = leafMaterial({ map: maps.birch, sway: 0.009, wrap: 0.75, rim: 0.3, trans: 0.5, cut: 0.5, aoScale: 0.06 });
  const bushMat = leafMaterial({ map: maps.bush, sway: 0.03, wrap: 0.8, rim: 0.3, trans: 0.3, cut: 0.5, aoScale: 0.4 });

  const parts = [
    ['pineTrunk', pine.trunk, bark, items.pine],
    ['pineLeaves', pine.leaves, pineMat, items.pine],
    ['oakTrunk', oak.trunk, bark, items.oak],
    ['oakLeaves', oak.leaves, oakMat, items.oak],
    ['birchTrunk', birch.trunk, bark, items.birch],
    ['birchLeaves', birch.leaves, birchMat, items.birch],
    ['bushPlain', bushModel(false), bushMat, items.bushPlain],
    ['bushFlower', bushModel(true), bushMat, items.bushFlower],
  ];
  const meshes = [];
  let tris = 0;
  for (const [name, P, mat, list] of parts) {
    if (!list.length) continue;
    const geo = partGeometry(P);
    const mesh = makeInstanced(geo, mat, list, instanceColor);
    mesh.name = 'temperate-' + name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    meshes.push(mesh);
    tris += triangles(geo) * list.length;
  }
  const counts = { pine: items.pine.length, oak: items.oak.length, birch: items.birch.length, bushes: items.bushPlain.length + items.bushFlower.length };
  return { meshes, materials: [bark, pineMat, oakMat, birchMat, bushMat], info: { draws: meshes.length, triangles: tris, programs: 1, counts } };
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
