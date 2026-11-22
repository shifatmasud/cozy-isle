// Ocean surface and shoreline: one draw, one ShaderMaterial (the ocean's own program, built on GLSL_COMMON).
//
// Look (from real refs + Ghibli sea paintings, e.g. Porco Rosso's hideout cove after Stiniva, Vis):
//  - pale aquamarine over sand (white sand bounces light back through a short water path), turquoise-teal in the
//    lagoon, deep cobalt offshore where light no longer reaches the floor (NASA reef photos: "iridescent blues of
//    shallow lagoons contrast sharply with the dark blues of deep water").
//  - the reef crest faces the open sea and carries the surf; the lagoon behind it is calm and glassy.
//  - foam: a crisp, broken white wash hugging the waterline plus thin surf lines that run parallel to the coast
//    (waves refract until their crests follow the depth contours) and travel shoreward.
//  - sun glints: a soft painted sun path plus crisp white dashes on sun-facing ripples (a glitter pattern is many
//    small specular glints that blend into a smooth path far away, so the dashes fade with distance).
//  - from below: a bright rippled Snell's window (~97 degree cone of sky) whose edge wobbles with the ripples,
//    and a teal total-internal-reflection mirror outside it, fading into the underwater fog.
//
// Geometry: an N x N grid over the 420 m world (vertex swell, shore lapping) plus a flat skirt ring out to 1500 m
// that reuses the grid's border vertices, so there are no cracks. Everything else is per-pixel.
import { createElement as h, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { WORLD_SIZE, BIOME_ANGLE, getField, shapeAt } from '../world/island.js';
import { smoothstep } from '../world/noise.js';
import { shared, GLSL_COMMON } from '../materials/shading.js';
import { report } from '../lib/geo.js';

const HALF = WORLD_SIZE / 2;
const FAR = 1500; // skirt reaches past fog far (720) so the horizon is always water
const DEPTH_RANGE = 24; // metres encoded in R (sqrt curve, precise in the shallows)
const SHORE_RANGE = 40; // metres encoded in G (distance to the nearest land)

function gl(n) {
  return n.toFixed(4);
}

// Same Gaussian sector weight the island uses for its biome layout.
function sector(a, c, w) {
  const d = Math.atan2(Math.sin(a - c), Math.cos(a - c));
  return Math.exp(-(d * d) / (2 * w * w));
}

// 3x3 box blur in place (k passes), keeps masks soft under bilinear filtering.
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

// Grid of seg x seg quads over the world + a skirt ring (4 * seg quads) out to FAR, sharing the border vertices.
function buildGeometry(seg) {
  const row = seg + 1;
  const inner = row * row;
  const ring = 4 * seg;
  const pos = new Float32Array((inner + ring) * 3);
  const cell = WORLD_SIZE / seg;
  for (let j = 0; j <= seg; j++) {
    for (let i = 0; i <= seg; i++) {
      const v = j * row + i;
      pos[v * 3] = -HALF + i * cell;
      pos[v * 3 + 1] = 0;
      pos[v * 3 + 2] = -HALF + j * cell;
    }
  }
  const id = (i, j) => j * row + i;
  const quads = seg * seg + ring;
  const idx = inner + ring > 65535 ? new Uint32Array(quads * 6) : new Uint16Array(quads * 6);
  let w = 0;
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = id(i, j);
      const b = id(i + 1, j);
      const c = id(i, j + 1);
      const d = id(i + 1, j + 1);
      idx[w++] = a; idx[w++] = c; idx[w++] = b; // faces +y
      idx[w++] = b; idx[w++] = c; idx[w++] = d;
    }
  }
  // Border loop: north edge eastward, east edge southward, south edge westward, west edge northward.
  const loop = [];
  for (let i = 0; i < seg; i++) loop.push(id(i, 0));
  for (let j = 0; j < seg; j++) loop.push(id(seg, j));
  for (let i = seg; i > 0; i--) loop.push(id(i, seg));
  for (let j = seg; j > 0; j--) loop.push(id(0, j));
  const s = FAR / HALF;
  for (let k = 0; k < ring; k++) {
    const src = loop[k];
    const o = inner + k;
    pos[o * 3] = pos[src * 3] * s;
    pos[o * 3 + 1] = 0;
    pos[o * 3 + 2] = pos[src * 3 + 2] * s;
  }
  for (let k = 0; k < ring; k++) {
    const k1 = (k + 1) % ring;
    const p0 = loop[k];
    const p1 = loop[k1];
    const o0 = inner + k;
    const o1 = inner + k1;
    idx[w++] = p0; idx[w++] = p1; idx[w++] = o0; // faces +y
    idx[w++] = p1; idx[w++] = o1; idx[w++] = o0;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.boundingSphere.radius += 2; // swell headroom
  return g;
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
varying float vH;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec4 o = oceanData(w.xz);
  float depthM = o.r * o.r * ${gl(DEPTH_RANGE)};
  float shoreM = o.g * ${gl(SHORE_RANGE)};
  float fade = 1.0 - smoothstep(170.0, 208.0, max(abs(w.x), abs(w.z)));
  float amp = waveAmp(depthM, o.a) * fade;
  vec3 s = swell(w.xz, uTime);
  // Swash: a short wave running up the beach, crests parallel to the coast, moving shoreward.
  float lap = 0.09 * sin(shoreM * 0.42 + uTime * 1.25) * smoothstep(12.0, 1.0, shoreM) * (1.0 - 0.6 * o.a) * fade;
  float hgt = s.x * amp + lap;
  w.y += hgt;
  vH = hgt;
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
varying vec3 vW;
varying float vH;
void main() {
  float t = uTime;
  vec4 o = oceanData(vW.xz);
  float depthM = o.r * o.r * ${gl(DEPTH_RANGE)};
  float shoreM = o.g * ${gl(SHORE_RANGE)};
  float crest = o.b;
  float lagoon = o.a;
  float camDist = distance(cameraPosition, vW);
  float nearF = 1.0 - smoothstep(40.0, 320.0, camDist);

  // ---- normal: painted swell + fine ripples (ripples fade with distance to stop shimmer) ----
  float amp = waveAmp(depthM, lagoon);
  vec3 sw = swell(vW.xz, t);
  vec2 g = sw.yz * amp * 2.6;
  vec2 rp = vW.xz;
  vec2 rip = vec2(0.6, 0.8) * cos(dot(rp, vec2(0.6, 0.8)) * 0.9 + t * 2.3) * 0.05;
  rip += vec2(-0.85, 0.5) * cos(dot(rp, vec2(-0.85, 0.5)) * 1.37 + t * 2.9) * 0.04;
  rip += (vec2(vnoise(rp * 0.45 + vec2(t * 0.35, t * 0.1)), vnoise(rp * 0.45 - vec2(t * 0.1, t * 0.3) + 17.0)) - 0.5) * 0.16;
  g += rip * nearF * (1.0 - 0.5 * lagoon);
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
  col *= 1.0 + clamp(vH, -0.4, 0.4) * 0.35;
  col *= 1.0 + clamp(facing, -0.6, 0.6) * 0.16;
  col = mix(col, col * uShadowTint * 1.3, clamp(-facing, 0.0, 1.0) * 0.22);

  // ---- sky reflection ----
  vec3 V = normalize(cameraPosition - vW);
  float ndv = max(dot(n, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  col = mix(col, mix(uSkyColor, uFogColor, 0.35), clamp(fres * 1.1, 0.0, 0.75));

  // ---- sun: soft painted path + crisp glint dashes ----
  vec3 R = reflect(-V, n);
  float sd = max(dot(R, uSunDir), 0.0);
  col += uSunColor * pow(sd, 18.0) * 0.22;
  float glint = 0.0;
  if (nearF > 0.0) {
    float sp = vnoise(vW.xz * vec2(1.3, 0.7) + vec2(t * 0.9, -t * 0.6));
    glint = smoothstep(0.955, 0.985, sd) * smoothstep(0.55, 0.72, sp);
    glint += smoothstep(0.8, 0.88, sp) * smoothstep(0.05, 0.18, vH) * clamp(facing, 0.0, 1.0) * 0.4;
    glint *= nearF;
    col += uSunColor * glint;
  }

  // ---- foam: waterline wash, shoreward surf lines, reef-crest surf ----
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
    float cn = vnoise(vW.xz * 0.3 + vec2(t * 0.35, -t * 0.12));
    float pulse = 0.5 + 0.5 * sin(dot(vW.xz, vec2(0.2, 0.25)) - t * 1.4);
    float crestFoam = crest * (0.55 + 0.6 * cn) * (0.7 + 0.5 * pulse);
    foam = smoothstep(0.25, 0.55, max(max(wash, line * 0.9), crestFoam));
    vec3 foamCol = mix(uFoam * mix(uShadowTint, vec3(1.0), 0.65), uFoam, 0.6 + 0.4 * clamp(facing + 0.5, 0.0, 1.0));
    col = mix(col, foamCol, foam);
  }

  // ---- transparency: sand and coral show through the shallows ----
  float alpha = mix(0.28, 0.95, 1.0 - exp(-depthM * 0.32));
  alpha = max(alpha, fres * 0.9);
  alpha = max(alpha, max(foam, glint));

  // ---- seen from below: Snell's window + total internal reflection ----
  if (!gl_FrontFacing) {
    vec3 I = normalize(vW - cameraPosition);
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

  col = applyFog(col, vW);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export default function Ocean({ Q }) {
  // Grid density follows the tier: low 92 (4.6 m cells), medium 138 (3.0 m), high 184.
  const seg = Math.max(48, Q.oceanSeg || Math.round(Q.terrainSeg * 0.72));
  const { geometry, material } = useMemo(() => {
    const g = buildGeometry(seg);
    const { texture, map } = buildOceanData();
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true, // transparent DoubleSide would otherwise draw twice (back pass + front pass)
      uniforms: {
        ...shared,
        uOcean: { value: texture },
        uTexMap: { value: map },
        uShallow: { value: new THREE.Color('#9ef0dc') },
        uMid: { value: new THREE.Color('#2ec3c1') },
        uLagoon: { value: new THREE.Color('#3dd3c6') },
        uDeep: { value: new THREE.Color('#1f5aa8') },
        uFoam: { value: new THREE.Color('#fbfdf6') },
      },
    });
    report('ocean', { draws: 1, triangles: seg * seg * 2 + seg * 8, programs: 1 });
    return { geometry: g, material: m };
  }, [seg]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.uniforms.uOcean.value.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  return h('mesh', { geometry, material, renderOrder: 2 });
}
