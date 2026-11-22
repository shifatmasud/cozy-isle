// Shared painterly shading. Every material reuses these uniforms and GLSL so the phone compiles few programs
// (Adreno 5xx has no shader disk cache: every program compiles on every visit).
import * as THREE from 'three';

export const shared = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.45, 0.62, 0.42).normalize() },
  uSunColor: { value: new THREE.Color('#fff0d2') },
  uSkyColor: { value: new THREE.Color('#9fd1f5') },
  uGroundColor: { value: new THREE.Color('#7d8f55') },
  uShadowTint: { value: new THREE.Color('#6b7fc0') },
  uFogColor: { value: new THREE.Color('#d8ebf3') },
  uFogNear: { value: 140 },
  uFogFar: { value: 720 },
  uWind: { value: new THREE.Vector2(1.0, 0.35) },
  uUnderwater: { value: 0 },
};

export const GLSL_COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uShadowTint;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec2 uWind;
uniform float uUnderwater;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Soft toon light: warm sun, cool blue-violet shadows, hemisphere fill. wrap 0..1 softens the terminator.
vec3 cozyLight(vec3 base, vec3 n, vec3 wpos, float wrap, float ao) {
  float ndl = dot(n, uSunDir);
  float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  float band = smoothstep(0.30, 0.46, diff) * 0.45 + diff * 0.55;
  vec3 hemi = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
  vec3 shadowCol = base * mix(uShadowTint, vec3(1.0), 0.5);
  vec3 lit = base * uSunColor * 1.12;
  vec3 col = mix(shadowCol, lit, band);
  col += base * hemi * 0.2;
  return col * ao;
}

float caustics(vec2 p, float t) {
  vec2 q = p * 0.35;
  float c = 0.0;
  for (int i = 0; i < 2; i++) {
    q += vec2(sin(q.y * 1.7 + t * 0.6), cos(q.x * 1.5 - t * 0.5));
    c += abs(sin(q.x + q.y));
  }
  return pow(clamp(1.0 - c * 0.5, 0.0, 1.0), 4.0);
}

// Underwater look for anything below sea level: blue-green tint by depth + caustics.
vec3 underwaterTint(vec3 col, vec3 wpos) {
  if (wpos.y >= 0.0) return col;
  float dep = -wpos.y;
  col = mix(col, col * vec3(0.55, 0.86, 0.92), clamp(dep / 10.0, 0.0, 1.0));
  col += vec3(0.75, 0.95, 1.0) * caustics(wpos.xz, uTime) * 0.3 * exp(-dep * 0.12);
  return col;
}

vec3 applyFog(vec3 col, vec3 wpos) {
  float d = distance(cameraPosition, wpos);
  float f = smoothstep(uFogNear, uFogFar, d);
  float uf = smoothstep(2.0, 60.0, d);
  vec3 c = mix(col, uFogColor, f);
  return mix(c, mix(col, vec3(0.10, 0.42, 0.50), uf), uUnderwater);
}
`;

const COZY_VERT = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uColor;
uniform float uSway;
uniform float uAOScale;
varying vec3 vCol;
varying vec3 vN;
varying vec3 vW;
varying float vAO;
void main() {
  mat4 im = mat4(1.0);
  #ifdef USE_INSTANCING
  im = instanceMatrix;
  #endif
  vec4 w = modelMatrix * im * vec4(position, 1.0);
  float sway = uSway * max(position.y, 0.0);
  float ph = w.x * 0.07 + w.z * 0.05;
  w.xz += uWind * sway * (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 2.3) * 0.25);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(im) * normal);
  vec3 c = vec3(1.0);
  #ifdef USE_COLOR
  c = color;
  #endif
  #ifdef USE_INSTANCING_COLOR
  c *= instanceColor;
  #endif
  vCol = c * uColor;
  vAO = clamp(0.6 + position.y * uAOScale, 0.6, 1.0);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const COZY_FRAG = /* glsl */ `
${GLSL_COMMON}
uniform float uWrap;
uniform float uRim;
varying vec3 vCol;
varying vec3 vN;
varying vec3 vW;
varying float vAO;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float brush = vnoise(vW.xz * 0.9 + vW.y * 0.7) * 0.16 - 0.08;
  vec3 base = vCol * (1.0 + brush);
  vec3 col = cozyLight(base, n, vW, uWrap, vAO);
  vec3 V = normalize(cameraPosition - vW);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0) * uRim;
  col += rim * uSunColor * base * 0.8;
  col = underwaterTint(col, vW);
  col = applyFog(col, vW);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// One shader source for every plant, rock and coral: instances of it share one GPU program.
// color: base tint (multiplies vertex + instance colours). sway: wind bend per metre of local height.
// wrap: 0 hard terminator .. 1 very soft (use ~0.6-0.9 for foliage). rim: back-light glow.
export function cozyMaterial({ color = '#ffffff', sway = 0, wrap = 0.5, rim = 0.25, aoScale = 0.08, side = THREE.FrontSide } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: COZY_VERT,
    fragmentShader: COZY_FRAG,
    vertexColors: true,
    side,
    uniforms: {
      ...shared,
      uColor: { value: new THREE.Color(color) },
      uSway: { value: sway },
      uWrap: { value: wrap },
      uRim: { value: rim },
      uAOScale: { value: aoScale },
    },
  });
}
