// Painted late-morning sky, one draw, 12 triangles.
// References: fair-weather cumulus have flat bases at one condensation level and heaped, cauliflower tops, and gather
// in clusters and lines (WMO Cloud Atlas, cumulus humilis); cirrus are thin hair-like streaks combed along the high
// wind (Met Office, cirrus fibratus); the sky is deepest blue overhead and paler, whiter toward the horizon (Met Office,
// Rayleigh scattering). Ghibli painters simplify all this into flat-based white heaps with warm cream tops on the sun
// side and lavender-blue undersides over a cerulean gradient (Oga, Nishikawa).
//
// Performance: the box is drawn on the far plane (z = w) with depth test on and after the opaque pass, so on the
// phone only the pixels that really show sky run this shader (no full-screen overdraw under the terrain).
// Underwater the same box shows the water volume colour (waterFogColor) with soft light shafts.
import { createElement as h, useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { shared, GLSL_COMMON } from '../materials/shading.js';
import { report } from '../lib/geo.js';

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
varying vec3 vDir;

float fbmS(vec2 p) {
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

  vec2 hz = d.xz / max(length(d.xz), 0.0001);
  vec2 sunH = normalize(uSunDir.xz + vec2(0.0001));
  float sunSide = dot(hz, sunH) * 0.5 + 0.5;

  // 1) High cirrus: a few thin streaks combed along the upper wind, in patches.
  if (y > 0.16) {
    vec2 cu = d.xz / (y + 0.35) * 2.2 + vec2(uTime * 0.006, 0.0);
    cu = vec2(cu.x * 0.94 + cu.y * 0.34, -cu.x * 0.34 + cu.y * 0.94);
    float streak = vnoise(vec2(cu.x * 0.7, cu.y * 7.5));
    float patchy = vnoise(cu * 0.45 + 17.0);
    float w = smoothstep(0.55, 0.9, streak) * smoothstep(0.52, 0.78, patchy) * smoothstep(0.16, 0.4, y);
    col = mix(col, uCloudLight, w * 0.5);
  }

  // 2) Big cumulus heaps standing on the horizon: one flat base line, heaped tops, clear gaps between masses.
  if (y > 0.0 && y < 0.3) {
    float base = 0.03;
    vec2 drift = vec2(uTime * 0.004, 0.0);
    float prof = vnoise(hz * 3.1 + 11.0 + drift) * 0.62 + vnoise(hz * 7.3 + 3.0 + drift) * 0.38;
    float mass = smoothstep(0.45, 0.8, prof);
    float top = base + mass * 0.19;
    float puff = vnoise(hz * 16.0 + vec2(y * 30.0, -y * 22.0) + drift * 3.0) * 0.65
               + vnoise(hz * 40.0 + vec2(-y * 55.0, y * 41.0)) * 0.35;
    float edge = top + (puff - 0.5) * 0.05 * mass - y;
    float inside = smoothstep(0.0, 0.006, edge) * smoothstep(base - 0.002, base + 0.004, y) * step(0.02, mass);
    float hgt = clamp((y - base) / max(top - base, 0.01), 0.0, 1.0);
    float lit = (smoothstep(0.05, 0.85, hgt) * 0.65 + puff * 0.35) * (0.7 + 0.3 * sunSide);
    vec3 cc = mix(uCloudShade, uCloudLight, clamp(lit, 0.0, 1.0));
    cc = mix(cc, uCloudWarm, smoothstep(0.6, 1.0, hgt) * sunSide * 0.5);
    cc = mix(cc, uCloudShade * 0.92, smoothstep(0.012, 0.0, y - base) * 0.6);
    cc = mix(cc, uHorizon, 0.18);
    col = mix(col, cc, inside);
  }

  // 3) Scattered fair-weather cumulus overhead: white sun-facing rims, lavender thick cores.
  if (y > 0.1) {
    vec2 uv = d.xz / (y + 0.1) * 1.4 + vec2(uTime * 0.010, uTime * 0.003);
    float c = fbmS(uv);
    float cover = smoothstep(0.58, 0.62, c);
    float thick = smoothstep(0.62, 0.78, c);
    float dirLit = clamp((vnoise(uv) - vnoise(uv + sunH * 0.3)) * 2.5 + 0.55, 0.0, 1.0);
    vec3 cc = mix(uCloudShade, uCloudLight, clamp(dirLit * 0.6 + (1.0 - thick) * 0.5, 0.0, 1.0));
    cc = mix(cc, uCloudWarm, 0.25 * sunSide);
    col = mix(col, cc, cover * smoothstep(0.1, 0.3, y) * 0.97);
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
  cloudShade: '#a9b2dc',
};

export default function Sky({ Q }) {
  const ref = useRef();
  const { geometry, material } = useMemo(() => {
    // Camera sits at the centre, so the interpolated position is the exact view ray: a 12-triangle box is enough.
    const g = new THREE.BoxGeometry(1000, 1000, 1000);
    g.deleteAttribute('uv');
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      defines: { OCT: Math.max(1, Math.min(6, Q.cloudOctaves | 0)) },
      uniforms: {
        ...shared,
        uZenith: { value: new THREE.Color(SKY_PALETTE.zenith) },
        uMidSky: { value: new THREE.Color(SKY_PALETTE.midSky) },
        uHorizon: { value: new THREE.Color(SKY_PALETTE.horizon) },
        uCloudLight: { value: new THREE.Color(SKY_PALETTE.cloudLight) },
        uCloudWarm: { value: new THREE.Color(SKY_PALETTE.cloudWarm) },
        uCloudShade: { value: new THREE.Color(SKY_PALETTE.cloudShade) },
      },
    });
    const triangles = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    report('sky', { draws: 1, triangles, programs: 1 });
    return { geometry: g, material: m };
  }, [Q.cloudOctaves]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.position.copy(camera.position);
  });
  // renderOrder 1: after the opaque world (so depth rejects covered pixels), before the transparent ocean (2).
  return h('mesh', { ref, geometry, material, renderOrder: 1, frustumCulled: false });
}
