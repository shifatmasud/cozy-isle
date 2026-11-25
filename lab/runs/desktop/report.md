# Device run: Shifat's laptop (Intel UHD Graphics 600, 3 GB RAM)

- **Page:** https://cozy-isle.vercel.app/?lab=1
- **When:** 2026-11-25T19:35:29.906Z
- **Screen:** 1366 x 625 CSS px at pixel ratio 1
- **CPU:** 4x slower (fallback (not calibrated on the real device)). Checked under load: 4.2x.
- **Network:** wifi (20 Mbps down, 10 Mbps up, 40 ms), cold cache
- **GPU:** real renderer was "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" (software, so frame times are rough). The page was told: "ANGLE (Intel, Intel(R) UHD Graphics 600 (0x00003185) Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.100.8681)".

## Scorecard: 17 pass, 6 fail, 1 not measured

Confidence says how much a number from this cloud browser holds on the real device. High = counted work, the same on any device. Low = timing on different hardware.

| Area | Check | Value | Target | Result | Confidence |
|---|---|---|---|---|---|
| smooth | Average FPS during play | 1.8 fps | >= 30 | FAIL | low |
| smooth | 95% of frames faster than | 983.4 ms | <= 40 | FAIL | low |
| smooth | 99% of frames faster than | 1,100 ms | <= 50 | FAIL | low |
| smooth | Frames slower than 33.3 ms | 98.5 % | <= 10 | FAIL | low |
| smooth | Frame-to-frame change (steadiness) | 141.8 ms | <= 6 | FAIL | low |
| smooth | Hitches over 100 ms per minute | 104.9 /min | <= 2 | FAIL | low |
| smooth | Slowdown from start to end of steady play | -0 % | <= 15 | PASS | low |
| cpu | Main thread busy during play | 2.8 % | <= 70 | PASS | low |
| cpu | Longest main-thread task during play | 0 ms | <= 100 | PASS | low |
| cpu | Blocking time per minute during play | 0 ms/min | <= 1,000 | PASS | low |
| gpu | Draw calls per frame (95th pct) | 40 draws | <= 250 | PASS | high |
| gpu | Triangles per frame (95th pct) | 339,228 tris | <= 500,000 | PASS | high |
| gpu | Canvas pixels drawn each frame | 723,350 px | <= 853,750 | PASS | high |
| gpu | Shader programs alive | 6 programs | <= 80 | PASS | high |
| gpu | Time blocked on shader compile and link | 165.5 ms | <= 1,500 | PASS | low |
| gpu | Textures larger than the device limit | 0 textures | <= 0 | PASS | high |
| memory | JavaScript heap peak | 35.8 MB | <= 200 | PASS | high |
| memory | GPU memory estimate peak | 40.6 MB | <= 200 | PASS | medium |
| memory | Heap plus GPU estimate peak | 76.4 MB | <= 400 | PASS | medium |
| memory | Heap growth during steady play | -0.4 MB/min | <= 5 | PASS | high |
| load | Downloaded on a cold load | 0.5 MB | <= 20 | PASS | high |
| load | Requests on a cold load | 7 requests | <= 150 | PASS | high |
| load | Time to first WebGL draw | 8,522.9 ms | <= 10,000 | PASS | low |
| load | Time until frames are steady | - ms | <= 20,000 | N/A | low |

## Phases

| Phase | Seconds | Avg FPS | p50 ms | p95 ms | p99 ms | Hitches | Long tasks | Main thread busy | Draws p95 |
|---|---|---|---|---|---|---|---|---|---|
| load | 0.7 | 26.1 | 16.7 | 149.9 | 149.9 | 1 | 3 | - | 0 |
| loaded | 24.9 | 0.5 | 566.6 | 18,765.9 | 18,765.9 | 10 | 3 | 83.7% | 40 |
| play | 18.5 | 1.8 | 550 | 983.4 | 1,100 | 30 | 0 | 4.1% | 40 |
| steady | 20 | 1.8 | 533.3 | 1,033.2 | 1,050 | 35 | 0 | 1.6% | 40 |

Steady play, first third vs last third: p50 533.4 -> 533.2 ms, p95 1,033.2 -> 1,050 ms. Heap growth -0.4 MB/min, GPU estimate growth 0 MB/min.

## Load

- 0.5 MB in 7 requests (0 failed). Last byte at 761 ms.
- First byte 89.1 ms, first paint 1,012 ms, load event 525.4 ms, first WebGL draw 8,522.9 ms, steady frames from - ms.
- By type: Script 0.4 MB, Stylesheet 0.06 MB, Font 0.02 MB, Document 0 MB, Other 0 MB

Largest files:

- index-Dk-hiJCZ.js (Script): 0.4 MB
- css2 (Stylesheet): 0.06 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cUW1yO5Cb.woff2 (Font): 0.01 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cGWtyO5Cb.woff2 (Font): 0.01 MB
- index-BAiiyWGm.css (Stylesheet): 0 MB
- / (Document): 0 MB
- favicon.ico (Other): 0 MB

## GPU work (counted)

- Draw calls per frame: p50 40, p95 40, max 40
- Triangles per frame: p50 339,228, p95 339,228, max 339,228
- Canvas pixels: 723,350. Shader programs: 6 (7 links, 165.5 ms blocked, compile 0.6 ms).
- Textures: 26, largest 2,048 px, over the device limit: 0.
- Software GPU load on the cloud machine during play: 3.2 CPU cores (only useful to compare runs).

## Memory

- JavaScript heap peak 35.8 MB, GPU estimate peak 40.6 MB, together 76.4 MB.
- GPU estimate at the end: textures 38.1 MB, buffers 2.5 MB, renderbuffers 0 MB.
- Cloud process memory (not the device): renderer 545 MB, GPU process 320.9 MB.

## Scripts in slow frames during play

- o @ index-Dk-hiJCZ.js: 111.3 ms over 14 slow frames (longest 22.5 ms)
- U @ index-Dk-hiJCZ.js: 10.9 ms over 1 slow frames (longest 10.9 ms)
- Animation.onfinish @ index-Dk-hiJCZ.js: 5.3 ms over 1 slow frames (longest 5.3 ms)

## What this run cannot tell you

- It does not run on the real GPU. WebGL ran on SwiftShader, a software renderer on the cloud CPU. GPU limits, the renderer name and the screen are copied. GPU speed, drivers and heat are not.
- CPU slowdown makes the whole page slower by one factor. It does not copy the device's cores, caches or how the phone slows down when it gets hot.
- Memory numbers are what the page uses. The cloud machine does not run out of RAM like a device with 1 GB free, and Android may kill the tab sooner. Use --heap-cap-mb to find heap crashes.
- Battery drain, power and device temperature are not measured.
- To confirm, run the same page on the real device (Chrome remote debugging, or the FPS meter) and compare.
