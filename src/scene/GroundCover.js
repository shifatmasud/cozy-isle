// Ground cover: long curly fluffy grass, wildflower drifts and western sword ferns (Polystichum munitum),
// painted like a Kazuo Oga meadow: the detail is in hand-painted gouache textures on a few large cards.
//
// Draws (7, all one leafMaterial program, DoubleSide, instance colours):
//   grass-curly   open 6-sided "vase" of painted cards (12 tris): long blades that arch and hook over at the
//   grass-fluffy  tips, cool blue-green roots, warm lit tips; curly/fluffy/dry are three tuft shapes over one
//   grass-dry     grass atlas. The outside is the front face (lit crown), the inside of the far wall shows
//                 through the gaps with flipped normals, so every tuft has a cool core.
//   grass-long    3 geometric ribbon blades per tuft (one a timothy seed stem) near the camera stops for depth.
//   flowers-warm  triangular vase of painted clump cards: oxeye daisy + meadow buttercup.
//   flowers-cool  lupin + red clover / cornflower.
//   fern          rosette of arching, V-folded frond strips; single-pinnate fronds with the sword-hilt lobe.
// Counts come from the tier: Q.grass blades (/6 per painted tuft, /60 long-blade tufts), Q.flowers heads
// (/4 per clump), Q.ferns rosettes. Fronds per rosette come from what is left of the triangle budget.
// Culling: instances are sorted into 12 m chunks; each part packs only the chunks within reach of the camera
// (grass 70 m, flowers 50 m, ferns 95 m) and inside the view cone, so it stays one draw per part.
// Placement only fills the camera stops (target disc, orbit disc and opening sightline): nothing is drawn
// from the island overview, where the painted terrain carries the meadow.
import { createElement as h, useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { scatter, sampleField, clump, WORLD_SIZE } from '../world/island.js';
import { mulberry32, valueNoise, smoothstep, clamp, lerp } from '../world/noise.js';
import { VIEWS } from '../world/views.js';
import { leafMaterial } from '../materials/shading.js';
import { paintTexture, brush } from '../materials/leafTex.js';
import { paintUV, makeInstanced, triangles, report } from '../lib/geo.js';

// ---- paint:begin ----
// Gouache painting for ground cover. Pure Canvas 2D: runs in the browser (paintTexture) and in Node for previews.
// Atlas layouts (fractions of the square canvas; canvas y grows downward, texture v = 1 - y):
//   grass atlas  3 x 2 tiles: G0 lush curly, G1 lush curly with meadow specks, G2 short fluffy,
//                             G3 dry golden, G4 six single-blade strips, G5 six seed-head stems.
//   flower atlas 2 x 2 tiles: F0 oxeye daisy, F1 meadow buttercup, F2 lupin, F3 red clover + cornflower.
//   fern atlas   4 strips:    one sword-fern frond each, rachis on the strip centre line, petiole at the bottom.
const GRASS_COLS = 3;
const GRASS_ROWS = 2;
const FLOWER_COLS = 2;
const FERN_STRIPS = 4;
const BLADE_STRIPS = 6;

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
function mixHex(a, b, t) {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

// Grass blade along a curling centre line: base (x, y), heading a0 (radians from straight up, + = right),
// curl added over the length (most of it near the tip, so the tip hooks over), width w. Flat-sided like a real
// blade, tapering over the top half. Value steps: body gradient, a lit band on the convex side, a pale tip accent.
function paintBlade(ctx, x, y, len, w, a0, curl, root, tip, light, rand, accent) {
  const N = 16;
  const L = [];
  const R = [];
  const C = [];
  let px = x;
  let py = y;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const th = a0 + curl * Math.pow(t, 2.1);
    const ww = w * (t < 0.45 ? 1 - 0.15 * t : Math.pow((1 - t) / 0.55, 0.85) * 0.93);
    const nx = Math.cos(th);
    const ny = Math.sin(th);
    C.push([px, py, th, ww]);
    L.push([px - nx * ww * 0.5, py - ny * ww * 0.5]);
    R.push([px + nx * ww * 0.5, py + ny * ww * 0.5]);
    px += Math.sin(th) * (len / N);
    py -= Math.cos(th) * (len / N);
  }
  const tipP = C[N];
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(L[i][0], L[i][1]);
    for (let i = N; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(x, y, tipP[0], tipP[1]);
  g.addColorStop(0, root);
  g.addColorStop(0.5, mixHex(root, tip, 0.62));
  g.addColorStop(1, tip);
  outline();
  ctx.fillStyle = g;
  ctx.fill();
  if (light) {
    // Lit band on the convex (outer, sun-facing) side from part way up: a crisp second value, not a blend.
    const s = curl >= 0 ? -1 : 1;
    ctx.save();
    outline();
    ctx.clip();
    ctx.beginPath();
    const i0 = Math.floor(N * (0.3 + rand() * 0.2));
    const side = (c, f) => [c[0] + s * Math.cos(c[2]) * c[3] * f, c[1] + s * Math.sin(c[2]) * c[3] * f];
    let q = side(C[i0], 0.6);
    ctx.moveTo(q[0], q[1]);
    for (let i = i0; i <= N; i++) {
      q = side(C[i], 0.6);
      ctx.lineTo(q[0], q[1]);
    }
    for (let i = N; i >= i0; i--) {
      q = side(C[i], -0.05 + 0.2 * (1 - (i - i0) / (N - i0 + 1)));
      ctx.lineTo(q[0], q[1]);
    }
    ctx.closePath();
    ctx.fillStyle = light;
    ctx.globalAlpha = 0.72;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  if (accent) {
    // Pale glint on the last fifth of the blade, sitting on the lit edge.
    const s = curl >= 0 ? -1 : 1;
    ctx.strokeStyle = accent;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, w * 0.22);
    ctx.beginPath();
    const j0 = Math.floor(N * 0.68);
    for (let i = j0; i < N; i++) {
      const c = C[i];
      const qx = c[0] + s * Math.cos(c[2]) * c[3] * 0.25;
      const qy = c[1] + s * Math.sin(c[2]) * c[3] * 0.25;
      if (i === j0) ctx.moveTo(qx, qy);
      else ctx.lineTo(qx, qy);
    }
    ctx.stroke();
  }
  return tipP;
}

function clipRect(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
}

// Faint colour under the whole tile (alpha well below the cut) so mipmaps do not pull dark fringes in.
function bleed(ctx, x, y, w, h, color) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = rgba(color, 0.14);
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

const GRASS_PAL = {
  lush: {
    base: '#35584a', violet: '#4a5a80',
    back: ['#30574a', '#4e7f4c'], mid: ['#3b6a3d', '#8abb4e'], front: ['#558a3a', '#c4de6c'],
    light: '#e6f19a', accent: '#f3f7c0',
  },
  dry: {
    base: '#5a5238', violet: '#6a5f78',
    back: ['#525236', '#8e8a4c'], mid: ['#6e6c3c', '#c4b462'], front: ['#8d8044', '#ecd68c'],
    light: '#fbeab0', accent: '#fff6d6',
  },
};

// A band of grass filling a tile: dense cool roots, three layers of blades (cool back, mid, warm curling front),
// tips that hook over, mostly with the wind (+x), and a few long blades breaking the top silhouette.
function paintGrassTile(ctx, x0, y0, w, h, rand, pal, o) {
  clipRect(ctx, x0 + 2, y0 + 2, w - 4, h - 4);
  const k = w / 341;
  const foot = y0 + h - 3 * k;
  const top = y0 + h * (1 - o.height);
  const span = foot - top;
  // Root mass: low overlapping dabs, cool blue-violet in the hollows between stems.
  for (let i = 0; i < 40; i++) {
    const x = x0 + rand() * w;
    const y = foot - rand() * span * 0.12;
    brush.dab(ctx, x, y, (8 + rand() * 12) * k, rand() < 0.3 ? pal.violet : pal.base, 0.9);
  }
  const layer = (n, c, lenLo, lenHi, wLo, wHi, curlLo, curlHi, lit) => {
    for (let i = 0; i < n; i++) {
      const xn = rand() * 1.1 - 0.05;
      const x = x0 + xn * w;
      // Dome profile across the tile: each tile wraps two sides of the tuft, so every tuft reads as three
      // rounded lobes and the straight top edge of the card never shows.
      const prof = 0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, Math.max(0, xn)));
      const len = span * (lenLo + rand() * (lenHi - lenLo)) * prof;
      const lean = (rand() - 0.4) * o.splay + (xn - 0.5) * 0.5;
      const curl = (curlLo + rand() * (curlHi - curlLo)) * (rand() < o.back ? -0.75 : 1);
      const root = mixHex(c[0], pal.base, rand() * 0.3);
      const tip = mixHex(c[1], c[0], rand() * 0.25);
      paintBlade(ctx, x, foot + 8 * k, len, (wLo + rand() * (wHi - wLo)) * k, lean, curl, root, tip,
        lit ? pal.light : null, rand, lit && rand() < 0.5 ? pal.accent : null);
    }
  };
  layer(o.n * 0.8, pal.back, 0.4, 0.8, 11, 16, 0.5, 1.4, false);
  layer(o.n * 0.7, pal.mid, 0.45, 0.9, 12, 17, 0.8, 2.0, true);
  layer(o.n * 0.6, pal.front, 0.5, 0.95, 12, 18, 1.1, 2.6, true);
  // A few long blades that break the silhouette and curl right over.
  layer(Math.max(3, o.n * 0.1), pal.front, 0.88, 1.02, 12, 15, 2.2, 3.2, true);
  if (o.specks) paintSpecks(ctx, x0, y0, w, h, top, span, rand, k);
  ctx.restore();
  bleed(ctx, x0, y0, w, h, pal.mid[0]);
}

