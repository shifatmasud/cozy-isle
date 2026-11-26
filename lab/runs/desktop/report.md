# Device run: Shifat's laptop (Intel UHD Graphics 600, 3 GB RAM)

- **Page:** https://cozy-isle.vercel.app/?lab=1
- **When:** 2026-11-26T11:19:31.878Z
- **Screen:** 1366 x 625 CSS px at pixel ratio 1
- **CPU:** 4x slower (fallback (not calibrated on the real device)). Checked under load: 3.9x.
- **Network:** wifi (20 Mbps down, 10 Mbps up, 40 ms), cold cache
- **GPU:** real renderer was "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" (software, so frame times are rough). The page was told: "ANGLE (Intel, Intel(R) UHD Graphics 600 (0x00003185) Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.100.8681)".

## Scorecard: 15 pass, 8 fail, 1 not measured

Confidence says how much a number from this cloud browser holds on the real device. High = counted work, the same on any device. Low = timing on different hardware.

| Area | Check | Value | Target | Result | Confidence |
|---|---|---|---|---|---|
| smooth | Average FPS during play | 3.3 fps | >= 30 | FAIL | low |
| smooth | 95% of frames faster than | 666.7 ms | <= 40 | FAIL | low |
| smooth | 99% of frames faster than | 933.3 ms | <= 50 | FAIL | low |
| smooth | Frames slower than 33.3 ms | 90.7 % | <= 10 | FAIL | low |
| smooth | Frame-to-frame change (steadiness) | 188 ms | <= 6 | FAIL | low |
| smooth | Hitches over 100 ms per minute | 173.5 /min | <= 2 | FAIL | low |
| smooth | Slowdown from start to end of steady play | 0 % | <= 15 | PASS | low |
| cpu | Main thread busy during play | 6.3 % | <= 70 | PASS | low |
| cpu | Longest main-thread task during play | 935 ms | <= 100 | FAIL | low |
| cpu | Blocking time per minute during play | 1,609.8 ms/min | <= 1,000 | FAIL | low |
| gpu | Draw calls per frame (95th pct) | 40 draws | <= 250 | PASS | high |
| gpu | Triangles per frame (95th pct) | 339,228 tris | <= 500,000 | PASS | high |
| gpu | Canvas pixels drawn each frame | 723,350 px | <= 853,750 | PASS | high |
| gpu | Shader programs alive | 6 programs | <= 80 | PASS | high |
| gpu | Time blocked on shader compile and link | 110.4 ms | <= 1,500 | PASS | low |
| gpu | Textures larger than the device limit | 0 textures | <= 0 | PASS | high |
| memory | JavaScript heap peak | 39.1 MB | <= 200 | PASS | high |
| memory | GPU memory estimate peak | 40.6 MB | <= 200 | PASS | medium |
| memory | Heap plus GPU estimate peak | 79.7 MB | <= 400 | PASS | medium |
| memory | Heap growth during steady play | 0.6 MB/min | <= 5 | PASS | high |
| load | Downloaded on a cold load | 0.5 MB | <= 20 | PASS | high |
| load | Requests on a cold load | 7 requests | <= 150 | PASS | high |
| load | Time to first WebGL draw | 5,771.7 ms | <= 10,000 | PASS | low |
| load | Time until frames are steady | - ms | <= 20,000 | N/A | low |

## Phases

| Phase | Seconds | Avg FPS | p50 ms | p95 ms | p99 ms | Hitches | Long tasks | Main thread busy | Draws p95 |
|---|---|---|---|---|---|---|---|---|---|
| load | 0.6 | 34.7 | 16.7 | 116.7 | 116.7 | 1 | 3 | - | 0 |
| loaded | 17.7 | 0.7 | 333.3 | 13,966.1 | 13,966.1 | 11 | 3 | 84.3% | 40 |
| play | 12.9 | 3.1 | 316.6 | 883.4 | 950 | 33 | 0 | 4.6% | 40 |
| steady | 20 | 3.5 | 283.3 | 550 | 933.3 | 60 | 1 | 7.4% | 40 |

Steady play, first third vs last third: p50 283.3 -> 283.3 ms, p95 549.9 -> 549.9 ms. Heap growth 0.6 MB/min, GPU estimate growth 0 MB/min.

## Load

- 0.5 MB in 7 requests (0 failed). Last byte at 595 ms.
- First byte 56.1 ms, first paint 740 ms, load event 391.8 ms, first WebGL draw 5,771.7 ms, steady frames from - ms.
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
- Canvas pixels: 723,350. Shader programs: 6 (7 links, 110.4 ms blocked, compile 1 ms).
- Textures: 26, largest 2,048 px, over the device limit: 0.
- Software GPU load on the cloud machine during play: 3.2 CPU cores (only useful to compare runs).

## Memory

- JavaScript heap peak 39.1 MB, GPU estimate peak 40.6 MB, together 79.7 MB.
- GPU estimate at the end: textures 38.1 MB, buffers 2.5 MB, renderbuffers 0 MB.
- Cloud process memory (not the device): renderer 549.6 MB, GPU process 332.7 MB.

## Scripts in slow frames during play

- o @ index-Dk-hiJCZ.js: 986.7 ms over 9 slow frames (longest 930.9 ms)
- a @ index-Dk-hiJCZ.js: 7 ms over 1 slow frames (longest 7 ms)
- U @ index-Dk-hiJCZ.js: 5.6 ms over 1 slow frames (longest 5.6 ms)

## What this run cannot tell you

- It does not run on the real GPU. WebGL ran on SwiftShader, a software renderer on the cloud CPU. GPU limits, the renderer name and the screen are copied. GPU speed, drivers and heat are not.
- CPU slowdown makes the whole page slower by one factor. It does not copy the device's cores, caches or how the phone slows down when it gets hot.
- Memory numbers are what the page uses. The cloud machine does not run out of RAM like a device with 1 GB free, and Android may kill the tab sooner. Use --heap-cap-mb to find heap crashes.
- Battery drain, power and device temperature are not measured.
- To confirm, run the same page on the real device (Chrome remote debugging, or the FPS meter) and compare.
