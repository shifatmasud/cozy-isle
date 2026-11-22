// Island terrain + instanced rocks (boulders, desert mesa faces, grey cliff chunks).
// Terrain: one mesh, painted with vertex colours that follow biome, height and slope.
// Rocks: three InstancedMeshes sharing the cozyMaterial program.
// References studied: Kazuo Oga on simplifying to the essential masses; mesa "cliff-and-bench"
// strata (red shale base, orange de Chelly-like cliff, pale caprock); spheroidal weathering
// (rounded corestones that cluster and sit half buried); painting rocks by one dominant plane
// (light top, mid sides, cool dark base).
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
import { valueNoise, smoothstep, mulberry32 } from '../world/noise.js';
import { shared, GLSL_COMMON, cozyMaterial } from '../materials/shading.js';
import { paint, merge, makeInstanced, spherifyNormals, triangles, report } from '../lib/geo.js';

// ---------------------------------------------------------------------------------------------
// Palette (sRGB hex, converted to linear by THREE.Color).
// ---------------------------------------------------------------------------------------------
const C = (hex) => new THREE.Color(hex);
const PAL = {
  meadowLo: C('#9fcb50'),
  meadowHi: C('#6caa44'),
  meadowSun: C('#c6de6c'),
  meadowDry: C('#cfc56e'),
  slopeOlive: C('#5f8a3c'),
  forestMoss: C('#5a8f3d'),
  forestDeep: C('#2f6337'),
  forestCool: C('#3d6b4a'),
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

// Painted ground colour from the field sample.
function terrainColor(b, x, z, out) {
  const s = sectors(x, z);
  const n1 = valueNoise(x * 0.035, z * 0.035, 77); // big painted patches
  const n2 = valueNoise(x * 0.11, z * 0.11, 78); // small mottling
  const hgt = b.h;
  const slope = b.slope;
  out.setRGB(0, 0, 0);
  let w = 0;

  // Meadow: warm yellow-green lowlands, deeper green uphill, sunlit patches, olive on slopes.
  mix(tA, PAL.meadowLo, PAL.meadowHi, smoothstep(3, 22, hgt));
  tA.lerp(PAL.meadowSun, smoothstep(0.55, 0.8, n1) * 0.55);
  tA.lerp(PAL.slopeOlive, smoothstep(0.18, 0.5, slope) * 0.45);
  w += addW(out, tA, b.meadow);

  // Forest floor: mossy to deep green, cooler as it climbs the mountain.
  mix(tA, PAL.forestMoss, PAL.forestDeep, n1 * 0.8 + n2 * 0.2);
  tA.lerp(PAL.forestCool, smoothstep(20, 42, hgt) * 0.6);
  w += addW(out, tA, b.forest);

  // Tropics: bright lime with lush darker drifts.
  mix(tA, PAL.tropical, PAL.tropicalLush, smoothstep(0.35, 0.75, n2 * 0.6 + n1 * 0.4));
  w += addW(out, tA, b.tropical);

  // Desert: warm ochre flats; steep ground shows red-orange strata bands.
  mix(tA, PAL.desert, PAL.desertLight, n1 * 0.7);
  const band = 0.5 + 0.5 * Math.sin(hgt * 1.25 + n2 * 2.2);
  mix(tB, PAL.mesaRed, PAL.mesaOrange, band);
  tB.lerp(PAL.mesaCream, smoothstep(0.75, 0.95, band) * 0.6);
  tA.lerp(tB, smoothstep(0.15, 0.42, slope));
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
  return out;
}

const VERT = /* glsl */ `
${GLSL_COMMON}
varying vec3 vCol;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vCol = color;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const FRAG = /* glsl */ `
${GLSL_COMMON}
varying vec3 vCol;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  float brush = vnoise(vW.xz * 0.35) * 0.12 + vnoise(vW.xz * 1.7) * 0.06 - 0.09;
  vec3 base = vCol * (1.0 + brush);
  // Wet sand / wet rock band at the waterline: darker and a touch cooler, with a pale tide line above it.
  float edge = 0.55 + (vnoise(vW.xz * 0.6) - 0.5) * 0.25;
  float wet = smoothstep(edge, edge - 0.45, vW.y) * step(-0.6, vW.y);
  base = mix(base, base * vec3(0.78, 0.79, 0.86), wet);
  float tide = (1.0 - smoothstep(0.0, 0.09, abs(vW.y - edge - 0.06))) * step(0.0, vW.y);
  base *= 1.0 + tide * 0.07;
  float ao = mix(0.78, 1.0, smoothstep(0.55, 0.95, n.y));
  vec3 col = cozyLight(base, n, vW, 0.35, ao);
  col = underwaterTint(col, vW);
  col = applyFog(col, vW);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function buildTerrain(seg) {
  const g = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  g.rotateX(-Math.PI / 2);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const b = sampleField(x, z);
    pos.setY(i, b.h);
    terrainColor(b, x, z, c);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, uniforms: { ...shared } });
  return { geometry: g, material: m, tris: seg * seg * 2 };
}

