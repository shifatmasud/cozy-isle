import { createElement as h, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { WORLD_SIZE, sampleField } from '../world/island.js';
import { valueNoise, smoothstep } from '../world/noise.js';
import { shared, GLSL_COMMON } from '../materials/shading.js';
import { report } from '../lib/geo.js';

const PAL = {
  meadow: new THREE.Color('#8cc152'),
  meadowLight: new THREE.Color('#b9da6a'),
  forest: new THREE.Color('#4d7d38'),
  tropical: new THREE.Color('#62b04a'),
  desert: new THREE.Color('#dba56a'),
  sand: new THREE.Color('#f3e0a8'),
  rock: new THREE.Color('#8f928a'),
  seabed: new THREE.Color('#ecdcaa'),
  deep: new THREE.Color('#5f938e'),
};

const tmp = new THREE.Color();
function add(out, c, w) {
  out.r += c.r * w;
  out.g += c.g * w;
  out.b += c.b * w;
  return w;
}

function terrainColor(b, x, z, out) {
  const n = valueNoise(x * 0.07, z * 0.07, 77);
  out.setRGB(0, 0, 0);
  let w = 0;
  w += add(out, PAL.meadow, b.meadow * (1 - n * 0.6));
  w += add(out, PAL.meadowLight, b.meadow * n * 0.6);
  w += add(out, PAL.forest, b.forest);
  w += add(out, PAL.tropical, b.tropical);
  w += add(out, PAL.desert, b.desert);
  w += add(out, PAL.sand, b.beach);
  w += add(out, PAL.rock, b.rock);
  tmp.copy(PAL.seabed).lerp(PAL.deep, smoothstep(2, 20, -b.h));
  w += add(out, tmp, b.under);
  if (w > 0) out.multiplyScalar(1 / w);
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
  float wet = smoothstep(0.7, -0.1, vW.y) * step(-0.6, vW.y);
  base *= 1.0 - wet * 0.22;
  float ao = mix(0.78, 1.0, smoothstep(0.55, 0.95, n.y));
  vec3 col = cozyLight(base, n, vW, 0.35, ao);
  col = underwaterTint(col, vW);
  col = applyFog(col, vW);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export default function Terrain({ Q }) {
  const { geometry, material } = useMemo(() => {
    const seg = Q.terrainSeg;
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
    report('terrain', { triangles: seg * seg * 2, draws: 1 });
    return { geometry: g, material: m };
  }, [Q.terrainSeg]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return h('mesh', { geometry, material });
}
