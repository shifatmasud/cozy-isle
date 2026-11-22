// ?debug overlay: exact GPU counts from StatsProbe, per-file reports from report(), and the contract budgets.
import { createElement as h, useEffect, useState } from 'react';

// Whole-scene contract budgets per tier (CONTRACT.md); high has no hard target, so it reuses medium's numbers.
const BUDGET = {
  low: { draws: 60, triangles: 240000, programs: 14 },
  medium: { draws: 60, triangles: 500000, programs: 14 },
  high: { draws: 60, triangles: 500000, programs: 14 },
};

const k = (v) => (v == null || isNaN(v) ? '-' : v >= 1000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'k' : String(Math.round(v)));
const pad = (s, n) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
const flag = (v, max) => (v > max ? ' !' : '');

export default function DebugOverlay() {
  const [s, setS] = useState(null);
  useEffect(() => {
    const id = setInterval(() => {
      const c = window.__cozy;
      if (!c) return;
      setS({
        stats: c.stats ? { ...c.stats } : null,
        parts: c.parts ? { ...c.parts } : {},
        errors: (c.errors || []).slice(-3),
        nErrors: (c.errors || []).length,
        ready: !!c.ready,
      });
    }, 500);
    return () => clearInterval(id);
  }, []);
  if (!s || !s.stats) return h('div', { className: 'debug' }, 'loading...');
  const st = s.stats;
  const b = BUDGET[st.tier] || BUDGET.medium;
  const names = Object.keys(s.parts).sort();
  let sumD = 0;
  let sumT = 0;
  const rows = names.map((n) => {
    const p = s.parts[n] || {};
    sumD += p.draws || 0;
    sumT += p.triangles || 0;
    return `${pad(n, 12)} ${pad(String(p.draws ?? '-'), 4)} ${k(p.triangles)}`;
  });
  const lines = [
    `${st.tier} | dpr ${st.dpr.toFixed(2)} | ${k(st.canvasPixels)} px | ${s.ready ? 'ready' : 'warming'}`,
    `calls ${st.calls} (peak ${st.peakCalls}/${b.draws}${flag(st.peakCalls, b.draws)}) | tris ${k(st.triangles)} (peak ${k(st.peakTriangles)}/${k(b.triangles)}${flag(st.peakTriangles, b.triangles)})`,
    `programs ${st.programs}/${b.programs}${flag(st.programs, b.programs)} | textures ${st.textures} | geometries ${st.geometries}`,
    `fps ${st.fpsCloud} | p95 ${st.p95ms} ms | heap ${st.jsHeapMb == null ? '-' : st.jsHeapMb} MB | errors ${s.nErrors}`,
  ];
  if (rows.length) {
    lines.push('', `${pad('part', 12)} ${pad('drw', 4)} tris`, ...rows, `${pad('sum', 12)} ${pad(String(sumD), 4)} ${k(sumT)}`);
  }
  if (s.errors.length) lines.push('', ...s.errors.map((e) => 'x ' + String(e).slice(0, 60)));
  return h('div', { className: 'debug' }, lines.join('\n'));
}