// ---------------------------------------------------------------------------------------------
// Rock geometry (unit sized, base near y = 0).
// ---------------------------------------------------------------------------------------------
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

// Rounded corestone boulder: lumpy icosphere (80 tris), flattened base, soft spherified normals.
const BOULDER = { light: C('#cbc4b4'), mid: C('#9d9aa5'), dark: C('#77748b'), lichen: C('#c4b47c') };
function boulderGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  let minY = Infinity;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    let y = p.getY(i);
    const z = p.getZ(i);
    const n = valueNoise(x * 1.3 + y * 0.7 + 4, z * 1.3 - y * 0.5 + 9, 5);
    const r = 0.8 + 0.4 * n;
    y *= 0.8;
    if (y < -0.25) y = -0.25 + (y + 0.25) * 0.3;
    p.setXYZ(i, x * r, y * r, z * r);
    minY = Math.min(minY, y * r);
  }
  g.computeVertexNormals();
  const out = paint(g, '#ffffff');
  spherifyNormals(out, new THREE.Vector3(0, 0, 0), 0.78);
  out.translate(0, -minY, 0);
  const height = 1 - minY;
  recolor(out, (x, y, z, nx, ny, nz, col) => {
    const t = smoothstep(0.1, height * 0.85, y);
    mix(col, BOULDER.dark, BOULDER.mid, t);
    col.lerp(BOULDER.light, smoothstep(0.45, 0.95, ny) * 0.75);
    const sp = valueNoise(x * 3.1 + 2, z * 3.1 + y * 2.3, 6);
    col.lerp(BOULDER.lichen, smoothstep(0.68, 0.85, sp) * 0.3 * t);
  });
  out.computeBoundingSphere();
  return out;
}

// Layered mesa rock face / butte: stepped lobed column (cliff-and-bench profile), 171 tris.
export const MESA_SEG = 9;
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

// Pure arrays (testable without three): side ring vertices + index, and the top cap triangles.
export function mesaArrays() {
  const S = MESA_SEG;
  const R = MESA_RINGS.length;
  const lobe = [];
  for (let j = 0; j < S; j++) lobe.push(0.8 + 0.36 * valueNoise(j * 0.9 + 0.3, 3.3, 61));
  const side = new Float32Array(R * S * 3);
  for (let i = 0; i < R; i++) {
    const [y, rr] = MESA_RINGS[i];
    for (let j = 0; j < S; j++) {
      const a = (j / S) * Math.PI * 2;
      const wob = 1 + (valueNoise(j * 1.7 + 0.5, i * 1.3 + 0.5, 62) - 0.5) * 0.12;
      const r = rr * lobe[j] * wob;
      const k = (i * S + j) * 3;
      side[k] = Math.cos(a) * r;
      side[k + 1] = y;
      side[k + 2] = Math.sin(a) * r;
    }
  }
  const index = [];
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < S; j++) {
      const a = i * S + j;
      const b = i * S + ((j + 1) % S);
      const c = (i + 1) * S + j;
      const d = (i + 1) * S + ((j + 1) % S);
      index.push(a, c, b, b, c, d);
    }
  }
  const top = (R - 1) * S;
  const cap = new Float32Array(S * 9);
  for (let j = 0; j < S; j++) {
    const p0 = (top + j) * 3;
    const p1 = (top + ((j + 1) % S)) * 3;
    const k = j * 9;
    cap[k] = 0; cap[k + 1] = MESA_TOP; cap[k + 2] = 0;
    cap[k + 3] = side[p1]; cap[k + 4] = side[p1 + 1]; cap[k + 5] = side[p1 + 2];
    cap[k + 6] = side[p0]; cap[k + 7] = side[p0 + 1]; cap[k + 8] = side[p0 + 2];
  }
  return { side, index, cap, sideTris: index.length / 3, capTris: S };
}

