import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';

// Publishes exact GPU work counts to window.__cozy.stats for the ?debug overlay and the lab workflow.
export default function StatsProbe({ tier }) {
  const { gl } = useThree();
  const acc = useRef({ frames: 0, last: performance.now(), ft: [], peakCalls: 0, peakTris: 0 });
  useEffect(() => {
    const c = (window.__cozy = window.__cozy || {});
    c.tier = tier;
    c.ready = false;
    c.errors = c.errors || [];
  }, [tier]);
  useFrame(() => {
    const a = acc.current;
    const now = performance.now();
    a.ft.push(now - a.last);
    a.last = now;
    if (a.ft.length > 120) a.ft.shift();
    a.frames++;
    const r = gl.info.render;
    if (a.frames > 2) {
      a.peakCalls = Math.max(a.peakCalls, r.calls);
      a.peakTris = Math.max(a.peakTris, r.triangles);
    }
    if (a.frames % 30 === 0) {
      const sorted = [...a.ft].sort((x, y) => x - y);
      const avg = a.ft.reduce((s, v) => s + v, 0) / a.ft.length;
      const mem = performance.memory;
      window.__cozy.stats = {
        tier,
        dpr: gl.getPixelRatio(),
        canvasPixels: gl.domElement.width * gl.domElement.height,
        calls: r.calls,
        triangles: r.triangles,
        peakCalls: a.peakCalls,
        peakTriangles: a.peakTris,
        programs: gl.info.programs ? gl.info.programs.length : 0,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        fpsCloud: Math.round(1000 / avg),
        p95ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
        jsHeapMb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
        frames: a.frames,
      };
    }
    if (a.frames === 12) {
      window.__cozy.ready = true;
      window.__cozy.readyAt = performance.now();
    }
  });
  return null;
}
