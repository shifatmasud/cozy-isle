// Island terrain + instanced rocks (mossy boulders, bare boulders, desert mesa faces, grey cliff chunks).
// Terrain: one mesh with vertex colours that follow biome, height and slope (including the snowy mountain
// cap above ~34 m) plus a painted gouache detail map
// (grass tufts / sand ripples / rock strata) applied per pixel near the camera, faded out with distance.
// Wet-sand and caustic work only runs in the waterline band and the shallows; the deep seabed skips both.
// Rocks: smooth lathe-built shapes (smooth + partly spherified normals, low-frequency lumps) painted with
// hand-made gouache textures, drawn with the shared leafMaterial program (opaque map, cut 0: nothing discards).
//
// References studied:
//  - Kazuo Oga on extracting the essence of a scene and rendering the little things, with poster colours:
//    https://animationobsessive.substack.com/p/what-kazuo-oga-thinks-about-when
//    https://www.openculture.com/2021/01/a-look-inside-the-painting-process-of-the-studio-ghibli-artist-kazuo-oga.html
//    https://prominentpainting.com/ghibli-background-art-a-deep-dive/
//    https://www.quora.com/Ponyo-2008-movie-What-is-the-technique-used-to-draw-the-background-scenes-in-the-movie
//  - Mossy / lichen granite boulders: https://www.alamy.com/stock-photo/rock-moss-granite.html
//    https://www.shutterstock.com/search/lichen-on-rocks
//  - Mesa strata (slope-forming shale, cliff-forming sandstone, caprock): https://en.wikipedia.org/wiki/Monument_Valley
//    https://en.wikipedia.org/wiki/Butte , https://en.wikipedia.org/wiki/Mesa
//  - Sea cliffs and stacks: https://en.wikipedia.org/wiki/Stack_(geology) , https://coastalwiki.org/wiki/Rocky_shore_morphology
import { createElement as h, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import {
  WORLD_SIZE,
  BIOME_ANGLE,
  sampleField,
  normalAt,
  scatter,
  clump,
  shapeAt,
} from '../world/island.js';
import { valueNoise, fbm, smoothstep, mulberry32 } from '../world/noise.js';
import { shared, GLSL_COMMON, leafMaterial } from '../materials/shading.js';
import { paintTexture, brush } from '../materials/leafTex.js';
import { paintUV, makeInstanced, spherifyNormals, triangles, report } from '../lib/geo.js';

// ==== TEXTURES BEGIN ====
// Gouache textures painted in code (the same draw() is previewed in Node with the canvas package).
// Kazuo Oga / Ghibli rocks: a big light top plane, mid-value side planes laid in with a flat brush, a few dark
// cracks with a lit lip, lichen freckles, one coherent moss mantle on top (dark core, mid body, sunlit
// yellow-green dabs, a few bright specks) spilling down cracks in tongues, cool blue-violet values low down.
// Mesa faces: slope-forming red shale, pale bench, orange cliff with dark desert-varnish streaks, cream caprock
// with an overhang shadow (Monument Valley cliff-and-bench profile).
const brushRef = brush;

// Mesa texture v for a local height y (ring heights run -0.1 .. 0.99); kept inside 0.02..0.98 so the
// repeat-wrapped sampler never blends the top row with the bottom row.
function mesaV(y) {
  return Math.max(0.02, Math.min(0.98, 0.02 + (0.96 * (y + 0.1)) / 1.09));
}

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}
function grey(v, a = 1) {
  const c = clamp255(v);
  return `rgba(${c},${c},${c},${a})`;
}
function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Mix two hex colours (t 0..1) and scale the value by k, as an rgba() string.
function mixc(a, b, t = 0, k = 1, alpha = 1) {
  const A = hexRGB(a);
  const B = hexRGB(b);
  const r = clamp255((A[0] + (B[0] - A[0]) * t) * k);
  const g = clamp255((A[1] + (B[1] - A[1]) * t) * k);
  const bl = clamp255((A[2] + (B[2] - A[2]) * t) * k);
  return `rgba(${r},${g},${bl},${alpha})`;
}
// Call fn at (x, y) and at the wrapped copies that cross the texture edges (tileable painting).
function wrapAt(S, x, y, reach, wrapY, fn) {
  const xs = [x];
  if (x < reach) xs.push(x + S);
  if (x > S - reach) xs.push(x - S);
  const ys = [y];
  if (wrapY) {
    if (y < reach) ys.push(y + S);
    if (y > S - reach) ys.push(y - S);
  }
  for (const a of xs) for (const b of ys) fn(a, b);
}
// Smooth soft wash (no visible ring): v is a grey value or an [r, g, b] colour.
function wash(ctx, x, y, r, v, a) {
  const c = Array.isArray(v) ? v : [v, v, v];
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`);
  g.addColorStop(0.5, `rgba(${c[0]},${c[1]},${c[2]},${a * 0.55})`);
  g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
// Flat-brush plane: an angular slab with chiselled ends, the basic gouache mark for rock planes.
function plane(ctx, x, y, ang, len, wid, color, alpha, rand) {
  const j = () => (rand() - 0.5) * wid * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-len / 2, -wid / 2 + j());
  ctx.lineTo(len / 2 - wid * 0.4, -wid / 2 + j() * 0.4);
  ctx.lineTo(len / 2, wid / 2 + j());
  ctx.lineTo(-len / 2 + wid * 0.5, wid / 2 + j() * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}
// Rounded slab, used for soft streaks (varnish runs, bench ledges).
function slab(ctx, x, y, ang, len, wid, color, alpha) {
  const r = Math.min(wid, len) / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-len / 2 + r, -wid / 2);
  ctx.lineTo(len / 2 - r, -wid / 2);
  ctx.arc(len / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(-len / 2 + r, wid / 2);
  ctx.arc(-len / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}
function spot(ctx, x, y, r, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
function polyline(ctx, pts, width, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
// Wandering crack, mostly downward, tapering, with a lit lip on its upper-left side and one short branch.
function crack(ctx, S, x, y, len, rand, dark, lip) {
  const pts = [[x, y]];
  let a = Math.PI / 2 + (rand() - 0.5) * 0.9;
  let px = x;
  let py = y;
  const n = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    a += (rand() - 0.5) * 1.0;
    a = Math.max(0.4, Math.min(Math.PI - 0.4, a));
    px += (Math.cos(a) * len) / n;
    py += (Math.sin(a) * len) / n;
    pts.push([px, py]);
  }
  const w = 2.6 + rand() * 2.2;
  const k = 1 + Math.floor(rand() * (pts.length - 2));
  const br = [pts[k], [pts[k][0] + (rand() - 0.5) * len * 0.6, pts[k][1] + len * (0.15 + rand() * 0.2)]];
  wrapAt(S, x, y, len + 10, false, (ax) => {
    const dx = ax - x;
    const p2 = pts.map((p) => [p[0] + dx, p[1]]);
    for (let i = 0; i < p2.length - 1; i++) {
      const t = 1 - i / (p2.length - 1);
      polyline(ctx, [[p2[i][0] - 2, p2[i][1] - 1.5], [p2[i + 1][0] - 2, p2[i + 1][1] - 1.5]], 1.2 + t * 1.4, lip, 0.75);
      polyline(ctx, [p2[i], p2[i + 1]], 0.8 + w * t, dark, 0.95);
    }
    polyline(ctx, br.map((p) => [p[0] + dx, p[1]]), w * 0.45, dark, 0.85);
  });
}
// Lichen freckles: tight clusters of pale dots.
function lichen(ctx, S, x, y, rand, cols) {
  const n = 5 + Math.floor(rand() * 9);
  const c = cols[Math.floor(rand() * cols.length)];
  wrapAt(S, x, y, 20, false, (ax, ay) => {
    for (let i = 0; i < n; i++) spot(ctx, ax + (rand() - 0.5) * 18, ay + (rand() - 0.5) * 9, 1.1 + rand() * 2.4, c, 0.85);
  });
}
// One coherent moss mantle. depth(x, y) > 0 inside (bigger = deeper). Layers: broken dark edge specks, dark core,
// mid body, sunlit yellow-green dabs (more toward the top of the canvas = top of the rock), bright specks.
function mossRegion(ctx, S, rand, depth, y0, y1, density = 1) {
  const layers = [
    { n: 900, min: -0.18, max: 0, col: '#2f5634', r: [1.2, 2.6], top: 0 },
    { n: 1500, min: 0, col: '#2f5634', r: [4.5, 8.5], top: 0 },
    { n: 1700, min: 0.18, col: '#4a7739', r: [3.5, 7], top: 0.1, dy: -1.5 },
    { n: 1700, min: 0.3, col: '#76a243', r: [2.4, 5], top: 0.3, dy: -2 },
    { n: 1100, min: 0.42, col: '#a5c457', r: [1.5, 3.2], top: 0.4, dy: -2.5 },
    { n: 420, min: 0.55, col: '#dde58a', r: [0.8, 1.7], top: 0.5, dy: -3 },
  ];
  for (const L of layers) {
    const n = Math.round(L.n * density);
    for (let i = 0; i < n; i++) {
      const x = rand() * S;
      const y = y0 + rand() * (y1 - y0);
      const d = depth(x, y);
      if (d <= L.min || (L.max !== undefined && d > L.max)) continue;
      const lightBias = 1 - Math.min(1, Math.max(0, y / S));
      if (rand() > 1 - L.top + L.top * lightBias) continue;
      const r = L.r[0] + rand() * (L.r[1] - L.r[0]);
      wrapAt(S, x, y, r + 1, false, (ax) => spot(ctx, ax, y + (L.dy || 0), r, L.col, 0.95));
    }
  }
}
// Wrapped horizontal distance on the tileable canvas.
function wdx(S, a, b) {
  const d = Math.abs(a - b) % S;
  return Math.min(d, S - d);
}
// Snow mantle: same region idea as mossRegion but in whites with cool blue shade, so snowy crags read as
// wind-packed drifts with dark rock showing through the scoured edge. Reference: Sierra Nevada granite
// snow patches, https://www.americansouthwest.california/… (broad look) — bright caps, cool shade lips.
function snowRegion(ctx, S, rand, depth, y0, y1, density = 1) {
  const layers = [
    { n: 700, min: -0.2, max: 0, col: '#6a7594', r: [1.5, 3], top: 0 },
    { n: 1500, min: 0, col: '#e9eef8', r: [5, 10], top: 0 },
    { n: 1700, min: 0.18, col: '#f2f6fd', r: [4, 8], top: 0.1, dy: -1.5 },
    { n: 1600, min: 0.32, col: '#ffffff', r: [2.6, 5.5], top: 0.3, dy: -2 },
    { n: 420, min: 0.5, col: '#ffffff', r: [1.2, 2.6], top: 0.5, dy: -3 },
  ];
  for (const L of layers) {
    const n = Math.round(L.n * density);
    for (let i = 0; i < n; i++) {
      const x = rand() * S;
      const y = y0 + rand() * (y1 - y0);
      const d = depth(x, y);
      if (d <= L.min || (L.max !== undefined && d > L.max)) continue;
      const lightBias = 1 - Math.min(1, Math.max(0, y / S));
      if (rand() > 1 - L.top + L.top * lightBias) continue;
      const r = L.r[0] + rand() * (L.r[1] - L.r[0]);
      wrapAt(S, x, y, r + 1, false, (ax) => spot(ctx, ax, y + (L.dy || 0), r, L.col, 0.95));
    }
  }
}
// Moss cap depth function: ragged lower edge plus a few tongues running down cracks.
function mossCap(S, rand, base, nT, tLen) {
  const p1 = rand() * 6.283;
  const p2 = rand() * 6.283;
  const edge = (x) => S * (base + 0.04 * Math.sin((x / S) * 6.283 * 2 + p1) + 0.025 * Math.sin((x / S) * 6.283 * 5 + p2));
  const tongues = [];
  for (let i = 0; i < nT; i++) {
    const x0 = rand() * S;
    tongues.push({ x0, y0: edge(x0) - 4, len: S * tLen * (0.4 + rand() * 0.8), w: 10 + rand() * 14, ph: rand() * 6.283 });
  }
  return (x, y) => {
    let d = (edge(x) - y) / 22;
    for (const t of tongues) {
      const s = (y - t.y0) / t.len;
      if (s < 0 || s > 1) continue;
      const cx = t.x0 + Math.sin(s * 3 + t.ph) * 7;
      const half = t.w * Math.pow(1 - s, 0.7);
      d = Math.max(d, (half - wdx(S, x, cx)) / 10);
    }
    return d;
  };
}
// Grass blades growing up from a base line (where rock meets the meadow): dark first, light tips last.
function grassFringe(ctx, S, y0, rand, count, h) {
  const cols = ['#2f5a33', '#3f7038', '#5a8c3c', '#86ad4c', '#b7cf68'];
  for (let i = 0; i < count; i++) {
    const x = rand() * S;
    const layer = Math.min(cols.length - 1, Math.floor((i / count) * cols.length));
    const len = h * (0.35 + rand() * 0.65) * (1 - layer * 0.12);
    wrapAt(S, x, y0, 12, false, (ax) => {
      brushRef.stroke(ctx, ax, y0 + 2, (rand() - 0.5) * 0.9, len, 2 + rand() * 2.2, cols[layer], (rand() - 0.5) * 0.5);
    });
  }
}

// ---- Ground detail (data texture: R grass, G sand, B rock stroke patterns around mid grey 128) ----
// Periodic patch function so clumps tile.
function patchW(S, x, y, ph) {
  const u = (x / S) * 6.283;
  const v = (y / S) * 6.283;
  return 0.5 + 0.25 * Math.sin(u * 2 + ph) * Math.cos(v * 3 - ph) + 0.25 * Math.sin(u * 3 + v * 2 + ph * 2);
}
// R: meadow / forest floor: soft clump washes, flat horizontal drifts, tufts of short blades clustered in
// patches (dark roots and blades, mid blades, a few lit tips where the patch is sunny), sun flecks.
function grassLayer(ctx, S, rand) {
  ctx.fillStyle = grey(128);
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 40 + rand() * 60;
    const v = Math.round(128 + (rand() - 0.5) * 60);
    wrapAt(S, x, y, r, true, (ax, ay) => wash(ctx, ax, ay, r, v, 0.5));
  }
  for (let i = 0; i < 90; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const v = rand() < 0.5 ? 100 : 158;
    wrapAt(S, x, y, 50, true, (ax, ay) => plane(ctx, ax, ay, (rand() - 0.5) * 0.25, 40 + rand() * 60, 5 + rand() * 7, grey(v), 0.28, rand));
  }
  const ph = rand() * 6.283;
  let made = 0;
  for (let t = 0; t < 4000 && made < 330; t++) {
    const x = rand() * S;
    const y = rand() * S;
    const p = patchW(S, x, y, ph);
    if (rand() > 0.25 + p * 0.75) continue;
    made++;
    const n = 3 + Math.floor(rand() * 3);
    const big = 0.7 + rand() * 0.6;
    const sunny = p > 0.55;
    wrapAt(S, x, y, 32, true, (ax, ay) => {
      wash(ctx, ax, ay + 3, 9 * big, 70, 0.45);
      for (let k = 0; k < n; k++) brushRef.stroke(ctx, ax + (rand() - 0.5) * 10, ay + 3, (rand() - 0.5) * 1.3, (13 + rand() * 12) * big, 3.4, grey(66 + rand() * 24), (rand() - 0.5) * 0.6);
      for (let k = 0; k < n; k++) brushRef.stroke(ctx, ax + (rand() - 0.5) * 9, ay + 1, (rand() - 0.5) * 1.1, (10 + rand() * 10) * big, 2.6, grey(128 + rand() * 22), (rand() - 0.5) * 0.6);
      if (sunny) for (let k = 0; k < 2; k++) brushRef.stroke(ctx, ax + (rand() - 0.5) * 8, ay - 1, (rand() - 0.5) * 0.9, (6 + rand() * 7) * big, 2, grey(176 + rand() * 24), (rand() - 0.5) * 0.6);
    });
  }
  for (let i = 0; i < 60; i++) {
    const x = rand() * S;
    const y = rand() * S;
    wrapAt(S, x, y, 6, true, (ax, ay) => spot(ctx, ax, ay, 1.4 + rand() * 1.6, grey(212), 0.9));
  }
}
// G: sand: soft drifts, broken wind ripples (light crest over a dark trough), fine stipple, a few pebbles.
function sandLayer(ctx, S, rand) {
  ctx.fillStyle = grey(128);
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 50 + rand() * 70;
    wrapAt(S, x, y, r, true, (ax, ay) => wash(ctx, ax, ay, r, Math.round(128 + (rand() - 0.5) * 50), 0.45));
  }
  const rows = 11;
  for (let i = 0; i < rows; i++) {
    const y0 = (i + rand() * 0.6) * (S / rows);
    const k = 1 + Math.floor(rand() * 2);
    const ph = rand() * 6.283;
    const amp = 4 + rand() * 8;
    let x = rand() * 40;
    while (x < S) {
      const L = 50 + rand() * 120;
      const seg = (dy, v, w, a) => {
        for (const oy of [-S, 0, S]) {
          const pts = [];
          for (let xx = x; xx <= Math.min(S, x + L); xx += 8) pts.push([xx, y0 + oy + dy + Math.sin((xx / S) * 6.283 * k + ph) * amp]);
          if (pts.length > 1) polyline(ctx, pts, w, grey(v), a);
        }
      };
      seg(3, 96, 4, 0.4);
      seg(0, 168, 2.6, 0.45);
      x += L + 15 + rand() * 50;
    }
  }
  for (let i = 0; i < 2200; i++) spot(ctx, rand() * S, rand() * S, 0.7 + rand() * 1.1, grey(rand() < 0.5 ? 92 + rand() * 20 : 166 + rand() * 30), 0.55);
  for (let i = 0; i < 30; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 2.5 + rand() * 3.5;
    wrapAt(S, x, y, 10, true, (ax, ay) => {
      spot(ctx, ax, ay + 1, r, grey(72), 0.9);
      spot(ctx, ax - r * 0.25, ay - r * 0.3, r * 0.55, grey(196), 0.9);
    });
  }
}
// B: rock faces (u along the contour, v = height): strata bands, a dark shadow under each ledge and a lit lip on
// top (both broken, never ruled lines), joints hanging from ledges, angular flat-brush planes.
function rockLayer(ctx, S, rand) {
  ctx.fillStyle = grey(128);
  ctx.fillRect(0, 0, S, S);
  const hs = [];
  let tot = 0;
  while (tot < S - 40) {
    const hh = 26 + rand() * 50;
    hs.push(hh);
    tot += hh;
  }
  const sc = S / tot;
  let y = 0;
  const edges = [];
  for (let i = 0; i < hs.length; i++) {
    const hh = hs[i] * sc;
    const v = 128 + (i % 2 ? -1 : 1) * (8 + rand() * 22);
    const k = 1 + Math.floor(rand() * 2);
    const ph = rand() * 6.283;
    const amp = 2 + rand() * 4;
    const wav = (x, yy) => yy + Math.sin((x / S) * 6.283 * k + ph) * amp;
    ctx.fillStyle = grey(v);
    ctx.beginPath();
    for (let x = 0; x <= S; x += 8) ctx.lineTo(x, wav(x, y));
    for (let x = S; x >= 0; x -= 8) ctx.lineTo(x, wav(x, y + hh));
    ctx.fill();
    edges.push({ y: y + hh, wav });
    y += hh;
  }
  for (let i = 0; i < 110; i++) {
    const x = rand() * S;
    const yy = rand() * S;
    const vert = rand() < 0.4;
    wrapAt(S, x, yy, 60, true, (ax, ay) => plane(ctx, ax, ay, vert ? Math.PI / 2 + (rand() - 0.5) * 0.3 : (rand() - 0.5) * 0.5, 24 + rand() * 56, 8 + rand() * 16, grey(128 + (rand() - 0.5) * 80), 0.35, rand));
  }
  for (const e of edges) {
    let x = rand() * 30;
    while (x < S) {
      const L = 40 + rand() * 140;
      const pts = [];
      const lip = [];
      for (let xx = x; xx <= Math.min(S, x + L); xx += 8) {
        pts.push([xx, e.wav(xx, e.y) + 1.5]);
        lip.push([xx, e.wav(xx, e.y) - 2]);
      }
      if (pts.length > 1) {
        polyline(ctx, lip, 2.2, grey(200), 0.75);
        polyline(ctx, pts, 2.4 + rand() * 2, grey(50 + rand() * 30), 0.85);
      }
      x += L + 6 + rand() * 30;
    }
    const nj = 3 + Math.floor(rand() * 5);
    for (let j = 0; j < nj; j++) {
      const jx = rand() * S;
      const len = 14 + rand() * 34;
      const yy = e.wav(jx, e.y) + 2;
      wrapAt(S, jx, yy, 4, true, (ax, ay) => polyline(ctx, [[ax, ay], [ax + (rand() - 0.5) * 6, ay + len * 0.5], [ax + (rand() - 0.5) * 8, ay + len]], 2.2, grey(62), 0.8));
    }
  }
}
function drawTerrainDetail(ctx, S, rand) {
  const layers = [grassLayer, sandLayer, rockLayer];
  const chans = [];
  for (const L of layers) {
    ctx.clearRect(0, 0, S, S);
    L(ctx, S, rand);
    chans.push(ctx.getImageData(0, 0, S, S).data);
  }
  const out = ctx.createImageData(S, S);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = chans[0][i];
    d[i + 1] = chans[1][i];
    d[i + 2] = chans[2][i];
    d[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
}

// ---- Boulders (u wraps around the rock twice, v = height; canvas top = top of the rock) ----
function boulderBase(ctx, S, rand, pal) {
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, pal.top);
  g.addColorStop(0.32, pal.upper);
  g.addColorStop(0.68, pal.lower);
  g.addColorStop(1, pal.base);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // Big planes first (light planes high up, cool shadow planes low down), then smaller broken value steps.
  for (let i = 0; i < 70; i++) {
    const y = rand() * S;
    const x = rand() * S;
    const t = y / S;
    const light = rand() < 0.8 - t * 0.7;
    const col = light ? mixc(pal.top, pal.light, 0.3 + rand() * 0.7, 0.98 + rand() * 0.06) : mixc(pal.lower, pal.shade, 0.4 + rand() * 0.6, 0.96 + rand() * 0.08);
    const len = 60 + rand() * 110;
    const wid = 26 + rand() * 40;
    wrapAt(S, x, y, len, false, (ax, ay) => plane(ctx, ax, ay, (rand() - 0.5) * 0.8, len, wid, col, 0.3 + rand() * 0.25, rand));
  }
  for (let i = 0; i < 120; i++) {
    const y = S * (0.1 + rand() * 0.85);
    const x = rand() * S;
    const t = y / S;
    const col = rand() < 0.75 - t * 0.5 ? pal.light : pal.shade;
    wrapAt(S, x, y, 24, false, (ax, ay) => plane(ctx, ax, ay, (rand() - 0.5) * 1.0, 14 + rand() * 26, 6 + rand() * 10, col, 0.45, rand));
  }
  for (let i = 0; i < 6; i++) crack(ctx, S, rand() * S, S * (0.22 + rand() * 0.4), S * (0.14 + rand() * 0.22), rand, pal.crack, pal.light);
  for (let i = 0; i < pal.lichenN; i++) lichen(ctx, S, rand() * S, S * (0.22 + rand() * 0.6), rand, pal.lichen);
}
function drawBoulderMoss(ctx, S, rand) {
  boulderBase(ctx, S, rand, {
    top: '#d6cdb6', upper: '#b7b1b4', lower: '#9a96a9', base: '#7e7b95',
    light: '#ebe1c9', shade: '#6c6788', crack: '#4c4764',
    lichen: ['#d5d59a', '#e7e1c3', '#bfc58a', '#c9b66a'], lichenN: 22,
  });
  mossRegion(ctx, S, rand, mossCap(S, rand, 0.22, 6, 0.2), -6, S * 0.6);
  // Damp moss and grass at the foot, where the boulder sits in the meadow.
  const p = rand() * 6.283;
  mossRegion(ctx, S, rand, (x, y) => (y - S * (0.9 + 0.03 * Math.sin((x / S) * 6.283 * 3 + p))) / 14, S * 0.84, S, 0.35);
  grassFringe(ctx, S, S, rand, 200, S * 0.11);
}
function drawBoulderBare(ctx, S, rand) {
  boulderBase(ctx, S, rand, {
    top: '#efe5cd', upper: '#d4cabb', lower: '#b6adaa', base: '#968fa0',
    light: '#f7efdc', shade: '#857c94', crack: '#5c5470',
    lichen: ['#e7dfb2', '#dca560', '#f1ead2', '#cfc98c'], lichenN: 38,
  });
  // Sun-bleached top plane and a dusting of sand at the foot.
  for (let i = 0; i < 30; i++) {
    const x = rand() * S;
    wrapAt(S, x, 0, 70, false, (ax) => plane(ctx, ax, S * (0.03 + rand() * 0.14), (rand() - 0.5) * 0.5, 50 + rand() * 70, 14 + rand() * 18, '#f8f0dc', 0.35, rand));
  }
  const g = ctx.createLinearGradient(0, S * 0.8, 0, S);
  g.addColorStop(0, 'rgba(216,192,149,0)');
  g.addColorStop(1, 'rgba(216,192,149,0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(0, S * 0.8, S, S * 0.2);
  for (let i = 0; i < 700; i++) spot(ctx, rand() * S, S * (0.84 + rand() * 0.16), 0.8 + rand() * 1.5, rand() < 0.6 ? '#e6d0a4' : '#b39874', 0.7);
}

// ---- Mesa face (v follows the ring heights: see mesaV) ----
function drawMesa(ctx, S, rand) {
  const Y = (yw) => (1 - mesaV(yw)) * S;
  const band = (y0, y1, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(0, Y(y1), S, Y(y0) - Y(y1));
  };
  band(-0.2, 0.12, '#c98b5c');
  band(0.12, 0.36, '#b4573a');
  band(0.36, 0.44, '#e8bd88');
  band(0.44, 0.78, '#d9773f');
  band(0.78, 0.8, '#8a4f4e');
  band(0.8, 0.96, '#efcd98');
  band(0.96, 1.2, '#cfa766');
  // Talus apron: tumbled blocks, each lit on top.
  for (let i = 0; i < 110; i++) {
    const x = rand() * S;
    const y = Y(-0.08 + rand() * 0.2);
    const r = 3 + rand() * 7;
    wrapAt(S, x, y, 14, false, (ax, ay) => {
      plane(ctx, ax, ay + r * 0.3, (rand() - 0.5) * 0.6, r * 2.4, r * 1.3, '#8f5845', 0.8, rand);
      plane(ctx, ax - r * 0.2, ay - r * 0.15, (rand() - 0.5) * 0.6, r * 1.8, r * 0.8, rand() < 0.5 ? '#e6b382' : '#d49a6a', 0.9, rand);
    });
  }
  for (let i = 0; i < 800; i++) spot(ctx, rand() * S, Y(-0.1 + rand() * 0.22), 0.8 + rand() * 1.4, rand() < 0.5 ? '#e0a877' : '#9a634c', 0.6);
  // Shale slope: thin wavy layers and soft rain gullies.
  for (let i = 0; i < 16; i++) {
    const yw = 0.13 + rand() * 0.22;
    const k = 1 + Math.floor(rand() * 3);
    const ph = rand() * 6.283;
    const pts = [];
    for (let x = 0; x <= S; x += 8) pts.push([x, Y(yw) + Math.sin((x / S) * 6.283 * k + ph) * 2.5]);
    polyline(ctx, pts, 1.6 + rand() * 1.8, rand() < 0.5 ? '#97452f' : '#cd7550', 0.7);
  }
  for (let i = 0; i < 30; i++) {
    const x = rand() * S;
    wrapAt(S, x, 0, 12, false, (ax) => slab(ctx, ax, Y(0.22), Math.PI / 2 + (rand() - 0.5) * 0.2, Y(0.12) - Y(0.34), 4 + rand() * 7, rand() < 0.6 ? '#9b4733' : '#c66d4b', 0.35));
  }
  // Bench ledge: lit top edge, dark shadow under the lip.
  polyline(ctx, [[0, Y(0.44) + 1], [S, Y(0.44) + 1]], 3, '#f8dfae', 0.9);
  polyline(ctx, [[0, Y(0.36) + 2], [S, Y(0.36) + 2]], 5, '#7a3a2f', 0.85);
  for (let i = 0; i < 50; i++) {
    const x = rand() * S;
    wrapAt(S, x, 0, 30, false, (ax) => slab(ctx, ax, Y(0.4), (rand() - 0.5) * 0.15, 20 + rand() * 40, 4 + rand() * 6, rand() < 0.5 ? '#f3d4a2' : '#cf9e6c', 0.5));
  }
  // Main cliff: vertical planes, joints, dark varnish streaks and pale washes running down from the caprock.
  for (let i = 0; i < 70; i++) {
    const x = rand() * S;
    const y = Y(0.46 + rand() * 0.3);
    const col = rand() < 0.5 ? '#e8995c' : '#c8693a';
    wrapAt(S, x, y, 30, false, (ax, ay) => plane(ctx, ax, ay, Math.PI / 2 + (rand() - 0.5) * 0.15, 30 + rand() * 60, 10 + rand() * 22, col, 0.4, rand));
  }
  for (let i = 0; i < 60; i++) {
    const x = rand() * S;
    const len = (Y(0.44) - Y(0.78)) * (0.3 + rand() * 0.75);
    const dark = rand() < 0.65;
    wrapAt(S, x, 0, 12, false, (ax) => slab(ctx, ax, Y(0.78) + len / 2, Math.PI / 2 + (rand() - 0.5) * 0.06, len, 2.5 + rand() * 8, dark ? '#7e3f36' : '#f0b07a', dark ? 0.32 + rand() * 0.25 : 0.35));
  }
  for (let i = 0; i < 8; i++) {
    const x = rand() * S;
    const pts = [];
    for (let s = 0; s <= 6; s++) pts.push([x + (rand() - 0.5) * 6, Y(0.78) + (s / 6) * (Y(0.45) - Y(0.78))]);
    wrapAt(S, x, 0, 8, false, (ax) => {
      const dx = ax - x;
      polyline(ctx, pts.map((p) => [p[0] + dx + 1.5, p[1]]), 1.6, '#f2b07c', 0.7);
      polyline(ctx, pts.map((p) => [p[0] + dx, p[1]]), 2.4, '#6f3530', 0.85);
    });
  }
  // Caprock: pale blocks with a lit top, a few joints, dark overhang shadow below.
  for (let i = 0; i < 60; i++) {
    const x = rand() * S;
    wrapAt(S, x, 0, 40, false, (ax) => plane(ctx, ax, Y(0.81 + rand() * 0.14), (rand() - 0.5) * 0.2, 24 + rand() * 50, 6 + rand() * 12, rand() < 0.5 ? '#fae6bf' : '#d9b27e', 0.45, rand));
  }
  for (let i = 0; i < 7; i++) {
    const x = rand() * S;
    wrapAt(S, x, 0, 4, false, (ax) => polyline(ctx, [[ax, Y(0.95)], [ax + (rand() - 0.5) * 5, Y(0.88)], [ax + (rand() - 0.5) * 8, Y(0.81)]], 2.2, '#a8775a', 0.8));
  }
  polyline(ctx, [[0, Y(0.8) + 1.5], [S, Y(0.8) + 1.5]], 4, '#6c3d45', 0.8);
  polyline(ctx, [[0, Y(0.955)], [S, Y(0.955)]], 2.5, '#fff0d0', 0.85);
  for (let i = 0; i < 60; i++) {
    const x = rand() * S;
    wrapAt(S, x, 0, 8, false, (ax) => spot(ctx, ax, Y(0.965 + rand() * 0.03), 2 + rand() * 3.5, rand() < 0.5 ? '#8f9a52' : '#b8ad66', 0.9));
  }
}

// ---- Grey cliff chunk (north coast / mountain crags): irregular jointed blocks, moss mantle, wet cool foot ----
function drawCliff(ctx, S, rand, snowy = false) {
  ctx.fillStyle = '#8f8ba3';
  ctx.fillRect(0, 0, S, S);
  const stones = ['#a39eb3', '#928ea7', '#aca6b6', '#8a879f', '#b2abb7', '#9c97ab'];
  // Row boundaries: wavy, tileable in x.
  const rows = [];
  let y = S * 0.1;
  while (y < S * 0.97) {
    const k = 1;
    const ph = rand() * 6.283;
    const amp = 1.5 + rand() * 3;
    const y0 = y;
    rows.push((x) => y0 + Math.sin((x / S) * 6.283 * k + ph) * amp);
    y += 34 + rand() * 58;
  }
  for (let r = 0; r < rows.length - 1; r++) {
    const top = rows[r];
    const bot = rows[r + 1];
    const joints = [];
    let x = rand() * 60;
    const x0 = x;
    while (x < x0 + S) {
      joints.push({ x, sk: (rand() - 0.5) * 26 });
      x += 50 + rand() * 120;
    }
    joints.push({ x: x0 + S, sk: joints[0].sk });
    for (let j = 0; j < joints.length - 1; j++) {
      const A = joints[j];
      const B = joints[j + 1];
      const col = stones[Math.floor(rand() * stones.length)];
      const shadeSide = rand() < 0.55;
      const sw = 0.25 + rand() * 0.25;
      const seeds = [rand(), rand(), rand(), rand(), rand(), rand()];
      for (const ox of [0, -S]) {
        const xa = A.x + ox;
        const xb = B.x + ox;
        if (xb + 20 < 0 || xa - 20 > S) continue;
        const path = () => {
          ctx.beginPath();
          for (let xx = xa; xx <= xb; xx += 8) ctx.lineTo(xx, top(xx));
          ctx.lineTo(xb, top(xb));
          ctx.lineTo(xb + B.sk, bot(xb + B.sk));
          for (let xx = xb + B.sk; xx >= xa + A.sk; xx -= 8) ctx.lineTo(xx, bot(xx));
          ctx.lineTo(xa + A.sk, bot(xa + A.sk));
          ctx.closePath();
        };
        ctx.save();
        path();
        ctx.fillStyle = col;
        ctx.fill();
        ctx.clip();
        const w = xb - xa;
        const yt = top(xa);
        const yb = bot(xa);
        if (shadeSide) {
          // the block turns a corner: right part is a cool side plane in shade
          const cx = xb - w * sw;
          ctx.fillStyle = mixc('#76728f', '#6a6787', seeds[0]);
          ctx.globalAlpha = 0.75;
          ctx.beginPath();
          ctx.moveTo(cx, yt - 20);
          ctx.lineTo(xb + 40, yt - 20);
          ctx.lineTo(xb + 40, yb + 20);
          ctx.lineTo(cx + (seeds[1] - 0.5) * 20, yb + 20);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        const r2 = (() => {
          let i = 0;
          return () => seeds[i++ % seeds.length] * 0.7 + rand() * 0.3;
        })();
        for (let k = 0; k < 4; k++) plane(ctx, xa + r2() * w, yt + r2() * (yb - yt), (r2() - 0.5) * 0.5, 16 + r2() * 34, 6 + r2() * 10, r2() < 0.5 ? '#c3bdc8' : '#7d7a95', 0.35, rand);
        // sunlit top plane of the block
        const lit = [];
        for (let xx = xa; xx <= xb; xx += 8) lit.push([xx, top(xx) + 4]);
        if (lit.length > 1) polyline(ctx, lit, 8, '#d6d0d6', 0.65);
        ctx.restore();
        // shadow line under the block, joint line with a lit lip
        const sh = [];
        for (let xx = xa + A.sk; xx <= xb + B.sk; xx += 8) sh.push([xx, bot(xx) - 1.5]);
        if (sh.length > 1) polyline(ctx, sh, 4, '#55526e', 0.85);
        polyline(ctx, [[xb, top(xb) + 2], [xb + B.sk, bot(xb + B.sk)]], 2.8, '#55526e', 0.9);
        polyline(ctx, [[xb - 2.5, top(xb) + 5], [xb + B.sk - 2.5, bot(xb + B.sk) - 3]], 1.3, '#cbc4cd', 0.55);
      }
    }
  }
  for (let i = 0; i < 5; i++) crack(ctx, S, rand() * S, S * (0.22 + rand() * 0.45), S * (0.1 + rand() * 0.14), rand, '#4b4864', '#c9c2cc');
  for (let i = 0; i < 22; i++) lichen(ctx, S, rand() * S, S * (0.22 + rand() * 0.62), rand, ['#d7d6a4', '#e9e5cf', '#c6c08a']);
  // Small moss cushions on a few ledges (snowy crags stay clean).
  if (!snowy) {
    for (let r = 1; r < rows.length - 2; r++) {
      if (rand() < 0.45) continue;
      const row = rows[r];
      const cx = rand() * S;
      const w = 20 + rand() * 40;
      mossRegion(ctx, S, rand, (x, yy) => Math.min((w - wdx(S, x, cx)) / 12, (yy - (row(x) - 9)) / 5, (row(x) + 3 - yy) / 4), row(cx) - 16, row(cx) + 6, 0.16);
    }
  }
  // Wet, cool foot with pale tide specks.
  const g = ctx.createLinearGradient(0, S * 0.82, 0, S);
  g.addColorStop(0, 'rgba(84,86,116,0)');
  g.addColorStop(0.45, 'rgba(84,86,116,0.5)');
  g.addColorStop(1, 'rgba(66,70,100,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, S * 0.82, S, S * 0.18);
  for (let i = 0; i < 240; i++) spot(ctx, rand() * S, S * (0.86 + rand() * 0.12), 0.8 + rand() * 1.5, '#d9dde0', 0.6);
  // Moss mantle on top, spilling over the edge in tongues — or a snow drift on the snowy variant.
  if (snowy) snowRegion(ctx, S, rand, mossCap(S, rand, 0.14, 9, 0.26), -6, S * 0.55);
  else mossRegion(ctx, S, rand, mossCap(S, rand, 0.16, 8, 0.22), -6, S * 0.55);
}
// ==== TEXTURES END ====

// ---------------------------------------------------------------------------------------------
// Palette (sRGB hex, converted to linear by THREE.Color). GroundCover.js mirrors these ground colours.
// ---------------------------------------------------------------------------------------------
const C = (hex) => new THREE.Color(hex);
const PAL = {
  meadowLo: C('#9fcb50'),
  meadowHi: C('#6caa44'),
  meadowSun: C('#c6de6c'),
  meadowCool: C('#5f9d5c'),
  meadowDry: C('#cfc56e'),
  slopeOlive: C('#5f8a3c'),
  forestMoss: C('#5a8f3d'),
  forestDeep: C('#2f6337'),
  forestCool: C('#3d6b4a'),
  forestDapple: C('#86b04a'),
  tropical: C('#62bb48'),
  tropicalLush: C('#3f9f4c'),
  desert: C('#e0a862'),
  desertLight: C('#efc688'),
  mesaRed: C('#c4633d'),
  mesaOrange: C('#e2925a'),
  mesaCream: C('#f0c792'),
  sand: C('#f5e4b2'),
  sandWarm: C('#ecd49c'),
  rock: C('#8f8ba0'),
  rockLight: C('#b9b3bd'),
  rockDark: C('#6e6c86'),
  rockMoss: C('#6f8f55'),
  seabed: C('#eedcaa'),
  lagoon: C('#e8e6b6'),
  deep: C('#4f8c8e'),
  // Mountain snow: bright tops, cool blue-violet in the drifts, dirty grey-green where wind scours it off.
  snow: C('#f6f8fc'),
  snowShade: C('#bcc8e6'),
  snowDirty: C('#c9cec4'),
};

function sectorW(ang, c, w) {
  const d = Math.atan2(Math.sin(ang - c), Math.cos(ang - c));
  return Math.exp(-(d * d) / (2 * w * w));
}
// Raw biome sectors (not zeroed on rock), so cliffs can be tinted by the biome they stand in.
function sectors(x, z) {
  const { ang } = shapeAt(x, z);
  return {
    desert: sectorW(ang, BIOME_ANGLE.desert, 0.55),
    forest: sectorW(ang, BIOME_ANGLE.forest, 0.7),
    tropical: sectorW(ang, BIOME_ANGLE.tropical, 0.55),
  };
}

const tA = new THREE.Color();
const tB = new THREE.Color();
function addW(out, c, w) {
  if (w <= 0) return 0;
  out.r += c.r * w;
  out.g += c.g * w;
  out.b += c.b * w;
  return w;
}
function mix(out, a, b, t) {
  return out.copy(a).lerp(b, Math.min(1, Math.max(0, t)));
}

// Painted ground colour from the field sample. Also returns the detail-map weights in mat[0..2]
// (grass strokes, sand stipple/ripples, rock strata) so the fragment shader knows which pattern to paint.
function terrainColor(b, x, z, out, mat) {
  const s = sectors(x, z);
  const n1 = valueNoise(x * 0.035, z * 0.035, 77); // big painted patches
  const n2 = valueNoise(x * 0.11, z * 0.11, 78); // small mottling
  const n3 = fbm(x * 0.018 + 5, z * 0.018 - 2, 2, 79); // broad warm / cool drifts
  const hgt = b.h;
  const slope = b.slope;
  out.setRGB(0, 0, 0);
  let w = 0;

  // Meadow: warm yellow-green lowlands, deeper green uphill, sunlit patches, cool drifts, olive on slopes.
  mix(tA, PAL.meadowLo, PAL.meadowHi, smoothstep(3, 22, hgt));
  tA.lerp(PAL.meadowSun, smoothstep(0.55, 0.8, n1) * 0.55);
  tA.lerp(PAL.meadowCool, smoothstep(0.55, 0.75, n3) * 0.3);
  tA.lerp(PAL.slopeOlive, smoothstep(0.18, 0.5, slope) * 0.45);
  w += addW(out, tA, b.meadow);

  // Forest floor: mossy to deep green, dappled sun patches, cooler as it climbs the mountain.
  mix(tA, PAL.forestMoss, PAL.forestDeep, n1 * 0.8 + n2 * 0.2);
  tA.lerp(PAL.forestDapple, smoothstep(0.62, 0.85, n2) * 0.35);
  tA.lerp(PAL.forestCool, smoothstep(20, 42, hgt) * 0.6);
  w += addW(out, tA, b.forest);

  // Tropics: bright lime with lush darker drifts.
  mix(tA, PAL.tropical, PAL.tropicalLush, smoothstep(0.35, 0.75, n2 * 0.6 + n1 * 0.4));
  w += addW(out, tA, b.tropical);

  // Desert: warm ochre flats; steep ground shows red-orange strata bands.
  const steepD = smoothstep(0.15, 0.42, slope);
  mix(tA, PAL.desert, PAL.desertLight, n1 * 0.7);
  const band = 0.5 + 0.5 * Math.sin(hgt * 1.25 + n2 * 2.2);
  mix(tB, PAL.mesaRed, PAL.mesaOrange, band);
  tB.lerp(PAL.mesaCream, smoothstep(0.75, 0.95, band) * 0.6);
  tA.lerp(tB, steepD);
  w += addW(out, tA, b.desert);

  // Dune grass where beach turns into land (not in the desert).
  const dune = b.beach * (1 - b.beach) * 2.2 * (1 - s.desert);
  w += addW(out, PAL.meadowDry, dune);

  // Beach: cream, warmer up the berm (the wet band is painted per pixel in the shader).
  mix(tA, PAL.sand, PAL.sandWarm, smoothstep(0.8, 2.0, hgt) * 0.7 + n2 * 0.2);
  w += addW(out, tA, b.beach);

  // Rock: grey-violet, lighter on sunlit high crags, mossy in the forest, red in the desert.
  mix(tA, PAL.rock, PAL.rockDark, smoothstep(0.6, 1.0, slope) * 0.6);
  tA.lerp(PAL.rockLight, smoothstep(38, 56, hgt) * 0.7);
  tA.lerp(PAL.rockMoss, s.forest * (1 - smoothstep(30, 50, hgt)) * 0.35 * (0.5 + n2));
  mix(tB, PAL.mesaRed, PAL.mesaOrange, band);
  tA.lerp(tB, smoothstep(0.3, 0.7, s.desert));
  w += addW(out, tA, b.rock);

  // Sea floor: cream shallows to teal deeps, extra pale in the tropical lagoon.
  mix(tA, PAL.seabed, PAL.deep, smoothstep(2, 20, -hgt));
  tA.lerp(PAL.lagoon, s.tropical * smoothstep(7, 2, -hgt) * 0.6);
  w += addW(out, tA, b.under);

  if (w > 0) out.multiplyScalar(1 / w);
  else out.copy(PAL.seabed);
  out.multiplyScalar(0.95 + n2 * 0.1);

  // Snow biome: high on the mountain, whiter with height, painted over whatever is underneath so the
  // treeline fade comes free. Patchy: wind-scoured ridgelines and steep faces show rock and dirt through.
  // The snowline climbs a little on the south flank of the peak (+z side), where the sun melts it lower.
  const southFlank = smoothstep(-78, -44, z);
  const snowH = hgt + (n1 - 0.5) * 9 + southFlank * 3.5;
  const patch = smoothstep(0.3, 0.72, n2 * 0.6 + n1 * 0.4);
  let snow = smoothstep(30, 38, snowH) * (0.4 + 0.6 * patch);
  snow *= 1 - smoothstep(0.62, 0.9, slope) * 0.5;
  if (snow > 0.003) {
    // Drifts and steep lee faces lean cool blue-violet; scoured patches go dirty grey-green.
    mix(tA, PAL.snow, PAL.snowShade, 0.14 + n3 * 0.32 + smoothstep(0.45, 0.85, slope) * 0.3);
    tA.lerp(PAL.snowDirty, (1 - patch) * smoothstep(36, 46, snowH) * 0.45);
    out.lerp(tA, snow);
  }

  // Detail-map weights. Deep seabed gets none, so the shader skips its texture fetches there.
  let g = b.meadow + b.forest + b.tropical + dune * 0.6;
  let sd = b.beach + b.desert * (1 - steepD) + b.under * smoothstep(-7, -1.5, hgt);
  let rk = b.rock + b.desert * steepD;
  const sum = g + sd + rk;
  if (sum > 1) {
    g /= sum;
    sd /= sum;
    rk /= sum;
  }
  // Snowed ground reads cleaner: fade the gouache detail out where the snow takes over.
  if (snow > 0.003) {
    const damp = 1 - snow * 0.8;
    g *= damp;
    sd *= damp;
    rk *= damp;
  }
  mat[0] = g;
  mat[1] = sd;
  mat[2] = rk;
  return out;
}

const VERT = /* glsl */ `
${GLSL_COMMON}
attribute vec3 aMat;
varying vec3 vCol;
varying vec3 vN;
varying vec3 vW;
varying vec3 vMat;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vCol = color;
  vMat = aMat;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const FRAG = /* glsl */ `
${GLSL_COMMON}
uniform sampler2D uDetail;
varying vec3 vCol;
varying vec3 vN;
varying vec3 vW;
varying vec3 vMat;
void main() {
  vec3 n = normalize(vN);
  vec3 base = vCol;
  float dist = distance(cameraPosition, vW);
  // Painted gouache strokes near the camera (2 fetches, 3 on rock faces); faded out and skipped far away,
  // where mipmapping would average them to flat colour anyway.
  float nearW = 1.0 - smoothstep(70.0, 240.0, dist);
  if (nearW * (vMat.x + vMat.y + vMat.z) > 0.01) {
    vec2 p = vW.xz * 0.125;
    vec3 t = texture2D(uDetail, p).rgb - 0.5;
    t += (texture2D(uDetail, mat2(0.83, 0.56, -0.56, 0.83) * p * 0.37 + 0.31).rgb - 0.5) * 0.45;
    if (vMat.z > 0.04) {
      // Rock strata run level around the slope: u along the contour, v up the height.
      vec2 tg = normalize(vec2(-n.z, n.x) + vec2(0.0001, 0.0));
      float tr = texture2D(uDetail, vec2(dot(vW.xz, tg) * 0.11, vW.y * 0.12)).b - 0.5;
      t.z = mix(tr * 1.3, t.z, smoothstep(0.72, 0.92, n.y));
    }
    float d = dot(t, vMat) * nearW;
    // Value step plus temperature: light strokes warm, dark strokes cool (poster-colour mixing).
    base *= (1.0 + d * 0.9) * (vec3(1.0) + d * vec3(0.18, 0.06, -0.22));
  }
  base *= 0.96 + vnoise(vW.xz * 0.21) * 0.08;
  // Wet sand / wet rock band at the waterline, with a pale tide line above it: only computed in that band.
  if (vW.y > -0.6 && vW.y < 0.95) {
    float edge = 0.55 + (vnoise(vW.xz * 0.6) - 0.5) * 0.25;
    float wet = smoothstep(edge, edge - 0.45, vW.y);
    base = mix(base, base * vec3(0.78, 0.79, 0.86), wet);
    float tide = (1.0 - smoothstep(0.0, 0.09, abs(vW.y - edge - 0.06))) * step(0.0, vW.y);
    base *= 1.0 + tide * 0.07;
  }
  float ao = mix(0.78, 1.0, smoothstep(0.55, 0.95, n.y));
  vec3 col = cozyLight(base, n, vW, 0.35, ao);
  if (vW.y < 0.0) {
    // Caustics only in the shallows; the deep floor gets the same fully absorbed tint without them.
    if (vW.y > -12.0) col = underwaterTint(col, vW);
    else col = col * vec3(0.52, 0.84, 0.92) + uWaterFog * 0.05;
  }
  col = applyFog(col, vW);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function detailTexture() {
  const t = paintTexture('terrainDetail', drawTerrainDetail, { size: 512, seed: 315, repeat: true });
  // Data, not colour: keep it linear so mid grey stays the neutral 0.5.
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function buildTerrain(seg) {
  const g = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  g.rotateX(-Math.PI / 2);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const mats = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const m = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const b = sampleField(x, z);
    pos.setY(i, b.h);
    terrainColor(b, x, z, c, m);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    mats[i * 3] = m[0];
    mats[i * 3 + 1] = m[1];
    mats[i * 3 + 2] = m[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(mats, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
    uniforms: { ...shared, uDetail: { value: detailTexture() } },
  });
  return { geometry: g, material, tris: seg * seg * 2 };
}

// ---------------------------------------------------------------------------------------------
// Rock geometry: smooth lathe shapes (rings of S columns, seam column duplicated for the uv wrap, pole fans).
// ---------------------------------------------------------------------------------------------
// Pure arrays (testable without three). rings: [{ y, r }] bottom to top. top / bottom: pole heights (bottom may be
// null for a shape that is always buried). radius(a, ring, i) gives the final radius at angle a.
export function latheArrays({ S, rings, top, bottom = null, radius, yJitter = null, uRep = 1, vOf }) {
  const R = rings.length;
  const cols = S + 1;
  const pos = [];
  const uv = [];
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < cols; j++) {
      const a = ((j % S) / S) * Math.PI * 2;
      const r = radius(a, rings[i], i);
      const y = rings[i].y + (yJitter ? yJitter(a, rings[i], i) : 0);
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uv.push((j / S) * uRep, vOf(y));
    }
  }
  const topStart = pos.length / 3;
  for (let j = 0; j < S; j++) {
    pos.push(0, top, 0);
    uv.push(((j + 0.5) / S) * uRep, vOf(top));
  }
  let botStart = -1;
  if (bottom !== null) {
    botStart = pos.length / 3;
    for (let j = 0; j < S; j++) {
      pos.push(0, bottom, 0);
      uv.push(((j + 0.5) / S) * uRep, vOf(bottom));
    }
  }
  const index = [];
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < S; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const last = (R - 1) * cols;
  for (let j = 0; j < S; j++) index.push(last + j, topStart + j, last + j + 1);
  if (botStart >= 0) for (let j = 0; j < S; j++) index.push(j, j + 1, botStart + j);
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), index, cols, R, S, topStart, botStart, tris: index.length / 3 };
}

// Indexed -> smooth normals, seam and poles welded -> non-indexed with uv + white vertex colour (paintUV).
function latheGeometry(arr, { sph = 0, center = new THREE.Vector3() } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr.pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(arr.uv, 2));
  g.setIndex(arr.index);
  g.computeVertexNormals();
  const nr = g.attributes.normal;
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  for (let i = 0; i < arr.R; i++) {
    const a = i * arr.cols;
    const b = a + arr.S;
    v.fromBufferAttribute(nr, a).add(w.fromBufferAttribute(nr, b)).normalize();
    nr.setXYZ(a, v.x, v.y, v.z);
    nr.setXYZ(b, v.x, v.y, v.z);
  }
  for (const start of [arr.topStart, arr.botStart]) {
    if (start < 0) continue;
    v.set(0, 0, 0);
    for (let j = 0; j < arr.S; j++) v.add(w.fromBufferAttribute(nr, start + j));
    v.normalize();
    for (let j = 0; j < arr.S; j++) nr.setXYZ(start + j, v.x, v.y, v.z);
  }
  nr.needsUpdate = true;
  if (sph > 0) spherifyNormals(g, center, sph);
  const out = paintUV(g, '#ffffff');
  out.computeBoundingSphere();
  return out;
}

function recolor(g, fn) {
  const p = g.attributes.position;
  const nr = g.attributes.normal;
  const cl = g.attributes.color;
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), nr.getX(i), nr.getY(i), nr.getZ(i), col);
    cl.setXYZ(i, col.r, col.g, col.b);
  }
  cl.needsUpdate = true;
  return g;
}

// Rounded corestone boulder: 14 x 6 rings + pole caps = 168 tris. Flattish lit top, ground contact at y = 0.
export const BOULDER_SEG = 14;
const BOULDER_PHI = [2.35, 1.95, 1.55, 1.15, 0.75, 0.38];
export function boulderArrays() {
  const ys = BOULDER_PHI.map((p) => Math.cos(p) * 0.78 + 0.3);
  const top = 1.04;
  const bottom = -0.32;
  // v: buried part squeezed into the bottom of the texture, so the painted grass / sand foot sits at the ground.
  const vOf = (y) => (y < 0 ? 0.02 + 0.06 * smoothstep(bottom, 0, y) : 0.08 + 0.9 * Math.min(1, y / top));
  return latheArrays({
    S: BOULDER_SEG,
    rings: BOULDER_PHI.map((p, i) => ({ y: ys[i], r: Math.sin(p) })),
    top,
    bottom,
    uRep: 2,
    vOf,
    radius: (a, ring, i) => {
      const n = valueNoise(Math.cos(a) * 1.1 + ring.y * 0.9 + 4, Math.sin(a) * 1.1 - ring.y * 0.7 + 9, 5);
      const n2 = valueNoise(Math.cos(a) * 2.3 + 1, Math.sin(a) * 2.3 + ring.y * 1.4, 6);
      return ring.r * (0.84 + 0.3 * n + 0.08 * n2) * (i === BOULDER_PHI.length - 1 ? 0.92 : 1);
    },
    yJitter: (a, ring) => (valueNoise(Math.cos(a) * 1.4 + 2, Math.sin(a) * 1.4 + 7, 8) - 0.5) * 0.08 * Math.max(0, ring.y),
  });
}
function boulderGeometry() {
  const g = latheGeometry(boulderArrays(), { sph: 0.35, center: new THREE.Vector3(0, 0.35, 0) });
  recolor(g, (x, y, z, nx, ny, nz, col) => {
    const v = 0.94 + valueNoise(x * 2.1 + 3, z * 2.1 + y * 1.7, 9) * 0.12;
    col.setRGB(v, v, v * (ny < 0 ? 1.04 : 1));
  });
  return g;
}

// Layered mesa rock face / butte: lobed cliff-and-bench profile, 14 columns x 10 rings + top cap = 266 tris.
export const MESA_SEG = 14;
export const MESA_RINGS = [
  [-0.1, 1.2], // buried talus
  [0.08, 1.1], // talus apron
  [0.16, 0.98], // red shale slope
  [0.34, 0.95],
  [0.38, 1.0], // resistant bench ledge
  [0.43, 0.92],
  [0.74, 0.89], // main orange cliff
  [0.8, 0.97], // caprock overhang
  [0.92, 0.95],
  [0.96, 0.86], // rounded lip
];
export const MESA_TOP = 0.99;
export function mesaArrays() {
  return latheArrays({
    S: MESA_SEG,
    rings: MESA_RINGS.map(([y, r]) => ({ y, r })),
    top: MESA_TOP,
    bottom: null,
    uRep: 3,
    vOf: mesaV,
    radius: (a, ring, i) => {
      const lobe = 0.8 + 0.36 * valueNoise(Math.cos(a) * 1.3 + 3.3, Math.sin(a) * 1.3 + 3.3, 61);
      const wob = 1 + (valueNoise(Math.cos(a) * 2.6 + i * 1.3, Math.sin(a) * 2.6 + 0.5, 62) - 0.5) * 0.1;
      return ring.r * lobe * wob;
    },
  });
}
function mesaGeometry() {
  const g = latheGeometry(mesaArrays(), { sph: 0 });
  recolor(g, (x, y, z, nx, ny, nz, col) => {
    const v = 0.95 + valueNoise(Math.atan2(z, x) * 2.2 + 3, y * 1.5, 63) * 0.1;
    col.setRGB(v, v, v);
  });
  return g;
}

// Grey cliff chunk: rounded-box cross section (superellipse), 12 columns x 6 rings + top cap = 132 tris.
export const CLIFF_SEG = 12;
const CLIFF_RINGS = [
  [-0.35, 0.92],
  [0.0, 1.0],
  [0.3, 0.97],
  [0.55, 1.0],
  [0.8, 0.94],
  [0.95, 0.78],
];
export function cliffArrays() {
  const top = 1.02;
  const vOf = (y) => (y < 0 ? 0.02 + 0.1 * smoothstep(-0.35, 0, y) : 0.12 + 0.86 * Math.min(1, y / top));
  return latheArrays({
    S: CLIFF_SEG,
    rings: CLIFF_RINGS.map(([y, r]) => ({ y, r })),
    top,
    bottom: null,
    uRep: 2,
    vOf,
    radius: (a, ring, i) => {
      const c = Math.abs(Math.cos(a));
      const s = Math.abs(Math.sin(a));
      const box = 0.86 / Math.pow(Math.pow(c, 4) + Math.pow(s, 4), 0.25);
      const n = valueNoise(Math.cos(a) * 1.6 + i * 0.7 + 1, Math.sin(a) * 1.6 + 2, 70);
      const stretch = 1 + 0.35 * c; // longer along local x
      return ring.r * box * stretch * (0.88 + 0.24 * n);
    },
    yJitter: (a, ring, i) => (i >= 4 ? (valueNoise(Math.cos(a) * 1.8 + 4, Math.sin(a) * 1.8, 71) - 0.5) * 0.12 : 0),
  });
}
function cliffGeometry() {
  const g = latheGeometry(cliffArrays(), { sph: 0.3, center: new THREE.Vector3(0, 0.4, 0) });
  recolor(g, (x, y, z, nx, ny, nz, col) => {
    // Snow caps read top-down: up-facing vertices carry more of the instance tint (snow), sheer sides
    // less of it (grey rock). Works for coast cliffs too - light tops, cooler shaded sides.
    const topW = Math.max(0, ny) ** 1.5;
    const v = 0.84 + topW * 0.3 + valueNoise(x * 1.8 + 7, z * 1.8 - 3 + y, 72) * 0.12;
    col.setRGB(v, v, v);
  });
  return g;
}

// ---------------------------------------------------------------------------------------------
// Placement (scatter / sampleField only).
// ---------------------------------------------------------------------------------------------
// Counts come from the tier (Q.mossRocks, Q.bareRocks, Q.mesaRocks, Q.cliffRocks); until quality.js carries
// them, tier-sized defaults are used (sized to the rock budget: 12k tris low, 25k medium).
const ROCK_DEFAULTS = {
  low: { mossRocks: 24, bareRocks: 20, mesaRocks: 10, cliffRocks: 14 },
  medium: { mossRocks: 52, bareRocks: 42, mesaRocks: 22, cliffRocks: 24 },
  high: { mossRocks: 120, bareRocks: 96, mesaRocks: 48, cliffRocks: 72 },
};
export function rockCounts(Q, tier) {
  const key = ROCK_DEFAULTS[tier] ? tier : Q.terrainSeg <= 128 ? 'low' : Q.terrainSeg <= 192 ? 'medium' : 'high';
  const d = ROCK_DEFAULTS[key];
  const pick = (k) => (Q[k] != null ? Q[k] : d[k]);
  return { mossRocks: pick('mossRocks'), bareRocks: pick('bareRocks'), mesaRocks: pick('mesaRocks'), cliffRocks: pick('cliffRocks') };
}

const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();
// Yaw about local up, then tilt the up axis toward the ground normal by `follow`, plus a little lean.
function orient(it, nrm, yaw, follow, lean, rand) {
  _n.set(nrm[0] * follow + (rand() - 0.5) * lean, 1, nrm[2] * follow + (rand() - 0.5) * lean).normalize();
  _q.setFromUnitVectors(_up, _n);
  _qy.setFromAxisAngle(_up, yaw);
  _q.multiply(_qy);
  _e.setFromQuaternion(_q, 'XYZ');
  it.tx = _e.x;
  it.r = _e.y;
  it.tz = _e.z;
  return it;
}

// Boulders: clustered corestones (1 big + up to 3 smaller, half buried). kind 'moss' sits in meadows and the
// forest; kind 'bare' on beaches, in the tropics and the desert.
export function placeBoulders(N, kind = 'moss', orientFn = orient) {
  if (N <= 0) return [];
  const moss = kind === 'moss';
  const centres = scatter({
    count: Math.ceil(N / 2.0),
    seed: moss ? 4101 : 4111,
    tries: 80,
    accept: (b, x, z) => {
      if (b.under > 0.25 || b.h < -0.2 || b.rock > 0.55 || b.slope > 0.5) return 0;
      const patch = smoothstep(0.45, 0.68, clump(x, z, 0.045, moss ? 11 : 12));
      if (moss && b.h > 26) return 0; // no mossy boulders up in the snow
      const w = moss ? b.meadow * 0.6 + b.forest * 0.55 : b.beach * 0.9 + b.desert * 0.35 + b.tropical * 0.3;
      return w * (0.08 + 0.92 * patch);
    },
  });
  const rand = mulberry32(moss ? 4102 : 4112);
  const out = [];
  for (const c of centres) {
    if (out.length >= N) break;
    const b = c.b;
    const kids = 1 + Math.floor(rand() * 3.2);
    const landmark = moss && b.meadow > 0.4 && rand() < 0.12 ? 2.4 : 1;
    const base = (b.beach > 0.4 ? 0.85 : 1.1) * (0.7 + rand() * 0.7) * landmark;
    for (let k = 0; k < kids && out.length < N; k++) {
      const s = k === 0 ? base : base * (0.3 + rand() * 0.45);
      const ang = rand() * Math.PI * 2;
      const dist = k === 0 ? 0 : base * (0.9 + rand() * 1.1) + s * 0.5;
      const x = c.x + Math.cos(ang) * dist;
      const z = c.z + Math.sin(ang) * dist;
      const f = k === 0 ? b : sampleField(x, z);
      if (k > 0 && (f.under > 0.4 || f.rock > 0.7)) continue;
      const nrm = normalAt(x, z, 1.5);
      const tint = moss ? (f.forest > f.meadow ? 'forest' : 'meadow') : f.desert > 0.35 ? 'desert' : f.tropical > f.beach ? 'tropical' : 'beach';
      const it = {
        x, z,
        y: f.h - s * (0.1 + rand() * 0.15),
        s,
        sx: 0.85 + rand() * 0.4,
        sy: 0.6 + rand() * 0.35,
        sz: 0.85 + rand() * 0.35,
        tint,
        j: rand(),
      };
      out.push(orientFn(it, nrm, rand() * Math.PI * 2, 0.6, 0.15, rand));
    }
  }
  return out;
}

function desertness(x, z) {
  return sectors(x, z).desert;
}

// Mesa rocks: 70% layered faces dressing the steep mesa edges (facing downslope), 30% freestanding buttes.
export function placeMesas(N, orientFn = orient) {
  if (N <= 0) return [];
  const nFace = Math.round(N * 0.7);
  const rand = mulberry32(5203);
  const out = [];
  const faces = scatter({
    count: nFace,
    seed: 5201,
    tries: 90,
    accept: (b, x, z) => {
      if (b.under > 0.1 || b.h < 1.4 || b.slope < 0.18 || b.d < 0.3) return 0;
      const dz = desertness(x, z);
      if (dz < 0.35) return 0;
      return dz * smoothstep(0.18, 0.45, b.slope);
    },
  });
  for (const p of faces) {
    const nrm = normalAt(p.x, p.z, 1.5);
    const sy = 4 + rand() * 5;
    const it = { x: p.x, z: p.z, y: p.b.h - sy * 0.45, s: 1, sx: 3 + rand() * 3, sy, sz: 1.8 + rand() * 1.2, tint: 'face', j: rand() };
    out.push(orientFn(it, nrm, Math.atan2(nrm[0], nrm[2]), 0, 0.06, rand));
  }
  const buttes = scatter({
    count: N - nFace,
    seed: 5202,
    tries: 120,
    accept: (b, x, z) => {
      if (b.under > 0.05 || b.h < 1.2 || b.slope > 0.3 || b.d < 0.3 || b.d > 0.88) return 0;
      if (b.desert < 0.2 || desertness(x, z) < 0.45) return 0;
      return (0.25 + b.desert) * smoothstep(0.4, 0.62, clump(x, z, 0.05, 23));
    },
  });
  for (const p of buttes) {
    const spire = rand() < 0.35;
    const w = spire ? 1.2 + rand() * 1.0 : 2.2 + rand() * 2.2;
    const sy = spire ? 5 + rand() * 4 : 4 + rand() * 6;
    const it = { x: p.x, z: p.z, y: p.b.h - 0.5, s: 1, sx: w * (0.85 + rand() * 0.3), sy, sz: w * (0.85 + rand() * 0.3), tint: 'butte', j: rand() };
    out.push(orientFn(it, [0, 1, 0], rand() * Math.PI * 2, 0, 0.05, rand));
  }
  return out;
}

// Grey cliff chunks: north-coast cliffs and their sea stacks, plus crags on the mountain.
export function placeCliffs(N, orientFn = orient) {
  if (N <= 0) return [];
  const rand = mulberry32(6302);
  const pts = scatter({
    count: N,
    seed: 6301,
    tries: 60,
    accept: (b, x, z) => {
      const north = smoothstep(-20, -60, z);
      let p = 0;
      if (b.d > 0.78 && b.d < 1.12 && b.h > -2.2 && b.h < 28) {
        p = north * smoothstep(0.25, 0.6, b.slope + b.rock * 0.5);
      }
      if (b.h > 24) p = Math.max(p, b.rock * 0.7 * north);
      if (p > 0 && desertness(x, z) > 0.4) p = 0;
      return p;
    },
  });
  const out = [];
  for (const p of pts) {
    const nrm = normalAt(p.x, p.z, 1.5);
    const mountain = p.b.h > 24;
    const stack = p.b.h < 0.2;
    const s = mountain ? 2.8 + rand() * 3.6 : 2.0 + rand() * 2.6;
    // Mountain crags above the snowline cap themselves: patchy, so wind-scoured blocks stay bare rock,
    // and steep slopes hold less snow. tint stays 'crag'; tintColor() lerps toward snow by it.snow.
    let snow = 0;
    if (mountain) {
      const scour = valueNoise(p.x * 0.06, p.z * 0.06, 91);
      snow = smoothstep(33, 40, p.b.h + (scour - 0.5) * 9);
      snow *= 1 - smoothstep(0.45, 0.8, p.b.slope) * 0.5;
    }
    // Any crag high enough to touch the snowline gets the snow-capped texture; the rest stay mossy.
    if (mountain && p.b.h > 36) snow = Math.max(snow, 1 - smoothstep(36, 44, p.b.h));
    const it = {
      x: p.x, z: p.z,
      y: p.b.h - s * (stack ? 0.1 : 0.3),
      s,
      sx: 0.8 + rand() * 0.5,
      sy: stack ? 1.4 + rand() * 0.6 : 0.8 + rand() * 0.6,
      sz: 0.8 + rand() * 0.4,
      tint: mountain ? 'crag' : 'coast',
      snow,
      j: rand(),
    };
    out.push(orientFn(it, nrm, Math.atan2(nrm[0], nrm[2]) + (rand() - 0.5) * 0.8, 0.25, 0.1, rand));
  }
  return out;
}

// Per-instance tint (multiplies the painted texture) + +-8% hue/value jitter.
const TINTS = {
  beach: [1.04, 1.0, 0.94],
  tropical: [1.0, 1.01, 0.95],
  meadow: [1.0, 1.02, 0.97],
  forest: [0.9, 0.97, 0.94],
  desert: [1.12, 0.93, 0.8],
  face: [1.0, 1.0, 1.0],
  butte: [1.02, 0.98, 0.96],
  coast: [0.97, 0.98, 1.03],
  crag: [1.05, 1.04, 1.06],
};
const _col = new THREE.Color();
function tintColor(it) {
  const t = TINTS[it.tint] || TINTS.meadow;
  let r = t[0];
  let g = t[1];
  let b = t[2];
  // Snow-capped mountain crags: lift the whole rock toward a bright cool white; combined with the
  // cliff geometry's brighter top vertices and darker sheer sides, tops read as snow, sides as rock.
  if (it.snow > 0) {
    r += (1.5 - r) * it.snow;
    g += (1.56 - g) * it.snow;
    b += (1.7 - b) * it.snow;
  }
  _col.setRGB(r, g, b);
  const j = it.j;
  _col.offsetHSL((j - 0.5) * 0.04, 0, 0);
  _col.multiplyScalar(0.92 + ((j * 7.31) % 1) * 0.16);
  return _col;
}

// One shared program (leafMaterial) for every rock: opaque painted map, cut 0 so nothing is discarded.
function rockMaterial(key, draw, seed, opts) {
  const map = paintTexture(key, draw, { size: 512, seed, repeat: true });
  return leafMaterial({ map, color: '#ffffff', sway: 0, trans: 0, cut: 0, ...opts });
}

function buildRocks(counts) {
  const boulder = boulderGeometry();
  const kinds = [
    { name: 'mossRocks', geo: boulder, mat: rockMaterial('rockMoss', drawBoulderMoss, 311, { wrap: 0.5, rim: 0.12, aoScale: 0.45 }), items: placeBoulders(counts.mossRocks, 'moss') },
    { name: 'bareRocks', geo: boulder, mat: rockMaterial('rockBare', drawBoulderBare, 312, { wrap: 0.5, rim: 0.12, aoScale: 0.45 }), items: placeBoulders(counts.bareRocks, 'bare') },
    { name: 'mesaRocks', geo: mesaGeometry(), mat: rockMaterial('rockMesa', drawMesa, 313, { wrap: 0.4, rim: 0.08, aoScale: 0.5 }), items: placeMesas(counts.mesaRocks) },
    { name: 'cliffSnowRocks', geo: cliffGeometry(), mat: rockMaterial('rockCliffSnow', (ctx, S, rand) => drawCliff(ctx, S, rand, true), 315, { wrap: 0.4, rim: 0.12, aoScale: 0.35 }), items: placeCliffs(counts.cliffRocks).filter((it) => it.snow > 0.25) },
    { name: 'cliffRocks', geo: cliffGeometry(), mat: rockMaterial('rockCliff', drawCliff, 314, { wrap: 0.4, rim: 0.1, aoScale: 0.4 }), items: placeCliffs(counts.cliffRocks).filter((it) => !(it.snow > 0.25)) },
  ];
  let tris = 0;
  let draws = 0;
  const meshes = kinds.map((k) => {
    const mesh = makeInstanced(k.geo, k.mat, k.items, tintColor);
    mesh.name = k.name;
    mesh.visible = k.items.length > 0;
    if (k.items.length > 0) {
      draws += 1;
      tris += triangles(k.geo) * k.items.length;
    }
    return mesh;
  });
  return { meshes, kinds, tris, draws };
}

export default function Terrain({ Q, tier }) {
  const terrain = useMemo(() => buildTerrain(Q.terrainSeg), [Q.terrainSeg]);
  const counts = rockCounts(Q, tier);
  const rocks = useMemo(() => buildRocks(counts), [counts.mossRocks, counts.bareRocks, counts.mesaRocks, counts.cliffRocks]);

  useEffect(() => {
    report('terrain', { draws: 1 + rocks.draws, triangles: terrain.tris + rocks.tris, programs: 2 });
  }, [terrain, rocks]);
  useEffect(() => () => { terrain.geometry.dispose(); terrain.material.dispose(); }, [terrain]);
  useEffect(
    () => () => {
      const geos = new Set(rocks.kinds.map((k) => k.geo));
      for (const g of geos) g.dispose();
      for (const k of rocks.kinds) k.mat.dispose();
      for (const m of rocks.meshes) m.dispose();
    },
    [rocks]
  );

  return h(
    'group',
    null,
    h('mesh', { geometry: terrain.geometry, material: terrain.material }),
    ...rocks.meshes.map((m) => h('primitive', { key: m.name, object: m }))
  );
}
