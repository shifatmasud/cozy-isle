# Device run: Shifat's laptop (Intel UHD Graphics 600, 3 GB RAM)

- **Page:** https://cozy-isle.vercel.app/?lab=1
- **When:** 2026-11-22T10:57:55.707Z
- **Screen:** 1366 x 625 CSS px at pixel ratio 1
- **CPU:** 4x slower (fallback (not calibrated on the real device)). Checked under load: 4.1x.
- **Network:** wifi (20 Mbps down, 10 Mbps up, 40 ms), cold cache
- **GPU:** real renderer was "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" (software, so frame times are rough). The page was told: "ANGLE (Intel, Intel(R) UHD Graphics 600 (0x00003185) Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.100.8681)".

## Scorecard: 17 pass, 6 fail, 1 not measured

Confidence says how much a number from this cloud browser holds on the real device. High = counted work, the same on any device. Low = timing on different hardware.

| Area | Check | Value | Target | Result | Confidence |
|---|---|---|---|---|---|
| smooth | Average FPS during play | 2.3 fps | >= 30 | FAIL | low |
| smooth | 95% of frames faster than | 833.3 ms | <= 40 | FAIL | low |
| smooth | 99% of frames faster than | 850 ms | <= 50 | FAIL | low |
| smooth | Frames slower than 33.3 ms | 89.2 % | <= 10 | FAIL | low |
| smooth | Frame-to-frame change (steadiness) | 228.6 ms | <= 6 | FAIL | low |
| smooth | Hitches over 100 ms per minute | 121.1 /min | <= 2 | FAIL | low |
| smooth | Slowdown from start to end of steady play | 0 % | <= 15 | PASS | low |
| cpu | Main thread busy during play | 2.2 % | <= 70 | PASS | low |
| cpu | Longest main-thread task during play | 0 ms | <= 100 | PASS | low |
| cpu | Blocking time per minute during play | 0 ms/min | <= 1,000 | PASS | low |
| gpu | Draw calls per frame (95th pct) | 41 draws | <= 250 | PASS | high |
| gpu | Triangles per frame (95th pct) | 488,468 tris | <= 500,000 | PASS | high |
| gpu | Canvas pixels drawn each frame | 723,350 px | <= 853,750 | PASS | high |
| gpu | Shader programs alive | 5 programs | <= 80 | PASS | high |
| gpu | Time blocked on shader compile and link | 77.1 ms | <= 1,500 | PASS | low |
| gpu | Textures larger than the device limit | 0 textures | <= 0 | PASS | high |
| memory | JavaScript heap peak | 37.5 MB | <= 200 | PASS | high |
| memory | GPU memory estimate peak | 3.7 MB | <= 200 | PASS | medium |
| memory | Heap plus GPU estimate peak | 41.2 MB | <= 400 | PASS | medium |
| memory | Heap growth during steady play | -11.1 MB/min | <= 5 | PASS | high |
| load | Downloaded on a cold load | 0.5 MB | <= 20 | PASS | high |
| load | Requests on a cold load | 7 requests | <= 150 | PASS | high |
| load | Time to first WebGL draw | 3,667 ms | <= 10,000 | PASS | low |
| load | Time until frames are steady | - ms | <= 20,000 | N/A | low |

## Phases

| Phase | Seconds | Avg FPS | p50 ms | p95 ms | p99 ms | Hitches | Long tasks | Main thread busy | Draws p95 |
|---|---|---|---|---|---|---|---|---|---|
| load | 0.6 | 33 | 16.7 | 116.7 | 116.7 | 1 | 3 | - | 0 |
| loaded | 7.6 | 1.6 | 433.3 | 3,333.2 | 3,333.2 | 10 | 3 | 56.7% | 41 |
| play | 15.7 | 2.3 | 433.3 | 816.7 | 850 | 31 | 0 | 2.2% | 41 |
| steady | 20 | 2.4 | 416.7 | 816.6 | 833.4 | 38 | 0 | 2.3% | 41 |

Steady play, first third vs last third: p50 416.6 -> 416.7 ms, p95 833.4 -> 816.6 ms. Heap growth -11.1 MB/min, GPU estimate growth -0 MB/min.

## Load

- 0.5 MB in 7 requests (0 failed). Last byte at 664.9 ms.
- First byte 118.7 ms, first paint 808 ms, load event 456.7 ms, first WebGL draw 3,667 ms, steady frames from - ms.
- By type: Script 0.37 MB, Stylesheet 0.06 MB, Font 0.02 MB, Document 0 MB, Other 0 MB

Largest files:

- index-DLZ7oxx9.js (Script): 0.37 MB
- css2 (Stylesheet): 0.06 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cUW1yO5Cb.woff2 (Font): 0.01 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cGWtyO5Cb.woff2 (Font): 0.01 MB
- index-BAiiyWGm.css (Stylesheet): 0 MB
- / (Document): 0 MB
- favicon.ico (Other): 0 MB

## GPU work (counted)

- Draw calls per frame: p50 41, p95 41, max 41
- Triangles per frame: p50 488,468, p95 488,468, max 488,468
- Canvas pixels: 723,350. Shader programs: 5 (5 links, 77.1 ms blocked, compile 0 ms).
- Textures: 6, largest 257 px, over the device limit: 0.
- Software GPU load on the cloud machine during play: 3.2 CPU cores (only useful to compare runs).

## Memory

- JavaScript heap peak 37.5 MB, GPU estimate peak 3.7 MB, together 41.2 MB.
- GPU estimate at the end: textures 0.3 MB, buffers 3.4 MB, renderbuffers 0 MB.
- Cloud process memory (not the device): renderer 522.1 MB, GPU process 203.3 MB.

## Scripts in slow frames during play

- o @ index-DLZ7oxx9.js: 37.2 ms over 4 slow frames (longest 16.1 ms)
- V @ index-DLZ7oxx9.js: 8.8 ms over 1 slow frames (longest 8.8 ms)

## What this run cannot tell you

- It does not run on the real GPU. WebGL ran on SwiftShader, a software renderer on the cloud CPU. GPU limits, the renderer name and the screen are copied. GPU speed, drivers and heat are not.
- CPU slowdown makes the whole page slower by one factor. It does not copy the device's cores, caches or how the phone slows down when it gets hot.
- Memory numbers are what the page uses. The cloud machine does not run out of RAM like a device with 1 GB free, and Android may kill the tab sooner. Use --heap-cap-mb to find heap crashes.
- Battery drain, power and device temperature are not measured.
- To confirm, run the same page on the real device (Chrome remote debugging, or the FPS meter) and compare.
