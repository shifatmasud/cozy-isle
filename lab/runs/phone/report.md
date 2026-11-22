# Device run: Shifat's phone (Samsung Galaxy M02s, Adreno 506)

- **Page:** https://cozy-isle.vercel.app/?lab=1
- **When:** 2026-11-22T07:45:29.889Z
- **Screen:** 412 x 800 CSS px at pixel ratio 1.75, mobile, touch
- **CPU:** 6x slower (fallback (not calibrated on the real device)). Checked under load: 6.6x.
- **Network:** 4g (9 Mbps down, 1.5 Mbps up, 170 ms), cold cache
- **GPU:** real renderer was "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" (software, so frame times are rough). The page was told: "ANGLE (Qualcomm, Adreno (TM) 506, OpenGL ES 3.2 V@415.0 (GIT@7677c8b89e Id4b4c8da21 1589356105) (Date:05/13/20))".

## Scorecard: 16 pass, 7 fail, 1 not measured

Confidence says how much a number from this cloud browser holds on the real device. High = counted work, the same on any device. Low = timing on different hardware.

| Area | Check | Value | Target | Result | Confidence |
|---|---|---|---|---|---|
| smooth | Average FPS during play | 2.9 fps | >= 25 | FAIL | low |
| smooth | 95% of frames faster than | 683.3 ms | <= 50 | FAIL | low |
| smooth | 99% of frames faster than | 700 ms | <= 67 | FAIL | low |
| smooth | Frames slower than 40 ms | 88.8 % | <= 10 | FAIL | low |
| smooth | Frame-to-frame change (steadiness) | 245.7 ms | <= 8 | FAIL | low |
| smooth | Hitches over 100 ms per minute | 143 /min | <= 2 | FAIL | low |
| smooth | Slowdown from start to end of steady play | 0 % | <= 15 | PASS | low |
| cpu | Main thread busy during play | 2.9 % | <= 70 | PASS | low |
| cpu | Longest main-thread task during play | 0 ms | <= 100 | PASS | low |
| cpu | Blocking time per minute during play | 0 ms/min | <= 1,000 | PASS | low |
| gpu | Draw calls per frame (95th pct) | 41 draws | <= 150 | PASS | high |
| gpu | Triangles per frame (95th pct) | 254,705 tris | <= 250,000 | FAIL | high |
| gpu | Canvas pixels drawn each frame | 329,600 px | <= 329,600 | PASS | high |
| gpu | Shader programs alive | 5 programs | <= 60 | PASS | high |
| gpu | Time blocked on shader compile and link | 118.5 ms | <= 2,000 | PASS | low |
| gpu | Textures larger than the device limit | 0 textures | <= 0 | PASS | high |
| memory | JavaScript heap peak | 37.7 MB | <= 200 | PASS | high |
| memory | GPU memory estimate peak | 2.1 MB | <= 200 | PASS | medium |
| memory | Heap plus GPU estimate peak | 39.8 MB | <= 400 | PASS | medium |
| memory | Heap growth during steady play | 0.2 MB/min | <= 5 | PASS | high |
| load | Downloaded on a cold load | 0.5 MB | <= 20 | PASS | high |
| load | Requests on a cold load | 7 requests | <= 150 | PASS | high |
| load | Time to first WebGL draw | 3,952.2 ms | <= 20,000 | PASS | low |
| load | Time until frames are steady | - ms | <= 30,000 | N/A | low |

## Phases

| Phase | Seconds | Avg FPS | p50 ms | p95 ms | p99 ms | Hitches | Long tasks | Main thread busy | Draws p95 |
|---|---|---|---|---|---|---|---|---|---|
| load | 1.3 | 29.1 | 16.7 | 200 | 200 | 1 | 4 | 37% | 0 |
| loaded | 38.1 | 2.4 | 350 | 933.3 | 2,766.6 | 78 | 4 | 11.9% | 41 |
| play | 26.6 | 2.9 | 349.9 | 666.7 | 700 | 64 | 0 | 3% | 41 |
| steady | 20 | 2.9 | 333.4 | 683.4 | 766.6 | 44 | 0 | 2.9% | 41 |

Steady play, first third vs last third: p50 333.3 -> 333.3 ms, p95 683.4 -> 683.4 ms. Heap growth 0.2 MB/min, GPU estimate growth -0 MB/min.

## Load

- 0.5 MB in 7 requests (0 failed). Last byte at 1,475.8 ms.
- First byte 284.4 ms, first paint 1,552 ms, load event 1,025.4 ms, first WebGL draw 3,952.2 ms, steady frames from - ms.
- By type: Script 0.37 MB, Stylesheet 0.06 MB, Font 0.02 MB, Document 0 MB, Other 0 MB

Largest files:

- index-DdcvTA1b.js (Script): 0.37 MB
- css2 (Stylesheet): 0.06 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cUW1yO5Cb36v1vg.woff2 (Font): 0.01 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cGWtyO5Cb36v1vg.woff2 (Font): 0.01 MB
- index-BAiiyWGm.css (Stylesheet): 0 MB
- / (Document): 0 MB
- favicon.ico (Other): 0 MB

## GPU work (counted)

- Draw calls per frame: p50 41, p95 41, max 41
- Triangles per frame: p50 254,705, p95 254,705, max 254,705
- Canvas pixels: 329,600. Shader programs: 5 (5 links, 118.5 ms blocked, compile 0 ms).
- Textures: 5, largest 257 px, over the device limit: 0.
- Software GPU load on the cloud machine during play: 3.1 CPU cores (only useful to compare runs).

## Memory

- JavaScript heap peak 37.7 MB, GPU estimate peak 2.1 MB, together 39.8 MB.
- GPU estimate at the end: textures 0.3 MB, buffers 1.9 MB, renderbuffers 0 MB.
- Cloud process memory (not the device): renderer 482.7 MB, GPU process 173.4 MB.

## Scripts in slow frames during play

- o @ index-DdcvTA1b.js: 252 ms over 31 slow frames (longest 14.2 ms)
- FrameRequestCallback @ : 18.7 ms over 2 slow frames (longest 10.9 ms)
- qO @ index-DdcvTA1b.js: 6.4 ms over 1 slow frames (longest 6.4 ms)
- PerformanceObserverCallback @ : 6 ms over 1 slow frames (longest 6 ms)

## What this run cannot tell you

- It does not run on the real GPU. WebGL ran on SwiftShader, a software renderer on the cloud CPU. GPU limits, the renderer name and the screen are copied. GPU speed, drivers and heat are not.
- CPU slowdown makes the whole page slower by one factor. It does not copy the device's cores, caches or how the phone slows down when it gets hot.
- Memory numbers are what the page uses. The cloud machine does not run out of RAM like a device with 1 GB free, and Android may kill the tab sooner. Use --heap-cap-mb to find heap crashes.
- Battery drain, power and device temperature are not measured.
- To confirm, run the same page on the real device (Chrome remote debugging, or the FPS meter) and compare.
