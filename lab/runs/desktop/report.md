# Device run: Shifat's laptop (Intel UHD Graphics 600, 3 GB RAM)

- **Page:** https://cozy-isle.vercel.app/?lab=1
- **When:** 2026-11-22T10:49:37.998Z
- **Screen:** 1366 x 625 CSS px at pixel ratio 1
- **CPU:** 4x slower (fallback (not calibrated on the real device)). Checked under load: 5.3x.
- **Network:** wifi (20 Mbps down, 10 Mbps up, 40 ms), cold cache
- **GPU:** real renderer was "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" (software, so frame times are rough). The page was told: "ANGLE (Intel, Intel(R) UHD Graphics 600 (0x00003185) Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.100.8681)".

## Scorecard: 16 pass, 7 fail, 1 not measured

Confidence says how much a number from this cloud browser holds on the real device. High = counted work, the same on any device. Low = timing on different hardware.

| Area | Check | Value | Target | Result | Confidence |
|---|---|---|---|---|---|
| smooth | Average FPS during play | 1.1 fps | >= 30 | FAIL | low |
| smooth | 95% of frames faster than | 1,700 ms | <= 40 | FAIL | low |
| smooth | 99% of frames faster than | 1,716.6 ms | <= 50 | FAIL | low |
| smooth | Frames slower than 33.3 ms | 94.1 % | <= 10 | FAIL | low |
| smooth | Frame-to-frame change (steadiness) | 327.3 ms | <= 6 | FAIL | low |
| smooth | Hitches over 100 ms per minute | 64.2 /min | <= 2 | FAIL | low |
| smooth | Slowdown from start to end of steady play | 0 % | <= 15 | PASS | low |
| cpu | Main thread busy during play | 1.7 % | <= 70 | PASS | low |
| cpu | Longest main-thread task during play | 0 ms | <= 100 | PASS | low |
| cpu | Blocking time per minute during play | 0 ms/min | <= 1,000 | PASS | low |
| gpu | Draw calls per frame (95th pct) | 41 draws | <= 250 | PASS | high |
| gpu | Triangles per frame (95th pct) | 514,690 tris | <= 500,000 | FAIL | high |
| gpu | Canvas pixels drawn each frame | 853,750 px | <= 853,750 | PASS | high |
| gpu | Shader programs alive | 5 programs | <= 80 | PASS | high |
| gpu | Time blocked on shader compile and link | 85.5 ms | <= 1,500 | PASS | low |
| gpu | Textures larger than the device limit | 0 textures | <= 0 | PASS | high |
| memory | JavaScript heap peak | 41.8 MB | <= 200 | PASS | high |
| memory | GPU memory estimate peak | 4.1 MB | <= 200 | PASS | medium |
| memory | Heap plus GPU estimate peak | 45.9 MB | <= 400 | PASS | medium |
| memory | Heap growth during steady play | -1.3 MB/min | <= 5 | PASS | high |
| load | Downloaded on a cold load | 0.5 MB | <= 20 | PASS | high |
| load | Requests on a cold load | 7 requests | <= 150 | PASS | high |
| load | Time to first WebGL draw | 5,621 ms | <= 10,000 | PASS | low |
| load | Time until frames are steady | - ms | <= 20,000 | N/A | low |

## Phases

| Phase | Seconds | Avg FPS | p50 ms | p95 ms | p99 ms | Hitches | Long tasks | Main thread busy | Draws p95 |
|---|---|---|---|---|---|---|---|---|---|
| load | 0.6 | 24.5 | 16.7 | 166.6 | 166.6 | 1 | 3 | - | 0 |
| loaded | 13.7 | 0.9 | 850 | 5,216.4 | 5,216.4 | 12 | 3 | 51.3% | 41 |
| play | 25.6 | 1.1 | 866.7 | 1,716.5 | 1,716.6 | 26 | 0 | 2.4% | 41 |
| steady | 20 | 1.1 | 850.1 | 1,683.3 | 1,700 | 20 | 0 | 0.8% | 41 |

Steady play, first third vs last third: p50 866.6 -> 866.7 ms, p95 1,700 -> 1,683.3 ms. Heap growth -1.3 MB/min, GPU estimate growth 0 MB/min.

## Load

- 0.5 MB in 7 requests (0 failed). Last byte at 665.5 ms.
- First byte 72.9 ms, first paint 904 ms, load event 418.7 ms, first WebGL draw 5,621 ms, steady frames from - ms.
- By type: Script 0.37 MB, Stylesheet 0.06 MB, Font 0.02 MB, Document 0 MB, Other 0 MB

Largest files:

- index-CIM5i29t.js (Script): 0.37 MB
- css2 (Stylesheet): 0.06 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cUW1yO5Cb.woff2 (Font): 0.01 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cGWtyO5Cb.woff2 (Font): 0.01 MB
- index-BAiiyWGm.css (Stylesheet): 0 MB
- / (Document): 0 MB
- favicon.ico (Other): 0 MB

## GPU work (counted)

- Draw calls per frame: p50 41, p95 41, max 41
- Triangles per frame: p50 514,690, p95 514,690, max 514,690
- Canvas pixels: 853,750. Shader programs: 5 (5 links, 85.5 ms blocked, compile 0 ms).
- Textures: 5, largest 257 px, over the device limit: 0.
- Software GPU load on the cloud machine during play: 3.2 CPU cores (only useful to compare runs).

## Memory

- JavaScript heap peak 41.8 MB, GPU estimate peak 4.1 MB, together 45.9 MB.
- GPU estimate at the end: textures 0.3 MB, buffers 3.9 MB, renderbuffers 0 MB.
- Cloud process memory (not the device): renderer 483.6 MB, GPU process 199 MB.

## Scripts in slow frames during play

- o @ index-CIM5i29t.js: 62.4 ms over 9 slow frames (longest 8.6 ms)
- V @ index-CIM5i29t.js: 18.5 ms over 2 slow frames (longest 13.1 ms)

## What this run cannot tell you

- It does not run on the real GPU. WebGL ran on SwiftShader, a software renderer on the cloud CPU. GPU limits, the renderer name and the screen are copied. GPU speed, drivers and heat are not.
- CPU slowdown makes the whole page slower by one factor. It does not copy the device's cores, caches or how the phone slows down when it gets hot.
- Memory numbers are what the page uses. The cloud machine does not run out of RAM like a device with 1 GB free, and Android may kill the tab sooner. Use --heap-cap-mb to find heap crashes.
- Battery drain, power and device temperature are not measured.
- To confirm, run the same page on the real device (Chrome remote debugging, or the FPS meter) and compare.
