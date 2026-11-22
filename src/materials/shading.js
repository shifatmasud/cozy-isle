// Shared painterly shading. Every material reuses these uniforms and GLSL so the phone compiles few programs
// (Adreno 5xx has no shader disk cache: every program compiles on every visit).
//
// Look: a late-morning Studio Ghibli background (Kazuo Oga / Yoichi Nishikawa poster-colour paintings).
// - Sun about 44 degrees up from the east-south-east, warm cream light: lit greens go warm and a touch more saturated.
// - Shadows are lit by the blue sky (Leonardo's coloured shadows): cool blue-violet, luminous, never grey or black.
// - Hemisphere fill: cerulean from above, warm olive bounce from the grass below.
// - Aerial perspective: with distance colours get cooler, then lighter, then melt into the horizon haze (uFogColor),
//   which is the exact colour of the sky's lowest band, so the sea and far land dissolve into the sky without a seam.
// - Underwater: red is absorbed first (teal shift with depth), caustic threads on the sand, teal-blue fog that is
//   brighter looking up toward the surface and deeper blue looking down (the sky box uses the same waterFogColor()).
//
// API kept stable for every builder: cozyMaterial({ color, sway, wrap, rim, aoScale, side }) and the GLSL_COMMON
// names hash12, vnoise, cozyLight, caustics, underwaterTint, applyFog plus all original uniforms.
// Added (optional to use): uWaterFog, uWaterDeep uniforms and waterFogColor(dir), cozyLuma(c) helpers.
import * as THREE from 'three';

export const shared = {
  uTime: { value: 0 },
  // ESE sun, ~44 degrees high: late morning. Side-lights the overview camera (which looks north-west) for modelling.
  uSunDir: { value: new THREE.Vector3(0.62, 0.64, 0.24).normalize() },
  uSunColor: { value: new THREE.Color('#fff0d4') },
  uSkyColor: { value: new THREE.Color('#9ccbf0') },
  uGroundColor: { value: new THREE.Color('#8f9a58') },
  uShadowTint: { value: new THREE.Color('#5d6cc6') },
  // Must equal the lowest band of the painted sky (Sky.js mixes into this colour at the horizon).
  uFogColor: { value: new THREE.Color('#dbe8ec') },
  uFogNear: { value: 130 },
  uFogFar: { value: 900 },
  uWind: { value: new THREE.Vector2(1.0, 0.35) },
  uUnderwater: { value: 0 },
  // Lagoon water seen from inside: bright teal toward the surface, deep blue below.
  uWaterFog: { value: new THREE.Color('#3aa7b2') },
  uWaterDeep: { value: new THREE.Color('#14557a') },
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
uniform vec3 uWaterFog;
uniform vec3 uWaterDeep;

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
float cozyLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Soft gouache light: warm sun, cool sky-lit blue-violet shadows, hemisphere fill. wrap 0..1 softens the terminator.
vec3 cozyLight(vec3 base, vec3 n, vec3 wpos, float wrap, float ao) {
  float ndl = dot(n, uSunDir);
  float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  // A readable painted edge between light and shade, softened by a little gradient.
  float band = smoothstep(0.28, 0.44, diff) * 0.6 + diff * 0.4;
  // Shade is lit by the sky: cooler, luminous, never black.
  vec3 shadowCol = base * mix(uShadowTint, vec3(1.0), 0.48) + uShadowTint * 0.03;
  // Sun side: warm cream light and slightly richer saturation (poster-colour greens).
  vec3 lit = base * uSunColor * 1.14;
  lit = max(mix(vec3(cozyLuma(lit)), lit, 1.12), vec3(0.0));
  vec3 col = mix(shadowCol, lit, band);
  // Hemisphere fill: cerulean from above, warm olive bounce from below.
  vec3 hemi = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
  col += base * hemi * 0.2;
  // Upward faces in shade catch a faint cool sheen from the open sky.
  col += uSkyColor * 0.025 * (1.0 - band) * max(n.y, 0.0);
  return col * ao;
}

// Thin bright threads that drift like light focused by surface ripples. Returns 0..1.
float caustics(vec2 p, float t) {
  vec2 q = p * 0.38 + vec2(t * 0.03, -t * 0.02);
  float c = 0.0;
  for (int i = 0; i < 2; i++) {
    q += vec2(sin(q.y * 1.7 + t * 0.62), cos(q.x * 1.5 - t * 0.48));
    c += abs(sin(q.x + q.y));
  }
  float net = clamp(1.0 - c * 0.5, 0.0, 1.0);
  net *= net;
  return net * net;
}

// Underwater look for anything below sea level: red absorbed first (teal shift by depth) + caustics.
vec3 underwaterTint(vec3 col, vec3 wpos) {
  if (wpos.y >= 0.0) return col;
  float dep = -wpos.y;
  float k = clamp(dep / 9.0, 0.0, 1.0);
  col = mix(col, col * vec3(0.52, 0.84, 0.92) + uWaterFog * 0.05, k);
  col += vec3(0.80, 0.96, 1.0) * caustics(wpos.xz, uTime) * 0.32 * exp(-dep * 0.11) * (0.6 + 0.4 * uSunDir.y);
  return col;
}

// Colour of open water seen from inside, by view direction: deep blue looking down, bright teal looking up.
vec3 waterFogColor(vec3 dir) {
  float up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  return mix(uWaterDeep, uWaterFog, smoothstep(0.15, 0.75, up));
}

// Aerial perspective above water (cooler, then lighter, then horizon haze); teal water fog when the camera is under.
vec3 applyFog(vec3 col, vec3 wpos) {
  vec3 toP = wpos - cameraPosition;
  float d = length(toP);
  if (uUnderwater > 0.5) {
    float uf = 1.0 - exp(-max(d - 1.5, 0.0) * 0.032);
    vec3 absorbed = col * mix(vec3(1.0), vec3(0.55, 0.85, 0.95), clamp(d / 25.0, 0.0, 1.0));
    return mix(absorbed, waterFogColor(toP / max(d, 0.001)), uf);
  }
  float cool = smoothstep(uFogNear * 0.4, uFogFar * 0.6, d);
  col = mix(col, col * vec3(0.84, 0.92, 1.05) + uSkyColor * 0.06, cool * 0.65);
  float x = clamp((d - uFogNear) / max(uFogFar - uFogNear, 1.0), 0.0, 1.0);
  return mix(col, uFogColor, x * x * (3.0 - 2.0 * x));
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
  // Brush texture: small value strokes plus broad warm/cool patches, like hand-mixed poster colour.
  float brush = (vnoise(vW.xz * 0.9 + vW.y * 0.7) - 0.5) * 0.16;
  vec3 base = vCol * (1.0 + brush);
  base *= mix(vec3(0.97, 1.0, 1.03), vec3(1.04, 1.0, 0.92), vnoise(vW.xz * 0.05 + 3.7));
  vec3 col = cozyLight(base, n, vW, uWrap, vAO);
  // Rim glow, stronger when the sun is behind the leaves (back-lit translucency).
  vec3 V = normalize(cameraPosition - vW);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0) * uRim;
  float back = 0.55 + 0.45 * max(dot(-V, uSunDir), 0.0);
  col += rim * back * uSunColor * base * 0.8;
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
// Note: three.js keys programs by side (Front/Double) and by instance colour use, so for the fewest programs
// pass a colour callback to makeInstanced() everywhere and prefer FrontSide unless a part is a single sheet.
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
