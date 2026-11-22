// Ocean surface and shoreline: two draws that share ONE GPU program (the ocean's own, built on GLSL_COMMON).
//
// Look (from real refs + Ghibli sea paintings, e.g. Porco Rosso's hideout cove after Stiniva, Vis; Ponyo's
// poster-colour sea with coloured-pencil wave lines):
//  - pale aquamarine over sand (white sand bounces light back through a short water path), turquoise-teal in the
//    lagoon, deep cobalt offshore where light no longer reaches the floor (NASA reef photos: the bright blues of
//    shallow lagoons sit hard against the dark blues of deep water).
//  - the reef crest faces the open sea and carries the surf; the lagoon behind it is calm and glassy.
//  - foam: a crisp, broken white wash hugging the waterline plus thin surf lines that run parallel to the coast
//    (waves refract until their crests follow the depth contours) and travel shoreward.
//  - sun glints: a soft painted sun path plus crisp white dashes on sun-facing ripples (many small glints blend into
//    a smooth path far away, so the dashes fade with distance).
//  - from below: a bright rippled Snell's window (~97 degree cone of sky) whose edge wobbles with the ripples,
//    and a teal total-internal-reflection mirror outside it, fading into the underwater fog.
//
// Performance (round 2, perf critic): the old single transparent sheet covered ~60% of the overview with no depth
// write, so the sea floor under it was shaded twice. Now:
//  - DEEP mesh (opaque, depth-writing, renderOrder -1, drawn before everything): every grid cell whose whole area is
//    deeper than DEEP_T. It is geometrically flat (swell lives in the per-pixel normal), so it uses coarse cells and
//    a flat skirt to FAR. Early-z then rejects the terrain sea floor under it before the terrain shader runs.
//  - SHALLOW mesh (transparent, renderOrder 2): only cells that touch water shallower than DEEP_T, subdivided
//    3x3 or 4x4 (tier) for the vertex swell and the swash on the beach. Its alpha ramps to 1 before DEEP_T and the vertex
//    swell ramps to 0 before DEEP_T, so the two meshes meet with no seam and no crack (T-junction edges stay at y=0).
//  - cells that are dry land (> LAND_H everywhere) get no water at all.
//  - per pixel: ripples and glint dashes only inside uNear of the camera; past fog-far (or ~160 m underwater) the
//    pixel returns the fog colour straight away.
import { createElement as h, Fragment, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { WORLD_SIZE, BIOME_ANGLE, getField, shapeAt } from '../world/island.js';
import { smoothstep } from '../world/noise.js';
import { shared, GLSL_COMMON } from '../materials/shading.js';
import { report } from '../lib/geo.js';

const HALF = WORLD_SIZE / 2;
const FAR = 1200; // skirt half-size: camera (<= ~230 m from centre) + fog far (900) is always covered
const DEPTH_RANGE = 24; // metres encoded in R (sqrt curve, precise in the shallows)
const SHORE_RANGE = 40; // metres encoded in G (distance to the nearest land)
const DEEP_T = 7.0; // metres: a cell deeper than DEEP_T + 0.5 everywhere goes into the opaque mesh
const LAND_H = 2.0; // metres: a cell higher than this everywhere is dry land (swell + swash stay < 0.6 m)

function gl(n) {
  return n.toFixed(4);
}

// Same Gaussian sector weight the island uses for its biome layout.
function sector(a, c, w) {
  const d = Math.atan2(Math.sin(a - c), Math.cos(a - c));
  return Math.exp(-(d * d) / (2 * w * w));
}

// 3x3 box blur (k passes), keeps masks soft under bilinear filtering.
function blur(src, n, passes) {
  let a = src;
  let b = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let s = 0;
        let c = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = j + dj;
          if (jj < 0 || jj >= n) continue;
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            if (ii < 0 || ii >= n) continue;
            s += a[jj * n + ii];
            c++;
          }
        }
        b[j * n + i] = s / c;
      }
    }
    const t = a;
    a = b;
    b = t;
  }
  return a;
}

