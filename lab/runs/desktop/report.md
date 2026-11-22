# Device run: Shifat's laptop (Intel UHD Graphics 600, 3 GB RAM)

- **Page:** https://cozy-isle.vercel.app/?lab=1
- **When:** 2026-11-22T07:47:59.374Z
- **Screen:** 1366 x 625 CSS px at pixel ratio 1
- **CPU:** 4x slower (fallback (not calibrated on the real device)). Checked under load: 6.8x.
- **Network:** wifi (20 Mbps down, 10 Mbps up, 40 ms), cold cache
- **GPU:** real renderer was "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" (software, so frame times are rough). The page was told: "ANGLE (Intel, Intel(R) UHD Graphics 600 (0x00003185) Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.100.8681)".

## Scorecard: 16 pass, 7 fail, 1 not measured

Confidence says how much a number from this cloud browser holds on the real device. High = counted work, the same on any device. Low = timing on different hardware.

| Area | Check | Value | Target | Result | Confidence |
|---|---|---|---|---|---|
| smooth | Average FPS during play | 1.2 fps | >= 30 | FAIL | low |
| smooth | 95% of frames faster than | 1,683.3 ms | <= 40 | FAIL | low |
| smooth | 99% of frames faster than | 1,983.2 ms | <= 50 | FAIL | low |
| smooth | Frames slower than 33.3 ms | 88.9 % | <= 10 | FAIL | low |
| smooth | Frame-to-frame change (steadiness) | 542.1 ms | <= 6 | FAIL | low |
| smooth | Hitches over 100 ms per minute | 63.6 /min | <= 2 | FAIL | low |
| smooth | Slowdown from start to end of steady play | 2 % | <= 15 | PASS | low |
| cpu | Main thread busy during play | 1.2 % | <= 70 | PASS | low |
| cpu | Longest main-thread task during play | 0 ms | <= 100 | PASS | low |
| cpu | Blocking time per minute during play | 0 ms/min | <= 1,000 | PASS | low |
| gpu | Draw calls per frame (95th pct) | 41 draws | <= 250 | PASS | high |
| gpu | Triangles per frame (95th pct) | 514,690 tris | <= 500,000 | FAIL | high |
| gpu | Canvas pixels drawn each frame | 853,750 px | <= 853,750 | PASS | high |
| gpu | Shader programs alive | 5 programs | <= 80 | PASS | high |
| gpu | Time blocked on shader compile and link | 97 ms | <= 1,500 | PASS | low |
| gpu | Textures larger than the device limit | 0 textures | <= 0 | PASS | high |
| memory | JavaScript heap peak | 31.1 MB | <= 200 | PASS | high |
| memory | GPU memory estimate peak | 4.1 MB | <= 200 | PASS | medium |
| memory | Heap plus GPU estimate peak | 33.4 MB | <= 400 | PASS | medium |
| memory | Heap growth during steady play | -1.2 MB/min | <= 5 | PASS | high |
| load | Downloaded on a cold load | 0.5 MB | <= 20 | PASS | high |
| load | Requests on a cold load | 7 requests | <= 150 | PASS | high |
| load | Time to first WebGL draw | 5,319.6 ms | <= 10,000 | PASS | low |
| load | Time until frames are steady | - ms | <= 20,000 | N/A | low |

## Phases

| Phase | Seconds | Avg FPS | p50 ms | p95 ms | p99 ms | Hitches | Long tasks | Main thread busy | Draws p95 |
|---|---|---|---|---|---|---|---|---|---|
| load | 0.6 | 27 | 16.7 | 150 | 150 | 1 | 3 | - | 0 |
| loaded | 81.7 | 1.1 | 866.6 | 1,716.6 | 4,983.2 | 79 | 3 | 8.9% | 41 |
| play | 26.3 | 1.2 | 849.9 | 1,683.3 | 1,983.2 | 26 | 0 | 1.6% | 41 |
| steady | 20 | 1.2 | 849.9 | 1,666.6 | 1,683.3 | 20 | 0 | 0.8% | 41 |

Steady play, first third vs last third: p50 833.3 -> 850 ms, p95 866.6 -> 1,683.3 ms. Heap growth -1.2 MB/min, GPU estimate growth 0 MB/min.

## Load

- 0.5 MB in 7 requests (0 failed). Last byte at 683.8 ms.
- First byte 90.2 ms, first paint 928 ms, load event 442.3 ms, first WebGL draw 5,319.6 ms, steady frames from - ms.
- By type: Script 0.37 MB, Stylesheet 0.06 MB, Font 0.02 MB, Document 0 MB, Other 0 MB

Largest files:

- index-DdcvTA1b.js (Script): 0.37 MB
- css2 (Stylesheet): 0.06 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cUW1yO5Cb.woff2 (Font): 0.01 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cGWtyO5Cb.woff2 (Font): 0.01 MB
- index-BAiiyWGm.css (Stylesheet): 0 MB
- / (Document): 0 MB
- favicon.ico (Other): 0 MB

## GPU work (counted)

- Draw calls per frame: p50 41, p95 41, max 41
- Triangles per frame: p50 514,690, p95 514,690, max 514,690
- Canvas pixels: 853,750. Shader programs: 5 (5 links, 97 ms blocked, compile 0 ms).
- Textures: 5, largest 257 px, over the device limit: 0.
- Software GPU load on the cloud machine during play: 3.2 CPU cores (only useful to compare runs).

## Memory

- JavaScript heap peak 31.1 MB, GPU estimate peak 4.1 MB, together 33.4 MB.
- GPU estimate at the end: textures 0.3 MB, buffers 3.9 MB, renderbuffers 0 MB.
- Cloud process memory (not the device): renderer 508.1 MB, GPU process 203.4 MB.

## Scripts in slow frames during play

- o @ index-DdcvTA1b.js: 72.1 ms over 8 slow frames (longest 16.5 ms)

## What this run cannot tell you

- It does not run on the real GPU. WebGL ran on SwiftShader, a software renderer on the cloud CPU. GPU limits, the renderer name and the screen are copied. GPU speed, drivers and heat are not.
- CPU slowdown makes the whole page slower by one factor. It does not copy the device's cores, caches or how the phone slows down when it gets hot.
- Memory numbers are what the page uses. The cloud machine does not run out of RAM like a device with 1 GB free, and Android may kill the tab sooner. Use --heap-cap-mb to find heap crashes.
- Battery drain, power and device temperature are not measured.
- To confirm, run the same page on the real device (Chrome remote debugging, or the FPS meter) and compare.
