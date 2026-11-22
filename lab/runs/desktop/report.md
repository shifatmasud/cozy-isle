# Device run: Shifat's laptop (Intel UHD Graphics 600, 3 GB RAM)

- **Page:** https://cozy-isle.vercel.app/?lab=1
- **When:** 2026-11-22T21:13:54.892Z
- **Screen:** 1366 x 625 CSS px at pixel ratio 1
- **CPU:** 4x slower (fallback (not calibrated on the real device)). Checked under load: 4.1x.
- **Network:** wifi (20 Mbps down, 10 Mbps up, 40 ms), cold cache
- **GPU:** real renderer was "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" (software, so frame times are rough). The page was told: "ANGLE (Intel, Intel(R) UHD Graphics 600 (0x00003185) Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.100.8681)".

## Scorecard: 17 pass, 6 fail, 1 not measured

Confidence says how much a number from this cloud browser holds on the real device. High = counted work, the same on any device. Low = timing on different hardware.

| Area | Check | Value | Target | Result | Confidence |
|---|---|---|---|---|---|
| smooth | Average FPS during play | 2.5 fps | >= 30 | FAIL | low |
| smooth | 95% of frames faster than | 766.7 ms | <= 40 | FAIL | low |
| smooth | 99% of frames faster than | 866.7 ms | <= 50 | FAIL | low |
| smooth | Frames slower than 33.3 ms | 95.5 % | <= 10 | FAIL | low |
| smooth | Frame-to-frame change (steadiness) | 167.3 ms | <= 6 | FAIL | low |
| smooth | Hitches over 100 ms per minute | 135 /min | <= 2 | FAIL | low |
| smooth | Slowdown from start to end of steady play | 0 % | <= 15 | PASS | low |
| cpu | Main thread busy during play | 2.5 % | <= 70 | PASS | low |
| cpu | Longest main-thread task during play | 0 ms | <= 100 | PASS | low |
| cpu | Blocking time per minute during play | 0 ms/min | <= 1,000 | PASS | low |
| gpu | Draw calls per frame (95th pct) | 37 draws | <= 250 | PASS | high |
| gpu | Triangles per frame (95th pct) | 327,692 tris | <= 500,000 | PASS | high |
| gpu | Canvas pixels drawn each frame | 723,350 px | <= 853,750 | PASS | high |
| gpu | Shader programs alive | 6 programs | <= 80 | PASS | high |
| gpu | Time blocked on shader compile and link | 136.5 ms | <= 1,500 | PASS | low |
| gpu | Textures larger than the device limit | 0 textures | <= 0 | PASS | high |
| memory | JavaScript heap peak | 38.8 MB | <= 200 | PASS | high |
| memory | GPU memory estimate peak | 37 MB | <= 200 | PASS | medium |
| memory | Heap plus GPU estimate peak | 75.8 MB | <= 400 | PASS | medium |
| memory | Heap growth during steady play | 0.2 MB/min | <= 5 | PASS | high |
| load | Downloaded on a cold load | 0.5 MB | <= 20 | PASS | high |
| load | Requests on a cold load | 7 requests | <= 150 | PASS | high |
| load | Time to first WebGL draw | 6,438.6 ms | <= 10,000 | PASS | low |
| load | Time until frames are steady | - ms | <= 20,000 | N/A | low |

## Phases

| Phase | Seconds | Avg FPS | p50 ms | p95 ms | p99 ms | Hitches | Long tasks | Main thread busy | Draws p95 |
|---|---|---|---|---|---|---|---|---|---|
| load | 0.6 | 36 | 16.7 | 116.7 | 116.7 | 1 | 3 | - | 0 |
| loaded | 19.4 | 0.7 | 366.7 | 14,549.4 | 14,549.4 | 12 | 3 | 79.4% | 37 |
| play | 15.3 | 2.3 | 416.6 | 866.7 | 866.7 | 33 | 0 | 3.7% | 37 |
| steady | 20 | 2.6 | 383.4 | 766.6 | 766.7 | 45 | 0 | 1.7% | 37 |

Steady play, first third vs last third: p50 383.4 -> 383.4 ms, p95 766.6 -> 766.6 ms. Heap growth 0.2 MB/min, GPU estimate growth 0 MB/min.

## Load

- 0.5 MB in 7 requests (0 failed). Last byte at 605.3 ms.
- First byte 59.5 ms, first paint 780 ms, load event 400.1 ms, first WebGL draw 6,438.6 ms, steady frames from - ms.
- By type: Script 0.4 MB, Stylesheet 0.06 MB, Font 0.02 MB, Document 0 MB, Other 0 MB

Largest files:

- index-Dfie3GJ7.js (Script): 0.4 MB
- css2 (Stylesheet): 0.06 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cUW1yO5Cb.woff2 (Font): 0.01 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cGWtyO5Cb.woff2 (Font): 0.01 MB
- index-BAiiyWGm.css (Stylesheet): 0 MB
- / (Document): 0 MB
- favicon.ico (Other): 0 MB

## GPU work (counted)

- Draw calls per frame: p50 37, p95 37, max 37
- Triangles per frame: p50 327,692, p95 327,692, max 327,692
- Canvas pixels: 723,350. Shader programs: 6 (7 links, 136.5 ms blocked, compile 0 ms).
- Textures: 24, largest 2,048 px, over the device limit: 0.
- Software GPU load on the cloud machine during play: 3.2 CPU cores (only useful to compare runs).

## Memory

- JavaScript heap peak 38.8 MB, GPU estimate peak 37 MB, together 75.8 MB.
- GPU estimate at the end: textures 34.5 MB, buffers 2.5 MB, renderbuffers 0 MB.
- Cloud process memory (not the device): renderer 546.1 MB, GPU process 333.8 MB.

## Scripts in slow frames during play

- o @ index-Dfie3GJ7.js: 49.4 ms over 6 slow frames (longest 14.8 ms)
- AO @ index-Dfie3GJ7.js: 9.2 ms over 1 slow frames (longest 9.2 ms)
- B @ index-Dfie3GJ7.js: 5.7 ms over 1 slow frames (longest 5.7 ms)

## What this run cannot tell you

- It does not run on the real GPU. WebGL ran on SwiftShader, a software renderer on the cloud CPU. GPU limits, the renderer name and the screen are copied. GPU speed, drivers and heat are not.
- CPU slowdown makes the whole page slower by one factor. It does not copy the device's cores, caches or how the phone slows down when it gets hot.
- Memory numbers are what the page uses. The cloud machine does not run out of RAM like a device with 1 GB free, and Android may kill the tab sooner. Use --heap-cap-mb to find heap crashes.
- Battery drain, power and device temperature are not measured.
- To confirm, run the same page on the real device (Chrome remote debugging, or the FPS meter) and compare.
