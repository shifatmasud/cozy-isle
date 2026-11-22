# Device run: Shifat's phone (Samsung Galaxy M02s, Adreno 506)

- **Page:** https://cozy-isle.vercel.app/?lab=1
- **When:** 2026-11-22T11:53:26.281Z
- **Screen:** 412 x 800 CSS px at pixel ratio 1.75, mobile, touch
- **CPU:** 6x slower (fallback (not calibrated on the real device)). Checked under load: 6.8x.
- **Network:** 4g (9 Mbps down, 1.5 Mbps up, 170 ms), cold cache
- **GPU:** real renderer was "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" (software, so frame times are rough). The page was told: "ANGLE (Qualcomm, Adreno (TM) 506, OpenGL ES 3.2 V@415.0 (GIT@7677c8b89e Id4b4c8da21 1589356105) (Date:05/13/20))".

## Scorecard: 15 pass, 8 fail, 1 not measured

Confidence says how much a number from this cloud browser holds on the real device. High = counted work, the same on any device. Low = timing on different hardware.

| Area | Check | Value | Target | Result | Confidence |
|---|---|---|---|---|---|
| smooth | Average FPS during play | 5.2 fps | >= 25 | FAIL | low |
| smooth | 95% of frames faster than | 383.3 ms | <= 50 | FAIL | low |
| smooth | 99% of frames faster than | 400 ms | <= 67 | FAIL | low |
| smooth | Frames slower than 40 ms | 94.3 % | <= 10 | FAIL | low |
| smooth | Frame-to-frame change (steadiness) | 97.7 ms | <= 8 | FAIL | low |
| smooth | Hitches over 100 ms per minute | 268.3 /min | <= 2 | FAIL | low |
| smooth | Slowdown from start to end of steady play | 0 % | <= 15 | PASS | low |
| cpu | Main thread busy during play | 6.1 % | <= 70 | PASS | low |
| cpu | Longest main-thread task during play | 997 ms | <= 100 | FAIL | low |
| cpu | Blocking time per minute during play | 1,387.4 ms/min | <= 1,000 | FAIL | low |
| gpu | Draw calls per frame (95th pct) | 37 draws | <= 150 | PASS | high |
| gpu | Triangles per frame (95th pct) | 164,798 tris | <= 250,000 | PASS | high |
| gpu | Canvas pixels drawn each frame | 278,944 px | <= 329,600 | PASS | high |
| gpu | Shader programs alive | 6 programs | <= 60 | PASS | high |
| gpu | Time blocked on shader compile and link | 27.2 ms | <= 2,000 | PASS | low |
| gpu | Textures larger than the device limit | 0 textures | <= 0 | PASS | high |
| memory | JavaScript heap peak | 40.1 MB | <= 200 | PASS | high |
| memory | GPU memory estimate peak | 35.9 MB | <= 200 | PASS | medium |
| memory | Heap plus GPU estimate peak | 76 MB | <= 400 | PASS | medium |
| memory | Heap growth during steady play | 0.6 MB/min | <= 5 | PASS | high |
| load | Downloaded on a cold load | 0.5 MB | <= 20 | PASS | high |
| load | Requests on a cold load | 7 requests | <= 150 | PASS | high |
| load | Time to first WebGL draw | 7,638.1 ms | <= 20,000 | PASS | low |
| load | Time until frames are steady | - ms | <= 30,000 | N/A | low |

## Phases

| Phase | Seconds | Avg FPS | p50 ms | p95 ms | p99 ms | Hitches | Long tasks | Main thread busy | Draws p95 |
|---|---|---|---|---|---|---|---|---|---|
| load | 1.8 | 17.4 | 16.7 | 233.4 | 383.3 | 3 | 4 | 42% | 0 |
| loaded | 20.7 | 0.6 | 200 | 18,349.2 | 18,349.2 | 11 | 4 | 91.7% | 37 |
| play | 20.4 | 5 | 199.9 | 383.3 | 383.4 | 90 | 1 | 7.1% | 37 |
| steady | 20 | 5.3 | 183.3 | 366.6 | 400 | 88 | 0 | 5.2% | 37 |

Steady play, first third vs last third: p50 183.3 -> 183.3 ms, p95 350 -> 400 ms. Heap growth 0.6 MB/min, GPU estimate growth -0 MB/min.

## Load

- 0.5 MB in 7 requests (0 failed). Last byte at 1,945.8 ms.
- First byte 222 ms, first paint 1,680 ms, load event 1,037.2 ms, first WebGL draw 7,638.1 ms, steady frames from - ms.
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
- Canvas pixels: 278,944. Shader programs: 6 (7 links, 27.2 ms blocked, compile 1.3 ms).
- Textures: 24, largest 2,048 px, over the device limit: 0.
- Software GPU load on the cloud machine during play: 3.1 CPU cores (only useful to compare runs).

## Memory

- JavaScript heap peak 40.1 MB, GPU estimate peak 35.9 MB, together 76 MB.
- GPU estimate at the end: textures 34.5 MB, buffers 1.4 MB, renderbuffers 0 MB.
- Cloud process memory (not the device): renderer 528.2 MB, GPU process 297.5 MB.

## Scripts in slow frames during play

- o @ index-Dfie3GJ7.js: 1933.6 ms over 132 slow frames (longest 990.3 ms)
- FrameRequestCallback @ : 14.1 ms over 2 slow frames (longest 7.6 ms)
- x @ index-Dfie3GJ7.js: 12.2 ms over 1 slow frames (longest 12.2 ms)
- TimerHandler:setTimeout @ index-Dfie3GJ7.js: 5.1 ms over 1 slow frames (longest 5.1 ms)

## What this run cannot tell you

- It does not run on the real GPU. WebGL ran on SwiftShader, a software renderer on the cloud CPU. GPU limits, the renderer name and the screen are copied. GPU speed, drivers and heat are not.
- CPU slowdown makes the whole page slower by one factor. It does not copy the device's cores, caches or how the phone slows down when it gets hot.
- Memory numbers are what the page uses. The cloud machine does not run out of RAM like a device with 1 GB free, and Android may kill the tab sooner. Use --heap-cap-mb to find heap crashes.
- Battery drain, power and device temperature are not measured.
- To confirm, run the same page on the real device (Chrome remote debugging, or the FPS meter) and compare.
