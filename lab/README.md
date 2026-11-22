# Lab output

Written by `.github/workflows/lab.yml` on every code push and every 10 minutes.

- `latest/phone.png`, `latest/laptop.png`: overview shots (phone = low tier at 412x800, ratio 1.75 touch; laptop = medium tier at 1366x625)
- `latest/<device>-<stop>.jpg`: forest, meadow, tropics, desert, reef
- `latest/stats.json`, `latest/summary.md`: exact draw calls, triangles, programs, textures, canvas pixels, checked against shade-device-lab targets
- `runs/phone`, `runs/desktop`: shade-device-lab reports and `estimate.md` (estimated device FPS, low confidence until the devices are calibrated)

The runner has no GPU. WebGL runs on SwiftShader. Counts are exact; SwiftShader FPS is never device FPS.
