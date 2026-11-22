# Device run: Shifat's phone (Samsung Galaxy M02s, Adreno 506)

- **Page:** https://cozy-isle.vercel.app/?lab=1
- **When:** 2026-11-22T10:56:53.664Z
- **Screen:** 412 x 800 CSS px at pixel ratio 1.75, mobile, touch
- **CPU:** 6x slower (fallback (not calibrated on the real device)). Checked under load: 5.9x.
- **Network:** 4g (9 Mbps down, 1.5 Mbps up, 170 ms), cold cache
- **GPU:** real renderer was "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" (software, so frame times are rough). The page was told: "ANGLE (Qualcomm, Adreno (TM) 506, OpenGL ES 3.2 V@415.0 (GIT@7677c8b89e Id4b4c8da21 1589356105) (Date:05/13/20))".

## Scorecard: 16 pass, 7 fail, 1 not measured

Confidence says how much a number from this cloud browser holds on the real device. High = counted work, the same on any device. Low = timing on different hardware.

| Area | Check | Value | Target | Result | Confidence |
|---|---|---|---|---|---|
| smooth | Average FPS during play | 5.6 fps | >= 25 | FAIL | low |
| smooth | 95% of frames faster than | 333.3 ms | <= 50 | FAIL | low |
| smooth | 99% of frames faster than | 449.9 ms | <= 67 | FAIL | low |
| smooth | Frames slower than 40 ms | 81.1 % | <= 10 | FAIL | low |
| smooth | Frame-to-frame change (steadiness) | 140.4 ms | <= 8 | FAIL | low |
| smooth | Hitches over 100 ms per minute | 261.2 /min | <= 2 | FAIL | low |
| smooth | Slowdown from start to end of steady play | 0 % | <= 15 | PASS | low |
| cpu | Main thread busy during play | 4.8 % | <= 70 | PASS | low |
| cpu | Longest main-thread task during play | 481 ms | <= 100 | FAIL | low |
| cpu | Blocking time per minute during play | 635.7 ms/min | <= 1,000 | PASS | low |
| gpu | Draw calls per frame (95th pct) | 41 draws | <= 150 | PASS | high |
| gpu | Triangles per frame (95th pct) | 243,131 tris | <= 250,000 | PASS | high |
| gpu | Canvas pixels drawn each frame | 278,944 px | <= 329,600 | PASS | high |
| gpu | Shader programs alive | 5 programs | <= 60 | PASS | high |
| gpu | Time blocked on shader compile and link | 11 ms | <= 2,000 | PASS | low |
| gpu | Textures larger than the device limit | 0 textures | <= 0 | PASS | high |
| memory | JavaScript heap peak | 38.5 MB | <= 200 | PASS | high |
| memory | GPU memory estimate peak | 2 MB | <= 200 | PASS | medium |
| memory | Heap plus GPU estimate peak | 38.5 MB | <= 400 | PASS | medium |
| memory | Heap growth during steady play | -15.2 MB/min | <= 5 | PASS | high |
| load | Downloaded on a cold load | 0.5 MB | <= 20 | PASS | high |
| load | Requests on a cold load | 7 requests | <= 150 | PASS | high |
| load | Time to first WebGL draw | 3,054.3 ms | <= 20,000 | PASS | low |
| load | Time until frames are steady | - ms | <= 30,000 | N/A | low |

## Phases

| Phase | Seconds | Avg FPS | p50 ms | p95 ms | p99 ms | Hitches | Long tasks | Main thread busy | Draws p95 |
|---|---|---|---|---|---|---|---|---|---|
| load | 1.2 | 34.8 | 16.7 | 150.1 | 150.1 | 1 | 3 | - | 0 |
| loaded | 4.1 | 3.4 | 150 | 1,983.2 | 1,983.2 | 9 | 3 | 69.3% | 41 |
| play | 19.9 | 5.2 | 166.7 | 433.3 | 450 | 81 | 1 | 5.7% | 41 |
| steady | 20 | 6.1 | 166.6 | 316.7 | 333.3 | 91 | 0 | 4% | 41 |

Steady play, first third vs last third: p50 166.6 -> 166.6 ms, p95 316.7 -> 316.6 ms. Heap growth -15.2 MB/min, GPU estimate growth 0 MB/min.

## Load

- 0.5 MB in 7 requests (0 failed). Last byte at 1,349.2 ms.
- First byte 252.6 ms, first paint 1,360 ms, load event 980.8 ms, first WebGL draw 3,054.3 ms, steady frames from - ms.
- By type: Script 0.37 MB, Stylesheet 0.06 MB, Font 0.02 MB, Document 0 MB, Other 0 MB

Largest files:

- index-DLZ7oxx9.js (Script): 0.37 MB
- css2 (Stylesheet): 0.06 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cUW1yO5Cb36v1vg.woff2 (Font): 0.01 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cGWtyO5Cb36v1vg.woff2 (Font): 0.01 MB
- index-BAiiyWGm.css (Stylesheet): 0 MB
- / (Document): 0 MB
- favicon.ico (Other): 0 MB

## GPU work (counted)

- Draw calls per frame: p50 41, p95 41, max 41
- Triangles per frame: p50 243,131, p95 243,131, max 243,131
- Canvas pixels: 278,944. Shader programs: 5 (5 links, 11 ms blocked, compile 0 ms).
- Textures: 6, largest 257 px, over the device limit: 0.
- Software GPU load on the cloud machine during play: 2.8 CPU cores (only useful to compare runs).

## Memory

- JavaScript heap peak 38.5 MB, GPU estimate peak 2 MB, together 38.5 MB.
- GPU estimate at the end: textures 0.3 MB, buffers 1.7 MB, renderbuffers 0 MB.
- Cloud process memory (not the device): renderer 516.7 MB, GPU process 168.6 MB.

## Scripts in slow frames during play

- o @ index-DLZ7oxx9.js: 537.9 ms over 7 slow frames (longest 478.3 ms)
- S @ index-DLZ7oxx9.js: 23.6 ms over 1 slow frames (longest 23.6 ms)
- PerformanceObserverCallback @ : 8.4 ms over 1 slow frames (longest 8.4 ms)
- e5 @ index-DLZ7oxx9.js: 5.2 ms over 1 slow frames (longest 5.2 ms)

## What this run cannot tell you

- It does not run on the real GPU. WebGL ran on SwiftShader, a software renderer on the cloud CPU. GPU limits, the renderer name and the screen are copied. GPU speed, drivers and heat are not.
- CPU slowdown makes the whole page slower by one factor. It does not copy the device's cores, caches or how the phone slows down when it gets hot.
- Memory numbers are what the page uses. The cloud machine does not run out of RAM like a device with 1 GB free, and Android may kill the tab sooner. Use --heap-cap-mb to find heap crashes.
- Battery drain, power and device temperature are not measured.
- To confirm, run the same page on the real device (Chrome remote debugging, or the FPS meter) and compare.
