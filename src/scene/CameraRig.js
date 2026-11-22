import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { sampleField } from '../world/island.js';
import { clamp } from '../world/noise.js';
import { VIEWS } from '../world/views.js';

function resolve(v) {
  const f = sampleField(v.target[0], v.target[2]);
  const ty = v.underwater ? Math.min(f.h + 2.0, -1.5) : Math.max(f.h, 0) + v.lift;
  return {
    tx: v.target[0], ty, tz: v.target[2], radius: v.radius, theta: v.theta, phi: v.phi,
    maxPhi: v.underwater ? 1.75 : 1.5, underwater: !!v.underwater,
  };
}
function pinchDist(map) {
  const p = [...map.values()];
  return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
}

// Drag to orbit, wheel or pinch to zoom, slow drift when idle. window.__cozy.view(name, instant) flies to a stop.
export default function CameraRig() {
  const { camera, gl } = useThree();
  const st = useRef(null);
  if (!st.current) {
    const r = resolve(VIEWS.overview);
    st.current = { cur: { ...r }, goal: { ...r }, idle: 0, pointers: new Map(), pinch: 0 };
  }

  useEffect(() => {
    const el = gl.domElement;
    const s = st.current;
    el.style.touchAction = 'none';
    const down = (e) => {
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      s.idle = 0;
      if (s.pointers.size === 2) s.pinch = pinchDist(s.pointers);
    };
    const move = (e) => {
      const p = s.pointers.get(e.pointerId);
      if (!p) return;
      s.idle = 0;
      if (s.pointers.size === 1) {
        s.goal.theta -= (e.clientX - p.x) * 0.006;
        s.goal.phi = clamp(s.goal.phi - (e.clientY - p.y) * 0.004, 0.25, s.goal.maxPhi);
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (s.pointers.size === 2) {
        const d = pinchDist(s.pointers);
        if (s.pinch > 0) s.goal.radius = clamp((s.goal.radius * s.pinch) / d, 10, 420);
        s.pinch = d;
      }
    };
    const up = (e) => {
      s.pointers.delete(e.pointerId);
      s.pinch = s.pointers.size === 2 ? pinchDist(s.pointers) : 0;
    };
    const wheel = (e) => {
      e.preventDefault();
      s.idle = 0;
      s.goal.radius = clamp(s.goal.radius * Math.exp(e.deltaY * 0.0012), 10, 420);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    const c = (window.__cozy = window.__cozy || {});
    c.view = (name, instant) => {
      const v = VIEWS[name];
      if (!v) return false;
      const r = resolve(v);
      Object.assign(s.goal, r);
      if (instant) Object.assign(s.cur, r);
      s.idle = 0;
      return true;
    };
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl]);

  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.1);
    const s = st.current;
    s.idle += dt;
    if (s.idle > 5 && s.pointers.size === 0) s.goal.theta += dt * 0.035;
    const k = 1 - Math.exp(-dt * 3.5);
    const c = s.cur;
    const g = s.goal;
    for (const key of ['theta', 'phi', 'radius', 'tx', 'ty', 'tz']) c[key] += (g[key] - c[key]) * k;
    const sp = Math.sin(c.phi);
    const x = c.tx + c.radius * sp * Math.cos(c.theta);
    const z = c.tz + c.radius * sp * Math.sin(c.theta);
    let y = c.ty + c.radius * Math.cos(c.phi);
    const ground = sampleField(x, z).h;
    if (g.underwater) y = Math.min(Math.max(y, ground + 1.2), -0.6);
    else y = Math.max(y, ground + 2.5, 0.8);
    camera.position.set(x, y, z);
    camera.lookAt(c.tx, c.ty, c.tz);
  });
  return null;
}