const MESA = {
  talus: C('#c98b5c'),
  shale: C('#b4573a'),
  ledge: C('#ebc28c'),
  cliff: C('#d9773f'),
  cliffLight: C('#e8995c'),
  cap: C('#f0cf9c'),
  top: C('#cfa766'),
};
function mesaGeometry() {
  const { side, index, cap } = mesaArrays();
  const gs = new THREE.BufferGeometry();
  gs.setAttribute('position', new THREE.BufferAttribute(side, 3));
  gs.setIndex(index);
  gs.computeVertexNormals();
  const gc = new THREE.BufferGeometry();
  gc.setAttribute('position', new THREE.BufferAttribute(cap, 3));
  gc.computeVertexNormals();
  const g = merge([paint(gs, '#ffffff'), paint(gc, '#ffffff')]);
  recolor(g, (x, y, z, nx, ny, nz, col) => {
    const streak = valueNoise(Math.atan2(z, x) * 2.2 + 3, y * 1.5, 63);
    if (ny > 0.8 && y > 0.9) {
      col.copy(MESA.top).lerp(MESA.cap, streak * 0.4);
      return;
    }
    if (y < 0.12) mix(col, MESA.talus, MESA.shale, smoothstep(-0.1, 0.12, y));
    else if (y < 0.36) mix(col, MESA.shale, MESA.cliff, smoothstep(0.16, 0.36, y) * 0.35);
    else if (y < 0.44) col.copy(MESA.ledge);
    else if (y < 0.78) mix(col, MESA.cliff, MESA.cliffLight, streak);
    else col.copy(MESA.cap);
    // desert varnish: darker vertical streaks down the cliff
    col.multiplyScalar(0.9 + streak * 0.16);
  });
  g.computeBoundingSphere();
  return g;
}

