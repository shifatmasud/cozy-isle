# FPS estimate: Shifat's laptop (Intel UHD Graphics 600, 3 GB RAM)

**ESTIMATE, not measured on the device.** Estimated from a cloud run. Not measured on the device. Real FPS is only what the device itself shows.

- Page: https://cozy-isle.vercel.app/?lab=1
- Likely FPS: **20.3** (range 5.6 to 60, capped at 60 Hz)
- Frame time: likely 49.2 ms (range 16.2 to 180.1 ms)
- Main limit: GPU
- Confidence: low (spec-based guesses; use for comparing builds, not as a promise)
- GPU costs from: spec-based guess (profile.gpuPrior)
- CPU speed from: fallback CPU slowdown x4 (not calibrated)

## Where the device time goes (per frame, estimated)

- CPU main thread: 16.2 ms
- GPU total: 49.2 ms
  - Shading pixels: 46.34 ms (11.59 reference megapixels, 16.02 per screen pixel)
  - Draw calls: 1.2 ms (40 per frame)
  - Triangles: 1.7 ms (339228 per frame)
  - Uploads: 0 ms (0 MB per frame)

## Measured in the cloud (inputs, exact counts)

- Window: steady phase, 70 frames over 19.2 s (cloud FPS 3.6; SwiftShader, not comparable to the device)
- Cloud GPU process time per frame: 872.7 ms; main thread per frame: 16.3 ms
- Canvas: 723350 pixels
- Cloud renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)

## How to make it real

1. Open https://shifatmasud.github.io/shade-device-lab/ on the device, tap Run, and save the result with `node scripts/calibrate-apply.mjs <device> '<JSON>'`. This replaces the guesses with measured CPU and GPU costs.
2. Read the FPS the game shows on the device (for Shade Verse: add `?debug`) in the same scene, then run `node scripts/anchor.mjs --device <device> --estimate <this folder>/estimate.json --fps <number>`.
