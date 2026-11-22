# Builder contract (read before touching code)

Coordinator merges and pushes. Builders only edit the files they own.

## Hard rules
- Plain `.js` with `import { createElement as h } from 'react'`. **No JSX, no TypeScript, no new npm packages.**
  Allowed imports: `react`, `@react-three/fiber`, `three`, `three/examples/jsm/...`, `framer-motion` (UI only), and files in `src/`.
- Never use three's built-in lights, shadows, fog, `MeshStandardMaterial`/`MeshPhysicalMaterial`, textures from files, or post-processing.
  Use `cozyMaterial()` from `src/materials/shading.js` for every plant, rock and coral (one shared GPU program).
  A new `ShaderMaterial` needs coordinator approval and must `${GLSL_COMMON}` and end with tonemapping + colorspace chunks.
- One `InstancedMesh` per part per species (trunk, canopy...). Build with `src/lib/geo.js`: `paint()`, `merge()`, `makeInstanced()`, `spherifyNormals()`.
- Place things with `scatter()` and `sampleField()` from `src/world/island.js`. Never call `heightAt()` in a loop.
- Read counts from the tier: `Q.pine`, `Q.grass`... Never hard-code counts.
- Call `report('<file>', { draws, triangles, programs })` with the totals for your file.
- Wrap all work in `useMemo` and dispose geometry/materials in `useEffect` cleanup.
- Export one default component taking `{ Q, tier }`.

## Detail (Shifat's priority: nothing low-poly; high-detail Studio Ghibli foliage and leaves)
- Detail comes from **hand-painted leaf textures**, not extra triangles. Paint them in code with `paintTexture(key, draw)` and `brush` from `src/materials/leafTex.js` (Canvas 2D: leaf clusters, needle sprays, fronds, petals, grass tufts, bark strokes).
- Draw them with `leafMaterial({ map, color, sway, wrap, rim, trans, cut })` from `shading.js` (one shared program for every map). Geometry needs uv: build with `paintUV()`.
- Ghibli canopies = clumps of crossed/fanned leaf cards on a soft blob, spherified normals, light tops, cool violet-blue undersides, a few leaves breaking the silhouette. Never visible facets: smooth normals, enough radial segments on trunks and stems, rounded rocks.
- Preview every texture: run the same `draw()` in run_javascript with `require('canvas')` (createCanvas), save a PNG under tmp/, and look at it with file_read_image. Iterate until it reads like a Ghibli background painting.
- Leaf cards use alpha cut-out, which costs pixels on the phone: prefer fewer, larger, richly painted cards over many small ones; no more than ~3 layers of cards over any screen pixel.

## Budgets (low tier = Galaxy M02s, the hard one)
| File | draws | triangles (low) | triangles (medium) |
|---|---|---|---|
| Terrain + Ocean + Sky | 3 | 34k | 75k |
| Temperate.js (pine, oak, birch, bushes) | 10 | 60k | 120k |
| Tropical.js (palm, low palm, banana, monstera, cactus) | 12 | 40k | 85k |
| GroundCover.js (grass, flowers, sword ferns) | 8 | 75k | 160k |
| Reef.js (coral, seagrass, fish, rocks) | 10 | 30k | 60k |
| Whole scene | <=60 | <=240k | <=500k |
Programs: whole scene <= 14. Canvas pixels are capped by `pixelRatioFor()`.

## World facts
+x east, -z north, sea level 0, island radius ~128, world 420 x 420.
Forest + mountain (peak ~60 m at x -10, z -78) north, meadow east and centre, tropics south with a lagoon and reef crest offshore (around x 30, z 122, 1-5 m deep), desert mesas west, beaches everywhere, cliffs on the north coast.
`sampleField(x, z)` gives `{ h, slope, forest, tropical, desert, meadow, beach, rock, under, d }` (weights 0..1).

## Style
Studio Ghibli background painting: saturated warm greens, soft cumulus, cool blue-violet shadows, light that feels like late morning.
Shapes read as soft painted masses, not detailed models: lumpy canopies with spherified normals, varied silhouettes,
per-instance colour jitter (+-8% hue/value), slight lean and size variety, clumps and clearings rather than even spread.
Study real references for each plant before modelling (bark, branching, leaf arrangement, how it grows in groups).

## Checking without a build
There is no npm here. Before handing back, strip `import`/`export` lines and parse each file with `run_javascript(file=...)`.
Vercel's build is the first real compile; a broken file is caught by `Safe` and renders nothing.
