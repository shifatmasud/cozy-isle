import { createElement as h, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { WORLD_SIZE, getField } from '../world/island.js';
import { shared, GLSL_COMMON } from '../materials/shading.js';
import { report } from '../lib/geo.js';

// Depth texture from the island field: R = depth (0 shore .. 1 at 24 m), G = land.
function depthTexture() {
  const f = getField();
  const n = f.n;
  const data = new Uint8Array(n * n * 4);
  for (let k = 0; k < n * n; k++) {
    const hgt = f.h[k];
    data[k * 4] = Math.round(Math.min(1, Math.max(0, -hgt / 24)) * 255);
    data[k * 4 + 1] = hgt > 0 ? 255 : 0;
    data[k * 4 + 2] = 0;
    data[k * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

const VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const FRAG = /* glsl */ `
${GLSL_COMMON}
uniform sampler2D uDepth;
uniform float uWorld;
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
varying vec3 vW;
void main() {
  vec2 uv = vW.xz / uWorld + 0.5;
  float depth = 1.0;
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) depth = texture2D(uDepth, uv).r;
  float t = uTime;
  vec2 grad = vec2(0.0);
  grad += vec2(0.8, 0.6) * cos(dot(vW.xz, vec2(0.8, 0.6)) * 0.21 + t * 1.1) * 0.5;
  grad += vec2(-0.4, 0.9) * cos(dot(vW.xz, vec2(-0.4, 0.9)) * 0.33 + t * 1.4) * 0.35;
  grad += vec2(0.95, -0.3) * cos(dot(vW.xz, vec2(0.95, -0.3)) * 0.57 + t * 1.9) * 0.2;
  grad += (vec2(vnoise(vW.xz * 0.18 + t * 0.2), vnoise(vW.xz * 0.18 - t * 0.17)) - 0.5) * 0.6;
  vec3 n = normalize(vec3(-grad.x * 0.22, 1.0, -grad.y * 0.22));

  vec3 col = mix(uShallow, uMid, smoothstep(0.0, 0.22, depth));
  col = mix(col, uDeep, smoothstep(0.22, 0.85, depth));

  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  col = mix(col, uSkyColor * 1.05, fres * 0.55);
  float s = pow(max(dot(reflect(-V, n), uSunDir), 0.0), 140.0);
  col += uSunColor * (step(0.45, s) * 0.55 + s * 0.35);

  float shore = smoothstep(0.07, 0.0, depth);
  float lines = step(0.58, fract(depth * 34.0 - t * 0.35 + vnoise(vW.xz * 0.25) * 0.8));
  float foam = shore * (0.55 + 0.45 * lines) * (0.7 + 0.3 * vnoise(vW.xz * 0.9 + t));
  col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.85);

  float alpha = mix(0.38, 0.94, smoothstep(0.0, 0.45, depth));
  alpha = max(alpha, foam);
  if (!gl_FrontFacing) {
    col = mix(uShallow * 1.2, vec3(0.85, 0.97, 1.0), fres);
    alpha = 0.85;
  }
  col = applyFog(col, vW);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export default function Ocean() {
  const { geometry, material } = useMemo(() => {
    const g = new THREE.PlaneGeometry(3000, 3000, 1, 1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        ...shared,
        uDepth: { value: depthTexture() },
        uWorld: { value: WORLD_SIZE },
        uShallow: { value: new THREE.Color('#7fe6d4') },
        uMid: { value: new THREE.Color('#2fb6c9') },
        uDeep: { value: new THREE.Color('#1e6fae') },
      },
    });
    report('ocean', { triangles: 2, draws: 1 });
    return { geometry: g, material: m };
  }, []);
  useEffect(() => () => { geometry.dispose(); material.uniforms.uDepth.value.dispose(); material.dispose(); }, [geometry, material]);
  return h('mesh', { geometry, material, renderOrder: 2 });
}
