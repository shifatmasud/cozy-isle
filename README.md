# Cozy Isle

A cozy, painterly 3D island and ocean in the browser: pine, oak and birch forest under a mountain, meadows of long curly grass and wildflowers, sword ferns, palms, low palms, banana trees and monstera on the tropical shore, cactus mesas in the west, and a coral reef with seagrass and fish in the lagoon.

React 18, React Three Fiber 8, three.js, Framer Motion, WebGL2. No textures, no post-processing: a handful of shared shaders and instanced plants.

**Live:** https://cozy-isle.vercel.app (add `?debug` for draw calls, triangles and programs; `?q=low|medium|high` to force a tier)

## Built for two real devices
Tiers come from [shade-device-lab](https://github.com/shifatmasud/shade-device-lab) targets:

| | Phone: Galaxy M02s, Adreno 506 (`low`) | Laptop: Intel UHD 600, 3 GB (`medium`) |
|---|---|---|
| FPS floor | 25 | 30 |
| Draw calls | <= 150 | <= 250 |
| Triangles | <= 250k | <= 500k |
| Canvas pixels | <= 329,600 | <= 853,750 |
| Shader programs | <= 60 | <= 80 |

The phone compiles every shader on every visit (no shader disk cache on Adreno 5xx), so the whole scene shares a few programs.

## Lab
`.github/workflows/lab.yml` runs on every push and every 10 minutes on a GitHub runner with Chrome on SwiftShader. It saves screenshots and exact GPU work counts to `lab/latest/`, and runs shade-device-lab for estimated device FPS in `lab/runs/`. SwiftShader FPS is never device FPS.

## Develop
```
npm install
npm run dev
```
Builders: read `CONTRACT.md`.

MIT
