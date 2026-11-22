# Device run: Shifat's phone (Samsung Galaxy M02s, Adreno 506)

- **Page:** https://cozy-isle.vercel.app/?lab=1
- **When:** 2026-11-22T07:55:05.740Z
- **Screen:** 412 x 800 CSS px at pixel ratio 1.75, mobile, touch
- **CPU:** 6x slower (fallback (not calibrated on the real device)). Checked under load: 6.4x.
- **Network:** 4g (9 Mbps down, 1.5 Mbps up, 170 ms), cold cache
- **GPU:** real renderer was "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" (software, so frame times are rough). The page was told: "ANGLE (Qualcomm, Adreno (TM) 506, OpenGL ES 3.2 V@415.0 (GIT@7677c8b89e Id4b4c8da21 1589356105) (Date:05/13/20))".

## Scorecard: 17 pass, 6 fail, 1 not measured

Confidence says how much a number from this cloud browser holds on the real device. High = counted work, the same on any device. Low = timing on different hardware.

| Area | Check | Value | Target | Result | Confidence |
|---|---|---|---|---|---|
| smooth | Average FPS during play | 4.2 fps | >= 25 | FAIL | low |
| smooth | 95% of frames faster than | 466.7 ms | <= 50 | FAIL | low |
| smooth | 99% of frames faster than | 516.6 ms | <= 67 | FAIL | low |
| smooth | Frames slower than 40 ms | 87.2 % | <= 10 | FAIL | low |
| smooth | Frame-to-frame change (steadiness) | 165.9 ms | <= 8 | FAIL | low |
| smooth | Hitches over 100 ms per minute | 207.1 /min | <= 2 | FAIL | low |
| smooth | Slowdown from start to end of steady play | -0 % | <= 15 | PASS | low |
| cpu | Main thread busy during play | 4.2 % | <= 70 | PASS | low |
| cpu | Longest main-thread task during play | 0 ms | <= 100 | PASS | low |
| cpu | Blocking time per minute during play | 0 ms/min | <= 1,000 | PASS | low |
| gpu | Draw calls per frame (95th pct) | 41 draws | <= 150 | PASS | high |
| gpu | Triangles per frame (95th pct) | 243,131 tris | <= 250,000 | PASS | high |
| gpu | Canvas pixels drawn each frame | 329,600 px | <= 329,600 | PASS | high |
| gpu | Shader programs alive | 5 programs | <= 60 | PASS | high |
| gpu | Time blocked on shader compile and link | 37.1 ms | <= 2,000 | PASS | low |
| gpu | Textures larger than the device limit | 0 textures | <= 0 | PASS | high |
| memory | JavaScript heap peak | 33.8 MB | <= 200 | PASS | high |
| memory | GPU memory estimate peak | 1.9 MB | <= 200 | PASS | medium |
| memory | Heap plus GPU estimate peak | 35.7 MB | <= 400 | PASS | medium |
| memory | Heap growth during steady play | 0.2 MB/min | <= 5 | PASS | high |
| load | Downloaded on a cold load | 0.5 MB | <= 20 | PASS | high |
| load | Requests on a cold load | 7 requests | <= 150 | PASS | high |
| load | Time to first WebGL draw | 3,460.8 ms | <= 20,000 | PASS | low |
| load | Time until frames are steady | - ms | <= 30,000 | N/A | low |

## Phases

| Phase | Seconds | Avg FPS | p50 ms | p95 ms | p99 ms | Hitches | Long tasks | Main thread busy | Draws p95 |
|---|---|---|---|---|---|---|---|---|---|
| load | 1.2 | 37.5 | 16.7 | 66.6 | 166.7 | 1 | 3 | - | 0 |
| loaded | 26.4 | 3.5 | 233.4 | 616.6 | 2,599.8 | 79 | 3 | 16.9% | 41 |
| play | 22.6 | 4.1 | 233.3 | 483.3 | 650 | 74 | 0 | 4.8% | 41 |
| steady | 20 | 4.2 | 233.3 | 466.6 | 466.7 | 70 | 0 | 3.7% | 41 |

Steady play, first third vs last third: p50 233.4 -> 233.3 ms, p95 466.6 -> 466.7 ms. Heap growth 0.2 MB/min, GPU estimate growth -0 MB/min.

## Load

- 0.5 MB in 7 requests (0 failed). Last byte at 1,327.1 ms.
- First byte 227.4 ms, first paint 1,344 ms, load event 938.7 ms, first WebGL draw 3,460.8 ms, steady frames from - ms.
- By type: Script 0.37 MB, Stylesheet 0.06 MB, Font 0.02 MB, Document 0 MB, Other 0 MB

Largest files:

- index-BcmEyBKT.js (Script): 0.37 MB
- css2 (Stylesheet): 0.06 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cUW1yO5Cb36v1vg.woff2 (Font): 0.01 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cGWtyO5Cb36v1vg.woff2 (Font): 0.01 MB
- index-BAiiyWGm.css (Stylesheet): 0 MB
- / (Document): 0 MB
- favicon.ico (Other): 0 MB

## GPU work (counted)

- Draw calls per frame: p50 41, p95 41, max 41
- Triangles per frame: p50 243,131, p95 243,131, max 243,131
- Canvas pixels: 329,600. Shader programs: 5 (5 links, 37.1 ms blocked, compile 0 ms).
- Textures: 5, largest 257 px, over the device limit: 0.
- Software GPU load on the cloud machine during play: 3.1 CPU cores (only useful to compare runs).

## Memory

- JavaScript heap peak 33.8 MB, GPU estimate peak 1.9 MB, together 35.7 MB.
- GPU estimate at the end: textures 0.3 MB, buffers 1.7 MB, renderbuffers 0 MB.
- Cloud process memory (not the device): renderer 489.4 MB, GPU process 174.1 MB.

## Scripts in slow frames during play

- o @ index-BcmEyBKT.js: 330 ms over 40 slow frames (longest 20.8 ms)
- FrameRequestCallback @ : 21.4 ms over 3 slow frames (longest 7.4 ms)
- qO @ index-BcmEyBKT.js: 12.3 ms over 2 slow frames (longest 6.5 ms)
- S @ index-BcmEyBKT.js: 9.4 ms over 1 slow frames (longest 9.4 ms)
- DIV.onpointermove @ index-BcmEyBKT.js: 7.5 ms over 1 slow frames (longest 7.5 ms)
- V @ index-BcmEyBKT.js: 5.9 ms over 1 slow frames (longest 5.9 ms)

## What this run cannot tell you

- It does not run on the real GPU. WebGL ran on SwiftShader, a software renderer on the cloud CPU. GPU limits, the renderer name and the screen are copied. GPU speed, drivers and heat are not.
- CPU slowdown makes the whole page slower by one factor. It does not copy the device's cores, caches or how the phone slows down when it gets hot.
- Memory numbers are what the page uses. The cloud machine does not run out of RAM like a device with 1 GB free, and Android may kill the tab sooner. Use --heap-cap-mb to find heap crashes.
- Battery drain, power and device temperature are not measured.
- To confirm, run the same page on the real device (Chrome remote debugging, or the FPS meter) and compare.
