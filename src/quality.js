// Quality tiers, sized from shade-device-lab targets.
// low    = Samsung Galaxy M02s (Adreno 506): <=150 draws, <=250k tris, <=329,600 canvas px, <=60 programs
// medium = Intel UHD 600 laptop:            <=250 draws, <=500k tris, <=853,750 canvas px, <=80 programs
// high   = anything stronger.

export const TIERS = {
  low: {
    pixelBudget: 329600, antialias: false, terrainSeg: 128, cloudOctaves: 3,
    grass: 12000, flowers: 1600, ferns: 220,
    pine: 150, oak: 60, birch: 55, bushes: 200,
    palms: 60, lowPalms: 50, banana: 36, monstera: 60, cactus: 55,
    coral: 240, seagrass: 1800, fish: 48,
  },
  medium: {
    pixelBudget: 853750, antialias: false, terrainSeg: 192, cloudOctaves: 4,
    grass: 30000, flowers: 3800, ferns: 450,
    pine: 240, oak: 110, birch: 95, bushes: 380,
    palms: 100, lowPalms: 85, banana: 64, monstera: 110, cactus: 95,
    coral: 460, seagrass: 4500, fish: 110,
  },
  high: {
    pixelBudget: 2400000, antialias: true, terrainSeg: 256, cloudOctaves: 5,
    grass: 70000, flowers: 8000, ferns: 900,
    pine: 420, oak: 200, birch: 170, bushes: 700,
    palms: 170, lowPalms: 150, banana: 110, monstera: 200, cactus: 160,
    coral: 900, seagrass: 9000, fish: 220,
  },
};

function rendererName() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return 'no-webgl2';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return String(name);
  } catch (e) {
    return '';
  }
}

export function detectTier() {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low' || q === 'medium' || q === 'high') return q;
  const r = rendererName().toLowerCase();
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const mobile = coarse || /android|iphone|ipad|mobile/i.test(navigator.userAgent);
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (r === 'no-webgl2' || /adreno \(tm\) [1-5]\d\d|adreno [1-5]\d\d|mali-[gt]?[4-7]\d|mali-4|powervr|swiftshader|llvmpipe|software/.test(r)) return 'low';
  if (mobile) return mem >= 6 && cores >= 8 ? 'medium' : 'low';
  if (/intel|uhd|hd graphics|iris/.test(r) || mem <= 4 || cores <= 2) return 'medium';
  return 'high';
}

// Keep canvas pixels under the tier budget (phone budget = 412x800 at ratio 1).
export function pixelRatioFor(Q) {
  const px = Math.max(1, window.innerWidth * window.innerHeight);
  const fit = Math.sqrt(Q.pixelBudget / px);
  return Math.max(0.5, Math.min(window.devicePixelRatio || 1, fit, 2));
}
