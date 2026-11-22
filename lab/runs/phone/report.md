# Device run: Shifat's phone (Samsung Galaxy M02s, Adreno 506)

- **Page:** https://cozy-isle.vercel.app/?lab=1
- **When:** 2026-11-22T07:14:53.131Z
- **Screen:** 412 x 800 CSS px at pixel ratio 1.75, mobile, touch
- **CPU:** 6x slower (fallback (not calibrated on the real device)). Checked under load: 6x.
- **Network:** 4g (9 Mbps down, 1.5 Mbps up, 170 ms), cold cache
- **GPU:** real renderer was "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" (software, so frame times are rough). The page was told: "ANGLE (Qualcomm, Adreno (TM) 506, OpenGL ES 3.2 V@415.0 (GIT@7677c8b89e Id4b4c8da21 1589356105) (Date:05/13/20))".

## Scorecard: 19 pass, 5 fail, 0 not measured

Confidence says how much a number from this cloud browser holds on the real device. High = counted work, the same on any device. Low = timing on different hardware.

| Area | Check | Value | Target | Result | Confidence |
|---|---|---|---|---|---|
| smooth | Average FPS during play | 23.6 fps | >= 25 | FAIL | low |
| smooth | 95% of frames faster than | 66.7 ms | <= 50 | FAIL | low |
| smooth | 99% of frames faster than | 100 ms | <= 67 | FAIL | low |
| smooth | Frames slower than 40 ms | 47.2 % | <= 10 | FAIL | low |
| smooth | Frame-to-frame change (steadiness) | 25.7 ms | <= 8 | FAIL | low |
| smooth | Hitches over 100 ms per minute | 1.8 /min | <= 2 | PASS | low |
| smooth | Slowdown from start to end of steady play | 0 % | <= 15 | PASS | low |
| cpu | Main thread busy during play | 4.9 % | <= 70 | PASS | low |
| cpu | Longest main-thread task during play | 0 ms | <= 100 | PASS | low |
| cpu | Blocking time per minute during play | 0 ms/min | <= 1,000 | PASS | low |
| gpu | Draw calls per frame (95th pct) | 3 draws | <= 150 | PASS | high |
| gpu | Triangles per frame (95th pct) | 33,730 tris | <= 250,000 | PASS | high |
| gpu | Canvas pixels drawn each frame | 329,600 px | <= 329,600 | PASS | high |
| gpu | Shader programs alive | 3 programs | <= 60 | PASS | high |
| gpu | Time blocked on shader compile and link | 2.9 ms | <= 2,000 | PASS | low |
| gpu | Textures larger than the device limit | 0 textures | <= 0 | PASS | high |
| memory | JavaScript heap peak | 32.9 MB | <= 200 | PASS | high |
| memory | GPU memory estimate peak | 1 MB | <= 200 | PASS | medium |
| memory | Heap plus GPU estimate peak | 32.9 MB | <= 400 | PASS | medium |
| memory | Heap growth during steady play | -15.4 MB/min | <= 5 | PASS | high |
| load | Downloaded on a cold load | 0.4 MB | <= 20 | PASS | high |
| load | Requests on a cold load | 7 requests | <= 150 | PASS | high |
| load | Time to first WebGL draw | 1,686 ms | <= 20,000 | PASS | low |
| load | Time until frames are steady | 11,371.3 ms | <= 30,000 | PASS | low |

## Phases

| Phase | Seconds | Avg FPS | p50 ms | p95 ms | p99 ms | Hitches | Long tasks | Main thread busy | Draws p95 |
|---|---|---|---|---|---|---|---|---|---|
| load | 1 | 40.9 | 16.7 | 66.7 | 66.7 | 0 | 1 | - | 0 |
| loaded | 5.4 | 17.1 | 50 | 100 | 550 | 3 | 3 | 17.4% | 3 |
| play | 13.1 | 22.3 | 50 | 83.4 | 100 | 1 | 0 | 5.8% | 3 |
| steady | 20 | 24.5 | 33.4 | 66.7 | 83.4 | 0 | 0 | 4.3% | 3 |

Steady play, first third vs last third: p50 33.4 -> 33.4 ms, p95 66.7 -> 66.7 ms. Heap growth -15.4 MB/min, GPU estimate growth 0 MB/min.

## Load

- 0.4 MB in 7 requests (0 failed). Last byte at 1,151.3 ms.
- First byte 235.2 ms, first paint 964 ms, load event 869.2 ms, first WebGL draw 1,686 ms, steady frames from 11,371.3 ms.
- By type: Script 0.33 MB, Stylesheet 0.06 MB, Font 0.02 MB, Document 0 MB, Other 0 MB

Largest files:

- index-DfwRw6OB.js (Script): 0.33 MB
- css2 (Stylesheet): 0.06 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cUW1yO5Cb36v1vg.woff2 (Font): 0.01 MB
- o-0XIpIxzW5b-RxT-6A8jWAtCp-cGWtyO5Cb36v1vg.woff2 (Font): 0.01 MB
- / (Document): 0 MB
- index-Bc8sR3jj.css (Stylesheet): 0 MB
- favicon.ico (Other): 0 MB

## GPU work (counted)

- Draw calls per frame: p50 3, p95 3, max 3
- Triangles per frame: p50 33,730, p95 33,730, max 33,730
- Canvas pixels: 329,600. Shader programs: 3 (3 links, 2.9 ms blocked, compile 0 ms).
- Textures: 5, largest 257 px, over the device limit: 0.
- Software GPU load on the cloud machine during play: 3 CPU cores (only useful to compare runs).

## Memory

- JavaScript heap peak 32.9 MB, GPU estimate peak 1 MB, together 32.9 MB.
- GPU estimate at the end: textures 0.3 MB, buffers 0.8 MB, renderbuffers 0 MB.
- Cloud process memory (not the device): renderer 459.5 MB, GPU process 154.6 MB.

## Scripts in slow frames during play

- o @ index-DfwRw6OB.js: 64.4 ms over 8 slow frames (longest 12 ms)
- PerformanceObserverCallback @ : 11.7 ms over 1 slow frames (longest 11.7 ms)
- YU @ index-DfwRw6OB.js: 7.1 ms over 1 slow frames (longest 7.1 ms)
- DIV.onpointermove @ index-DfwRw6OB.js: 5.5 ms over 1 slow frames (longest 5.5 ms)

## What this run cannot tell you

- It does not run on the real GPU. WebGL ran on SwiftShader, a software renderer on the cloud CPU. GPU limits, the renderer name and the screen are copied. GPU speed, drivers and heat are not.
- CPU slowdown makes the whole page slower by one factor. It does not copy the device's cores, caches or how the phone slows down when it gets hot.
- Memory numbers are what the page uses. The cloud machine does not run out of RAM like a device with 1 GB free, and Android may kill the tab sooner. Use --heap-cap-mb to find heap crashes.
- Battery drain, power and device temperature are not measured.
- To confirm, run the same page on the real device (Chrome remote debugging, or the FPS meter) and compare.