// Ocean data texture from the cached island field (257 x 257 RGBA8):
// R = sqrt(depth / 24 m), G = distance to land / 40 m, B = reef-crest surf mask, A = sheltered lagoon mask.
function buildOceanData() {
  const f = getField();
  const n = f.n;
  const N = n * n;
  const cell = f.cell;
  const INF = 1e6;

  // Two-pass chamfer distance (1, sqrt2) from every land cell.
  const dist = new Float32Array(N);
  for (let k = 0; k < N; k++) dist[k] = f.h[k] > 0 ? 0 : INF;
  const D1 = cell;
  const D2 = cell * Math.SQRT2;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      let d = dist[k];
      if (d === 0) continue;
      if (i > 0) d = Math.min(d, dist[k - 1] + D1);
      if (j > 0) {
        d = Math.min(d, dist[k - n] + D1);
        if (i > 0) d = Math.min(d, dist[k - n - 1] + D2);
        if (i < n - 1) d = Math.min(d, dist[k - n + 1] + D2);
      }
      dist[k] = d;
    }
  }
  for (let j = n - 1; j >= 0; j--) {
    for (let i = n - 1; i >= 0; i--) {
      const k = j * n + i;
      let d = dist[k];
      if (d === 0) continue;
      if (i < n - 1) d = Math.min(d, dist[k + 1] + D1);
      if (j < n - 1) {
        d = Math.min(d, dist[k + n] + D1);
        if (i < n - 1) d = Math.min(d, dist[k + n + 1] + D2);
        if (i > 0) d = Math.min(d, dist[k + n - 1] + D2);
      }
      dist[k] = d;
    }
  }

  // Reef crest + lagoon: same formulas as heightAt(), only for sea cells near the island.
  const crest = new Float32Array(N);
  const lagoon = new Float32Array(N);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const hgt = f.h[k];
      if (hgt >= 0 || f.d[k] < 0.95 || f.d[k] > 1.5) continue;
      const x = -HALF + i * cell;
      const z = -HALF + j * cell;
      // Cheap pre-filter: the tropical weight is < 0.01 beyond ~1.82 rad (+0.3 rad of angle wobble).
      const ra = Math.atan2(z, x) - BIOME_ANGLE.tropical;
      if (Math.abs(Math.atan2(Math.sin(ra), Math.cos(ra))) > 2.15) continue;
      const s = shapeAt(x, z);
      const wT = sector(s.ang, BIOME_ANGLE.tropical, 0.6);
      if (wT < 0.01) continue;
      lagoon[k] = wT * smoothstep(0.98, 1.06, s.d) * smoothstep(1.42, 1.3, s.d);
      const dc = s.d - 1.33;
      crest[k] = wT * Math.exp(-(dc * dc) / (2 * 0.03 * 0.03)) * smoothstep(-4.0, -1.8, hgt);
    }
  }
  const crestB = blur(crest, n, 1);
  const lagoonB = blur(lagoon, n, 2);

  const data = new Uint8Array(N * 4);
  const to8 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  for (let k = 0; k < N; k++) {
    const hgt = f.h[k];
    const depth = hgt < 0 ? Math.sqrt(Math.min(1, -hgt / DEPTH_RANGE)) : 0;
    const shore = hgt > 0 ? 0 : Math.max(0, dist[k] - cell * 0.5); // waterline sits between cells
    data[k * 4] = to8(depth);
    data[k * 4 + 1] = to8(shore / SHORE_RANGE);
    data[k * 4 + 2] = to8(crestB[k] * 1.4);
    data[k * 4 + 3] = to8(lagoonB[k]);
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  // Texel centres: field point i sits at u = (i + 0.5) / n.
  const map = new THREE.Vector4(f.res / n, f.res / n, 0.5 / n, 0.5 / n);
  return { texture: t, map };
}

// Bilinear height from the cached field, the same lattice the GPU samples (texel centres = field points).
function makeHeightSampler() {
  const f = getField();
  const n = f.n;
  return (x, z) => {
    const u = Math.min(f.res - 1e-4, Math.max(0, (x + HALF) / f.cell));
    const v = Math.min(f.res - 1e-4, Math.max(0, (z + HALF) / f.cell));
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = u - i;
    const fv = v - j;
    const k = j * n + i;
    const a = f.h;
    return (a[k] * (1 - fu) + a[k + 1] * fu) * (1 - fv) + (a[k + n] * (1 - fu) + a[k + n + 1] * fu) * fv;
  };
}