// Tiny meadow flowers seen from far away: white daisy stars and buttercup dots on thread stems.
function paintSpecks(ctx, x0, y0, w, h, top, span, rand, k) {
  for (let i = 0; i < 9; i++) {
    const x = x0 + (0.08 + rand() * 0.84) * w;
    const y = top + span * (0.08 + rand() * 0.4);
    const white = rand() < 0.55;
    brush.stroke(ctx, x - 6 * k, y0 + h, 0.03, y0 + h - y, 2.5 * k, '#5e8f3a', 0.15);
    const r = (white ? 9 : 7) * k;
    if (white) {
      for (let p = 0; p < 9; p++) {
        const a = (p / 9) * Math.PI * 2;
        brush.leaf(ctx, x, y, a, r * 1.2, r * 0.45, p > 4 ? '#d9dcf0' : '#ffffff', null, 0.3);
      }
      brush.dab(ctx, x, y, r * 0.5, '#f4b830', 1);
    } else {
      brush.dab(ctx, x, y, r, '#e7a81c', 1);
      brush.dab(ctx, x - r * 0.2, y - r * 0.25, r * 0.65, '#ffe14a', 1);
      brush.dab(ctx, x - r * 0.35, y - r * 0.4, r * 0.22, '#fffbe0', 1);
    }
  }
}

// One straight tapered blade per strip (the geometry does the curling), or a seed-head stem with a plume.
function paintBladeStrips(ctx, x0, y0, w, h, rand, seed) {
  const sw = w / BLADE_STRIPS;
  for (let i = 0; i < BLADE_STRIPS; i++) {
    const sx = x0 + i * sw;
    clipRect(ctx, sx + 1, y0 + 2, sw - 2, h - 4);
    const cx = sx + sw / 2;
    const foot = y0 + h - 2;
    if (!seed) {
      const tones = [['#3c6b3c', '#c9e06c'], ['#46773c', '#d8e88a'], ['#355f45', '#a9cf5c']][i % 3];
      paintBlade(ctx, cx, foot, h * 0.97, sw * 0.84, 0, 0.0, tones[0], tones[1], null, rand, null);
      // Soft lit sheen down one side of the blade.
      const gl = ctx.createLinearGradient(0, foot, 0, y0);
      gl.addColorStop(0, 'rgba(230,245,160,0)');
      gl.addColorStop(0.6, 'rgba(230,245,160,0.45)');
      gl.addColorStop(1, 'rgba(245,250,200,0.8)');
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = gl;
      ctx.fillRect(cx - sw * 0.42, y0, sw * 0.3, h);
      ctx.restore();
      // Midrib groove: a darker line with a lit edge.
      ctx.strokeStyle = 'rgba(40,70,50,0.45)';
      ctx.lineWidth = sw * 0.06;
      ctx.beginPath();
      ctx.moveTo(cx, foot);
      ctx.lineTo(cx - sw * 0.02, y0 + h * 0.12);
      ctx.stroke();
    } else {
      // Stem (thin, slightly zigzag) and a soft timothy/foxtail plume on the top third.
      ctx.strokeStyle = '#6f9a45';
      ctx.lineWidth = sw * 0.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, foot);
      ctx.quadraticCurveTo(cx + sw * 0.08, y0 + h * 0.5, cx, y0 + h * 0.3);
      ctx.stroke();
      const t0 = y0 + h * 0.04;
      const t1 = y0 + h * 0.34;
      const warm = i % 2 === 0;
      // Spikelets: small overlapping pointed scales angled up the stem, lit on the left, cool on the right.
      for (let j = 0; j < 90; j++) {
        const t = j / 90;
        const y = t1 - (t1 - t0) * t + (rand() - 0.5) * 4;
        const wid = sw * 0.3 * Math.sin(Math.PI * Math.min(1, (1 - t) * 0.9 + 0.1));
        const sideR = rand() < 0.5;
        const x = cx + (sideR ? 1 : -1) * rand() * wid;
        const ang = Math.PI + (sideR ? -0.45 : 0.45) + (rand() - 0.5) * 0.3;
        const lit = !sideR;
        const col = warm ? (lit ? '#f1e2a4' : '#a2916a') : (lit ? '#dbe9a4' : '#7f9682');
        brush.leaf(ctx, x, y, ang, sw * (0.16 + rand() * 0.08), sw * 0.06, col, null, 0.8);
      }
      // Fine bristles breaking the plume edge.
      for (let j = 0; j < 14; j++) {
        const y = t0 + (t1 - t0) * rand();
        brush.stroke(ctx, cx, y, (rand() - 0.5) * 2.2, sw * 0.42, 1, warm ? 'rgba(250,240,200,0.8)' : 'rgba(225,238,190,0.8)', 0.2);
      }
    }
    ctx.restore();
  }
  bleed(ctx, x0, y0, w, h, '#4b7a40');
}

export function drawGrassAtlas(ctx, size, rand) {
  const tw = size / GRASS_COLS;
  const th = size / GRASS_ROWS;
  const T = (i) => [(i % GRASS_COLS) * tw, Math.floor(i / GRASS_COLS) * th];
  let p = T(0);
  paintGrassTile(ctx, p[0], p[1], tw, th, rand, GRASS_PAL.lush, { n: 40, height: 0.96, splay: 0.7, back: 0.2 });
  p = T(1);
  paintGrassTile(ctx, p[0], p[1], tw, th, rand, GRASS_PAL.lush, { n: 36, height: 0.9, splay: 0.8, back: 0.25, specks: true });
  p = T(2);
  paintGrassTile(ctx, p[0], p[1], tw, th, rand, GRASS_PAL.lush, { n: 46, height: 0.8, splay: 1.4, back: 0.45 });
  p = T(3);
  paintGrassTile(ctx, p[0], p[1], tw, th, rand, GRASS_PAL.dry, { n: 38, height: 0.95, splay: 0.9, back: 0.3 });
  p = T(4);
  paintBladeStrips(ctx, p[0], p[1], tw, th, rand, false);
  p = T(5);
  paintBladeStrips(ctx, p[0], p[1], tw, th, rand, true);
}

// ---- wildflowers ----
// Short grass blades in front of the stems so a flower clump sits in the meadow instead of on it.
function grassSkirt(ctx, x0, w, foot, hgt, n, rand, k) {
  const pal = GRASS_PAL.lush;
  for (let i = 0; i < n; i++) {
    const c = i < n * 0.45 ? pal.back : i < n * 0.8 ? pal.mid : pal.front;
    const curl = (0.6 + rand() * 1.6) * (rand() < 0.35 ? -0.8 : 1);
    paintBlade(ctx, x0 + rand() * w, foot + 6 * k, hgt * (0.45 + rand() * 0.55), (9 + rand() * 6) * k, (rand() - 0.45) * 0.9,
      curl, c[0], c[1], i >= n * 0.45 ? pal.light : null, rand, null);
  }
}
function stemLine(ctx, x, y, x1, y1, bend, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo((x + x1) / 2 + bend, (y + y1) / 2, x1, y1);
  ctx.stroke();
}

// Oxeye daisy head in three-quarter view: strap petals (warm cream in sun, cool lilac where they turn away),
// gold disc with a shadowed lower crescent and a lit upper rim.
function daisyHead(ctx, x, y, r, tilt, rand) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(1, 0.62 + rand() * 0.2);
  const n = 18 + Math.floor(rand() * 5);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.08;
      const up = Math.sin(a) < 0; // canvas: negative sin = upper half
      if ((pass === 0) !== up) continue;
      const lit = Math.cos(a + 0.8) < 0.2;
      const col = up ? (lit ? '#fffdf2' : '#eceaf6') : lit ? '#f4f1ea' : '#c6c8e6';
      brush.leaf(ctx, 0, 0, a - Math.PI / 2, r * (0.92 + rand() * 0.16), r * 0.17, col, null, 0.15);
    }
  }
  brush.dab(ctx, 0, r * 0.05, r * 0.36, '#c98a1e', 1);
  brush.dab(ctx, 0, -r * 0.02, r * 0.3, '#f3b82c', 1);
  brush.dab(ctx, -r * 0.08, -r * 0.1, r * 0.15, '#ffe27a', 1);
  ctx.restore();
}

