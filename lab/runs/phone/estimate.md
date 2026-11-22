# FPS estimate: Shifat's phone (Samsung Galaxy M02s, Adreno 506)

**ESTIMATE, not measured on the device.** Estimated from a cloud run. Not measured on the device. Real FPS is only what the device itself shows.

- Page: https://cozy-isle.vercel.app/?lab=1
- Likely FPS: **22.8** (range 6.7 to 60, capped at 60 Hz)
- Frame time: likely 43.9 ms (range 14.5 to 148.3 ms)
- Main limit: GPU
- Confidence: low (spec-based guesses; use for comparing builds, not as a promise)
- GPU costs from: spec-based guess (profile.gpuPrior)
- CPU speed from: fallback CPU slowdown x6 (not calibrated)

## Where the device time goes (per frame, estimated)

- CPU main thread: 8.2 ms
- GPU total: 43.9 ms
  - Shading pixels: 40.03 ms (6.9 reference megapixels, 20.94 per screen pixel)
  - Draw calls: 2.46 ms (41 per frame)
  - Triangles: 1.46 ms (243131 per frame)
  - Uploads: 0 ms (0 MB per frame)

## Measured in the cloud (inputs, exact counts)

- Window: steady phase, 82 frames over 19.3 s (cloud FPS 4.3; SwiftShader, not comparable to the device)
- Cloud GPU process time per frame: 744.1 ms; main thread per frame: 8.7 ms
- Canvas: 329600 pixels
- Cloud renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)

## How to make it real

1. Open https://shifatmasud.github.io/shade-device-lab/ on the device, tap Run, and save the result with `node scripts/calibrate-apply.mjs <device> '<JSON>'`. This replaces the guesses with measured CPU and GPU costs.
2. Read the FPS the game shows on the device (for Shade Verse: add `?debug`) in the same scene, then run `node scripts/anchor.mjs --device <device> --estimate <this folder>/estimate.json --fps <number>`.