// nc x nc coarse cells over the world. Each cell is classified from (DIV+1)^2 height samples (the exact points
// the shallow mesh would use, so its border vertices are tested too):
//   land    -> dropped;  deep -> one flat quad in the opaque mesh;  shallow -> DIV x DIV quads in the transparent mesh.
// Both index buffers share one position attribute. The opaque mesh also gets a flat skirt from the world border
// out to FAR (reusing the border vertices: every border cell is deep, the world edge is ~23 m down).
function buildGeometry(nc, DIV) {
  const hAt = makeHeightSampler();
  const L = nc * DIV + 1; // fine lattice width
  const C = WORLD_SIZE / nc;
  const fc = C / DIV;
  const ids = new Int32Array(L * L).fill(-1);
  const pos = [];
  const vert = (a, b) => {
    const k = b * L + a;
    if (ids[k] < 0) {
      ids[k] = pos.length / 3;
      pos.push(-HALF + a * fc, 0, -HALF + b * fc);
    }
    return ids[k];
  };
  const deepIdx = [];
  const shallowIdx = [];
  let deepCells = 0;
  let shallowCells = 0;
  const quad = (out, a0, b0, a1, b1) => {
    const p00 = vert(a0, b0);
    const p10 = vert(a1, b0);
    const p01 = vert(a0, b1);
    const p11 = vert(a1, b1);
    out.push(p00, p01, p10, p10, p01, p11); // faces +y
  };
  for (let j = 0; j < nc; j++) {
    for (let i = 0; i < nc; i++) {
      let hMin = Infinity;
      let hMax = -Infinity;
      for (let b = 0; b <= DIV; b++) {
        for (let a = 0; a <= DIV; a++) {
          const hv = hAt(-HALF + (i * DIV + a) * fc, -HALF + (j * DIV + b) * fc);
          if (hv < hMin) hMin = hv;
          if (hv > hMax) hMax = hv;
        }
      }
      if (hMin > LAND_H) continue;
      if (hMax < -(DEEP_T + 0.5)) {
        quad(deepIdx, i * DIV, j * DIV, (i + 1) * DIV, (j + 1) * DIV);
        deepCells++;
        continue;
      }
      shallowCells++;
      for (let b = 0; b < DIV; b++) {
        for (let a = 0; a < DIV; a++) quad(shallowIdx, i * DIV + a, j * DIV + b, i * DIV + a + 1, j * DIV + b + 1);
      }
    }
  }
  // Skirt: coarse border loop (north edge eastward, east southward, south westward, west northward) -> FAR ring.
  const loop = [];
  const last = nc * DIV;
  for (let i = 0; i < nc; i++) loop.push(vert(i * DIV, 0));
  for (let j = 0; j < nc; j++) loop.push(vert(last, j * DIV));
  for (let i = nc; i > 0; i--) loop.push(vert(i * DIV, last));
  for (let j = nc; j > 0; j--) loop.push(vert(0, j * DIV));
  const ring = loop.length;
  const s = FAR / HALF;
  const outer = [];
  for (let k = 0; k < ring; k++) {
    const src = loop[k];
    outer.push(pos.length / 3);
    pos.push(pos[src * 3] * s, 0, pos[src * 3 + 2] * s);
  }
  for (let k = 0; k < ring; k++) {
    const k1 = (k + 1) % ring;
    deepIdx.push(loop[k], loop[k1], outer[k]); // faces +y
    deepIdx.push(loop[k1], outer[k1], outer[k]);
  }
  const posAttr = new THREE.BufferAttribute(new Float32Array(pos), 3);
  const big = pos.length / 3 > 65535;
  const make = (list, pad) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', posAttr);
    g.setIndex(new THREE.BufferAttribute(big ? new Uint32Array(list) : new Uint16Array(list), 1));
    g.computeBoundingSphere();
    g.boundingSphere.radius += pad; // swell headroom
    return g;
  };
  return {
    deep: make(deepIdx, 1),
    shallow: make(shallowIdx, 2),
    trisDeep: deepIdx.length / 3,
    trisShallow: shallowIdx.length / 3,
    deepCells,
    shallowCells,
  };
}