function paintDaisyTile(ctx, x0, y0, w, h, rand) {
  clipRect(ctx, x0 + 2, y0 + 2, w - 4, h - 4);
  const k = w / 512;
  const foot = y0 + h - 3 * k;
  // Basal leaves: narrow, toothed-looking dark leaves.
  for (let i = 0; i < 10; i++) {
    const x = x0 + (0.15 + rand() * 0.7) * w;
    brush.leaf(ctx, x, foot, Math.PI + (rand() - 0.5) * 1.6, (60 + rand() * 50) * k, 11 * k, rand() < 0.5 ? '#3f6e3a' : '#4f8240', '#2f5434', 0.5);
  }
  const heads = [];
  for (let i = 0; i < 9; i++) {
    const hx = x0 + (0.1 + 0.8 * (i / 8) + (rand() - 0.5) * 0.1) * w;
    const hy = y0 + h * (0.12 + rand() * 0.46);
    heads.push([hx, hy, (34 + rand() * 12) * k * (hy < y0 + h * 0.3 ? 1 : 0.88)]);
  }
  for (const hd of heads) {
    const bx = hd[0] + (rand() - 0.5) * 60 * k;
    stemLine(ctx, bx, foot, hd[0], hd[1] + hd[2] * 0.3, (rand() - 0.5) * 30 * k, 7 * k, '#4f8a3a');
    stemLine(ctx, bx, foot, hd[0], hd[1] + hd[2] * 0.3, (rand() - 0.5) * 30 * k, 2 * k, 'rgba(190,225,120,0.6)');
    // One small stem leaf.
    const t = 0.55 + rand() * 0.2;
    brush.leaf(ctx, bx + (hd[0] - bx) * t, foot + (hd[1] - foot) * t, Math.PI + (rand() < 0.5 ? 0.7 : -0.7), 34 * k, 6 * k, '#4a7f3c', null, 0.6);
  }
  heads.sort((a, b) => a[1] - b[1]);
  for (const hd of heads) daisyHead(ctx, hd[0], hd[1], hd[2], (rand() - 0.5) * 0.5, rand);
  grassSkirt(ctx, x0, w, foot, h * 0.44, 40, rand, k);
  ctx.restore();
  bleed(ctx, x0, y0, w, h, '#5b8f3e');
}

// Meadow buttercup: branching thread stems, small glossy cups of five round petals (gold shade, lemon light,
// a white gloss spot), half-open buds, deeply cut leaves low down.
function buttercupHead(ctx, x, y, r, rand) {
  const a0 = rand() * Math.PI * 2;
  for (let i = 0; i < 5; i++) {
    const a = a0 + (i / 5) * Math.PI * 2;
    const back = Math.sin(a) < 0;
    brush.leaf(ctx, x, y, a - Math.PI / 2, r, r * 0.62, back ? '#e8a612' : '#f6c21c', null, 0.0);
  }
  brush.dab(ctx, x, y - r * 0.05, r * 0.75, '#ffd83a', 1);
  brush.dab(ctx, x - r * 0.25, y - r * 0.3, r * 0.4, '#ffe96e', 1);
  brush.dab(ctx, x + r * 0.15, y + r * 0.2, r * 0.38, '#c98a12', 0.6);
  brush.dab(ctx, x, y, r * 0.2, '#b9a020', 1);
  brush.dab(ctx, x - r * 0.38, y - r * 0.42, r * 0.16, '#fffbe6', 1);
}
function paintButtercupTile(ctx, x0, y0, w, h, rand) {
  clipRect(ctx, x0 + 2, y0 + 2, w - 4, h - 4);
  const k = w / 512;
  const foot = y0 + h - 3 * k;
  for (let i = 0; i < 7; i++) {
    const x = x0 + (0.15 + rand() * 0.7) * w;
    const y = foot - rand() * 40 * k;
    for (let j = 0; j < 5; j++) brush.leaf(ctx, x, y, Math.PI + (j - 2) * 0.45, 30 * k, 10 * k, j % 2 ? '#3e7038' : '#4d8340', null, 0.4);
  }
  const heads = [];
  for (let s = 0; s < 5; s++) {
    const bx = x0 + (0.14 + 0.72 * (s / 4) + (rand() - 0.5) * 0.08) * w;
    const fy = y0 + h * (0.5 + rand() * 0.15);
    const fx = bx + (rand() - 0.5) * 40 * k;
    stemLine(ctx, bx, foot, fx, fy, (rand() - 0.5) * 30 * k, 6 * k, '#4f8a3a');
    for (let b = 0; b < 3; b++) {
      const hx = fx + (b - 1) * (34 + rand() * 30) * k;
      const hy = fy - (30 + rand() * 150) * k;
      if (hy < y0 + 30 * k) continue;
      stemLine(ctx, fx, fy, hx, hy, (rand() - 0.5) * 20 * k, 4.5 * k, '#568f3c');
      heads.push([hx, hy, (19 + rand() * 7) * k, b === 2 && rand() < 0.4]);
    }
  }
  for (const hd of heads) {
    if (hd[3]) {
      brush.dab(ctx, hd[0], hd[1], hd[2] * 0.55, '#7fa23a', 1);
      brush.dab(ctx, hd[0] - hd[2] * 0.1, hd[1] - hd[2] * 0.2, hd[2] * 0.35, '#e8c22a', 1);
    } else buttercupHead(ctx, hd[0], hd[1], hd[2], rand);
  }
  grassSkirt(ctx, x0, w, foot, h * 0.44, 40, rand, k);
  ctx.restore();
  bleed(ctx, x0, y0, w, h, '#5b8f3e');
}

// Lupin: tall tapering spikes of pea flowers, violet-blue with pale banners, lit on the left, deep blue-violet
// on the right; green-purple buds at the tip; palmate leaves (radiating leaflets) at the foot.
function paintLupinTile(ctx, x0, y0, w, h, rand) {
  clipRect(ctx, x0 + 2, y0 + 2, w - 4, h - 4);
  const k = w / 512;
  const foot = y0 + h - 3 * k;
  for (let i = 0; i < 5; i++) {
    const x = x0 + (0.15 + rand() * 0.7) * w;
    const y = foot - (30 + rand() * 70) * k;
    stemLine(ctx, x, foot, x, y, 0, 3 * k, '#4c7f3e');
    for (let j = 0; j < 9; j++) {
      const a = Math.PI + (j - 4) * 0.36 + 0.0;
      brush.leaf(ctx, x, y, a, 34 * k, 7 * k, j % 2 ? '#4a8344' : '#5a9450', '#3a6a3a', 0.5);
    }
  }
  const spikes = [];
  for (let i = 0; i < 4; i++) {
    const bx = x0 + (0.16 + 0.68 * (i / 3) + (rand() - 0.5) * 0.08) * w;
    const top = y0 + h * (0.05 + rand() * 0.18);
    const base = top + h * (0.34 + rand() * 0.1);
    const tone = [['#5a4cc0', '#8f80ea', '#cfc8ff'], ['#6b4bb8', '#a07ee6', '#e6d8ff'], ['#4c5ec8', '#8a9cf0', '#d8e0ff'], ['#7a52b8', '#b48ae4', '#f0e0ff']][i];
    spikes.push({ bx, top, base, tone });
  }
  for (const sp of spikes) {
    stemLine(ctx, sp.bx, foot, sp.bx + 4 * k, sp.base, 6 * k, 6 * k, '#4f7f3f');
    stemLine(ctx, sp.bx + 4 * k, sp.base, sp.bx + 2 * k, sp.top, 0, 4 * k, '#5d8a46');
    // Florets packed in a soft cone, biggest at the bottom: open pea flowers below, tight buds at the tip.
    // Left side lit (pale banners), right side in cool blue-violet shade.
    const n = 80;
    const cx = sp.bx + 3 * k;
    for (let j = 0; j < n; j++) {
      const t = Math.pow(j / (n - 1), 0.85); // 0 = bottom of spike
      const y = sp.base - (sp.base - sp.top) * t + (rand() - 0.5) * 6 * k;
      const wid = (30 * (1 - t) + 9) * k;
      const u = rand() * 2 - 1;
      const x = cx + u * wid;
      const bud = t > 0.82;
      const r = (bud ? 7 : 15 - 6 * t) * k * (0.85 + rand() * 0.3);
      const col = bud ? mixHex('#7d9a56', sp.tone[0], 0.55) : u < -0.2 ? sp.tone[1] : u > 0.35 ? mixHex(sp.tone[0], '#3c3a8c', 0.35) : sp.tone[0];
      brush.leaf(ctx, x, y, Math.PI + u * 1.1, r * 1.3, r * 0.72, col, null, 0.05);
      if (!bud && u < 0.2 && rand() < 0.55) brush.dab(ctx, x - r * 0.1, y - r * 0.45, r * 0.38, sp.tone[2], 0.95);
    }
  }
  grassSkirt(ctx, x0, w, foot, h * 0.42, 38, rand, k);
  ctx.restore();
  bleed(ctx, x0, y0, w, h, '#5b8f3e');
}

