// Round 2: painted Ghibli gouache atlas (pinnate palm fronds, torn banana paddles, fenestrated monstera,
// ribbed cactus skin with spine areoles, flowers) on smooth bent cards and round tubes; leafMaterial program.
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
import { cozyMaterial, leafMaterial } from '../materials/shading.js';
import { paintTexture } from '../materials/leafTex.js';
import { paint, paintUV, merge, makeInstanced, spherifyNormals, triangles, report } from '../lib/geo.js';

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
// Painted atlas (previewed in Node: tmp/tex/r2_tropical/atlas_v2.png)
// Tropical atlas painter (shared by preview and Tropical.js). 1024 canvas, 4 quadrants of 512.
// Q0 (0,0) palm frond | Q1 (512,0) banana leaf | Q2 (0,512) monstera | Q3 (512,512) cactus ribs + pad/flower column
function curvedLeaf(ctx, x0, y0, cx, cy, x1, y1, w, fill, shade, edge) {
  const N = 12;
  const L = [];
  const R = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    const x = a * x0 + b * cx + c * x1;
    const y = a * y0 + b * cy + c * y1;
    const dx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx);
    const dy = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy);
    const l = Math.hypot(dx, dy) || 1;
    const ww = w * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.98)), 0.75);
    L.push([x - (dy / l) * ww, y + (dx / l) * ww]);
    R.push([x + (dy / l) * ww, y - (dx / l) * ww]);
  }
  const path = (A, B) => {
    ctx.beginPath();
    ctx.moveTo(A[0][0], A[0][1]);
    for (const p of A) ctx.lineTo(p[0], p[1]);
    for (let i = B.length - 1; i >= 0; i--) ctx.lineTo(B[i][0], B[i][1]);
    ctx.closePath();
  };
  const S = L.map((p, i) => [(p[0] + R[i][0]) / 2, (p[1] + R[i][1]) / 2]);
  path(L, R);
  ctx.fillStyle = shade;
  ctx.fill();
  path(L, S);
  ctx.fillStyle = fill;
  ctx.fill();
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 7; i <= N; i++) ctx[i === 7 ? 'moveTo' : 'lineTo'](L[i][0], L[i][1]);
    ctx.stroke();
  }
}

function drawFrond(ctx, rand) {
  // rachis from bottom centre to top, leaflets sweep toward the tip and droop
  const rx = (t) => 256 + Math.sin(t * 2.2) * 6;
  const ry = (t) => 506 - t * 494;
  for (let pass = 0; pass < 2; pass++) {
    for (let t = 0.03; t < 0.98; t += 0.026) {
      for (const sd of [-1, 1]) {
        if (pass === 0 && rand() < 0.5) continue;
        const x = rx(t);
        const y = ry(t);
        const len = 250 * Math.pow(Math.sin(Math.PI * (0.08 + t * 0.9)), 0.65) * (0.88 + rand() * 0.18) * (pass ? 1 : 0.92);
        const up = 0.3 + t * 0.55 + (rand() - 0.5) * 0.15; // angle toward tip
        const dx = sd * Math.cos(up) * len;
        const dy = -Math.sin(up) * len * 0.6;
        const droop = len * (0.35 + rand() * 0.1);
        const tip = [x + dx, y + dy + droop * 0.75];
        const ctl = [x + dx * 0.55, y + dy * 0.9 - droop * 0.1];
        const k = rand();
        const lit = pass ? `hsl(${80 + k * 16},${42 + k * 10}%,${44 + t * 8 + k * 6}%)` : `hsl(${150 + k * 12},32%,${30 + k * 5}%)`;
        const shade = pass ? `hsl(${150 + k * 14},${34 + k * 8}%,${31 + k * 5}%)` : `hsl(${205 + k * 15},26%,${26 + k * 4}%)`;
        curvedLeaf(ctx, x, y, ctl[0], ctl[1], tip[0], tip[1], 6.5 + rand() * 2.5, lit, shade, pass ? `hsla(52,75%,70%,${0.5 + k * 0.4})` : null);
      }
    }
  }
  // rachis: pale ochre, lit stroke over a cool underside
  ctx.lineCap = 'round';
  for (const [w, c] of [[9, '#6f7d52'], [5, '#d8cf80']]) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (let t = 0; t <= 1.001; t += 0.05) ctx[t === 0 ? 'moveTo' : 'lineTo'](rx(t) - (w < 6 ? 1.5 : 0), ry(t));
    ctx.stroke();
  }
}

