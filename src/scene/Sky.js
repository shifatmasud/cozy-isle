import { createElement as h, useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { shared, GLSL_COMMON } from '../materials/shading.js';
import { report } from '../lib/geo.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const FRAG = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uCloudLight;
uniform vec3 uCloudShade;
varying vec3 vDir;
float fbmS(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < OCT; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.6, y));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 8.0) * 0.22 + smoothstep(0.9985, 0.9995, sd) * 1.2);
  if (y > 0.0) {
    vec2 uv = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
    float c = fbmS(uv * 0.55);
    float cover = smoothstep(0.50, 0.555, c);
    float lit = smoothstep(0.56, 0.68, c);
    vec3 cc = mix(uCloudShade, uCloudLight, lit);
    col = mix(col, cc, cover * smoothstep(0.0, 0.1, y) * 0.96);
  } else {
    col = mix(uHorizon, uFogColor, smoothstep(0.0, -0.15, y));
  }
  if (uUnderwater > 0.5) col = vec3(0.10, 0.42, 0.50);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export default function Sky({ Q }) {
  const ref = useRef();
  const { geometry, material } = useMemo(() => {
    const g = new THREE.SphereGeometry(1100, 32, 16);
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      defines: { OCT: Q.cloudOctaves },
      uniforms: {
        ...shared,
        uZenith: { value: new THREE.Color('#5aa7e3') },
        uHorizon: { value: new THREE.Color('#f6efd9') },
        uCloudLight: { value: new THREE.Color('#ffffff') },
        uCloudShade: { value: new THREE.Color('#b9c8e2') },
      },
    });
    report('sky', { triangles: 32 * 16 * 2, draws: 1 });
    return { geometry: g, material: m };
  }, [Q.cloudOctaves]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.position.copy(camera.position);
  });
  return h('mesh', { ref, geometry, material, renderOrder: -1, frustumCulled: false });
}