// Red clover globes (many small upturned florets, rose-pink light, mauve shade) over trefoil leaves with the
// pale chevron, and taller cornflowers: ragged cobalt rays round a dark violet heart on a green bract cup.
function cloverHead(ctx, x, y, r, rand) {
  brush.dab(ctx, x, y + r * 0.1, r * 1.05, '#9a4a7e', 1);
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * r * 0.85;
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d * 0.95;
    const lit = px - x < r * 0.2 && py - y < r * 0.3;
    brush.leaf(ctx, px, py, Math.PI + (px - x) / r * 0.6, r * 0.42, r * 0.13, lit ? '#f6a9c8' : '#d26a9a', null, 0.4);
  }
  brush.dab(ctx, x - r * 0.3, y - r * 0.35, r * 0.25, '#ffd3e4', 0.9);
}
function trefoil(ctx, x, y, r, rand) {
  for (let i = 0; i < 3; i++) {
    const a = Math.PI + (i - 1) * 0.95 + (rand() - 0.5) * 0.2;
    brush.leaf(ctx, x, y, a, r, r * 0.5, i === 1 ? '#4f8a42' : '#3f7539', null, 0.0);
    const cx = x - Math.sin(a) * r * 0.55;
    const cy = y + Math.cos(a) * r * 0.55;
    brush.dab(ctx, cx, cy, r * 0.14, 'rgba(210,235,190,0.7)', 1);
  }
}
function cornflowerHead(ctx, x, y, r, rand) {
  brush.leaf(ctx, x, y + r * 0.9, Math.PI, r * 0.8, r * 0.36, '#5f8a52', null, 0.2);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * 0.95 + (i / (n - 1)) * Math.PI * 0.9 + (rand() - 0.5) * 0.15 - Math.PI * 0.03;
    const col = i < n / 2 ? '#7da2f2' : '#3f62cc';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    brush.leaf(ctx, 0, 0, Math.PI, r * 1.05, r * 0.28, col, null, 0.0);
    // Ragged floret mouth: three little teeth.
    for (let t = -1; t <= 1; t++) brush.leaf(ctx, t * r * 0.12, -r * 0.95, Math.PI + t * 0.4, r * 0.25, r * 0.08, col, null, 0.6);
    ctx.restore();
  }
  brush.dab(ctx, x, y + r * 0.05, r * 0.28, '#3a2a78', 1);
}
function paintCloverTile(ctx, x0, y0, w, h, rand) {
  clipRect(ctx, x0 + 2, y0 + 2, w - 4, h - 4);
  const k = w / 512;
  const foot = y0 + h - 3 * k;
  // Cornflowers behind (taller, thin grey-green stems).
  for (let i = 0; i < 3; i++) {
    const hx = x0 + (0.2 + 0.6 * (i / 2) + (rand() - 0.5) * 0.1) * w;
    const hy = y0 + h * (0.12 + rand() * 0.2);
    stemLine(ctx, hx + (rand() - 0.5) * 50 * k, foot, hx, hy + 20 * k, (rand() - 0.5) * 30 * k, 4 * k, '#6a9254');
    cornflowerHead(ctx, hx, hy, (30 + rand() * 6) * k, rand);
  }
  for (let i = 0; i < 9; i++) trefoil(ctx, x0 + (0.1 + rand() * 0.8) * w, foot - (20 + rand() * 80) * k, (26 + rand() * 10) * k, rand);
  const heads = [];
  for (let i = 0; i < 6; i++) {
    const hx = x0 + (0.12 + 0.76 * (i / 5) + (rand() - 0.5) * 0.08) * w;
    heads.push([hx, y0 + h * (0.42 + rand() * 0.2), (26 + rand() * 8) * k]);
  }
  for (const hd of heads) {
    stemLine(ctx, hd[0] + (rand() - 0.5) * 40 * k, foot, hd[0], hd[1], (rand() - 0.5) * 20 * k, 5 * k, '#4f8a3a');
    trefoil(ctx, hd[0], hd[1] + hd[2] * 1.2, hd[2] * 0.8, rand);
  }
  for (const hd of heads) cloverHead(ctx, hd[0], hd[1], hd[2], rand);
  grassSkirt(ctx, x0, w, foot, h * 0.42, 38, rand, k);
  ctx.restore();
  bleed(ctx, x0, y0, w, h, '#5b8f3e');
}

export function drawFlowerAtlas(ctx, size, rand) {
  const t = size / FLOWER_COLS;
  paintDaisyTile(ctx, 0, 0, t, t, rand);
  paintButtercupTile(ctx, t, 0, t, t, rand);
  paintLupinTile(ctx, 0, t, t, t, rand);
  paintCloverTile(ctx, t, t, t, t, rand);
}

// ---- sword fern (Polystichum munitum) ----
// One frond per strip: chaffy petiole at the foot, then alternate, narrow, sickle-curved pinnae pointing toward
// the tip, each with the small upward "hilt" lobe at its base and bristle-toothed edges. Dark glossy green:
// cool blue-green lower halves, a lit upper half and a few wet glints.
function paintPinna(ctx, x, y, dir, len, wid, ang, rand, tone) {
  // dir: -1 left, +1 right. ang: angle above the horizontal toward the frond tip.
  const N = 9;
  const top = [];
  const bot = [];
  const mid = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = ang + 0.28 * t * t; // sickle curve up toward the tip
    const d = len * t;
    const px = x + dir * Math.cos(a) * d;
    const py = y - Math.sin(a) * d;
    const ww = wid * (t < 0.2 ? 0.75 + t * 1.25 : Math.pow((1 - t) / 0.8, 0.7)) * 0.5;
    const tooth = i > 0 && i < N && i % 2 === 0 ? 1.18 : 1;
    const nx = Math.sin(a) * dir;
    const ny = Math.cos(a);
    mid.push([px, py]);
    top.push([px - nx * ww * tooth, py - ny * ww * tooth]);
    bot.push([px + nx * ww * tooth, py + ny * ww * tooth]);
  }
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(top[0][0], top[0][1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(top[i][0], top[i][1]);
    for (let i = N - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath();
  };
  path();
  ctx.fillStyle = tone.body;
  ctx.fill();
  // Shaded lower half (cool), lit upper half (warm), as two flat value steps.
  ctx.save();
  path();
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(mid[0][0], mid[0][1]);
  for (let i = 1; i <= N; i++) ctx.lineTo(mid[i][0], mid[i][1]);
  for (let i = N; i >= 0; i--) ctx.lineTo(bot[i][0] + (bot[i][0] - mid[i][0]), bot[i][1] + (bot[i][1] - mid[i][1]));
  ctx.closePath();
  ctx.fillStyle = tone.shade;
  ctx.fill();
  ctx.beginPath();
  const i0 = 1;
  ctx.moveTo(mid[i0][0], mid[i0][1] - 1);
  for (let i = i0; i <= N - 1; i++) ctx.lineTo((mid[i][0] * 0.1 + top[i][0] * 0.9), (mid[i][1] * 0.1 + top[i][1] * 0.9));
  for (let i = N - 1; i >= i0; i--) ctx.lineTo(mid[i][0], mid[i][1] - 0.5);
  ctx.closePath();
  ctx.fillStyle = tone.lit;
  ctx.fill();
  ctx.restore();
  // Midrib and a wet glint.
  ctx.strokeStyle = tone.rib;
  ctx.lineWidth = Math.max(1, wid * 0.08);
  ctx.beginPath();
  ctx.moveTo(mid[0][0], mid[0][1]);
  ctx.lineTo(mid[N - 1][0], mid[N - 1][1]);
  ctx.stroke();
  if (rand() < 0.55) {
    const j = 3 + Math.floor(rand() * 3);
    brush.stroke(ctx, (mid[j][0] + top[j][0]) / 2, (mid[j][1] + top[j][1]) / 2, dir * (Math.PI / 2 - ang), len * 0.22, Math.max(1, wid * 0.12), tone.glint, 0);
  }
  // The hilt: small upward lobe at the base on the tip-ward side.
  brush.leaf(ctx, x + dir * wid * 0.35, y - wid * 0.25, dir > 0 ? Math.PI * 0.9 : -Math.PI * 0.9, wid * 0.95, wid * 0.32, tone.lit, null, 0.5);
}

const FERN_TONES = [
  { body: '#2f6a38', shade: '#24504a', lit: '#5a9a46', rib: '#2a4f34', glint: 'rgba(200,235,150,0.75)' },
  { body: '#336f3a', shade: '#27564c', lit: '#66a64c', rib: '#2c5236', glint: 'rgba(210,240,160,0.75)' },
  { body: '#2b6236', shade: '#21484a', lit: '#4f8f42', rib: '#274a32', glint: 'rgba(190,230,150,0.7)' },
  { body: '#357a3c', shade: '#285a4c', lit: '#70ad52', rib: '#2c5536', glint: 'rgba(220,245,170,0.8)' },
];

function paintFrond(ctx, x0, y0, w, h, rand, tone) {
  clipRect(ctx, x0 + 2, y0 + 2, w - 4, h - 4);
  const cx = x0 + w / 2;
  const foot = y0 + h - 2;
  const tipY = y0 + h * 0.015;
  const bend = (rand() - 0.5) * w * 0.06;
  const rach = (t) => [cx + bend * Math.sin(t * Math.PI) , foot - (foot - tipY) * t];
  // Pinnae: alternate, start above the petiole, longest a third of the way up, tapering to the tip.
  const n = 44;
  for (let i = 0; i < n; i++) {
    const t = 0.1 + (i / n) * 0.86;
    const dir = i % 2 === 0 ? -1 : 1;
    const q = rach(t + (dir > 0 ? 0.012 : 0));
    const u = (t - 0.1) / 0.86;
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, 0.22 + u * 0.86)), 0.8) * (1 - 0.35 * u);
    const len = w * 0.46 * env * (0.92 + rand() * 0.1);
    if (len < w * 0.05) continue;
    const wid = Math.max(w * 0.06, len * 0.27);
    paintPinna(ctx, q[0], q[1], dir, len, wid, 0.18 + 0.5 * u, rand, tone);
  }
  // Terminal pinna continuing the rachis.
  {
    const q = rach(0.86);
    brush.leaf(ctx, q[0], q[1], Math.PI, (foot - tipY) * 0.11, w * 0.06, tone.body, tone.rib, 0.8);
  }
  // Rachis and petiole (chaffy, brown-green, with pale scales).
  ctx.lineCap = 'round';
  const pts = [];
  for (let i = 0; i <= 20; i++) pts.push(rach((i / 20) * 0.9));
  ctx.strokeStyle = '#2f5534';
  ctx.lineWidth = w * 0.035;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const q of pts) ctx.lineTo(q[0], q[1]);
  ctx.stroke();
  ctx.strokeStyle = '#4f5232';
  ctx.lineWidth = w * 0.045;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo(rach(0.1)[0], rach(0.1)[1]);
  ctx.stroke();
  for (let i = 0; i < 14; i++) {
    const q = rach(rand() * 0.11);
    brush.dab(ctx, q[0] + (rand() - 0.5) * w * 0.05, q[1], w * 0.01, '#9a8c5e', 0.9);
  }
  // Lit edge on the rachis.
  ctx.strokeStyle = 'rgba(150,200,110,0.7)';
  ctx.lineWidth = w * 0.01;
  ctx.beginPath();
  ctx.moveTo(pts[3][0] - w * 0.01, pts[3][1]);
  for (let i = 3; i < pts.length; i++) ctx.lineTo(pts[i][0] - w * 0.01, pts[i][1]);
  ctx.stroke();
  ctx.restore();
  bleed(ctx, x0, y0, w, h, tone.body);
}