// Shared by both stages: data lookup and the analytic swell (height in x, gradient in yz).
const OCEAN_COMMON = /* glsl */ `
uniform sampler2D uOcean;
uniform vec4 uTexMap;
vec4 oceanData(vec2 xz) {
  vec2 uv = (xz / ${gl(WORLD_SIZE)} + 0.5) * uTexMap.xy + uTexMap.zw;
  vec4 o = texture2D(uOcean, clamp(uv, 0.0, 1.0));
  float edge = smoothstep(${gl(HALF - 20)}, ${gl(HALF)}, max(abs(xz.x), abs(xz.y)));
  return mix(o, vec4(1.0, 1.0, 0.0, 0.0), edge);
}
void addWave(inout vec3 r, vec2 p, float t, vec2 d, float k, float w, float a) {
  float ph = dot(p, d) * k + t * w;
  r.x += a * sin(ph);
  r.yz += d * (a * k * cos(ph));
}
// Three long swells, deep-water dispersion w = sqrt(g k): 48 m, 29 m and 17 m wavelengths.
vec3 swell(vec2 p, float t) {
  vec3 r = vec3(0.0);
  addWave(r, p, t, vec2(0.83, 0.56), 0.131, 1.13, 0.22);
  addWave(r, p, t, vec2(-0.45, 0.89), 0.217, 1.46, 0.13);
  addWave(r, p, t, vec2(0.97, -0.24), 0.370, 1.90, 0.07);
  return r;
}
// Calmer in the shallows and much calmer in the lagoon behind the reef.
float waveAmp(float depthM, float lagoon) {
  return mix(0.3, 1.0, smoothstep(1.0, 10.0, depthM)) * (1.0 - 0.7 * lagoon);
}
`;

const VERT = /* glsl */ `
${GLSL_COMMON}
${OCEAN_COMMON}
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec4 o = oceanData(w.xz);
  float depthM = o.r * o.r * ${gl(DEPTH_RANGE)};
  // Geometry only moves in the shallows; it is exactly flat from DEEP_T - 0.5 m down, where it meets the deep mesh.
  float vAmp = 1.0 - smoothstep(${gl(DEEP_T - 3.0)}, ${gl(DEEP_T - 0.5)}, depthM);
  if (vAmp > 0.0) {
    float shoreM = o.g * ${gl(SHORE_RANGE)};
    vec3 s = swell(w.xz, uTime);
    // Swash: a short wave running up the beach, crests parallel to the coast, moving shoreward.
    float lap = 0.09 * sin(shoreM * 0.42 + uTime * 1.25) * smoothstep(12.0, 1.0, shoreM) * (1.0 - 0.6 * o.a);
    w.y += (s.x * waveAmp(depthM, o.a) + lap) * vAmp;
  }
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = /* glsl */ `
${GLSL_COMMON}
${OCEAN_COMMON}
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uLagoon;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform float uSolid;
uniform float uNear;
varying vec3 vW;

