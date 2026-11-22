import { createElement as h, Fragment, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { detectTier, TIERS, pixelRatioFor } from './quality.js';
import { shared, setShadingTier } from './materials/shading.js';
import { Safe } from './lib/Safe.js';
import Sky from './scene/Sky.js';
import Terrain from './scene/Terrain.js';
import Ocean from './scene/Ocean.js';
import Temperate from './scene/Temperate.js';
import Tropical from './scene/Tropical.js';
import GroundCover from './scene/GroundCover.js';
import Reef from './scene/Reef.js';
import CameraRig from './scene/CameraRig.js';
import StatsProbe from './scene/StatsProbe.js';
import Ui from './ui/Ui.js';
import DebugOverlay from './ui/DebugOverlay.js';

const tier = detectTier();
const Q = TIERS[tier];
const debug = new URLSearchParams(location.search).has('debug');
// Must run before any scene component builds its materials (they are built in useMemo during render).
setShadingTier(tier);

// Draw order (three.js sorts opaque objects by the renderOrder of their nearest Group first, then front-to-back).
// Big occluders go first so the depth test rejects hidden pixels before the expensive shaders run on them:
// trees, then the ground cover under them, then the terrain they hide, then the reef, then the sky box
// (drawn on the far plane, so it only shades pixels nothing else covered), then the transparent water last.
const ORDER = { temperate: 1, tropical: 2, ground: 3, terrain: 4, reef: 5, sky: 6, ocean: 7 };

function Clock() {
  useFrame((state, dt) => {
    shared.uTime.value += Math.min(dt, 0.1);
    shared.uUnderwater.value = state.camera.position.y < 0 ? 1 : 0;
  });
  return null;
}

// Adaptive resolution. Both target GPUs are pixel-bound, so frame time ~ canvas pixels. The canvas renders at
// scale x the tier pixel budget, scale in [Q.resMin, Q.resMax] (max 1: the budget is never exceeded).
// Lower quickly when the smoothed frame time is over target, raise slowly (one 5% step) only when the predicted
// frame time after the step still has 10% headroom, with cool-downs so it never ping-pongs.
const WARMUP_S = 2.0;
const ratioAt = (base, scale) => Math.floor(base * Math.sqrt(scale) * 1000) / 1000;
function AdaptiveResolution() {
  const setDpr = useThree((s) => s.setDpr);
  const st = useRef(null);
  if (!st.current) {
    st.current = { scale: Q.resStart, base: pixelRatioFor(Q, 1), ema: 0, t: 0, cool: 0, dpr: 0 };
  }
  const apply = () => {
    const s = st.current;
    const dpr = ratioAt(s.base, s.scale);
    if (dpr !== s.dpr) {
      s.dpr = dpr;
      setDpr(dpr);
    }
    const c = (window.__cozy = window.__cozy || {});
    c.res = { scale: +s.scale.toFixed(3), dpr, emaMs: +s.ema.toFixed(1), targetMs: Q.targetMs };
  };
  useEffect(() => {
    apply();
    const onResize = () => {
      st.current.base = pixelRatioFor(Q, 1);
      apply();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useFrame((state, dt) => {
    const s = st.current;
    const ms = dt * 1000;
    // Skip hitches (tab switch, shader compile) and the warm-up while programs and textures upload.
    if (ms <= 0 || ms > 250) return;
    s.t += dt;
    if (s.t < WARMUP_S) return;
    s.ema = s.ema ? s.ema * 0.93 + ms * 0.07 : ms;
    if (s.cool > 0) {
      s.cool -= dt;
      return;
    }
    const target = Q.targetMs;
    if (s.ema > target * 1.05 && s.scale > Q.resMin) {
      const next = Math.max(Q.resMin, Math.min(s.scale - 0.05, s.scale * (target / s.ema)));
      s.ema *= next / s.scale;
      s.scale = next;
      s.cool = 1.0;
      apply();
    } else if (s.scale < Q.resMax) {
      const next = Math.min(Q.resMax, s.scale + 0.05);
      if (s.ema * (next / s.scale) < target * 0.9) {
        s.ema *= next / s.scale;
        s.scale = next;
        s.cool = 2.5;
        apply();
      }
    }
  });
  return null;
}

const part = (name, C) =>
  h('group', { key: name, name, renderOrder: ORDER[name] }, h(Safe, { name }, h(C, { Q, tier })));
// Parts that draw nothing (camera controls) stay outside the ordered groups.
const plain = (name, C) => h(Safe, { key: name, name }, h(C, { Q, tier }));


export default function App() {
  return h(
    Fragment,
    null,
    h(
      Canvas,
      {
        dpr: ratioAt(pixelRatioFor(Q, 1), Q.resStart),
        flat: true,
        gl: { antialias: Q.antialias, powerPreference: 'high-performance', stencil: false, alpha: false },
        camera: { fov: 45, near: 0.5, far: 2400, position: [220, 140, 220] },
        onCreated: ({ gl }) => gl.setClearColor('#d8ebf3'),
      },
      h(Clock),
      h(AdaptiveResolution),
      part('temperate', Temperate),
      part('tropical', Tropical),
      part('ground', GroundCover),
      part('terrain', Terrain),
      part('reef', Reef),
      part('sky', Sky),
      part('ocean', Ocean),
      plain('camera', CameraRig),
      h(StatsProbe, { tier })
    ),
    h(Ui, { tier }),
    debug ? h(DebugOverlay) : null
  );
}