export function drawFernAtlas(ctx, size, rand) {
  const sw = size / FERN_STRIPS;
  for (let i = 0; i < FERN_STRIPS; i++) paintFrond(ctx, i * sw, 0, sw, size, rand, FERN_TONES[i]);
}
// ---- paint:end ----

// ---------- budgets and counts ----------
// Triangle budget for this file per tier (CONTRACT.md: low 75k, medium 160k). high is not contracted.
const FILE_BUDGET = { low: 75000, medium: 160000, high: 450000 };
const SAFETY = 0.98;
const BLADES_PER_TUFT = 6; // Q.grass counts blades; each painted tuft carries dozens, so this keeps cards few
const LONG_BLADE_DIV = 60; // Q.grass / 60 geometric long-blade tufts for depth near the camera stops
const FLOWERS_PER_CLUMP = 4; // Q.flowers counts heads; a painted clump card shows several
const CULL = { grass: 70, flowers: 50, ferns: 95 }; // metres from the camera (ferns also dress the far forest stop)
const CELL = 12; // culling grid cell (m)
const CELL_R = CELL * 0.75;

const VASE_SIDES = 6;
const TUFT_TRIS = VASE_SIDES * 2; // 12
const BLADE_SEGS = 6;
const LONG_TRIS = 3 * BLADE_SEGS * 2; // 36
const CLUMP_TRIS = 3 * 2; // 6
const FROND_SEGS = 4;
const FROND_TRIS = FROND_SEGS * 2 * 2; // 16

const TAU = Math.PI * 2;
const UV_INSET = 0.006;

// ---------- atlas uv ----------
// Tile rect in uv space. Canvas row 0 is the top of the texture (flipY), so v = 1 - y.
function grassTile(i) {
  const c = i % GRASS_COLS;
  const r = Math.floor(i / GRASS_COLS);
  return { u0: c / GRASS_COLS + UV_INSET, u1: (c + 1) / GRASS_COLS - UV_INSET, v0: 1 - (r + 1) / GRASS_ROWS + UV_INSET, v1: 1 - r / GRASS_ROWS - UV_INSET };
}
function flowerTile(i) {
  const c = i % FLOWER_COLS;
  const r = Math.floor(i / FLOWER_COLS);
  return { u0: c / FLOWER_COLS + UV_INSET, u1: (c + 1) / FLOWER_COLS - UV_INSET, v0: 1 - (r + 1) / FLOWER_COLS + UV_INSET, v1: 1 - r / FLOWER_COLS - UV_INSET };
}
function subStrip(t, i, n) {
  const w = (t.u1 - t.u0) / n;
  return { u0: t.u0 + w * i + UV_INSET * 0.5, u1: t.u0 + w * (i + 1) - UV_INSET * 0.5, v0: t.v0, v1: t.v1 };
}
// fv is squeezed a little at the top so far mips never pick up the neighbouring tile's roots.
function uvAt(t, fu, fv, mirror) {
  const u = mirror ? 1 - fu : fu;
  return [t.u0 + (t.u1 - t.u0) * u, t.v0 + (t.v1 - t.v0) * (0.005 + 0.97 * fv)];
}

