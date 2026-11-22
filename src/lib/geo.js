// Geometry helpers shared by all builders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Non-indexed, position + normal + color only, so any pieces can merge.
export function paint(geometry, color) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Like paint() but keeps uv (needed by leafMaterial). Pieces merged together must all use paintUV.
export function paintUV(geometry, color) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Ghibli "fluffy" canopy trick: point normals away from a centre so lumpy shapes shade like one soft cloud.
export function spherifyNormals(geometry, center = new THREE.Vector3(), amount = 1) {
  const p = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const v = new THREE.Vector3();
  const o = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(center).normalize();
    o.fromBufferAttribute(nrm, i).lerp(v, amount).normalize();
    nrm.setXYZ(i, o.x, o.y, o.z);
  }
  nrm.needsUpdate = true;
  return geometry;
}

export function merge(list) {
  const g = mergeGeometries(list, false);
  if (!g) throw new Error('merge failed: pieces need the same attributes (use paint())');
  g.computeBoundingSphere();
  return g;
}

export function triangles(geometry) {
  return geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
}

// items: [{ x, y, z, r (yaw), tx, tz (tilt), s, sx, sy, sz }]. color(item, i) -> THREE.Color (optional).
export function makeInstanced(geometry, material, items, color) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    e.set(it.tx || 0, it.r || 0, it.tz || 0);
    q.setFromEuler(e);
    p.set(it.x, it.y, it.z);
    const sc = it.s || 1;
    s.set(sc * (it.sx || 1), sc * (it.sy || 1), sc * (it.sz || 1));
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (color) mesh.setColorAt(i, color(it, i));
  }
  mesh.count = items.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

// Record what each module costs, for the ?debug overlay and the lab.
export function report(name, info) {
  const c = (window.__cozy = window.__cozy || {});
  c.parts = c.parts || {};
  c.parts[name] = info;
}