vec4 shadeOcean() {
  float t = uTime;
  vec3 toP = vW - cameraPosition;
  float camDist = length(toP);
  // Past the fog the sea is pure haze (above) or pure water fog (below): skip all the work.
  if (uUnderwater < 0.5) {
    if (camDist > uFogFar) return vec4(uFogColor, 1.0);
  } else if (camDist > 160.0) {
    return vec4(waterFogColor(toP / camDist), 1.0);
  }
  vec4 o = oceanData(vW.xz);
  float depthM = o.r * o.r * ${gl(DEPTH_RANGE)};
  float shoreM = o.g * ${gl(SHORE_RANGE)};
  float crest = o.b;
  float lagoon = o.a;
  float nearF = 1.0 - smoothstep(40.0, uNear, camDist);

  // ---- normal: painted swell + fine ripples near the camera (they fade with distance to stop shimmer) ----
  float amp = waveAmp(depthM, lagoon);
  vec3 sw = swell(vW.xz, t);
  float hS = sw.x * amp;
  vec2 g = sw.yz * amp * 2.6;
  if (nearF > 0.0) {
    vec2 rp = vW.xz;
    vec2 rip = vec2(0.6, 0.8) * cos(dot(rp, vec2(0.6, 0.8)) * 0.9 + t * 2.3) * 0.05;
    rip += vec2(-0.85, 0.5) * cos(dot(rp, vec2(-0.85, 0.5)) * 1.37 + t * 2.9) * 0.04;
    rip += (vec2(vnoise(rp * 0.45 + vec2(t * 0.35, t * 0.1)), vnoise(rp * 0.45 - vec2(t * 0.1, t * 0.3) + 17.0)) - 0.5) * 0.16;
    g += rip * nearF * (1.0 - 0.5 * lagoon);
  }
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  float facing = dot(n.xz, normalize(uSunDir.xz)) * 6.0;

  // ---- body colour by depth: aquamarine over sand, teal lagoon, cobalt offshore ----
  vec3 col = mix(uShallow, uMid, smoothstep(0.3, 4.0, depthM));
  col = mix(col, uDeep, smoothstep(4.0, 16.0, depthM));
  col = mix(col, uLagoon, lagoon * smoothstep(0.8, 2.6, depthM) * 0.85);
  // Wet-on-wet mottling: slow, broad cool patches in deeper water.
  float patchN = vnoise(vW.xz * 0.035 + vec2(t * 0.012, -t * 0.008));
  col = mix(col, col * mix(uShadowTint, vec3(1.0), 0.45) * 1.08, smoothstep(0.45, 0.8, patchN) * 0.45 * smoothstep(3.0, 10.0, depthM));
  // Swell banding: crests lighter, backs of the swell cool blue-violet.
  col *= 1.0 + clamp(hS, -0.4, 0.4) * 0.35;
  col *= 1.0 + clamp(facing, -0.6, 0.6) * 0.16;
  col = mix(col, col * uShadowTint * 1.3, clamp(-facing, 0.0, 1.0) * 0.22);

  // ---- sky reflection ----
  vec3 V = -toP / max(camDist, 0.001);
  float ndv = max(dot(n, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  col = mix(col, mix(uSkyColor, uFogColor, 0.35), clamp(fres * 1.1, 0.0, 0.75));

  // ---- sun: soft painted path + crisp glint dashes near the camera ----
  vec3 R = reflect(-V, n);
  float sd = max(dot(R, uSunDir), 0.0);
  col += uSunColor * pow(sd, 18.0) * 0.22;
  float glint = 0.0;
  if (nearF > 0.0) {
    float sp = vnoise(vW.xz * vec2(1.3, 0.7) + vec2(t * 0.9, -t * 0.6));
    glint = smoothstep(0.955, 0.985, sd) * smoothstep(0.55, 0.72, sp);
    glint += smoothstep(0.8, 0.88, sp) * smoothstep(0.05, 0.18, hS) * clamp(facing, 0.0, 1.0) * 0.4;
    glint *= nearF;
    col += uSunColor * glint;
  }

  // ---- foam: waterline wash, shoreward surf lines, reef-crest surf (only where there is shore or reef) ----
  float foam = 0.0;
  if (shoreM < 20.0 || crest > 0.02) {
    float brk = vnoise(vW.xz * 0.7 + vec2(t * 0.15, 0.0));
    float lapS = sin(shoreM * 0.42 + t * 1.25);
    float wash = 1.0 - smoothstep(0.5, 1.7 + 0.8 * lapS, shoreM + (brk - 0.5) * 1.4);
    wash = max(wash, 1.0 - smoothstep(0.05, 0.3, depthM));
    float ln = fract(shoreM * 0.16 + t * 0.22 + (brk - 0.5) * 0.5);
    float line = smoothstep(0.0, 0.06, ln) * (1.0 - smoothstep(0.1, 0.22, ln));
    float dash = smoothstep(0.3, 0.6, vnoise(vW.xz * 0.22 + vec2(t * 0.05, 0.0)));
    line *= smoothstep(16.0, 3.0, shoreM) * smoothstep(0.0, 1.0, shoreM) * dash * (1.0 - 0.6 * lagoon);
    float crestFoam = 0.0;
    if (crest > 0.02) {
      float cn = vnoise(vW.xz * 0.3 + vec2(t * 0.35, -t * 0.12));
      float pulse = 0.5 + 0.5 * sin(dot(vW.xz, vec2(0.2, 0.25)) - t * 1.4);
      crestFoam = crest * (0.55 + 0.6 * cn) * (0.7 + 0.5 * pulse);
    }
    foam = smoothstep(0.25, 0.55, max(max(wash, line * 0.9), crestFoam));
    vec3 foamCol = mix(uFoam * mix(uShadowTint, vec3(1.0), 0.65), uFoam, 0.6 + 0.4 * clamp(facing + 0.5, 0.0, 1.0));
    col = mix(col, foamCol, foam);
  }

  // ---- transparency: sand and coral show through the shallows; solid from DEEP_T - 1 m (matches the deep mesh) ----
  float alpha = mix(0.28, 0.95, 1.0 - exp(-depthM * 0.32));
  alpha = max(alpha, fres * 0.9);
  alpha = max(alpha, max(foam, glint));

  // ---- seen from below: Snell's window + total internal reflection ----
  if (!gl_FrontFacing) {
    vec3 I = -V;
    float cosi = max(dot(n, I), 0.0);
    float k = 1.0 - 1.777 * (1.0 - cosi * cosi);
    float win = smoothstep(0.0, 0.14, k);
    vec3 tr = refract(I, -n, 1.333);
    float sunUp = max(dot(tr, uSunDir), 0.0);
    float rp2 = caustics(vW.xz * 6.0, t * 1.6);
    vec3 skyIn = mix(uSkyColor, vec3(1.0, 0.98, 0.92), 0.35) * 1.15 + rp2 * 0.15;
    vec3 tir = vec3(0.16, 0.52, 0.56) + rp2 * vec3(0.18, 0.28, 0.28);
    col = mix(tir, skyIn, win);
    col += uSunColor * (pow(sunUp, 40.0) * 1.6 + pow(sunUp, 6.0) * 0.25) * win;
    col = mix(col, vec3(0.92, 0.98, 1.0), foam * 0.7);
    alpha = max(mix(0.82, 0.95, win), foam * 0.9);
  }
  float solid = max(uSolid, smoothstep(${gl(DEEP_T - 3.0)}, ${gl(DEEP_T - 1.0)}, depthM));
  alpha = mix(alpha, 1.0, solid);

  col = applyFog(col, vW);
  return vec4(col, alpha);
}

void main() {
  gl_FragColor = shadeOcean();
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Grid by tier: low 36 coarse cells (11.7 m) with shallows split 3x3 (3.9 m); medium 54 (7.8 m) split 3x3
// (2.6 m); high 72 (5.8 m) split 4x4 (1.5 m). The swash wave is 15 m long, so >= 4 vertices per wavelength.
function cellsFor(Q) {
  const seg = Q.terrainSeg || 128;
  return { nc: Q.oceanCells || Math.max(24, Math.round(seg * 0.28)), div: seg > 192 ? 4 : 3 };
}

export default function Ocean({ Q }) {
  const { nc, div } = cellsFor(Q);
  const nearRange = (Q.terrainSeg || 128) <= 128 ? 220 : 320;
  const built = useMemo(() => {
    const geo = buildGeometry(nc, div);
    const { texture, map } = buildOceanData();
    const uniforms = {
      ...shared,
      uOcean: { value: texture },
      uTexMap: { value: map },
      uShallow: { value: new THREE.Color('#9ef0dc') },
      uMid: { value: new THREE.Color('#2ec3c1') },
      uLagoon: { value: new THREE.Color('#3dd3c6') },
      uDeep: { value: new THREE.Color('#1f5aa8') },
      uFoam: { value: new THREE.Color('#fbfdf6') },
      uNear: { value: nearRange },
      uSolid: { value: 0 },
    };
    // Same source, same side, same blending class (neither is OPAQUE-defined) -> one shared GPU program.
    const shallowMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true, // transparent DoubleSide would otherwise draw twice (back pass + front pass)
      uniforms,
    });
    const deepMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: false,
      blending: THREE.NoBlending,
      depthWrite: true,
      side: THREE.DoubleSide,
      uniforms: { ...uniforms, uSolid: { value: 1 } },
    });
    report('ocean', { draws: 2, triangles: geo.trisDeep + geo.trisShallow, programs: 1 });
    return { ...geo, texture, shallowMat, deepMat };
  }, [nc, div, nearRange]);
  useEffect(
    () => () => {
      built.deep.dispose();
      built.shallow.dispose();
      built.texture.dispose();
      built.shallowMat.dispose();
      built.deepMat.dispose();
    },
    [built]
  );
  // Deep first (renderOrder -1, opaque, writes depth) so early-z rejects the sea floor under it;
  // shallow ring last among the transparent passes' water (renderOrder 2, after the sky at 1).
  return h(
    Fragment,
    null,
    h('mesh', { geometry: built.deep, material: built.deepMat, renderOrder: -1 }),
    h('mesh', { geometry: built.shallow, material: built.shallowMat, renderOrder: 2 })
  );
}