// ---------- geometry ----------
// Collects triangles with explicit normals and uv. Winding is chosen so the face normal points along `out`
// (that side is the front face; leafMaterial flips normals on back faces, which then read as cool shade).
class CardBuilder {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
  }
  tri(a, b, c, out) {
    const ux = b.p[0] - a.p[0], uy = b.p[1] - a.p[1], uz = b.p[2] - a.p[2];
    const vx = c.p[0] - a.p[0], vy = c.p[1] - a.p[1], vz = c.p[2] - a.p[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const list = nx * out[0] + ny * out[1] + nz * out[2] < 0 ? [a, c, b] : [a, b, c];
    for (const v of list) {
      this.p.push(v.p[0], v.p[1], v.p[2]);
      this.n.push(v.n[0], v.n[1], v.n[2]);
      this.uv.push(v.uv[0], v.uv[1]);
    }
  }
  quad(a, b, c, d, out) {
    // a-b bottom edge, d-c top edge
    this.tri(a, b, c, out);
    this.tri(a, c, d, out);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    const out = paintUV(g, '#ffffff');
    out.computeBoundingSphere();
    return out;
  }
}
function norm3(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

// Grass tuft: an open "vase" of painted cards, narrow at the root and flaring out like a real tussock.
// The outside faces are front faces with normals between outward and up (lit, warm crowns); the inside of the
// far wall is seen through the gaps between blades with flipped normals, so the tuft core reads cool.
// tiles: three [tile, mirror] pairs, each wrapped over two adjacent sides.
function vaseGeometry({ r0, r1, H, tiles, seed }) {
  const rand = mulberry32(seed);
  const B = new CardBuilder();
  const S = VASE_SIDES;
  const a0 = rand() * TAU;
  const tops = [];
  for (let j = 0; j < S; j++) tops.push(H * (0.9 + rand() * 0.2));
  const ring = (j, top) => {
    const jj = j % S;
    const a = a0 + (jj / S) * TAU;
    const r = top ? r1 * (0.92 + 0.08 * ((jj * 7) % 3)) : r0;
    const y = top ? tops[jj] : 0;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const nrm = top ? norm3(ca * 0.62, 0.78, sa * 0.62) : norm3(ca * 0.35, 0.94, sa * 0.35);
    return { p: [ca * r, y, sa * r], n: nrm, ca, sa };
  };
  for (let j = 0; j < S; j++) {
    const pair = tiles[Math.floor(j / 2) % tiles.length];
    const t = pair[0];
    const mir = pair[1];
    const f0 = (j % 2) * 0.5;
    const f1 = f0 + 0.5;
    const b0 = ring(j, false);
    const b1 = ring(j + 1, false);
    const t1 = ring(j + 1, true);
    const t0 = ring(j, true);
    b0.uv = uvAt(t, f0, 0, mir);
    b1.uv = uvAt(t, f1, 0, mir);
    t1.uv = uvAt(t, f1, 1, mir);
    t0.uv = uvAt(t, f0, 1, mir);
    const am = a0 + ((j + 0.5) / S) * TAU;
    B.quad(b0, b1, t1, t0, [Math.cos(am), 0, Math.sin(am)]);
  }
  return B.geometry();
}

// Flower clump: an open triangular vase of three painted cards (two species tiles + one mirrored).
function clumpGeometry(tiles, seed) {
  const rand = mulberry32(seed);
  const B = new CardBuilder();
  const S = 3;
  const a0 = rand() * TAU;
  const r0 = 0.14;
  const r1 = 0.36;
  const H = 0.45;
  const ring = (j, top) => {
    const a = a0 + (j / S) * TAU;
    const r = top ? r1 : r0;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return { p: [ca * r, top ? H : 0, sa * r], n: top ? norm3(ca * 0.5, 0.86, sa * 0.5) : norm3(ca * 0.3, 0.95, sa * 0.3) };
  };
  for (let j = 0; j < S; j++) {
    const t = tiles[j][0];
    const mir = tiles[j][1];
    const b0 = ring(j, false);
    const b1 = ring(j + 1, false);
    const t1 = ring(j + 1, true);
    const t0 = ring(j, true);
    b0.uv = uvAt(t, 0, 0, mir);
    b1.uv = uvAt(t, 1, 0, mir);
    t1.uv = uvAt(t, 1, 1, mir);
    t0.uv = uvAt(t, 0, 1, mir);
    const am = a0 + ((j + 0.5) / S) * TAU;
    B.quad(b0, b1, t1, t0, [Math.cos(am), 0, Math.sin(am)]);
  }
  return B.geometry();
}

// One long ribbon blade (BLADE_SEGS segments) that rises and curls over at the tip; the painted strip gives
// it a tapered, pointed silhouette and a lit edge, so the ribbon itself can stay a constant width.
function addRibbon(B, o) {
  const fx = Math.cos(o.a);
  const fz = Math.sin(o.a);
  const sx = -fz;
  const sz = fx;
  const pts = [];
  let x = fx * o.r0;
  let y = 0;
  let z = fz * o.r0;
  const heads = [];
  for (let i = 0; i <= BLADE_SEGS; i++) {
    const t = i / BLADE_SEGS;
    const th = o.lean + o.curl * Math.pow(t, 1.8);
    pts.push([x, y, z]);
    heads.push(th);
    const dl = o.len / BLADE_SEGS;
    const thm = o.lean + o.curl * Math.pow(Math.min(1, t + 0.5 / BLADE_SEGS), 1.8);
    x += fx * Math.sin(thm) * dl;
    y += Math.cos(thm) * dl;
    z += fz * Math.sin(thm) * dl;
  }
  const hw = o.width * 0.5;
  // Upper (concave) side of the blade: (-f cos th, sin th). Shading normal leans it outward and up so the blade
  // shades with its tuft; that side is the front face, the underside shows flipped (cool) normals.
  const upper = (th) => [-fx * Math.cos(th), Math.sin(th), -fz * Math.cos(th)];
  for (let i = 0; i < BLADE_SEGS; i++) {
    const mk = (j, side) => {
      const p = pts[j];
      const u = upper(heads[j]);
      const n = norm3(u[0] * 0.4 + fx * 0.3, u[1] * 0.4 + 0.7, u[2] * 0.4 + fz * 0.3);
      const tw = o.twist * (j / BLADE_SEGS);
      const ex = sx * Math.cos(tw);
      const ez = sz * Math.cos(tw);
      const ey = Math.sin(tw);
      return {
        p: [p[0] + side * ex * hw, p[1] + side * ey * hw, p[2] + side * ez * hw],
        n,
        uv: uvAt(o.tile, side < 0 ? 0 : 1, j / BLADE_SEGS, false),
      };
    };
    B.quad(mk(i, -1), mk(i, 1), mk(i + 1, 1), mk(i + 1, -1), upper((heads[i] + heads[i + 1]) / 2));
  }
}
function longBladeGeometry(seed) {
  const rand = mulberry32(seed);
  const B = new CardBuilder();
  const blades = grassTile(4);
  const seeds = grassTile(5);
  const a0 = rand() * TAU;
  for (let i = 0; i < 3; i++) {
    const seedHead = i === 2;
    const a = a0 + (i / 3) * TAU + (rand() - 0.5) * 0.6;
    addRibbon(B, {
      a,
      r0: 0.03,
      lean: seedHead ? 0.08 : 0.15 + rand() * 0.15,
      curl: seedHead ? 0.35 : 1.7 + rand() * 0.6,
      len: seedHead ? 1.25 : 0.95 + rand() * 0.25,
      width: seedHead ? 0.075 : 0.05,
      twist: (rand() - 0.5) * 0.6,
      tile: subStrip(seedHead ? seeds : blades, Math.floor(rand() * BLADE_STRIPS), BLADE_STRIPS),
    });
  }
  return B.geometry();
}

// Sword fern rosette: `fronds` arching cards; each frond is a 2-column strip folded along the rachis (the
// pinnae droop to either side) and bends from the crown, inner fronds upright, outer ones arching wide.
function fernGeometry(fronds, seed) {
  const rand = mulberry32(seed);
  const B = new CardBuilder();
  const a0 = rand() * TAU;
  const tex = { u0: 0, u1: 1, v0: UV_INSET, v1: 1 - UV_INSET };
  for (let f = 0; f < fronds; f++) {
    const inner = f % 3 === 0;
    const a = a0 + (f / fronds) * TAU + (rand() - 0.5) * 0.5;
    const th0 = inner ? 0.25 + rand() * 0.2 : 0.5 + rand() * 0.3;
    const k = 0.9 + rand() * 0.5;
    const L = (inner ? 0.85 : 1.0) * (0.88 + rand() * 0.24);
    const strip = subStrip(tex, Math.floor(rand() * FERN_STRIPS), FERN_STRIPS);
    const fx = Math.cos(a);
    const fz = Math.sin(a);
    const sx = -fz;
    const sz = fx;
    const hw = L / 8; // strip aspect is 1:4, so the card half-width is L / 8
    const fine = 16;
    const rach = [[0, 0, 0, th0]];
    let x = 0;
    let y = 0;
    let z = 0;
    for (let s = 0; s < fine; s++) {
      const t = (s + 0.5) / fine;
      const th = th0 + k * Math.pow(t, 1.5);
      x += fx * Math.sin(th) * (L / fine);
      y += Math.cos(th) * (L / fine);
      z += fz * Math.sin(th) * (L / fine);
      rach.push([x, y, z, th]);
    }
    const node = (j) => rach[Math.round((j / FROND_SEGS) * fine)];
    // Upper (adaxial) side of the arching frond: (-f cos th, sin th, ...). It is the front face. The shading
    // normal mixes it with the outward direction from below the crown, so the rosette shades as one mound.
    for (let j = 0; j < FROND_SEGS; j++) {
      const mk = (jj, side) => {
        const q = node(jj);
        const t = jj / FROND_SEGS;
        const th = q[3];
        const droop = side === 0 ? 0 : hw * (0.3 + 0.25 * t);
        const px = q[0] + side * sx * hw;
        const py = q[1] - droop;
        const pz = q[2] + side * sz * hw;
        const o = norm3(px, py + 0.35, pz);
        const n = norm3(
          -fx * Math.cos(th) * 0.45 + o[0] * 0.45 + side * sx * 0.3,
          Math.sin(th) * 0.45 + o[1] * 0.45 + 0.3,
          -fz * Math.cos(th) * 0.45 + o[2] * 0.45 + side * sz * 0.3
        );
        return { p: [px, py, pz], n, uv: uvAt(strip, side * 0.5 + 0.5, t, false) };
      };
      const thm = (node(j)[3] + node(j + 1)[3]) / 2;
      const out = [-fx * Math.cos(thm), Math.sin(thm), -fz * Math.cos(thm)];
      B.quad(mk(j, -1), mk(j, 0), mk(j + 1, 0), mk(j + 1, -1), out);
      B.quad(mk(j, 0), mk(j, 1), mk(j + 1, 1), mk(j + 1, 0), out);
    }
  }
  return B.geometry();
}

// ---------- colour ----------
const TINT = {
  meadow: new THREE.Color(1.0, 1.0, 1.0),
  meadowSun: new THREE.Color(1.08, 1.06, 0.88),
  forest: new THREE.Color(0.76, 0.86, 0.86),
  tropical: new THREE.Color(0.9, 1.06, 0.9),
  desert: new THREE.Color(1.02, 0.96, 0.84),
};
const FERN_TINT_SUN = new THREE.Color(1.06, 1.06, 0.96);
const FERN_TINT_SHADE = new THREE.Color(0.8, 0.9, 0.94);

function biomeMix(b) {
  const s = b.meadow + b.tropical + b.forest + b.desert + 1e-4;
  return { m: b.meadow / s, t: b.tropical / s, f: b.forest / s, d: b.desert / s };
}
function grassTint(b, x, z, rand) {
  const w = biomeMix(b);
  const sun = smoothstep(0.45, 0.75, valueNoise(x * 0.06, z * 0.06, 77));
  const c = new THREE.Color(0, 0, 0);
  const add = (t, k) => {
    c.r += t.r * k;
    c.g += t.g * k;
    c.b += t.b * k;
  };
  add(TINT.meadow, w.m * (1 - sun));
  add(TINT.meadowSun, w.m * sun);
  add(TINT.forest, w.f);
  add(TINT.tropical, w.t);
  add(TINT.desert, w.d);
  return jitter(c, rand);
}
// +-hue and +-value jitter (contract: about +-8%).
function jitter(c, rand, hue = 0.012, val = 0.08) {
  c.offsetHSL((rand() - 0.5) * 2 * hue, 0, 0);
  c.multiplyScalar(1 + (rand() - 0.5) * 2 * val);
  return c;
}

// ---------- placement fields ----------
// Ground cover belongs where the camera stops look: a disc around each stop's target (the camera orbits it)
// plus a wedge along the opening sightline from the camera to the target, never beyond the cull distance.
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
    zones.push({ id, tx, tz, cx, cz, ux: (tx - cx) / dist, uz: (tz - cz) / dist, dist, core: Math.min(v.radius, 60) });
  }
  const focus = function focus(x, z, reach) {
    let f = 0;
    for (let i = 0; i < zones.length; i++) {
      const q = zones[i];
      const dx = x - q.tx;
      const dz = z - q.tz;
      const dd = dx * dx + dz * dz;
      const far = q.dist + reach;
      if (dd > far * far) continue;
      const d = Math.sqrt(dd);
      const core = smoothstep(q.core, q.core * 0.3, d) * 0.8;
      // Thin orbit ring so a dragged camera still finds grass round the stop.
      const ring = smoothstep(q.dist + 15, q.dist * 0.5, d) * 0.3;
      const px = x - q.cx;
      const pz = z - q.cz;
      const along = px * q.ux + pz * q.uz;
      const lat = Math.abs(px * q.uz - pz * q.ux);
      const wedge = along <= 0 ? 0
        : smoothstep(10, 22, along) * smoothstep(reach + 5, reach - 8, along) *
          smoothstep(along * 0.7 + 6, along * 0.32 + 2, lat);
      f = Math.max(f, core, ring, wedge);
    }
    return f;
  };
  return { focus, zones };
}

