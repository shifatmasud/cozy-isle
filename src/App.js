import { createElement as h, Fragment } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { detectTier, TIERS, pixelRatioFor } from './quality.js';
import { shared } from './materials/shading.js';
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

function Clock() {
  useFrame((state, dt) => {
    shared.uTime.value += Math.min(dt, 0.1);
    shared.uUnderwater.value = state.camera.position.y < 0 ? 1 : 0;
  });
  return null;
}

const part = (name, C) => h(Safe, { key: name, name }, h(C, { Q, tier }));

export default function App() {
  return h(
    Fragment,
    null,
    h(
      Canvas,
      {
        dpr: pixelRatioFor(Q),
        flat: true,
        gl: { antialias: Q.antialias, powerPreference: 'high-performance', stencil: false, alpha: false },
        camera: { fov: 45, near: 0.5, far: 2400, position: [220, 140, 220] },
        onCreated: ({ gl }) => gl.setClearColor('#d8ebf3'),
      },
      h(Clock),
      part('sky', Sky),
      part('terrain', Terrain),
      part('ocean', Ocean),
      part('temperate', Temperate),
      part('tropical', Tropical),
      part('ground', GroundCover),
      part('reef', Reef),
      part('camera', CameraRig),
      h(StatsProbe, { tier })
    ),
    h(Ui, { tier }),
    debug ? h(DebugOverlay) : null
  );
}
