// THE shared world contract. Every module reads the island from here.
// Axes: +x east, -z north, y up, sea level y = 0.
// Biome layout: forest + mountain north, meadow east and centre, tropics south (with lagoon + reef offshore),
// desert mesas west, beaches all round, cliffs where the mountain meets the north coast.
import { fbm, valueNoise, smoothstep, lerp, clamp, mulberry32 } from './noise.js';

export const SEA_LEVEL = 0;
export const WORLD_SIZE = 420;
export const ISLAND_R = 128;
export const FIELD_RES = 256; // cells; arrays are (FIELD_RES + 1)^2

export const BIOME_ANGLE = {
  meadow: 0,
  tropical: Math.PI * 0.42,
  desert: Math.PI,
  forest: -Math.PI * 0.5,
};

function angDist(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
function sector(a, c, w) {
  const d = angDist(a, c);
  return Math.exp(-(d * d) / (2 * w * w));
}

export function coastRadius(ang) {
  const nx = Math.cos(ang);
  const nz = Math.sin(ang);
  const n = fbm(nx * 1.4 + 3.1, nz * 1.4 + 7.7, 4, 5);
  return ISLAND_R * (0.82 + 0.42 * (n - 0.5) + 0.06 * Math.sin(ang * 3 + 1.1) + 0.12 * sector(ang, BIOME_ANGLE.forest, 0.7));
}

// d: 0 at centre, ~0.95 at the waterline, >1 offshore. ang: noisy angle used for biome sectors.
export function shapeAt(x, z) {
  const rawAng = Math.atan2(z, x);
  const wob = (fbm(x * 0.02 + 11, z * 0.02 - 4, 3, 9) - 0.5) * 0.6;
  const d = Math.hypot(x, z) / coastRadius(rawAng);
  return { ang: rawAng + wob, d };
}

// Exact height. Expensive: use sampleField() in loops.
export function heightAt(x, z) {
  const { ang, d } = shapeAt(x, z);
  const wD = sector(ang, BIOME_ANGLE.desert, 0.6);
  const wT = sector(ang, BIOME_ANGLE.tropical, 0.6);
  const inland = smoothstep(0.98, 0.55, d);

  const hills = (fbm(x * 0.016 + 2, z * 0.016 - 3, 4, 3) - 0.42) * 18;
  let land = 1.2 + inland * (5 + Math.max(hills, -3));

  // Mountain in the north.
  const mx = x + 10;
  const mz = z + 78;
  const mount = Math.exp(-(mx * mx + mz * mz) / (2 * 34 * 34));
  const ridge = 1 - Math.abs(valueNoise(x * 0.045, z * 0.045, 21) * 2 - 1);
  land += mount * (46 + 14 * ridge);

  // Desert mesas in the west.
  const mesaN = fbm(x * 0.03 - 9, z * 0.03 + 5, 3, 31);
  const mesa = smoothstep(0.52, 0.6, mesaN) * 14 * wD * inland;
  land = land * (1 - 0.35 * wD) + mesa;

  // Tropics are low and gentle.
  land = lerp(land, 1.2 + inland * 4.0 + Math.max(hills, 0) * 0.3, wT * 0.6);

  const beach = smoothstep(1.0, 0.88, d);

  // Sea floor, tropical lagoon and reef crest.
  let sea = -1.0 - 22 * smoothstep(0.98, 1.75, d);
  const lagoon = wT * smoothstep(0.98, 1.06, d) * smoothstep(1.42, 1.3, d);
  sea = lerp(sea, -3.2 - 1.5 * valueNoise(x * 0.08, z * 0.08, 41), lagoon);
  const crest = wT * Math.exp(-((d - 1.33) * (d - 1.33)) / (2 * 0.03 * 0.03));
  sea = lerp(sea, -1.1, crest * 0.85);
  sea += (valueNoise(x * 0.12, z * 0.12, 51) - 0.5) * 0.8;

  return lerp(sea, land, beach);
}

// ---- Cached field: heights + biome weights on a grid, sampled bilinearly. ----
const KEYS = ['h', 'slope', 'forest', 'tropical', 'desert', 'meadow', 'beach', 'rock', 'under', 'd'];
let FIELD = null;

export function getField() {
  if (FIELD) return FIELD;
  const n = FIELD_RES + 1;
  const cell = WORLD_SIZE / FIELD_RES;
  const half = WORLD_SIZE / 2;
  const f = { res: FIELD_RES, n, cell };
  for (const k of KEYS) f[k] = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) f.h[j * n + i] = heightAt(-half + i * cell, -half + j * cell);
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = -half + i * cell;
      const z = -half + j * cell;
      const h = f.h[k];
      const hx = f.h[j * n + Math.min(n - 1, i + 1)] - f.h[j * n + Math.max(0, i - 1)];
      const hz = f.h[Math.min(n - 1, j + 1) * n + i] - f.h[Math.max(0, j - 1) * n + i];
      const slope = Math.min(1, Math.hypot(hx, hz) / (2 * cell));
      const { ang, d } = shapeAt(x, z);
      let forest = sector(ang, BIOME_ANGLE.forest, 0.7) + 0.6 * smoothstep(18, 30, h);
      let tropical = sector(ang, BIOME_ANGLE.tropical, 0.55);
      let desert = sector(ang, BIOME_ANGLE.desert, 0.5);
      let meadow = sector(ang, BIOME_ANGLE.meadow, 0.7) + 0.9 * smoothstep(0.5, 0.2, d);
      const sum = forest + tropical + desert + meadow + 1e-6;
      forest /= sum; tropical /= sum; desert /= sum; meadow /= sum;
      const beach = smoothstep(2.2, 1.0, h) * smoothstep(-0.6, 0.2, h) * smoothstep(0.7, 0.9, d);
      const rock = Math.max(smoothstep(0.55, 0.85, slope), smoothstep(42, 52, h));
      const under = smoothstep(0.1, -0.8, h);
      const landW = (1 - beach) * (1 - rock) * (1 - under);
      f.slope[k] = slope;
      f.forest[k] = forest * landW;
      f.tropical[k] = tropical * landW;
      f.desert[k] = desert * landW;
      f.meadow[k] = meadow * landW;
      f.beach[k] = beach * (1 - under);
      f.rock[k] = rock * (1 - under);
      f.under[k] = under;
      f.d[k] = d;
    }
  }
  FIELD = f;
  return f;
}