function landOK(b) {
  return b.h > 0.35 && b.under < 0.05;
}
// Dense in meadows, lighter in tropics, thin in forest shade, sparse dry tufts in desert; none on beach/rock/water.
function grassLand(b) {
  if (!landOK(b)) return 0;
  const g = b.meadow * 1.0 + b.tropical * 0.65 + b.forest * 0.35 + b.desert * 0.2;
  return clamp(g, 0, 1) * smoothstep(0.7, 0.4, b.slope) * (1 - smoothstep(0.15, 0.5, b.beach));
}
function flowerLand(b) {
  if (!landOK(b) || b.h < 0.45) return 0;
  const g = b.meadow + b.tropical * 0.4 + b.forest * 0.1;
  return clamp(g, 0, 1) * smoothstep(0.6, 0.35, b.slope) * (1 - smoothstep(0.1, 0.4, b.beach));
}
// Sword fern: moist forest understory and forest edges, foot of slopes rather than peaks.
function fernLand(b) {
  if (!landOK(b) || b.h < 0.8 || b.h > 44) return 0;
  const landW = b.meadow + b.tropical + b.forest + b.desert;
  if (landW < 0.05) return 0;
  const f = b.forest / landW;
  const dry = smoothstep(0.15, 0.4, b.desert / landW);
  const g = smoothstep(0.12, 0.55, f) * (1 - 0.6 * b.tropical / landW) * (1 - dry) * smoothstep(0.15, 0.45, landW);
  return g * smoothstep(0.78, 0.45, b.slope) * (1 - 0.5 * smoothstep(25, 40, b.h));
}
const grassPatch = (x, z) => smoothstep(0.36, 0.6, clump(x, z, 0.045, 11));
const flowerPatch = (x, z) => smoothstep(0.42, 0.62, clump(x, z, 0.035, 41));
const fernColony = (x, z) => smoothstep(0.4, 0.62, clump(x, z, 0.05, 31));

// Clumps: scatter() picks patch centres, then each centre spawns children around it (checked with
// sampleField). Gives tussock patches, flower drifts and fern colonies with clearings between them.
function clustersInto(out, { total, per, radius, seed, tries, center, child, make }) {
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

function baseY(b) {
  return b.h - 0.1 - b.slope * 0.35;
}
function makeTuft(b, x, z, rand) {
  const w = biomeMix(b);
  const dry = w.d * 1.3 + smoothstep(0.05, 0.3, b.beach) * 0.8;
  const kind = rand() < dry - 0.15 ? 'dry' : rand() < 0.42 + w.f * 0.4 ? 'fluffy' : 'curly';
  const bio = w.m * 1.15 + w.t * 1.0 + w.f * 0.78 + w.d * 0.7;
  const wave = 0.8 + 0.45 * clump(x, z, 0.022, 21);
  return {
    kind, x, y: baseY(b), z, r: rand() * TAU,
    tx: (rand() - 0.5) * 0.16, tz: (rand() - 0.5) * 0.16 - 0.04,
    s: bio * wave * (0.78 + 0.44 * rand()), sy: 0.85 + 0.3 * rand(),
    c: kind === 'dry' ? jitter(new THREE.Color(1, 1, 1), rand) : grassTint(b, x, z, rand),
  };
}
function makeLong(b, x, z, rand) {
  return {
    x, y: baseY(b), z, r: rand() * TAU, tx: (rand() - 0.5) * 0.12, tz: (rand() - 0.5) * 0.12,
    s: 0.85 + 0.4 * rand(), sy: 0.85 + 0.35 * rand(), c: grassTint(b, x, z, rand),
  };
}
function makeClump(b, x, z, warm, rand) {
  return {
    warm, x, y: baseY(b) + 0.02, z, r: rand() * TAU, tx: (rand() - 0.5) * 0.14, tz: (rand() - 0.5) * 0.14,
    s: 0.95 + 0.5 * rand(), sy: 0.9 + 0.3 * rand(), c: jitter(new THREE.Color(1, 1, 1), rand, 0.008, 0.06),
  };
}
function makeFern(b, x, z, rand) {
  const w = biomeMix(b);
  const shade = clamp(w.f, 0, 1);
  const col = FERN_TINT_SUN.clone().lerp(FERN_TINT_SHADE, shade * 0.8);
  jitter(col, rand);
  return {
    x, y: baseY(b) + 0.03, z, r: rand() * TAU,
    tx: (rand() - 0.5) * 0.12, tz: (rand() - 0.5) * 0.12,
    s: (0.85 + 0.5 * rand()) * (0.95 + 0.3 * shade),
    // Deep shade: fronds spread lower and wider. More light: more upright (Polystichum munitum habit).
    sy: lerp(1.08, 0.8, shade) * (0.92 + 0.16 * rand()),
    c: col,
  };
}

// ---------- culling grid ----------
// Instances are sorted into CELL x CELL chunks. Each frame (throttled) the chunks that are within the cull
// distance and inside a cone around the view direction are packed to the front of the instance buffer and
// mesh.count is set: one draw per part, nothing drawn past the cull distance or behind the camera.
function cellKey(x, z) {
  return Math.floor((x + WORLD_SIZE / 2) / CELL) * 1000 + Math.floor((z + WORLD_SIZE / 2) / CELL);
}
function makeCulled(geometry, material, items, name, reach) {
  const order = items.map((it, i) => i).sort((a, b) => cellKey(items[a].x, items[a].z) - cellKey(items[b].x, items[b].z));
  const sorted = order.map((i) => items[i]);
  const mesh = makeInstanced(geometry, material, sorted, (it) => it.c);
  mesh.name = name;
  const n = sorted.length;
  const mats = new Float32Array(mesh.instanceMatrix.array.subarray(0, n * 16));
  const cols = mesh.instanceColor ? new Float32Array(mesh.instanceColor.array.subarray(0, n * 3)) : null;
  const cells = [];
  let cur = null;
  for (let i = 0; i < n; i++) {
    const it = sorted[i];
    const key = cellKey(it.x, it.z);
    if (!cur || cur.key !== key) {
      cur = { key, start: i, end: i, x: 0, y: 0, z: 0 };
      cells.push(cur);
    }
    cur.end = i + 1;
    cur.x += it.x;
    cur.y += it.y;
    cur.z += it.z;
  }
  for (const c of cells) {
    const m = c.end - c.start;
    c.x /= m;
    c.y /= m;
    c.z /= m;
  }
  mesh.userData.cull = { mats, cols, cells, reach, sig: '' };
  mesh.count = 0;
  mesh.visible = false;
  return mesh;
}

const _dir = new THREE.Vector3();
function updateCulling(mesh, cam, dir, cosHalf) {
  const u = mesh.userData.cull;
  const reach = u.reach;
  let sig = '';
  let total = 0;
  const active = [];
  for (let i = 0; i < u.cells.length; i++) {
    const c = u.cells[i];
    const dx = c.x - cam.x;
    const dy = c.y - cam.y;
    const dz = c.z - cam.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > reach + CELL_R) continue;
    if (d > CELL_R * 1.5) {
      const cosA = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
      const pad = Math.asin(Math.min(1, CELL_R / d));
      if (cosA < Math.cos(Math.min(Math.PI, Math.acos(cosHalf) + pad))) continue;
    }
    active.push(c);
    sig += i + ',';
    total += c.end - c.start;
  }
  if (sig === u.sig) return;
  u.sig = sig;
  const dst = mesh.instanceMatrix.array;
  const dstC = mesh.instanceColor ? mesh.instanceColor.array : null;
  let o = 0;
  for (const c of active) {
    dst.set(u.mats.subarray(c.start * 16, c.end * 16), o * 16);
    if (dstC && u.cols) dstC.set(u.cols.subarray(c.start * 3, c.end * 3), o * 3);
    o += c.end - c.start;
  }
  mesh.count = total;
  mesh.visible = total > 0;
  if (total > 0) {
    const im = mesh.instanceMatrix;
    if (im.clearUpdateRanges) {
      im.clearUpdateRanges();
      im.addUpdateRange(0, total * 16);
    }
    im.needsUpdate = true;
    if (mesh.instanceColor) {
      if (mesh.instanceColor.clearUpdateRanges) {
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, total * 3);
      }
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
  }
}

// ---------- build (pure: no React) ----------
export function planCounts(Q, tier) {
  const budget = FILE_BUDGET[tier] || FILE_BUDGET.low;
  const target = Math.floor(budget * SAFETY);
  const grass = Math.max(0, Math.floor(Q.grass || 0));
  const tufts = Math.floor(grass / BLADES_PER_TUFT);
  const longs = Math.floor(grass / LONG_BLADE_DIV);
  const clumps = Math.floor(Math.max(0, Q.flowers || 0) / FLOWERS_PER_CLUMP);
  const fernsWanted = Math.max(0, Math.floor(Q.ferns || 0));
  const left = Math.max(0, target - tufts * TUFT_TRIS - longs * LONG_TRIS - clumps * CLUMP_TRIS);
  const fronds = clamp(Math.floor(left / Math.max(1, fernsWanted * FROND_TRIS)), 7, 12);
  const ferns = Math.min(fernsWanted, Math.floor(left / (fronds * FROND_TRIS)));
  return { budget, target, tufts, longs, clumps, ferns, fronds };
}

