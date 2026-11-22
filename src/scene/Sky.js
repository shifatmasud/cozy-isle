// Painted late-morning sky: one draw, 12 triangles, and a cloud panorama painted ONCE at start-up.
// References: fair-weather cumulus have flat bases at one condensation level and heaped, cauliflower tops, and gather
// in clusters and lines (WMO Cloud Atlas, cumulus humilis / CL1-CL2); cirrus are thin hair-like streaks combed along
// the high wind (Met Office, cirrus fibratus); the sky is deepest blue overhead and paler, whiter toward the horizon
// (Rayleigh scattering). Ghibli painters (Oga, Nishikawa; Ponyo and Kiki skies in poster colour) simplify this into
// flat-based white heaps built from round billows: cream-white tops on the sun side, lavender-blue undersides and
// creases where one billow sits in front of another, a bright silver lining when the sun is behind, and distant
// heaps that sink pale and blue into the horizon haze.
//
// Performance (round 2): the old shader ran 3-5 octaves of noise per sky pixel every frame. Now a one-off bake pass
// paints the clouds into a 2048 x 512 panorama (azimuth x sqrt(sin elevation), so the horizon band gets most rows):
//   R = light value (0 lavender shade .. 1 sunlit white), G = warm cream amount, B = cirrus, A = signed distance to
//   the cumulus edge (0.5 = edge). The per-frame sky is the colour gradient + ONE texture fetch; the edge is
//   re-sharpened with fwidth (like SDF text), so cloud silhouettes stay crisp at any zoom. The panorama turns very
//   slowly for drift. The bake re-runs if the WebGL context is restored.
// The box is drawn on the far plane (z = w) with depth test on and after the opaque pass, so only the pixels that
// really show sky run this shader. Underwater the same box shows the water volume colour with soft light shafts.
import { createElement as h, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { shared, GLSL_COMMON } from '../materials/shading.js';
import { report } from '../lib/geo.js';

const PANO_W = 2048;
const PANO_H = 512;
const DRIFT = 0.00012; // panorama turns per second (one turn in ~2.3 h; the baked light stays believable)

// ---------- bake pass (runs once) ----------
const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BAKE_FRAG = /* glsl */ `
${GLSL_COMMON}
varying vec2 vUv;
#define TAU 6.28318531
#define PI 3.14159265

float fbmB(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  float n = 0.0;
  for (int i = 0; i < OCT; i++) {
    s += a * vnoise(p);
    n += a;
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s / n;
}

// One row of cumulus heaps on a flat base. p = (azimuth in rad, y = sin of elevation).
// Each heap = a solid dome-shaped body + 12 round billows strung along the dome's top edge (the cauliflower
// silhouette) + 4 fat lumps along the flat base, in front. Returns the signed distance (rad, + inside) and paints
// the front-most lobe: lit (0..1) and rim (silhouette factor for silver linings).
float heaps(vec2 p, float N, float base, float hMin, float hMax, float seed, vec3 L, out float lit, out float rim) {
  float spacing = TAU / N;
  float ci = floor((p.x + PI) / spacing);
  float best = -1.0;
  float bestKey = -1e9;
  vec2 sel = vec2(1.0, 0.0);
  float selH = 1.0;
  float covered = 0.0;
  for (int k = -1; k <= 1; k++) {
    float idx = mod(ci + float(k), N);
    float h0 = hash12(vec2(idx, seed));
    if (h0 < 0.22) continue; // a gap of clear sky
    float h1 = hash12(vec2(idx + 7.3, seed));
    float h2 = hash12(vec2(idx, seed + 3.1));
    float ca = (idx + 0.5 + (h1 - 0.5) * 0.6) * spacing - PI;
    float dx = mod(p.x - ca + PI, TAU) - PI;
    float W = spacing * (0.3 + 0.45 * h2);
    float H = mix(hMin, hMax, h0 * h0);
    if (abs(dx) > W + H) continue;
    float py = p.y - base;
    // Body: half-ellipse dome, behind the billows.
    float Wb = W * 0.9;
    float Hb = H * 0.74;
    vec2 qb = vec2(dx / Wb, py / Hb);
    float eb = length(qb);
    float sb = (1.0 - eb) * min(Wb, Hb);
    best = max(best, sb);
    if (sb > 0.0) covered += 1.0;
    float keyB = sb > 0.0 ? 1.0 + sqrt(max(1.0 - eb * eb, 0.0)) * Hb * 0.5 - H * 0.4 : sb;
    if (keyB > bestKey) {
      bestKey = keyB;
      sel = qb;
      selH = H;
    }
    float rs = mix(H, W * 0.5, 0.5);
    for (int j = 0; j < 16; j++) {
      float fj = float(j);
      float r1 = hash12(vec2(idx * 17.0 + fj, seed + 11.0));
      float r2 = hash12(vec2(idx * 5.0 + fj * 3.0, seed + 23.0));
      float r3 = hash12(vec2(fj * 7.0 + idx, seed + 37.0));
      float t;
      float r;
      float cy;
      float zb;
      if (j < 12) {
        // top billows hugging the dome envelope
        t = (r1 * 2.0 - 1.0) * 0.95;
        float env = H * pow(max(1.0 - t * t, 0.0), 0.55);
        r = (0.18 + 0.2 * r2) * rs * mix(0.65, 1.0, 1.0 - abs(t));
        cy = max(env - r * 0.85, r * 0.3);
        zb = r3 * r * 0.3;
      } else {
        // fat lumps along the base, nearest the viewer
        t = (r1 * 2.0 - 1.0) * 0.8;
        r = (0.22 + 0.14 * r2) * rs;
        cy = r * 0.55;
        zb = H * 0.3;
      }
      vec2 q = vec2(dx - t * W, py - cy);
      float dd = length(q);
      float s = r - dd;
      best = max(best, s);
      if (s > 0.0) covered += 1.0;
      float key = s > 0.0 ? 1.0 + sqrt(max(r * r - dd * dd, 0.0)) + zb : s;
      if (key > bestKey) {
        bestKey = key;
        sel = q / r;
        selH = H;
      }
    }
  }
  // Small cauliflower bumps along every edge, then the flat condensation base.
  best += (vnoise(p * 90.0 + seed) - 0.5) * 0.004;
  float sd = min(best, (p.y - base) * 1.2);
  vec2 qn = sel;
  float l2 = dot(qn, qn);
  if (l2 > 1.0) qn /= sqrt(l2);
  float nz = sqrt(max(1.0 - dot(qn, qn), 0.0));
  vec3 Nn = vec3(qn, nz);
  float diff = clamp((dot(Nn, L) + 0.5) / 1.5, 0.0, 1.0);
  float hg = clamp((p.y - base) / selH, 0.0, 1.0);
  lit = diff * 0.45 + hg * 0.5 + 0.05;
  float occl = covered > 1.5 ? 1.0 : 0.0;
  lit *= mix(1.0, mix(0.55, 1.0, smoothstep(0.0, 0.55, nz)), occl); // lavender creases between billows
  lit *= mix(0.72, 1.0, smoothstep(0.0, 0.018, p.y - base)); // cool shaded underside along the base
  rim = (1.0 - occl) * pow(1.0 - nz, 3.0);
  return sd;
}

void main() {
  float az = (vUv.x - 0.5) * TAU;
  float y = vUv.y * vUv.y;
  float rh = sqrt(max(1.0 - y * y, 0.0));
  vec3 d = vec3(rh * cos(az), y, rh * sin(az));
  vec2 outH = vec2(cos(az), sin(az));
  vec3 S = uSunDir;
  vec2 sunH = normalize(S.xz + vec2(0.0001));
  // Sun in the local frame of a heap seen at this azimuth: x right, y up, z toward the viewer.
  vec3 L = vec3(dot(S.xz, vec2(-outH.y, outH.x)), S.y, -dot(S.xz, outH));
  float sunSide = dot(outH, sunH) * 0.5 + 0.5;
  float backlit = max(dot(outH, sunH), 0.0);
  vec2 p = vec2(az, y);

  // Far row: small pale heaps sitting low in the haze. Near row: the big towers.
  float litF;
  float rimF;
  float sF = heaps(p, 23.0, 0.006, 0.012, 0.042, 7.0, L, litF, rimF);
  float litN;
  float rimN;
  float sN = heaps(p, 10.0, 0.02, 0.04, 0.24, 3.0, L, litN, rimN);
  bool nearWins = sN > 0.0 || sN > sF;
  float s = max(sN, sF);
  float lit = nearWins ? litN : mix(litF, 0.82, 0.45);
  float rim = nearWins ? rimN : rimF * 0.6;

  // Scattered fair-weather cumulus overhead: soft-edged fbm puffs, white sun-facing rims, lavender thick cores.
  float sO = -1.0;
  float litO = 0.8;
  if (y > 0.1) {
    vec2 uv = d.xz / (y + 0.1) * 1.4;
    float c = fbmB(uv);
    float thr = 0.6 + 0.2 * (1.0 - smoothstep(0.12, 0.35, y));
    sO = (c - thr) * 0.15;
    float c2 = fbmB(uv + sunH * 0.18);
    float thick = smoothstep(thr, thr + 0.15, c);
    litO = clamp(0.62 + (c - c2) * 4.0, 0.0, 1.0);
    litO = mix(litO, litO * 0.55, thick * 0.7) + (1.0 - smoothstep(thr, thr + 0.04, c)) * 0.22;
  }
  if (sO > s && s <= 0.0) {
    s = sO;
    lit = litO;
    rim = 0.0;
  }
  lit += (vnoise(vec2(az * 90.0, y * 140.0)) - 0.5) * 0.07; // gouache brush grain
  lit += rim * backlit * 0.5; // silver lining
  lit = clamp(lit, 0.0, 1.0);
  float warm = clamp(smoothstep(0.6, 1.0, lit) * 0.55 * sunSide + rim * backlit * 0.6, 0.0, 1.0);

  // High cirrus: a few thin streaks combed along the upper wind, in patches.
  float ci = 0.0;
  if (y > 0.2) {
    vec2 cu = d.xz / (y + 0.35) * 2.2;
    cu = vec2(cu.x * 0.94 + cu.y * 0.34, -cu.x * 0.34 + cu.y * 0.94);
    cu.y += vnoise(cu * 0.8) * 1.5; // combed, gently curving strands
    float streak = vnoise(vec2(cu.x * 0.7, cu.y * 7.5));
    float patchy = vnoise(cu * 0.45 + 17.0);
    ci = smoothstep(0.55, 0.9, streak) * smoothstep(0.52, 0.78, patchy) * smoothstep(0.2, 0.45, y) * 0.7;
  }
  gl_FragColor = vec4(lit, warm, ci, 0.5 + clamp(s * 20.0, -0.5, 0.5));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------- per-frame sky ----------
const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
}
`;

const FRAG = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uZenith;
uniform vec3 uMidSky;
uniform vec3 uHorizon;
uniform vec3 uCloudLight;
uniform vec3 uCloudWarm;
uniform vec3 uCloudShade;
uniform sampler2D uClouds;
uniform float uDrift;
varying vec3 vDir;

vec3 paintedSky(vec3 d) {
  float y = d.y;
  float yy = max(y, 0.0);
  // Cream haze at the horizon -> soft blue -> deep cerulean overhead.
  vec3 col = mix(uHorizon, uMidSky, smoothstep(0.0, 0.3, yy));
  col = mix(col, uZenith, smoothstep(0.22, 1.0, yy));
  // The last sliver above the sea is the fog colour itself, so distant water and land melt into the sky.
  col = mix(uFogColor, col, smoothstep(-0.01, 0.06, y));
  // Gentle warm glow round a small soft sun.
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 5.0) * 0.10 + pow(sd, 48.0) * 0.22 + smoothstep(0.9990, 0.9996, sd) * 0.9);
  if (y > -0.004) {
    vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5 + uTime * uDrift, sqrt(yy));
    vec4 c = texture2D(uClouds, uv);
    col = mix(col, uCloudLight, c.b * 0.5);
    // Re-sharpen the stored edge distance: a crisp painted silhouette, 1-2 px wide at any zoom.
    float w = max(fwidth(c.a), 0.004) * 0.85;
    float cov = smoothstep(0.5 - w, 0.5 + w, c.a);
    vec3 cc = mix(uCloudShade, uCloudLight, c.r);
    cc = mix(cc, uCloudWarm, c.g);
    // Aerial perspective: low clouds sink into the horizon haze.
    cc = mix(cc, uHorizon, 0.1 + 0.4 * (1.0 - smoothstep(0.0, 0.035, y)));
    col = mix(col, cc, cov * 0.97);
  }
  return col;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 col;
  if (uUnderwater > 0.5) {
    col = waterFogColor(d);
    vec2 hz = d.xz / max(length(d.xz), 0.0001);
    float shafts = vnoise(hz * 26.0 + vec2(uTime * 0.15, 0.0)) * vnoise(hz * 11.0 - vec2(0.0, uTime * 0.08));
    col += uWaterFog * 0.6 * shafts * smoothstep(-0.1, 0.7, d.y);
  } else {
    col = paintedSky(d);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const SKY_PALETTE = {
  zenith: '#3f8fdc',
  midSky: '#86c1ee',
  horizon: '#f1eedc',
  cloudLight: '#ffffff',
  cloudWarm: '#fff3dc',
  cloudShade: '#9aa3d8',
};

function makeBake(octaves) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const m = new THREE.ShaderMaterial({
    vertexShader: BAKE_VERT,
    fragmentShader: BAKE_FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    defines: { OCT: octaves },
    uniforms: { ...shared },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { scene, camera: new THREE.Camera(), geometry: g, material: m };
}

export default function Sky({ Q }) {
  const ref = useRef();
  const renderer = useThree((s) => s.gl);
  // Bake detail does not cost frame time, so every tier gets 5-6 octaves.
  const octaves = Math.max(5, Math.min(6, (Q.cloudOctaves | 0) + 2));
  const { geometry, material, target } = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(PANO_W, PANO_H, {
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    rt.texture.wrapS = THREE.RepeatWrapping;
    rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    rt.texture.generateMipmaps = false;
    // Camera sits at the centre, so the interpolated position is the exact view ray: a 12-triangle box is enough.
    const g = new THREE.BoxGeometry(1000, 1000, 1000);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      uniforms: {
        ...shared,
        uZenith: { value: new THREE.Color(SKY_PALETTE.zenith) },
        uMidSky: { value: new THREE.Color(SKY_PALETTE.midSky) },
        uHorizon: { value: new THREE.Color(SKY_PALETTE.horizon) },
        uCloudLight: { value: new THREE.Color(SKY_PALETTE.cloudLight) },
        uCloudWarm: { value: new THREE.Color(SKY_PALETTE.cloudWarm) },
        uCloudShade: { value: new THREE.Color(SKY_PALETTE.cloudShade) },
        uClouds: { value: rt.texture },
        uDrift: { value: DRIFT },
      },
    });
    report('sky', { draws: 1, triangles: g.index.count / 3, programs: 1 });
    return { geometry: g, material: m, target: rt };
  }, []);

  // Paint the cloud panorama before the first frame (and again after a context restore).
  // The bake program lives only for this one draw: it is compiled, used once and released straight away.
  useLayoutEffect(() => {
    const paint = () => {
      const bake = makeBake(octaves);
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(bake.scene, bake.camera);
      renderer.setRenderTarget(prev);
      bake.geometry.dispose();
      bake.material.dispose();
    };
    paint();
    const canvas = renderer.domElement;
    // three restores its own state first (its listener was added earlier), then we repaint the lost panorama.
    const restored = () => setTimeout(paint, 0);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      canvas.removeEventListener('webglcontextrestored', restored);
    };
  }, [renderer, target, octaves]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      target.dispose();
    },
    [geometry, material, target]
  );
  useFrame(({ camera }) => {
    if (ref.current) ref.current.position.copy(camera.position);
  });
  // renderOrder 1: after the opaque world (so depth rejects covered pixels), before the transparent shallows (2).
  return h('mesh', { ref, geometry, material, renderOrder: 1, frustumCulled: false });
}
