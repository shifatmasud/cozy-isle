// Screenshots + exact GPU work counts on SwiftShader (no GPU on the runner).
// Counts (draw calls, triangles, programs, textures, canvas pixels) are the same as on the real devices.
// The FPS here is SwiftShader FPS and says nothing about the devices: never report it as device FPS.
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = (process.env.SITE_URL || 'https://cozy-isle.vercel.app').replace(/\/$/, '');
const OUT = 'lab/latest';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const DEVICES = [
  { id: 'phone', q: 'low', viewport: { width: 412, height: 800 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true },
  { id: 'laptop', q: 'medium', viewport: { width: 1366, height: 625 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
const STOPS = ['forest', 'meadow', 'tropics', 'desert', 'reef'];

const result = { at: new Date().toISOString(), sha: process.env.GITHUB_SHA || null, url: URL, devices: {} };
for (const d of DEVICES) {
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.deviceScaleFactor, isMobile: d.isMobile, hasTouch: d.hasTouch });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`.slice(0, 400)); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`.slice(0, 400)));
  const t0 = Date.now();
  let readyMs = null;
  try {
    await page.goto(`${URL}/?q=${d.q}&debug=1&lab=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__cozy && window.__cozy.ready, null, { timeout: 150000 });
    readyMs = Date.now() - t0;
  } catch (e) {
    logs.push('not ready: ' + e.message.slice(0, 300));
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/${d.id}.png` });
  const views = {};
  for (const stop of STOPS) {
    const ok = await page.evaluate((v) => !!(window.__cozy && window.__cozy.view && window.__cozy.view(v, true)), stop).catch(() => false);
    if (!ok) break;
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${d.id}-${stop}.jpg`, type: 'jpeg', quality: 78 });
    views[stop] = await page.evaluate(() => (window.__cozy ? window.__cozy.stats : null)).catch(() => null);
  }
  const cozy = await page.evaluate(() => (window.__cozy ? { stats: window.__cozy.stats, parts: window.__cozy.parts, errors: window.__cozy.errors } : null)).catch(() => null);
  result.devices[d.id] = { tier: d.q, readyMs, overview: cozy && cozy.stats, views, parts: cozy && cozy.parts, errors: cozy && cozy.errors, logs: logs.slice(0, 40) };
  await ctx.close();
}
await browser.close();

// Check counts against shade-device-lab targets (counted work: high confidence on any device).
const TARGETS = {
  phone: { drawCallsP95: 150, trianglesP95: 250000, maxCanvasPixels: 329600, programs: 60 },
  laptop: { drawCallsP95: 250, trianglesP95: 500000, maxCanvasPixels: 853750, programs: 80 },
};
result.checks = {};
for (const [id, t] of Object.entries(TARGETS)) {
  const dev = result.devices[id];
  const all = [dev.overview, ...Object.values(dev.views || {})].filter(Boolean);
  const peak = (k) => Math.max(0, ...all.map((s) => s[k] || 0));
  result.checks[id] = {
    drawCalls: { value: peak('peakCalls'), target: t.drawCallsP95, pass: peak('peakCalls') <= t.drawCallsP95 },
    triangles: { value: peak('peakTriangles'), target: t.trianglesP95, pass: peak('peakTriangles') <= t.trianglesP95 },
    canvasPixels: { value: peak('canvasPixels'), target: t.maxCanvasPixels, pass: peak('canvasPixels') <= t.maxCanvasPixels },
    programs: { value: peak('programs'), target: t.programs, pass: peak('programs') <= t.programs },
    errors: { value: (dev.errors || []).length + dev.logs.filter((l) => l.startsWith('pageerror')).length, target: 0 },
  };
}
fs.writeFileSync(`${OUT}/stats.json`, JSON.stringify(result, null, 2));
const lines = [`# Lab ${result.at}`, `commit ${result.sha || '-'} | ${URL}`, ''];
for (const [id, c] of Object.entries(result.checks)) {
  lines.push(`## ${id} (${result.devices[id].tier}) ready in ${result.devices[id].readyMs ?? 'n/a'} ms`);
  for (const [k, v] of Object.entries(c)) lines.push(`- ${k}: ${v.value} / ${v.target} ${v.pass === undefined ? '' : v.pass ? 'PASS' : 'FAIL'}`);
  lines.push('');
}
lines.push('Counts are exact. SwiftShader FPS is not device FPS; see lab/runs/*/estimate.md for estimated device FPS.');
fs.writeFileSync(`${OUT}/summary.md`, lines.join('\n') + '\n');
console.log(lines.join('\n'));
