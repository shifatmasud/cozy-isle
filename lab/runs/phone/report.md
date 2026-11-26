# Device run: Shifat's phone (Samsung Galaxy M02s, Adreno 506)

- **Page:** https://cozy-isle.vercel.app/?lab=1
- **When:** 2026-11-26T02:27:43.402Z
- **Screen:** 412 x 800 CSS px at pixel ratio 1.75, mobile, touch
- **CPU:** 6x slower (fallback (not calibrated on the real device)). Checked under load: 5.9x.
- **Network:** 4g (9 Mbps down, 1.5 Mbps up, 170 ms), cold cache
- **GPU:** real renderer was "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" (software, so frame times are rough). The page was told: "ANGLE (Qualcomm, Adreno (TM) 506, OpenGL ES 3.2 V@415.0 (GIT@7677c8b89e Id4b4c8da21 1589356105) (Date:05/13/20))".

## Scorecard: 16 pass, 7 fail, 1 not measured

Confidence says how much a number from this cloud browser holds on the real device. High = counted work, the same on any device. Low = timing on different hardware.

| Area | Check | Value | Target | Result | Confidence |
|---|---|---|---|---|---|
| smooth | Average FPS during play | 9.8 fps | >= 25 | FAIL | low |
| smooth | 95% of frames faster than | 200 ms | <= 50 | FAIL | low |
| smooth | 99% of frames faster than | 300 ms | <= 67 | FAIL | low |
| smooth | Frames slower than 40 ms | 88 % | <= 10 | FAIL | low |
| smooth | Frame-to-frame change (steadiness) | 58.1 ms | <= 8 | FAIL | low |
| smooth | Hitches over 100 ms per minute | 187.3 /min | <= 2 | FAIL | low |
| smooth | Slowdown from start to end of steady play | 0.1 % | <= 15 | PASS | low |
| cpu | Main thread busy during play | 10 % | <= 70 | PASS | low |
| cpu | Longest main-thread task during play | 328 ms | <= 100 | FAIL | low |
| cpu | Blocking time per minute during play | 442 ms/min | <= 1,000 | PASS | low |
| gpu | Draw calls per frame (95th pct) | 40 draws | <= 150 | PASS | high |
| gpu | Triangles per frame (95th pct) | 170,734 tris | <= 250,000 | PASS | high |
| gpu | Canvas pixels drawn each frame | 278,944 px | <= 329,600 | PASS | high |
| gpu | Shader programs alive | 6 programs | <= 60 | PASS | high |
| gpu | Time blocked on shader compile and link | 16.6 ms | <= 2,000 | PASS | low |
| gpu | Textures larger than the device limit | 0 textures | <= 0 | PASS | high |
| memory | JavaScript heap peak | 35.5 MB | <= 200 | PASS | high |
| memory | GPU memory estimate peak | 39.5 MB | <= 200 | PASS | medium |
| memory | Heap plus GPU estimate peak | 71.6 MB | <= 400 | PASS | medium |
| memory | Heap growth during steady play | 1 MB/min | <= 5 | PASS | high |
| load | Downloaded on a cold load | 0.5 MB | <= 20 | PASS | high |
| load | Requests on a cold load | 7 requests | <= 150 | PASS | high |
| load | Time to first WebGL draw | 4,832.1 ms | <= 20,000 | PASS | low |
| load | Time until frames are steady | - ms | <= 30,000 | N/A | low |

## Phases

| Phase | Seconds | Avg FPS | p50 ms | p95 ms | p99 ms | Hitches | Long tasks | Main thread busy | Draws p95 |
|---|---|---|---|---|---|---|---|---|---|
| load | 1.2 | 34.5 | 16.7 | 166.7 | 166.7 | 1 | 3 | - | 0 |
| loaded | 12.6 | 1.2 | 166.6 | 10,382.9 | 10,382.9 | 10 | 3 | 92.2% | 40 |
| play | 17 | 8.9 | 100 | 216.7 | 333.4 | 65 | 1 | 12.5% | 40 |
| steady | 20 | 10.5 | 99.9 | 183.4 | 200 | 51 | 0 | 7.9% | 40 |

Steady play, first third vs last third: p50 99.9 -> 100 ms, p95 183.3 -> 183.4 ms. Heap growth 1 MB/min, GPU estimate growth 0 MB/min.

## Load

- 0.5 MB in 7 requests (0 failed). Last byte at 1,373.1 ms.
- First byte 210.8 ms, first paint 1,360 ms, load event 983.2 ms, first WebGL draw 4,832.1 ms, steady frames from - ms.
- By type: Script 0.4 MB, Stylesheet 0.06 MB, Font 0.02 MB, Document 0 MB, Other 0 MB

Largest files:

- index-Dk-hiJCZ.js (Script): 0.4 MB
- css2 (Stylesheet): 0.06 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cUW1yO5Cb36v1vg.woff2 (Font): 0.01 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cGWtyO5Cb36v1vg.woff2 (Font): 0.01 MB
- index-BAiiyWGm.css (Stylesheet): 0 MB
- / (Document): 0 MB
- favicon.ico (Other): 0 MB

## GPU work (counted)

- Draw calls per frame: p50 40, p95 40, max 40
- Triangles per frame: p50 170,734, p95 170,734, max 170,734
- Canvas pixels: 278,944. Shader programs: 6 (7 links, 16.6 ms blocked, compile 0 ms).
- Textures: 26, largest 2,048 px, over the device limit: 0.
- Software GPU load on the cloud machine during play: 2.9 CPU cores (only useful to compare runs).

## Memory

- JavaScript heap peak 35.5 MB, GPU estimate peak 39.5 MB, together 71.6 MB.
- GPU estimate at the end: textures 38.1 MB, buffers 1.4 MB, renderbuffers 0 MB.
- Cloud process memory (not the device): renderer 521.1 MB, GPU process 315.7 MB.

## Scripts in slow frames during play

- o @ index-Dk-hiJCZ.js: 1216.8 ms over 125 slow frames (longest 324.1 ms)
- x @ index-Dk-hiJCZ.js: 11.8 ms over 1 slow frames (longest 11.8 ms)
- LO @ index-Dk-hiJCZ.js: 8.2 ms over 1 slow frames (longest 8.2 ms)
- PerformanceObserverCallback @ : 5 ms over 1 slow frames (longest 5 ms)

## What this run cannot tell you

- It does not run on the real GPU. WebGL ran on SwiftShader, a software renderer on the cloud CPU. GPU limits, the renderer name and the screen are copied. GPU speed, drivers and heat are not.
- CPU slowdown makes the whole page slower by one factor. It does not copy the device's cores, caches or how the phone slows down when it gets hot.
- Memory numbers are what the page uses. The cloud machine does not run out of RAM like a device with 1 GB free, and Android may kill the tab sooner. Use --heap-cap-mb to find heap crashes.
- Battery drain, power and device temperature are not measured.
- To confirm, run the same page on the real device (Chrome remote debugging, or the FPS meter) and compare.
