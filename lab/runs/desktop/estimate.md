# FPS estimate: Shifat's laptop (Intel UHD Graphics 600, 3 GB RAM)

**ESTIMATE, not measured on the device.** Estimated from a cloud run. Not measured on the device. Real FPS is only what the device itself shows.

- Page: https://cozy-isle.vercel.app/?lab=1
- Likely FPS: **9.7** (range 3.1 to 29.4, capped at 60 Hz)
- Frame time: likely 103.2 ms (range 34.1 to 320.6 ms)
- Main limit: GPU
- Confidence: low (spec-based guesses; use for comparing builds, not as a promise)
- GPU costs from: spec-based guess (profile.gpuPrior)
- CPU speed from: fallback CPU slowdown x4 (not calibrated)

## Where the device time goes (per frame, estimated)

- CPU main thread: 5.5 ms
- GPU total: 103.2 ms
  - Shading pixels: 99.39 ms (24.85 reference megapixels, 29.1 per screen pixel)
  - Draw calls: 1.23 ms (41 per frame)
  - Triangles: 2.57 ms (514690 per frame)
  - Uploads: 0 ms (0 MB per frame)

## Measured in the cloud (inputs, exact counts)

- Window: steady phase, 21 frames over 19.2 s (cloud FPS 1.1; SwiftShader, not comparable to the device)
- Cloud GPU process time per frame: 2961.4 ms; main thread per frame: 7.3 ms
- Canvas: 853750 pixels
- Cloud renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)

## How to make it real

1. Open https://shifatmasud.github.io/shade-device-lab/ on the device, tap Run, and save the result with `node scripts/calibrate-apply.mjs <device> '<JSON>'`. This replaces the guesses with measured CPU and GPU costs.
2. Read the FPS the game shows on the device (for Shade Verse: add `?debug`) in the same scene, then run `node scripts/anchor.mjs --device <device> --estimate <this folder>/estimate.json --fps <number>`.