// Grey cliff chunk: two jointed blocks (rounded-box, 48 tris each), flat-ish top plane with moss.
const CLIFF = { top: C('#bdb7c4'), side: C('#8e8a9f'), base: C('#67657c'), moss: C('#7f9b58') };
function cliffBlock(sx, sy, sz, seed) {
  const g = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const len = Math.hypot(x, z) || 1;
    const k = 0.22;
    x += ((x / len) * 0.6 - x) * k;
    z += ((z / len) * 0.6 - z) * k;
    const n = valueNoise(x * 2.1 + seed, z * 2.1 + y * 1.7 + seed * 0.5, 70 + seed) - 0.5;
    const f = 1 + n * 0.24;
    y += y > 0.4 ? n * 0.05 : n * 0.12;
    p.setXYZ(i, x * f * sx, y * sy, z * f * sz);
  }
  g.computeVertexNormals();
  return paint(g, '#ffffff');
}
function cliffGeometry() {
  const a = cliffBlock(1.5, 1.5, 1.0, 1);
  a.translate(0, 0.45, 0);
  const b = cliffBlock(0.95, 0.85, 0.8, 2);
  b.rotateZ(0.22);
  b.rotateY(0.4);
  b.translate(0.78, 0.12, 0.22);
  const g = merge([a, b]);
  spherifyNormals(g, new THREE.Vector3(0.2, 0.4, 0), 0.4);
  recolor(g, (x, y, z, nx, ny, nz, col) => {
    mix(col, CLIFF.base, CLIFF.side, smoothstep(-0.3, 0.7, y));
    col.lerp(CLIFF.top, smoothstep(0.35, 0.85, ny) * 0.8);
    const m = valueNoise(x * 1.8 + 7, z * 1.8 - 3, 71);
    col.lerp(CLIFF.moss, smoothstep(0.55, 0.9, ny) * smoothstep(0.35, 0.65, m) * 0.55);
  });
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------
// Placement (scatter / sampleField only).
// ---------------------------------------------------------------------------------------------
// Counts come from the tier (Q.boulders, Q.mesaRocks, Q.cliffRocks); until quality.js carries them,
// fall back to tier-sized defaults picked from Q.terrainSeg.
const ROCK_DEFAULTS = {
  low: { boulders: 64, mesaRocks: 18, cliffRocks: 36 },
  medium: { boulders: 140, mesaRocks: 36, cliffRocks: 76 },
  high: { boulders: 260, mesaRocks: 64, cliffRocks: 140 },
};
export function rockCounts(Q, tier) {
  const key = ROCK_DEFAULTS[tier] ? tier : Q.terrainSeg <= 128 ? 'low' : Q.terrainSeg <= 192 ? 'medium' : 'high';
  const d = ROCK_DEFAULTS[key];
  return {
    boulders: Q.boulders != null ? Q.boulders : d.boulders,
    mesaRocks: Q.mesaRocks != null ? Q.mesaRocks : d.mesaRocks,
    cliffRocks: Q.cliffRocks != null ? Q.cliffRocks : d.cliffRocks,
  };
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

// Boulders: clustered corestones (1 big + up to 3 smaller) on beaches and meadows, a few elsewhere.
export function placeBoulders(N, orientFn = orient) {
  if (N <= 0) return [];
  const centres = scatter({
    count: Math.ceil(N / 2.0),
    seed: 4101,
    tries: 70,
    accept: (b, x, z) => {
      if (b.under > 0.25 || b.h < -0.2 || b.rock > 0.55 || b.slope > 0.5) return 0;
      const patch = smoothstep(0.45, 0.68, clump(x, z, 0.045, 11));
      const w = b.beach * 0.9 + b.meadow * 0.55 + b.forest * 0.25 + b.tropical * 0.2 + b.desert * 0.3;
      return w * (0.08 + 0.92 * patch);
    },
  });
  const rand = mulberry32(4102);
  const out = [];
  for (const c of centres) {
    if (out.length >= N) break;
    const b = c.b;
    const kids = 1 + Math.floor(rand() * 3.2);
    const landmark = b.meadow > 0.4 && rand() < 0.12 ? 2.4 : 1;
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
      const it = {
        x, z,
        y: f.h - s * (0.18 + rand() * 0.2),
        s,
        sx: 0.85 + rand() * 0.4,
        sy: 0.6 + rand() * 0.35,
        sz: 0.85 + rand() * 0.35,
        tint: f.desert > 0.35 ? 'desert' : f.beach > 0.4 ? 'beach' : f.forest > 0.4 ? 'forest' : 'meadow',
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
    tries: 50,
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
    const s = mountain ? 2.6 + rand() * 3.4 : 1.8 + rand() * 2.4;
    const it = {
      x: p.x, z: p.z,
      y: p.b.h - s * (stack ? 0.15 : 0.35),
      s,
      sx: 0.8 + rand() * 0.5,
      sy: stack ? 1.4 + rand() * 0.6 : 0.8 + rand() * 0.6,
      sz: 0.8 + rand() * 0.4,
      tint: mountain ? 'crag' : 'coast',
      j: rand(),
    };
    out.push(orientFn(it, nrm, Math.atan2(nrm[0], nrm[2]) + (rand() - 0.5) * 0.8, 0.25, 0.1, rand));
  }
  return out;
}

// Per-instance tint (multiplies the baked vertex colours) + +-8% hue/value jitter.
const TINTS = {
  beach: [1.05, 1.0, 0.93],
  meadow: [0.98, 1.02, 0.95],
  forest: [0.9, 0.98, 0.92],
  desert: [1.15, 0.9, 0.76],
  face: [1.0, 1.0, 1.0],
  butte: [1.02, 0.98, 0.96],
  coast: [0.98, 0.98, 1.03],
  crag: [1.04, 1.03, 1.06],
};
const _col = new THREE.Color();
function tintColor(it) {
  const t = TINTS[it.tint] || TINTS.meadow;
  _col.setRGB(t[0], t[1], t[2]);
  const j = it.j;
  _col.offsetHSL((j - 0.5) * 0.04, 0, 0);
  _col.multiplyScalar(0.92 + ((j * 7.31) % 1) * 0.16);
  return _col;
}

function buildRocks(counts) {
  const kinds = [
    { name: 'boulders', geo: boulderGeometry(), mat: cozyMaterial({ wrap: 0.55, rim: 0.15, aoScale: 0.45 }), items: placeBoulders(counts.boulders) },
    { name: 'mesaRocks', geo: mesaGeometry(), mat: cozyMaterial({ wrap: 0.4, rim: 0.1, aoScale: 0.9 }), items: placeMesas(counts.mesaRocks) },
    { name: 'cliffRocks', geo: cliffGeometry(), mat: cozyMaterial({ wrap: 0.4, rim: 0.12, aoScale: 0.5 }), items: placeCliffs(counts.cliffRocks) },
  ];
  let tris = 0;
  let draws = 0;
  const meshes = kinds.map((k) => {
    const mesh = makeInstanced(k.geo, k.mat, k.items, tintColor);
    mesh.name = k.name;
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
  const rocks = useMemo(() => buildRocks(counts), [counts.boulders, counts.mesaRocks, counts.cliffRocks]);

  useEffect(() => {
    report('terrain', { draws: 1 + rocks.draws, triangles: terrain.tris + rocks.tris, programs: 2 });
  }, [terrain, rocks]);
  useEffect(() => () => { terrain.geometry.dispose(); terrain.material.dispose(); }, [terrain]);
  useEffect(
    () => () => {
      for (const k of rocks.kinds) {
        k.geo.dispose();
        k.mat.dispose();
      }
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
