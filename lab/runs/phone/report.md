# Device run: Shifat's phone (Samsung Galaxy M02s, Adreno 506)

- **Page:** https://cozy-isle.vercel.app/?lab=1
- **When:** 2026-11-22T10:48:17.295Z
- **Screen:** 412 x 800 CSS px at pixel ratio 1.75, mobile, touch
- **CPU:** 6x slower (fallback (not calibrated on the real device)). Checked under load: 6.6x.
- **Network:** 4g (9 Mbps down, 1.5 Mbps up, 170 ms), cold cache
- **GPU:** real renderer was "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" (software, so frame times are rough). The page was told: "ANGLE (Qualcomm, Adreno (TM) 506, OpenGL ES 3.2 V@415.0 (GIT@7677c8b89e Id4b4c8da21 1589356105) (Date:05/13/20))".

## Scorecard: 16 pass, 7 fail, 1 not measured

Confidence says how much a number from this cloud browser holds on the real device. High = counted work, the same on any device. Low = timing on different hardware.

| Area | Check | Value | Target | Result | Confidence |
|---|---|---|---|---|---|
| smooth | Average FPS during play | 2.8 fps | >= 25 | FAIL | low |
| smooth | 95% of frames faster than | 683.4 ms | <= 50 | FAIL | low |
| smooth | 99% of frames faster than | 1,016.6 ms | <= 67 | FAIL | low |
| smooth | Frames slower than 40 ms | 86.8 % | <= 10 | FAIL | low |
| smooth | Frame-to-frame change (steadiness) | 284.5 ms | <= 8 | FAIL | low |
| smooth | Hitches over 100 ms per minute | 137.2 /min | <= 2 | FAIL | low |
| smooth | Slowdown from start to end of steady play | -0 % | <= 15 | PASS | low |
| cpu | Main thread busy during play | 3 % | <= 70 | PASS | low |
| cpu | Longest main-thread task during play | 58 ms | <= 100 | PASS | low |
| cpu | Blocking time per minute during play | 8.7 ms/min | <= 1,000 | PASS | low |
| gpu | Draw calls per frame (95th pct) | 41 draws | <= 150 | PASS | high |
| gpu | Triangles per frame (95th pct) | 254,705 tris | <= 250,000 | FAIL | high |
| gpu | Canvas pixels drawn each frame | 329,600 px | <= 329,600 | PASS | high |
| gpu | Shader programs alive | 5 programs | <= 60 | PASS | high |
| gpu | Time blocked on shader compile and link | 13.6 ms | <= 2,000 | PASS | low |
| gpu | Textures larger than the device limit | 0 textures | <= 0 | PASS | high |
| memory | JavaScript heap peak | 37.8 MB | <= 200 | PASS | high |
| memory | GPU memory estimate peak | 2.1 MB | <= 200 | PASS | medium |
| memory | Heap plus GPU estimate peak | 39.9 MB | <= 400 | PASS | medium |
| memory | Heap growth during steady play | -0.1 MB/min | <= 5 | PASS | high |
| load | Downloaded on a cold load | 0.5 MB | <= 20 | PASS | high |
| load | Requests on a cold load | 7 requests | <= 150 | PASS | high |
| load | Time to first WebGL draw | 4,304.2 ms | <= 20,000 | PASS | low |
| load | Time until frames are steady | - ms | <= 30,000 | N/A | low |

## Phases

| Phase | Seconds | Avg FPS | p50 ms | p95 ms | p99 ms | Hitches | Long tasks | Main thread busy | Draws p95 |
|---|---|---|---|---|---|---|---|---|---|
| load | 1.2 | 32.6 | 16.7 | 183.4 | 183.4 | 1 | 4 | 39.5% | 0 |
| loaded | 8.5 | 1.8 | 450 | 3,383.2 | 3,383.2 | 10 | 4 | 47.9% | 41 |
| play | 34.6 | 2.7 | 350 | 783.3 | 1,049.9 | 76 | 1 | 3.1% | 41 |
| steady | 20 | 2.9 | 333.3 | 683.3 | 850 | 46 | 0 | 2.7% | 41 |

Steady play, first third vs last third: p50 333.4 -> 333.3 ms, p95 850 -> 666.7 ms. Heap growth -0.1 MB/min, GPU estimate growth 0 MB/min.

## Load

- 0.5 MB in 7 requests (0 failed). Last byte at 1,388.9 ms.
- First byte 198.6 ms, first paint 1,452 ms, load event 950.9 ms, first WebGL draw 4,304.2 ms, steady frames from - ms.
- By type: Script 0.37 MB, Stylesheet 0.06 MB, Font 0.02 MB, Document 0 MB, Other 0 MB

Largest files:

- index-CIM5i29t.js (Script): 0.37 MB
- css2 (Stylesheet): 0.06 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cUW1yO5Cb36v1vg.woff2 (Font): 0.01 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cGWtyO5Cb36v1vg.woff2 (Font): 0.01 MB
- index-BAiiyWGm.css (Stylesheet): 0 MB
- / (Document): 0 MB
- favicon.ico (Other): 0 MB

## GPU work (counted)

- Draw calls per frame: p50 41, p95 41, max 41
- Triangles per frame: p50 254,705, p95 254,705, max 254,705
- Canvas pixels: 329,600. Shader programs: 5 (5 links, 13.6 ms blocked, compile 0 ms).
- Textures: 5, largest 257 px, over the device limit: 0.
- Software GPU load on the cloud machine during play: 3 CPU cores (only useful to compare runs).

## Memory

- JavaScript heap peak 37.8 MB, GPU estimate peak 2.1 MB, together 39.9 MB.
- GPU estimate at the end: textures 0.3 MB, buffers 1.9 MB, renderbuffers 0 MB.
- Cloud process memory (not the device): renderer 487.1 MB, GPU process 174.4 MB.

## Scripts in slow frames during play

- o @ index-CIM5i29t.js: 317.9 ms over 35 slow frames (longest 19.7 ms)
- S @ index-CIM5i29t.js: 15 ms over 2 slow frames (longest 10 ms)
- qk @ index-CIM5i29t.js: 13.8 ms over 1 slow frames (longest 13.8 ms)
- V @ index-CIM5i29t.js: 12.9 ms over 2 slow frames (longest 8 ms)
- FrameRequestCallback @ : 7.7 ms over 1 slow frames (longest 7.7 ms)

## What this run cannot tell you

- It does not run on the real GPU. WebGL ran on SwiftShader, a software renderer on the cloud CPU. GPU limits, the renderer name and the screen are copied. GPU speed, drivers and heat are not.
- CPU slowdown makes the whole page slower by one factor. It does not copy the device's cores, caches or how the phone slows down when it gets hot.
- Memory numbers are what the page uses. The cloud machine does not run out of RAM like a device with 1 GB free, and Android may kill the tab sooner. Use --heap-cap-mb to find heap crashes.
- Battery drain, power and device temperature are not measured.
- To confirm, run the same page on the real device (Chrome remote debugging, or the FPS meter) and compare.