function drawBanana(ctx, rand) {
  const cx = 256;
  const hw = (t) => (t < 0.06 ? 0.04 : 196 * Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.04) / 0.98)), 0.55) * (0.75 + 0.25 * Math.min(1, t * 3)));
  const yAt = (t) => 504 - t * 496;
  ctx.beginPath();
  for (let t = 0; t <= 1.0001; t += 0.02) ctx.lineTo(cx - hw(t), yAt(t));
  for (let t = 1; t >= 0; t -= 0.02) ctx.lineTo(cx + hw(t), yAt(t));
  ctx.closePath();
  const g = ctx.createLinearGradient(30, 0, 482, 0);
  g.addColorStop(0, '#7fc25a');
  g.addColorStop(0.47, '#a8d46a');
  g.addColorStop(0.53, '#5fa65a');
  g.addColorStop(1, '#2f7a62');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // soft gouache patches
  for (let i = 0; i < 90; i++) {
    const x = 30 + rand() * 452;
    const y = 10 + rand() * 490;
    const r = 18 + rand() * 40;
    const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = x < cx ? `hsla(${80 + rand() * 20},55%,${55 + rand() * 10}%,0.35)` : `hsla(${170 + rand() * 40},35%,${30 + rand() * 8}%,0.35)`;
    gg.addColorStop(0, c);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // parallel side veins
  for (let y = 20; y < 500; y += 7 + rand() * 3) {
    for (const sd of [-1, 1]) {
      ctx.strokeStyle = sd < 0 ? `hsla(70,60%,78%,${0.25 + rand() * 0.2})` : `hsla(190,40%,22%,${0.25 + rand() * 0.2})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + sd * 6, y);
      ctx.quadraticCurveTo(cx + sd * 120, y - 22, cx + sd * 240, y - 60);
      ctx.stroke();
    }
  }
  // dry ochre edge
  ctx.strokeStyle = 'rgba(190,160,80,0.55)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let t = 0.5; t <= 1.0001; t += 0.02) ctx.lineTo(cx + hw(t) - 1, yAt(t));
  ctx.stroke();
  ctx.restore();
  // torn slits along the veins (cut into the alpha)
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 22; i++) {
    const sd = i % 2 ? 1 : -1;
    const t = 0.18 + rand() * 0.75;
    const y = yAt(t);
    const e = hw(t);
    const depth = e * (0.3 + rand() * 0.55);
    ctx.lineWidth = 2.5 + rand() * 3;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(cx + sd * (e + 8), y - 60 * (e / 240) + 4);
    ctx.lineTo(cx + sd * (e - depth), y - 60 * ((e - depth) / 240) + 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  // pale midrib
  ctx.lineCap = 'round';
  for (const [w, c] of [[14, '#8aa560'], [8, '#e8ecb0']]) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(cx, 508);
    ctx.lineTo(cx, 14);
    ctx.stroke();
  }
}

function drawMonstera(ctx, rand) {
  // heart: sinus at bottom centre (petiole junction), tip at top
  const cx = 256;
  const cy = 440;
  const rOf = (th) => 410 * (0.5 * Math.pow(1 + Math.cos(th), 0.85) + 0.04);
  const pt = (th, k = 1) => [cx + Math.sin(th) * rOf(th) * 0.62 * k, cy - Math.cos(th) * rOf(th) * k];
  ctx.beginPath();
  for (let th = -Math.PI * 0.92; th <= Math.PI * 0.92; th += 0.04) {
    const p = pt(th);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(40, 40, 470, 470);
  g.addColorStop(0, '#5aa85a');
  g.addColorStop(0.5, '#2f8048');
  g.addColorStop(1, '#1f5a5a');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // glossy highlight sweep and cool shade patches
  for (let i = 0; i < 60; i++) {
    const x = 40 + rand() * 430;
    const y = 30 + rand() * 420;
    const r = 15 + rand() * 35;
    const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
    gg.addColorStop(0, x + y < 520 ? 'hsla(95,50%,62%,0.3)' : 'hsla(200,35%,25%,0.3)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
    // side veins
  const K = 6;
  for (const sd of [-1, 1]) {
    for (let k = 1; k <= K; k++) {
      const th = sd * (k / (K + 0.6)) * Math.PI * 0.9;
      const o = pt(th, 0.98);
      ctx.strokeStyle = 'rgba(150,200,120,0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy - rOf(th) * 0.12);
      ctx.quadraticCurveTo((cx + o[0]) / 2, (cy + o[1]) / 2 - 20, o[0], o[1]);
      ctx.stroke();
    }
  }
  ctx.restore();
  // fenestrations: splits between veins from the margin, and oval holes near the midrib
  ctx.globalCompositeOperation = 'destination-out';
  for (const sd of [-1, 1]) {
    for (let k = 1; k <= K; k++) {
      const th = sd * ((k + 0.5) / (K + 0.6)) * Math.PI * 0.9;
      const o = pt(th, 1.05);
      const i = pt(th, 0.58 + rand() * 0.12);
      ctx.beginPath();
      ctx.moveTo(o[0] - 5, o[1]);
      ctx.lineTo(o[0] + 5, o[1]);
      ctx.lineTo(i[0], i[1]);
      ctx.closePath();
      ctx.fill();
      if (k < K) {
        const hpt = pt(th, 0.42);
        ctx.beginPath();
        ctx.ellipse(hpt[0], hpt[1], 7 + rand() * 4, 13 + rand() * 6, th * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#a8d48a';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy + 6);
  ctx.quadraticCurveTo(cx - 8, 250, cx, 40);
  ctx.stroke();
}

function drawCactus(ctx, rand) {
  // 6 ribs across 384px (crest lit, groove cool), spine areoles on crests
  const W = 384;
  ctx.fillStyle = '#5f8a5c';
  ctx.fillRect(0, 0, W, 512);
  for (let r = 0; r < 6; r++) {
    const x0 = r * 64;
    const g = ctx.createLinearGradient(x0, 0, x0 + 64, 0);
    g.addColorStop(0, '#3c6258');
    g.addColorStop(0.35, '#86ad6a');
    g.addColorStop(0.5, '#a9c97c');
    g.addColorStop(0.7, '#6f9a60');
    g.addColorStop(1, '#3c6258');
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, 64, 512);
  }
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `hsla(${rand() < 0.5 ? 90 : 190},30%,${rand() < 0.5 ? 70 : 28}%,0.12)`;
    ctx.fillRect(rand() * W, rand() * 512, 3 + rand() * 5, 20 + rand() * 50);
  }
  for (let r = 0; r < 6; r++) {
    for (let y = 8 + (r % 2) * 10; y < 512; y += 22) {
      const x = r * 64 + 32;
      ctx.strokeStyle = 'rgba(245,235,200,0.8)';
      ctx.lineWidth = 1.2;
      for (let s = 0; s < 5; s++) {
        const a = rand() * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7);
        ctx.stroke();
      }
      ctx.fillStyle = '#efe6c0';
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // right column (x 384..512): pad, pink flower, yellow flower, cream flower blocks of 128
  const X = 384;
  const pg = ctx.createRadialGradient(X + 50, 45, 5, X + 64, 64, 90);
  pg.addColorStop(0, '#b8d47e');
  pg.addColorStop(0.6, '#7fa85a');
  pg.addColorStop(1, '#4a7658');
  ctx.fillStyle = pg;
  ctx.fillRect(X, 0, 128, 128);
  for (let i = 0; i < 18; i++) {
    const x = X + 10 + rand() * 108;
    const y = 10 + rand() * 108;
    ctx.fillStyle = '#e9dca8';
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const flowers = [['#f6a6c0', '#d4507e', '#f7e07a'], ['#ffe27a', '#e8a838', '#c87a2a'], ['#fbf4dc', '#d8cfa8', '#f2d050']];
  flowers.forEach(([lit, shade, mid], f) => {
    const y0 = 128 * (f + 1);
    ctx.fillStyle = shade;
    ctx.fillRect(X, y0, 128, 128);
    for (let p = 0; p < 10; p++) {
      const a = (p / 10) * Math.PI * 2;
      curvedLeaf(ctx, X + 64, y0 + 64, X + 64 + Math.cos(a) * 40, y0 + 64 + Math.sin(a) * 40, X + 64 + Math.cos(a) * 62, y0 + 64 + Math.sin(a) * 62, 13, lit, shade, null);
    }
    ctx.fillStyle = mid;
    ctx.beginPath();
    ctx.arc(X + 64, y0 + 64, 14, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawTropicalAtlas(ctx, size, rand) {
  const q = size / 2;
  const s = q / 512;
  const at = (x, y, fn) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.rect(0, 0, 512, 512);
    ctx.clip();
    fn(ctx, rand);
    ctx.restore();
  };
  at(0, 0, drawFrond);
  at(q, 0, drawBanana);
  at(0, q, drawMonstera);
  at(q, q, drawCactus);
}


// ---------------------------------------------------------------------------------------------
// Atlas UV rects (canvas px of the 1024 atlas -> uv; CanvasTexture flips Y so v = 1 - y / 1024).
// ---------------------------------------------------------------------------------------------
const AT = 1024;
const uvPx = (x, y) => [x / AT, 1 - y / AT];
const UV_PETIOLE = uvPx(512 + 256, 260); // pale banana midrib: solid, pale green
const UV_RACHIS = uvPx(256, 470);

// ---------------------------------------------------------------------------------------------
// Builder: indexed geometry with colour + uv (+ optional explicit normals), returned non-indexed.
// ---------------------------------------------------------------------------------------------
class Builder {
  constructor() {
    this.p = [];
    this.c = [];
    this.u = [];
    this.n = [];
    this.i = [];
  }
  v(p, c, uv, n) {
    this.p.push(p[0], p[1], p[2]);
    this.c.push(c[0], c[1], c[2]);
    this.u.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
    if (n) this.n.push(n[0], n[1], n[2]);
    return this.p.length / 3 - 1;
  }
  tri(a, b, c) {
    this.i.push(a, b, c);
  }
  geometry(withUV = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (withUV) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.i);
    if (this.n.length === this.p.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    else g.computeVertexNormals();
    const out = g.toNonIndexed();
    g.dispose();
    return out;
  }
}

function connectRows(B, A, C) {
  if (C.length === A.length) {
    for (let k = 0; k < A.length - 1; k++) {
      B.tri(A[k], C[k], A[k + 1]);
      B.tri(A[k + 1], C[k], C[k + 1]);
    }
  } else if (C.length === 1) {
    for (let k = 0; k < A.length - 1; k++) B.tri(A[k], C[0], A[k + 1]);
  }
}

// Smooth round tube along a path with analytic (radial) normals, a seam-duplicated ring for uv and a
// rounded dome cap. colorFn(t, a) -> rgb with t 0..1 along, a 0..1 around. uvr: [u0, u1, v0, v1] or null.
function tube(B, pts, radii, S, colorFn, uvr, cap = 0) {
  const n = pts.length;
  let u = null;
  let T = [0, 1, 0];
  let w = null;
  const rings = [];
  const ring = (c, r, t, nk) => {
    const row = [];
    for (let k = 0; k <= S; k++) {
      const a = k / S;
      const ang = a * TAU;
      const rad = add(scl(u, Math.cos(ang)), scl(w, Math.sin(ang)));
      const nn = norm(add(scl(rad, 1 - nk), scl(T, nk)));
      const uv = uvr ? [uvr[0] + (uvr[1] - uvr[0]) * a, uvr[2] + (uvr[3] - uvr[2]) * Math.min(1, t)] : null;
      row.push(B.v(add(c, scl(rad, r)), colorFn(Math.min(1, t), a), uv, nn));
    }
    return row;
  };
  for (let i = 0; i < n; i++) {
    T = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    if (!u) u = norm(cross(T, Math.abs(T[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]));
    else u = norm(sub(u, scl(T, dot(u, T))));
    w = cross(u, T);
    rings.push(ring(pts[i], radii[i], i / (n - 1), 0));
  }
  if (cap > 0) {
    const e = pts[n - 1];
    const r = radii[n - 1];
    rings.push(ring(add(e, scl(T, cap * 0.55)), r * 0.78, 1.0, 0.45));
    rings.push(ring(add(e, scl(T, cap * 0.9)), r * 0.4, 1.0, 0.8));
  }
  for (let i = 0; i < rings.length - 1; i++) connectRows(B, rings[i], rings[i + 1]);
  if (cap > 0) {
    const last = rings[rings.length - 1];
    const ap = B.v(add(pts[n - 1], scl(T, cap)), colorFn(1, 0), uvr ? [(uvr[0] + uvr[1]) / 2, uvr[3]] : null, T);
    for (let k = 0; k < S; k++) B.tri(last[k], ap, last[k + 1]);
  }
  return rings;
}

// Painted leaf card along a bending spine: 3 vertices across (left edge, raised midrib, right edge,
// edges folded down by `fold`), last station a single tip vertex. uv: [uL, uR, vBase, vTip].
function leafStrip(B, spec) {
  const hd = [Math.cos(spec.az), 0, Math.sin(spec.az)];
  const side = [-Math.sin(spec.az), 0, Math.cos(spec.az)];
  const n = spec.ts.length;
  const [uL, uR, v0, v1] = spec.uv;
  const uM = (uL + uR) / 2;
  const dp = spec.droopPow || 1.4;
  let p = spec.base.slice();
  let prev = null;
  for (let s = 0; s < n; s++) {
    const t = spec.ts[s];
    if (s > 0) {
      const tm = (spec.ts[s - 1] + t) * 0.5;
      const e = spec.e0 - spec.droop * Math.pow(tm, dp);
      const step = spec.L * (t - spec.ts[s - 1]);
      p = add(p, add(scl(hd, Math.cos(e) * step), [0, Math.sin(e) * step, 0]));
    }
    const v = v0 + (v1 - v0) * t;
    const col = spec.color(t);
    let row;
    if (s === n - 1) {
      row = [B.v(p, col, [uM, v])];
    } else {
      const e = spec.e0 - spec.droop * Math.pow(t, dp);
      const f = add(scl(hd, Math.cos(e)), [0, Math.sin(e), 0]);
      const up = norm(cross(side, f));
      const twist = (spec.twist || 0) * t;
      const cf = Math.cos(spec.fold);
      const sf = Math.sin(spec.fold);
      const W = spec.w[s];
      const sl = add(scl(side, Math.cos(twist)), scl(up, Math.sin(twist)));
      const ul = norm(cross(sl, f));
      const L = add(p, add(scl(sl, -W * cf), scl(ul, -W * sf)));
      const R = add(p, add(scl(sl, W * cf), scl(ul, -W * sf)));
      row = [B.v(L, col, [uL, v]), B.v(add(p, scl(ul, W * 0.04)), mulC(col, 1.06), [uM, v]), B.v(R, col, [uR, v])];
    }
    if (prev) connectRows(B, prev, row);
    prev = row;
  }
}

// Small flattened round bead with uv onto an atlas block (flowers, fruit, pads). Non-indexed, uv kept.
function bead(r, seg, color, center, sc, uvr) {
  const g = new THREE.SphereGeometry(r, seg + 2, seg);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uvr[0] + (uvr[1] - uvr[0]) * uv.getX(i), uvr[2] + (uvr[3] - uvr[2]) * uv.getY(i));
  const out = paintUV(g, '#ffffff');
  const cl = out.attributes.color;
  for (let i = 0; i < cl.count; i++) cl.setXYZ(i, color[0], color[1], color[2]);
  out.scale(sc[0], sc[1], sc[2]);
  out.translate(center[0], center[1], center[2]);
  return out;
}
// cactus atlas blocks
const UV_RIBS = [512 / AT, 896 / AT, 0.02, 0.48];
const blockUV = (b) => {
  const y0 = 512 + b * 128;
  return [(896 + 6) / AT, (1024 - 6) / AT, 1 - (y0 + 122) / AT, 1 - (y0 + 6) / AT];
};
const UV_PAD = blockUV(0);
const UV_PINK = blockUV(1);
const UV_YELLOW = blockUV(2);
const UV_CREAM = blockUV(3);

// ---------------------------------------------------------------------------------------------
// Coconut palm: smooth ringed trunk (painted leaf-scar rings in vertex colour) + coconut cluster,
// crown of long painted pinnate frond cards. Local frame: trunk leans to +x (placement faces the sea).
// ---------------------------------------------------------------------------------------------
const PALM_H = 8.0;
const PALM_BEND = 0.17;
const palmPoint = (t) => [PALM_BEND * PALM_H * Math.pow(t, 1.8), PALM_H * t, 0];
const PALM_TOP = palmPoint(1);

function palmTrunkGeometry(hi) {
  const B = new Builder();
  const rows = hi ? 7 : 6;
  const ts = [];
  for (let i = 0; i <= rows; i++) ts.push(i / rows);
  const pts = ts.map((t) => palmPoint(t));
  pts[0] = [0, -0.4, 0];
  const radii = ts.map((t) => 0.19 + 0.17 * Math.pow(1 - t, 5) + (t > 0.95 ? 0.03 : 0));
  const rings = hi ? 22 : 16; // painted leaf-scar rings (colour bands between vertex rows blend softly)
  tube(B, pts, radii, 6, (t, a) => {
    let c = mixC(P.trunkBase, P.trunk, smoothstep(0, 0.35, t));
    c = mixC(c, P.trunkTop, smoothstep(0.82, 1, t));
    const ring = 0.5 + 0.5 * Math.cos(t * rings * TAU);
    c = mixC(c, P.trunkRing, ring * 0.55);
    return mulC(c, 0.93 + 0.14 * valueNoise(a * 6, t * 9, 81));
  }, null, 0.2);
  const trunk = B.geometry(false);
  const T = PALM_TOP;
  const nuts = [];
  const nutSpots = [[0.24, -0.2, 0.08], [-0.04, -0.27, 0.25], [0.1, -0.3, -0.2]];
  for (let j = 0; j < (hi ? 3 : 2); j++) {
    const g = paint(new THREE.IcosahedronGeometry(0.17, 0), '#ffffff');
    spherifyNormals(g, new THREE.Vector3(), 1);
    g.scale(1, 1.12, 1);
    g.translate(T[0] + nutSpots[j][0], T[1] + nutSpots[j][1], nutSpots[j][2]);
    const cn = mixC(P.nutGreen, P.nutBrown, j * 0.45);
    const cl = g.attributes.color;
    const p = g.attributes.position;
    for (let i = 0; i < cl.count; i++) {
      const c = mixC(mulC(cn, 0.75), mulC(cn, 1.15), smoothstep(T[1] - 0.45, T[1] - 0.05, p.getY(i)));
      cl.setXYZ(i, c[0], c[1], c[2]);
    }
    nuts.push(g);
  }
  return merge([trunk, ...nuts]);
}

const PALM_FRONDS = [
  { az: 0.2, e0: 0.95, droop: 1.35, L: 3.4, age: 0 },
  { az: 0.95, e0: 0.4, droop: 1.75, L: 4.0, age: 0.5 },
  { az: 1.75, e0: 0.15, droop: 1.95, L: 4.2, age: 0.7 },
  { az: 2.55, e0: 0.75, droop: 1.5, L: 3.8, age: 0.3 },
  { az: 3.35, e0: 0.28, droop: 1.9, L: 4.1, age: 0.6 },
  { az: 4.1, e0: 1.1, droop: 1.2, L: 3.0, age: 0 },
  { az: 4.85, e0: 0.55, droop: 1.6, L: 3.9, age: 0.4 },
  { az: 5.6, e0: -0.08, droop: 2.0, L: 4.0, age: 1 },
];
// uv of the painted frond (Q0): full quadrant width, base at canvas y 506, tip at y 12.
const UV_FROND = [0, 512 / AT, 1 - 506 / AT, 1 - 12 / AT];

function addFrond(B, base, f, segs, W, fold) {
  const ts = [];
  const w = [];
  for (let s = 0; s <= segs; s++) ts.push(s / segs);
  for (let s = 0; s < segs; s++) w.push(W * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(0.95, 0.25 + ts[s] * 0.8))));
  const blade = f.age >= 1 ? P.frondOld : mixC(P.frondYoung, P.frond, smoothstep(0, 0.5, f.age));
  leafStrip(B, {
    base,
    az: f.az,
    e0: f.e0,
    droop: f.droop,
    L: f.L,
    ts,
    w,
    fold,
    twist: 0.35,
    uv: UV_FROND,
    // vertex colour tints the painted texture: pale near the crown, darker toward the hanging tips
    color: (t) => mulC(mixC(mixC(hex('#fff6dc'), hex('#ffffff'), t), blade, 0.12), 1.12 - 0.22 * t),
  });
}

function palmFrondGeometry(hi) {
  const B = new Builder();
  const base = add(PALM_TOP, [0, 0.12, 0]);
  const list = hi ? PALM_FRONDS : PALM_FRONDS.filter((_, i) => i !== 5);
  for (const f of list) addFrond(B, base, f, hi ? 5 : 4, 0.78, 0.5);
  const g = B.geometry();
  spherifyNormals(g, new THREE.Vector3(base[0], base[1] - 0.6, base[2]), 0.45);
  g.computeBoundingSphere();
  return g;
}

// Low palm: stubby bole and a fountain of short feathery fronds (same painted frond, fuller tint).
const LOW_FRONDS = [
  { az: 0.3, e0: 1.3, droop: 1.6, L: 2.0, age: 0 },
  { az: 1.35, e0: 1.05, droop: 1.9, L: 2.4, age: 0.4 },
  { az: 2.4, e0: 1.2, droop: 1.7, L: 2.2, age: 0.2 },
  { az: 3.4, e0: 0.95, droop: 2.0, L: 2.5, age: 0.6 },
  { az: 4.4, e0: 1.25, droop: 1.75, L: 2.1, age: 0.1 },
  { az: 5.4, e0: 0.85, droop: 2.1, L: 2.4, age: 1 },
];
function lowPalmGeometry(hi) {
  const B = new Builder();
  tube(B, [[0, -0.2, 0], [0, 0.42, 0]], [0.22, 0.15], 6, (t) => mixC(P.trunkBase, P.trunkTop, t), [UV_RACHIS[0], UV_RACHIS[0], UV_RACHIS[1], UV_RACHIS[1]], hi ? 0.1 : 0);
  const base = [0, 0.45, 0];
  for (const f of LOW_FRONDS) addFrond(B, base, f, hi ? 4 : 3, 0.5, 0.45);
  const g = B.geometry();
  spherifyNormals(g, new THREE.Vector3(0, 0.3, 0), 0.45);
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------
// Banana: smooth pseudostem (sheath stripes in vertex colour), 6 big painted paddle leaves
// (pale midrib, parallel veins, torn slits in the alpha) + a rolled young leaf; optional bunch.
// ---------------------------------------------------------------------------------------------
const BAN_TOP = 2.45;
function bananaStemGeometry(hi) {
  const B = new Builder();
  const ys = [-0.15, 0.6, 1.2, 1.8, BAN_TOP];
  const rs = [0.21, 0.17, 0.15, 0.14, 0.125];
  tube(B, ys.map((y) => [0, y, 0]), rs, hi ? 7 : 6, (t, a) => {
    let c = mixC(P.stemDark, P.stem, smoothstep(0, 0.7, t));
    const n = valueNoise(a * 7 + 3, t * 5, 83);
    c = mixC(c, P.sheathDry, smoothstep(0.45, 0.8, n) * (1 - t) * 0.9);
    // overlapping sheath edges: soft pale streaks around the stem
    return mulC(c, 1 + 0.12 * Math.max(0, Math.sin(a * TAU * 3 + t * 2)));
  }, null, 0.12);
  return B.geometry(false);
}

const BAN_LEAVES = [
  { az: 0.3, e0: 1.25, droop: 0.75, L: 2.0, age: 0 },
  { az: 1.4, e0: 0.95, droop: 1.25, L: 2.3, age: 0.3 },
  { az: 2.5, e0: 0.75, droop: 1.55, L: 2.4, age: 0.5 },
  { az: 3.6, e0: 1.05, droop: 1.1, L: 2.2, age: 0.2 },
  { az: 4.6, e0: 0.5, droop: 1.95, L: 2.3, age: 0.8 },
  { az: 5.6, e0: 0.35, droop: 2.35, L: 2.1, age: 1 },
];
const UV_BANANA = [512 / AT, 1, 1 - 508 / AT, 1 - 8 / AT];
function bananaLeafGeometry(hi) {
  const B = new Builder();
  const segs = 4;
  const ts = [];
  for (let s = 0; s <= segs; s++) ts.push(s / segs);
  for (const lf of BAN_LEAVES) {
    const W = 0.46;
    const tintC = lf.age >= 0.8 ? hex('#f2e6b0') : mixC(hex('#fbffe8'), hex('#ffffff'), lf.age);
    const base = [Math.cos(lf.az) * 0.08, BAN_TOP + 0.05 + (1 - lf.age) * 0.1, Math.sin(lf.az) * 0.08];
    leafStrip(B, {
      base,
      az: lf.az,
      e0: lf.e0,
      droop: lf.droop,
      L: lf.L,
      ts,
      w: ts.slice(0, -1).map(() => W),
      fold: 0.22,
      twist: 0.25 * (lf.age - 0.5),
      uv: UV_BANANA,
      color: (t) => mulC(tintC, 1.08 - 0.16 * t),
    });
  }
  // rolled young "cigar" leaf standing up from the centre (narrow slice of the painted midrib)
  leafStrip(B, {
    base: [0, BAN_TOP + 0.1, 0],
    az: 0.9,
    e0: 1.45,
    droop: 0.15,
    L: 1.0,
    ts: [0, 0.6, 1],
    w: [0.06, 0.06],
    fold: 0.9,
    uv: [600 / AT, 700 / AT, 1 - 480 / AT, 1 - 60 / AT],
    color: () => hex('#f4ffe0'),
  });
  return B.geometry();
}

function bananaBunchGeometry(hi) {
  const B = new Builder();
  tube(B, [[0.05, BAN_TOP + 0.05, 0], [0.5, BAN_TOP - 0.1, 0], [0.72, 1.9, 0]], [0.04, 0.04, 0.035], 5, () => P.stemDark, null, 0);
  // bunch: smooth fat column of ribbed hands, green-yellow
  tube(B, [[0.73, 1.95, 0], [0.75, 1.6, 0], [0.75, 1.25, 0], [0.73, 1.0, 0]], [0.12, 0.22, 0.2, 0.12], hi ? 8 : 6,
    (t, a) => mixC(P.fruit, P.fruitRipe, 0.3 + 0.4 * t).map((x) => x * (0.82 + 0.18 * Math.abs(Math.cos(a * TAU * 4)))), null, 0.1);
  const g = B.geometry(false);
  const bud = paint(new THREE.IcosahedronGeometry(0.1, 0), '#ffffff');
  spherifyNormals(bud, new THREE.Vector3(), 1);
  bud.scale(1, 1.7, 1);
  bud.translate(0.72, 0.72, 0);
  const cl = bud.attributes.color;
  for (let i = 0; i < cl.count; i++) cl.setXYZ(i, P.bud[0], P.bud[1], P.bud[2]);
  return merge([g, bud]);
}

// ---------------------------------------------------------------------------------------------
// Monstera clump: 4 glossy heart leaves (painted fenestrations + splits in the alpha) on petioles.
// Leaf card in local space: forward +x from the petiole junction, across z, gently cupped.
// The painted leaf (Q2) has its junction at canvas (256, 952), tip at y 552, half-width ~0.41 L.
// ---------------------------------------------------------------------------------------------
const MON_LEAVES = [
  { az: 0.2, ph: 0.62, hr: 0.32, L: 0.95, pitch: 0.55, young: 0 },
  { az: 1.75, ph: 0.88, hr: 0.36, L: 1.1, pitch: 0.42, young: 0 },
  { az: 3.3, ph: 0.5, hr: 0.42, L: 0.85, pitch: 0.7, young: 1 },
  { az: 4.75, ph: 0.98, hr: 0.24, L: 1.05, pitch: 0.36, young: 0 },
];
function monsteraLeaf(B, L, young, mtx) {
  const fs = [-0.17, 0.35, 1.0];
  const zs = [-0.43, 0, 0.43];
  const tintC = young ? hex('#f0ffd8') : hex('#ffffff');
  const v3 = new THREE.Vector3();
  let prev = null;
  for (const f of fs) {
    const row = [];
    for (const zf of zs) {
      const u = f * L;
      const z = zf * L;
      const y = -0.22 * (z * z) / L - 0.2 * Math.pow(Math.max(0, u - 0.3 * L), 2) / L + (zf === 0 ? 0.015 * L : 0);
      v3.set(u, y, z).applyMatrix4(mtx);
      row.push(B.v([v3.x, v3.y, v3.z], tintC, [(256 + zf * 400) / AT, 1 - (952 - f * 400) / AT]));
    }
    if (prev) connectRows(B, prev, row);
    prev = row;
  }
}
function monsteraGeometry() {
  const B = new Builder();
  const m = new THREE.Matrix4();
  const ry = new THREE.Matrix4();
  const rz = new THREE.Matrix4();
  for (const lf of MON_LEAVES) {
    const J = [Math.cos(lf.az) * lf.hr, lf.ph, Math.sin(lf.az) * lf.hr];
    const b0 = [Math.cos(lf.az) * 0.04, -0.05, Math.sin(lf.az) * 0.04];
    const side = [-Math.sin(lf.az) * 0.026, 0, Math.cos(lf.az) * 0.026];
    const pc = mulC(P.mPetiole, 2.2);
    const r0 = [B.v(sub(b0, side), pc, UV_PETIOLE), B.v(add(b0, [0, 0.02, 0]), pc, UV_PETIOLE), B.v(add(b0, side), pc, UV_PETIOLE)];
    const r1 = [B.v(sub(J, scl(side, 0.6)), pc, UV_PETIOLE), B.v(add(J, [0, 0.015, 0]), pc, UV_PETIOLE), B.v(add(J, scl(side, 0.6)), pc, UV_PETIOLE)];
    connectRows(B, r0, r1);
    rz.makeRotationZ(-lf.pitch);
    ry.makeRotationY(-lf.az);
    m.makeTranslation(J[0], J[1], J[2]).multiply(ry).multiply(rz);
    monsteraLeaf(B, lf.L, lf.young, m);
  }
  const g = B.geometry();
  spherifyNormals(g, new THREE.Vector3(0, 0.2, 0), 0.3);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Cacti: smooth round bodies, ribs + spine areoles painted (Q3), flowers as painted beads.
// ---------------------------------------------------------------------------------------------
const cactusTint = (t) => mixC(hex('#d8e0d0'), hex('#fffbe8'), smoothstep(0, 0.4, t));
function flowerBeads(list, uvr, r) {
  return list.map((c) => bead(r, 3, hex('#ffffff'), c, [1, 0.55, 1], uvr));
}
function saguaroGeometry(arms, hi) {
  const B = new Builder();
  const S = hi ? 8 : 6;
  const ys = [-0.15, 1.2, 2.6, 3.9, 4.6];
  tube(B, ys.map((y) => [0, y, 0]), [0.36, 0.34, 0.33, 0.31, 0.27], S, cactusTint, UV_RIBS, 0.3);
  const fl = [[0.06, 4.86, 0.05], [-0.09, 4.82, -0.07]];
  for (const a of arms) {
    const d = [Math.cos(a.az), 0, Math.sin(a.az)];
    const pt = (out, y) => [d[0] * out, a.y + y, d[2] * out];
    const pts = [pt(0.12, 0), pt(0.52, 0.06), pt(0.68 * a.reach, 0.5), pt(0.7 * a.reach, a.up)];
    tube(B, pts, [0.19, 0.19, 0.18, 0.16], S, (t) => cactusTint(0.4 + t * 0.6), [UV_RIBS[0], UV_RIBS[0] + (UV_RIBS[1] - UV_RIBS[0]) * 0.6, 0.1, 0.35], 0.18);
    if (a.flower) fl.push(add(pts[3], [0, 0.17, 0]));
  }
  return merge([B.geometry(), ...flowerBeads(fl, UV_CREAM, 0.09)]);
}
const SAGUARO_A = [{ az: 0.3, y: 1.9, reach: 1, up: 1.5, flower: true }];
const SAGUARO_B = [
  { az: 0.2, y: 1.7, reach: 1.05, up: 1.7, flower: true },
  { az: 3.4, y: 2.4, reach: 0.9, up: 1.2, flower: false },
  { az: 1.9, y: 3.0, reach: 0.8, up: 0.9, flower: true },
];

function barrelGeometry(hi) {
  const B = new Builder();
  const prof = [[-0.08, 0.36], [0.25, 0.43], [0.56, 0.39], [0.8, 0.26]];
  tube(B, prof.map((p) => [0, p[0], 0]), prof.map((p) => p[1]), hi ? 8 : 6, (t) => mixC(cactusTint(t), hex('#fff0c8'), smoothstep(0.7, 1, t) * 0.4), [UV_RIBS[0], UV_RIBS[1], 0.3, 0.45], 0.14);
  const fl = [];
  const nf = hi ? 4 : 2;
  for (let j = 0; j < nf; j++) {
    const a = (j / nf) * TAU + 0.4;
    fl.push([Math.cos(a) * 0.14, 0.9, Math.sin(a) * 0.14]);
  }
  return merge([B.geometry(), ...flowerBeads(fl, UV_YELLOW, 0.08)]);
}

const PEAR_PADS = [
  [0, 0.36, 0, 0, 0.05, 1],
  [0.28, 0.32, 0.12, 0.8, 0.45, 0.9],
  [0.06, 0.98, 0.02, 0.2, -0.3, 0.85],
  [0.52, 0.86, 0.2, 0.9, 0.55, 0.75],
  [-0.28, 0.82, -0.06, -0.3, -0.7, 0.75],
];
function pearGeometry(hi) {
  const parts = [];
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const pads = hi ? PEAR_PADS : PEAR_PADS.slice(0, 4);
  for (const [x, y, z, yaw, roll, s] of pads) {
    const g = bead(1, 4, hex('#ffffff'), [0, 0, 0], [1, 1, 1], UV_PAD);
    spherifyNormals(g, new THREE.Vector3(), 0.5);
    const p = g.attributes.position;
    const cl = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const c = mixC(hex('#b8c4c0'), hex('#fff8e0'), smoothstep(-1, 0.6, p.getY(i)));
      cl.setXYZ(i, c[0], c[1], c[2]);
    }
    e.set(0, yaw, roll);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(0.3 * s, 0.38 * s, 0.075 * s));
    g.applyMatrix4(m);
    parts.push(g);
  }
  const tunas = [[0.0, 1.33, 0.02], [0.16, 1.28, 0.02], [0.66, 1.12, 0.26]];
  for (const c of tunas) parts.push(bead(0.06, 3, hex('#e0a0b8'), c, [1, 1.25, 1], UV_PINK));
  parts.push(bead(0.075, 3, hex('#ffffff'), [-0.44, 1.07, -0.08], [1, 0.55, 1], UV_YELLOW));
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
// Build everything. 3 opaque parts on cozyMaterial (trunks, stems, bunches) and 8 parts on the shared
// leafMaterial program with one painted 1024 atlas (fronds, banana, monstera, cacti).
// ---------------------------------------------------------------------------------------------
export function buildTropical(Q, tier) {
  const hi = tier !== 'low';
  const atlas = paintTexture('tropical-atlas', drawTropicalAtlas, { size: 1024, seed: 7 });
  const DS = THREE.DoubleSide;
  const leaf = (o) => leafMaterial({ map: atlas, side: DS, cut: 0.5, ...o });
  const mats = {
    palmTrunk: cozyMaterial({ sway: 0.012, wrap: 0.45, rim: 0.12, aoScale: 0.09 }),
    bananaStem: cozyMaterial({ sway: 0.025, wrap: 0.55, rim: 0.2, aoScale: 0.2 }),
    palmFrond: leaf({ sway: 0.012, wrap: 0.8, rim: 0.35, trans: 0.45, aoScale: 0.09 }),
    lowPalm: leaf({ sway: 0.05, wrap: 0.8, rim: 0.3, trans: 0.4, aoScale: 0.35 }),
    bananaLeaf: leaf({ sway: 0.025, wrap: 0.75, rim: 0.3, trans: 0.5, aoScale: 0.2 }),
    monstera: leaf({ sway: 0.06, wrap: 0.65, rim: 0.35, trans: 0.3, aoScale: 0.45 }),
    cactus: leaf({ sway: 0, wrap: 0.5, rim: 0.2, trans: 0, aoScale: 0.25 }),
  };
  const palms = placePalms(Q.palms | 0);
  const lowPalms = placeLowPalms(Q.lowPalms | 0);
  const ban = placeBananas(Q.banana | 0);
  const mon = placeMonstera(Q.monstera | 0);
  const cac = placeCacti(Q.cactus | 0);

  const parts = [
    { name: 'palmTrunk', geo: palmTrunkGeometry(hi), mat: mats.palmTrunk, items: palms },
    { name: 'palmFronds', geo: palmFrondGeometry(hi), mat: mats.palmFrond, items: palms },
    { name: 'lowPalm', geo: lowPalmGeometry(hi), mat: mats.lowPalm, items: lowPalms },
    { name: 'bananaStem', geo: bananaStemGeometry(hi), mat: mats.bananaStem, items: ban.plants },
    { name: 'bananaLeaves', geo: bananaLeafGeometry(hi), mat: mats.bananaLeaf, items: ban.plants },
    { name: 'bananaBunch', geo: bananaBunchGeometry(hi), mat: mats.bananaStem, items: ban.bunches },
    { name: 'monstera', geo: monsteraGeometry(), mat: mats.monstera, items: mon },
    { name: 'saguaroA', geo: saguaroGeometry(SAGUARO_A, hi), mat: mats.cactus, items: cac.sagA },
    { name: 'saguaroB', geo: saguaroGeometry(SAGUARO_B, hi), mat: mats.cactus, items: cac.sagB },
    { name: 'barrel', geo: barrelGeometry(hi), mat: mats.cactus, items: cac.barrel },
    { name: 'pear', geo: pearGeometry(hi), mat: mats.cactus, items: cac.pear },
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
  const built = useMemo(() => buildTropical(Q, tier), [Q.palms, Q.lowPalms, Q.banana, Q.monstera, Q.cactus, tier]);

  useEffect(() => {
    report('tropical', { draws: built.draws, triangles: built.tris, programs: 2 });
  }, [built]);
  useEffect(
    () => () => {
      // the atlas is cached by paintTexture() and shared across rebuilds: keep it
      for (const p of built.parts) p.geo.dispose();
      for (const k of Object.keys(built.mats)) built.mats[k].dispose();
      for (const m of built.meshes) m.dispose();
    },
    [built]
  );

  return h('group', { name: 'tropical' }, ...built.meshes.map((m) => h('primitive', { key: m.name, object: m })));
}