// Bilinear sample: { h, slope, forest, tropical, desert, meadow, beach, rock, under, d }.
// Land biome weights (forest..meadow) + beach + rock + under add up to about 1.
export function sampleField(x, z) {
  const f = getField();
  const n = f.n;
  const u = clamp((x + WORLD_SIZE / 2) / f.cell, 0, f.res - 1e-4);
  const v = clamp((z + WORLD_SIZE / 2) / f.cell, 0, f.res - 1e-4);
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const k00 = j * n + i;
  const k10 = k00 + 1;
  const k01 = k00 + n;
  const k11 = k01 + 1;
  const out = {};
  for (const key of KEYS) {
    const a = f[key];
    out[key] = (a[k00] * (1 - fu) + a[k10] * fu) * (1 - fv) + (a[k01] * (1 - fu) + a[k11] * fu) * fv;
  }
  return out;
}

// Surface normal from the cached field.
export function normalAt(x, z, e = 1) {
  const hx = sampleField(x + e, z).h - sampleField(x - e, z).h;
  const hz = sampleField(x, z + e).h - sampleField(x, z - e).h;
  const nx = -hx / (2 * e);
  const nz = -hz / (2 * e);
  const len = Math.hypot(nx, 1, nz);
  return [nx / len, 1 / len, nz / len];
}

// Rejection-sample placements. accept(sample, x, z, rand) returns 0..1 probability.
// Returns [{ x, y, z, r (yaw), s (scale 1), rnd (0..1), b (field sample) }].
export function scatter({ count, seed = 1, tries = 24, accept, bounds = WORLD_SIZE / 2 }) {
  const rand = mulberry32(seed);
  const out = [];
  const maxTries = count * tries;
  for (let t = 0; t < maxTries && out.length < count; t++) {
    const x = (rand() * 2 - 1) * bounds;
    const z = (rand() * 2 - 1) * bounds;
    const b = sampleField(x, z);
    const p = accept(b, x, z, rand);
    if (p > 0 && rand() < p) out.push({ x, y: b.h, z, r: rand() * Math.PI * 2, s: 1, rnd: rand(), b });
  }
  return out;
}

// Clumping helper: 0..1 low-frequency noise for groves and patches.
export function clump(x, z, scale = 0.04, seed = 0) {
  return fbm(x * scale, z * scale, 3, 900 + seed);
}