export function buildGroundCover(Q, tier) {
  const plan = planCounts(Q, tier);
  const { focus } = makeFocus();
  const reachG = CULL.grass;
  const reachF = CULL.flowers;

  // Grass tufts: tussock patches; 85% where the camera stops look, 15% thinly round the orbit.
  const tufts = [];
  const childG = (b) => {
    const g = grassLand(b);
    return g > 0.04 ? 0.3 + 0.7 * g : 0;
  };
  const tuftMake = (b, x, z, c, rand) => makeTuft(b, x, z, rand);
  clustersInto(tufts, {
    total: Math.round(plan.tufts * 0.85), per: 7, radius: 2.8, seed: 101, tries: 80,
    center: (b, x, z) => {
      const g = grassLand(b);
      if (g <= 0) return 0;
      const f = focus(x, z, reachG);
      return f > 0 ? g * f * (0.4 + 0.6 * grassPatch(x, z)) : 0;
    },
    child: childG, make: tuftMake,
  });
  clustersInto(tufts, {
    total: plan.tufts - tufts.length, per: 6, radius: 3.0, seed: 202, tries: 80,
    center: (b, x, z) => {
      const g = grassLand(b);
      if (g <= 0) return 0;
      const f = focus(x, z, reachG + 15);
      return f > 0 ? g * Math.min(1, f * 2 + 0.2) * grassPatch(x, z) : 0;
    },
    child: childG, make: tuftMake,
  });
  const curly = tufts.filter((t) => t.kind === 'curly');
  const fluffy = tufts.filter((t) => t.kind === 'fluffy');
  const dry = tufts.filter((t) => t.kind === 'dry');

  // Long geometric blades: in the camera stops' foreground and core only, lush land only.
  const longs = scatter({
    count: plan.longs, seed: 606, tries: 120,
    accept: (b, x, z) => {
      const g = grassLand(b) * (1 - biomeMix(b).d);
      if (g <= 0) return 0;
      const f = focus(x, z, 45);
      return f > 0.3 ? g * f * grassPatch(x, z) : 0;
    },
  }).map((p) => makeLong(p.b, p.x, p.z, mulberry32(Math.floor(p.rnd * 1e9))));

  // Wildflower drifts: mostly one palette per drift (warm daisy + buttercup, or cool lupin + clover/cornflower).
  const clumps = [];
  clustersInto(clumps, {
    total: plan.clumps, per: 6, radius: 3.2, seed: 303, tries: 120,
    center: (b, x, z) => {
      const g = flowerLand(b);
      if (g <= 0) return 0;
      const f = focus(x, z, reachF);
      return f > 0 ? g * f * (0.3 + 0.7 * flowerPatch(x, z)) : 0;
    },
    child: (b) => {
      const f = flowerLand(b);
      return f > 0.05 ? 0.35 + 0.65 * f : 0;
    },
    make: (b, x, z, c, rand) => makeClump(b, x, z, rand() < 0.12 ? rand() < 0.5 : c.rnd < 0.6, rand),
  });
  const warm = clumps.filter((c) => c.warm);
  const cool = clumps.filter((c) => !c.warm);

  // Sword fern colonies in the forest understory near the stops.
  const ferns = [];
  clustersInto(ferns, {
    total: plan.ferns, per: 4, radius: 2.8, seed: 505, tries: 300,
    center: (b, x, z) => {
      const g = fernLand(b);
      if (g <= 0) return 0;
      const f = focus(x, z, CULL.ferns);
      return f > 0 ? Math.min(1, g * 2.5) * (0.3 + 0.7 * f) * (0.35 + 0.65 * fernColony(x, z)) : 0;
    },
    child: (b) => {
      const f = fernLand(b);
      return f > 0.05 ? 0.4 + 0.6 * f : 0;
    },
    make: (b, x, z, c, rand) => makeFern(b, x, z, rand),
  });

  // ---------- textures + materials (one leafMaterial program for every part) ----------
  const size = tier === 'low' ? 512 : 1024;
  const grassTex = paintTexture('ground-grass-' + size, drawGrassAtlas, { size, seed: 11 });
  const flowerTex = paintTexture('ground-flowers-' + size, drawFlowerAtlas, { size, seed: 23 });
  const fernTex = paintTexture('ground-fern-' + size, drawFernAtlas, { size, seed: 31 });
  const grassMat = leafMaterial({ map: grassTex, sway: 0.26, wrap: 0.85, rim: 0.3, trans: 0.45, cut: 0.45, aoScale: 1.5 });
  const longMat = leafMaterial({ map: grassTex, sway: 0.3, wrap: 0.85, rim: 0.3, trans: 0.5, cut: 0.42, aoScale: 1.2 });
  const flowerMat = leafMaterial({ map: flowerTex, sway: 0.22, wrap: 0.8, rim: 0.25, trans: 0.35, cut: 0.45, aoScale: 1.6 });
  const fernMat = leafMaterial({ map: fernTex, sway: 0.08, wrap: 0.65, rim: 0.35, trans: 0.4, cut: 0.45, aoScale: 1.1 });
  const materials = [grassMat, longMat, flowerMat, fernMat];

  const G = grassTile;
  const F = flowerTile;
  const meshes = [];
  const geometries = [];
  const counts = {};
  let tris = 0;
  const add = (name, makeGeo, mat, items, reach) => {
    counts[name] = items.length;
    if (!items.length) return;
    const g = makeGeo();
    geometries.push(g);
    meshes.push(makeCulled(g, mat, items, name, reach));
    tris += triangles(g) * items.length;
  };
  add('grass-curly', () => vaseGeometry({ r0: 0.24, r1: 0.42, H: 0.82, tiles: [[G(0), false], [G(1), false], [G(0), true]], seed: 7 }), grassMat, curly, reachG);
  add('grass-fluffy', () => vaseGeometry({ r0: 0.27, r1: 0.47, H: 0.62, tiles: [[G(2), false], [G(0), true], [G(2), true]], seed: 19 }), grassMat, fluffy, reachG);
  add('grass-dry', () => vaseGeometry({ r0: 0.2, r1: 0.36, H: 0.72, tiles: [[G(3), false], [G(3), true], [G(3), false]], seed: 29 }), grassMat, dry, reachG);
  add('grass-long', () => longBladeGeometry(37), longMat, longs, reachG);
  add('flowers-warm', () => clumpGeometry([[F(0), false], [F(1), false], [F(0), true]], 41), flowerMat, warm, reachF);
  add('flowers-cool', () => clumpGeometry([[F(2), false], [F(3), false], [F(2), true]], 43), flowerMat, cool, reachF);
  add('fern', () => fernGeometry(plan.fronds, 23), fernMat, ferns, CULL.ferns);

  const info = {
    draws: meshes.length,
    triangles: tris,
    programs: 1,
    budget: plan.budget,
    detail: { fronds: plan.fronds, textureSize: size, cull: CULL },
    counts,
  };
  return { meshes, geometries, materials, info };
}

export default function GroundCover({ Q, tier }) {
  const built = useMemo(() => buildGroundCover(Q, tier), [Q, tier]);
  const last = useRef({ x: 1e9, y: 0, z: 0, dx: 0, dy: 0, dz: 0, t: 0 });
  useEffect(() => {
    report('GroundCover.js', built.info);
    last.current.x = 1e9;
    return () => {
      for (const m of built.meshes) m.dispose();
      for (const g of built.geometries) g.dispose();
      for (const m of built.materials) m.dispose();
    };
  }, [built]);
  useFrame((state, dt) => {
    const cam = state.camera;
    const L = last.current;
    L.t += dt;
    cam.getWorldDirection(_dir);
    const p = cam.position;
    const moved = Math.abs(p.x - L.x) + Math.abs(p.y - L.y) + Math.abs(p.z - L.z);
    const turned = Math.abs(_dir.x - L.dx) + Math.abs(_dir.y - L.dy) + Math.abs(_dir.z - L.dz);
    if (moved < 1.5 && turned < 0.03 && L.t < 0.5) return;
    if (moved < 0.05 && turned < 0.002) return;
    L.x = p.x;
    L.y = p.y;
    L.z = p.z;
    L.dx = _dir.x;
    L.dy = _dir.y;
    L.dz = _dir.z;
    L.t = 0;
    // Half-angle of the cone that holds the whole view (diagonal of the frustum) plus a margin.
    const vf = ((cam.fov || 45) * Math.PI) / 360;
    const hf = Math.atan(Math.tan(vf) * (cam.aspect || 1));
    const half = Math.min(Math.PI * 0.95, Math.atan(Math.hypot(Math.tan(vf), Math.tan(hf))) + 0.12);
    const cosHalf = Math.cos(half);
    for (const m of built.meshes) updateCulling(m, p, _dir, cosHalf);
  });
  return h(
    'group',
    { name: 'ground-cover' },
    built.meshes.map((m) => h('primitive', { key: m.name, object: m }))
  );
}
