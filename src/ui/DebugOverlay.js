import { createElement as h, useEffect, useState } from 'react';

export default function DebugOverlay() {
  const [s, setS] = useState(null);
  useEffect(() => {
    const id = setInterval(() => {
      const c = window.__cozy;
      setS(c && c.stats ? { ...c.stats, errors: (c.errors || []).length } : null);
    }, 500);
    return () => clearInterval(id);
  }, []);
  if (!s) return h('div', { className: 'debug' }, 'loading...');
  const k = (v) => (v / 1000).toFixed(0) + 'k';
  return h(
    'div',
    { className: 'debug' },
    `${s.tier} | dpr ${s.dpr.toFixed(2)} | ${k(s.canvasPixels)} px\n` +
      `calls ${s.calls} (peak ${s.peakCalls}) | tris ${k(s.triangles)} (peak ${k(s.peakTriangles)})\n` +
      `programs ${s.programs} | textures ${s.textures} | geometries ${s.geometries}\n` +
      `cloud fps ${s.fpsCloud} | p95 ${s.p95ms} ms | heap ${s.jsHeapMb == null ? '-' : s.jsHeapMb} MB | errors ${s.errors}`
  );
}
