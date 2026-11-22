# Device run: Shifat's phone (Samsung Galaxy M02s, Adreno 506)

- **Page:** https://cozy-isle.vercel.app/?lab=1
- **When:** 2026-11-22T15:26:43.611Z
- **Screen:** 412 x 800 CSS px at pixel ratio 1.75, mobile, touch
- **CPU:** 6x slower (fallback (not calibrated on the real device)). Checked under load: 6.1x.
- **Network:** 4g (9 Mbps down, 1.5 Mbps up, 170 ms), cold cache
- **GPU:** real renderer was "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" (software, so frame times are rough). The page was told: "ANGLE (Qualcomm, Adreno (TM) 506, OpenGL ES 3.2 V@415.0 (GIT@7677c8b89e Id4b4c8da21 1589356105) (Date:05/13/20))".

## Scorecard: 16 pass, 7 fail, 1 not measured

Confidence says how much a number from this cloud browser holds on the real device. High = counted work, the same on any device. Low = timing on different hardware.

| Area | Check | Value | Target | Result | Confidence |
|---|---|---|---|---|---|
| smooth | Average FPS during play | 9.1 fps | >= 25 | FAIL | low |
| smooth | 95% of frames faster than | 216.7 ms | <= 50 | FAIL | low |
| smooth | 99% of frames faster than | 233.4 ms | <= 67 | FAIL | low |
| smooth | Frames slower than 40 ms | 89.9 % | <= 10 | FAIL | low |
| smooth | Frame-to-frame change (steadiness) | 58.6 ms | <= 8 | FAIL | low |
| smooth | Hitches over 100 ms per minute | 273.6 /min | <= 2 | FAIL | low |
| smooth | Slowdown from start to end of steady play | 0 % | <= 15 | PASS | low |
| cpu | Main thread busy during play | 10.3 % | <= 70 | PASS | low |
| cpu | Longest main-thread task during play | 288 ms | <= 100 | FAIL | low |
| cpu | Blocking time per minute during play | 393.4 ms/min | <= 1,000 | PASS | low |
| gpu | Draw calls per frame (95th pct) | 37 draws | <= 150 | PASS | high |
| gpu | Triangles per frame (95th pct) | 164,798 tris | <= 250,000 | PASS | high |
| gpu | Canvas pixels drawn each frame | 278,944 px | <= 329,600 | PASS | high |
| gpu | Shader programs alive | 6 programs | <= 60 | PASS | high |
| gpu | Time blocked on shader compile and link | 27.3 ms | <= 2,000 | PASS | low |
| gpu | Textures larger than the device limit | 0 textures | <= 0 | PASS | high |
| memory | JavaScript heap peak | 38.3 MB | <= 200 | PASS | high |
| memory | GPU memory estimate peak | 35.9 MB | <= 200 | PASS | medium |
| memory | Heap plus GPU estimate peak | 69.8 MB | <= 400 | PASS | medium |
| memory | Heap growth during steady play | 0.8 MB/min | <= 5 | PASS | high |
| load | Downloaded on a cold load | 0.5 MB | <= 20 | PASS | high |
| load | Requests on a cold load | 7 requests | <= 150 | PASS | high |
| load | Time to first WebGL draw | 5,588.7 ms | <= 20,000 | PASS | low |
| load | Time until frames are steady | - ms | <= 30,000 | N/A | low |

## Phases

| Phase | Seconds | Avg FPS | p50 ms | p95 ms | p99 ms | Hitches | Long tasks | Main thread busy | Draws p95 |
|---|---|---|---|---|---|---|---|---|---|
| load | 1.2 | 36 | 16.7 | 83.3 | 166.7 | 1 | 3 | - | 0 |
| loaded | 15 | 0.9 | 133.2 | 13,049.5 | 13,049.5 | 11 | 3 | 94.7% | 37 |
| play | 16.3 | 8.6 | 116.6 | 233.3 | 299.9 | 80 | 1 | 12% | 37 |
| steady | 20 | 9.5 | 100 | 200 | 216.7 | 84 | 0 | 9% | 37 |

Steady play, first third vs last third: p50 100 -> 100 ms, p95 200 -> 200 ms. Heap growth 0.8 MB/min, GPU estimate growth 0 MB/min.

## Load

- 0.5 MB in 7 requests (0 failed). Last byte at 1,331.3 ms.
- First byte 185.2 ms, first paint 1,328 ms, load event 940.4 ms, first WebGL draw 5,588.7 ms, steady frames from - ms.
- By type: Script 0.4 MB, Stylesheet 0.06 MB, Font 0.02 MB, Document 0 MB, Other 0 MB

Largest files:

- index-Dfie3GJ7.js (Script): 0.4 MB
- css2 (Stylesheet): 0.06 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cUW1yO5Cb36v1vg.woff2 (Font): 0.01 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cGWtyO5Cb36v1vg.woff2 (Font): 0.01 MB
- index-BAiiyWGm.css (Stylesheet): 0 MB
- / (Document): 0 MB
- favicon.ico (Other): 0 MB

## GPU work (counted)

- Draw calls per frame: p50 37, p95 37, max 37
- Triangles per frame: p50 164,798, p95 164,798, max 164,798
- Canvas pixels: 278,944. Shader programs: 6 (7 links, 27.3 ms blocked, compile 0 ms).
- Textures: 24, largest 2,048 px, over the device limit: 0.
- Software GPU load on the cloud machine during play: 3.1 CPU cores (only useful to compare runs).

## Memory

- JavaScript heap peak 38.3 MB, GPU estimate peak 35.9 MB, together 69.8 MB.
- GPU estimate at the end: textures 34.5 MB, buffers 1.4 MB, renderbuffers 0 MB.
- Cloud process memory (not the device): renderer 545.4 MB, GPU process 299 MB.

## Scripts in slow frames during play

- o @ index-Dfie3GJ7.js: 1396.4 ms over 166 slow frames (longest 285.7 ms)
- B @ index-Dfie3GJ7.js: 14.5 ms over 2 slow frames (longest 7.4 ms)
- FrameRequestCallback @ : 14.2 ms over 2 slow frames (longest 8.4 ms)
- CO @ index-Dfie3GJ7.js: 6.9 ms over 1 slow frames (longest 6.9 ms)
- DIV.onpointermove @ index-Dfie3GJ7.js: 5.7 ms over 1 slow frames (longest 5.7 ms)
- Animation.onfinish @ index-Dfie3GJ7.js: 5.1 ms over 1 slow frames (longest 5.1 ms)
- PerformanceObserverCallback @ : 5.1 ms over 1 slow frames (longest 5.1 ms)

## What this run cannot tell you

- It does not run on the real GPU. WebGL ran on SwiftShader, a software renderer on the cloud CPU. GPU limits, the renderer name and the screen are copied. GPU speed, drivers and heat are not.
- CPU slowdown makes the whole page slower by one factor. It does not copy the device's cores, caches or how the phone slows down when it gets hot.
- Memory numbers are what the page uses. The cloud machine does not run out of RAM like a device with 1 GB free, and Android may kill the tab sooner. Use --heap-cap-mb to find heap crashes.
- Battery drain, power and device temperature are not measured.
- To confirm, run the same page on the real device (Chrome remote debugging, or the FPS meter) and compare.
