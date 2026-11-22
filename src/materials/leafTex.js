// Hand-painted textures made in code at load time (no image files to download).
// draw(ctx, size, rand) paints with the Canvas 2D API onto a transparent square canvas.
// The same draw() runs in Node with the `canvas` package, so builders can preview their painting as PNG.
import * as THREE from 'three';
import { mulberry32 } from '../world/noise.js';

const cache = new Map();

export function paintTexture(key, draw, { size = 512, seed = 7, repeat = false } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  draw(ctx, size, mulberry32(seed));
  // Bleed colour into transparent pixels so mipmaps do not get dark fringes.
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 2;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  cache.set(key, t);
  const z = (window.__cozy = window.__cozy || {});
  z.textures = (z.textures || 0) + size * size * 4 * 1.33;
  return t;
}

// Helpers for painting. All take a rand() from mulberry32.
export const brush = {
  // Soft-edged blob of colour, like a gouache dab.
  dab(ctx, x, y, r, color, alpha = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(0.7, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  },
  // Leaf shape along a direction: length l, width w, tip pointedness 0..1.
  leaf(ctx, x, y, angle, l, w, fill, vein, point = 0.6) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(w, l * 0.25, w * (1 - point * 0.5), l * 0.75, 0, l);
    ctx.bezierCurveTo(-w * (1 - point * 0.5), l * 0.75, -w, l * 0.25, 0, 0);
    ctx.fillStyle = fill;
    ctx.fill();
    if (vein) {
      ctx.strokeStyle = vein;
      ctx.lineWidth = Math.max(1, w * 0.12);
      ctx.beginPath();
      ctx.moveTo(0, l * 0.05);
      ctx.lineTo(0, l * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  },
  // Curved stroke from (x, y) with given angle, length and curl.
  stroke(ctx, x, y, angle, len, width, color, curl = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(curl * len * 0.5, -len * 0.6, curl * len, -len);
    ctx.stroke();
    ctx.restore();
  },
};
