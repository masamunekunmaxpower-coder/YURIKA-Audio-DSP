YURIKA Audio GIRO MONATIUM 3.3.2

3.3.2 Integrity Numeric Stability
- Default Integrity transparent mode is now a true unity path with no hidden 3.5 Hz Biquad.
- Explicit Integrity stability modes use normalized first-order IIR DC blockers instead of ultra-low-frequency second-order Biquads.
- This targets the measured 96 kHz post-Integrity THD+N collapse without changing Self-DAP, HRTF, Spatial or Virtual Amp coefficients.
- No added algorithmic delay.


3.3.1 C++ / WebAssembly DSP SDK
- Chrome cannot execute .cpp source directly. YURIKA compiles C++ to local WebAssembly before extension load/reload.
- Added reusable cpp-wasm-host.js + cpp-wasm-worklet.js for future C++ DSP stages.
- Added cpp-sdk/ with ABI header, C++ example, prebuilt WASM, Windows build helper and Node self-test.
- Existing Virtual Class-A Amp remains C++/WASM and unchanged in its audible algorithm.
- No generic C++ module is connected to the audible path by default, so 3.2.7 sound/latency behavior is preserved.
- Manifest V3 CSP keeps local WASM enabled via script-src 'self' 'wasm-unsafe-eval'.
- Runtime C++ compilation is intentionally unsupported; compile .cpp to .wasm first, bundle it locally, then reload the unpacked extension.

YURIKA Audio GIRO MONATIUM 3.2.7

3.2.7 Internal Class-A Virtual Amplifier
- Added an internal C++ -> WebAssembly Class-A amplifier stage inside the Chrome extension. This is not an OS virtual audio device.
- Signal order: Spatial -> Auto Level -> Adaptive Trim -> Virtual Amp -> Limiter -> Safety -> output.
- Auto Apply is enabled by default and persists with YURIKA settings. Neutral (Flat) automatically bypasses amp residual distortion/noise to preserve the transparency gate.
- Reference electrical model: 8 W/ch rated @ 6 ohms, 12 W/ch practical simulated maximum, output impedance 0.020 ohm, damping factor 300, S/N 122 dB(A), amp-only THD+N target -100 dB at rated reference, crosstalk -120 dB @ 1 kHz, slew-rate-equivalent 25 V/us.
- These wattage/impedance figures are software reference-model values. They do not mean the PC physically drives a 6-ohm load at those powers.
- Frequency response inherits the current YURIKA DSP; the amp adds no EQ and measured reference gain deviation is about +0.00027 dB at rated reference.
- Amp algorithmic latency is 0 frames. The 6 ms enable/disable ramp suppresses clicks and is not a permanent audio delay. Actual browser/device latency remains visible through baseLatency/outputLatency diagnostics.
- WASM/worklet initialization or runtime faults fail open to unity bypass and are shown in the Virtual Amp UI/Diagnostics.
- Built from virtual-amp-core.cpp; bundled runtime is virtual-amp-core.wasm.

YURIKA Audio GIRO MONATIUM 3.2.6

3.2.6 fixes
- Spatial AUTO now honors explicit headphone intent when Chrome output labels are unavailable/unmatched.
- Audio-Technica ATH / ATH-WS330BT labels are recognized as headphone-class for Spatial selection; no model-specific EQ is invented.
- Local headphone/IEM AudioContext uses interactive latency policy, including Hi-Res request path. Actual latency remains browser/device dependent; inspect Diagnostics.
- Default sink is no longer redundantly reset with setSinkId("").
- Fixed SonoBus remote profiles are no longer re-ramped on unrelated sink/device notifications, targeting the slow control modulation seen in the previous THD+N measurement.
- DSP nonlinear coefficients, HRTF strength, Spatial coefficients, Self-DAP and DJ algorithms are otherwise unchanged.

YURIKA Audio GIRO MONATIUM 3.2.5 - External Input Permission Fix

3.2.5 changes:
- External / Phono Input now requests microphone/line-in permission from the visible popup on the user click.
- The short permission-priming stream is stopped immediately; persistent capture remains in the offscreen document.
- Permission dismissal/denial is shown explicitly and START_EXTERNAL is not attempted until permission succeeds.
- DSP, Spatial/HRTF and SonoBus audio algorithms are unchanged from 3.2.4.

YURIKA Audio 3.2.4 Chrome Extension - DJ Existing-Stream Promotion Fix

YURIKA Audio - GIRO MONATIUM 3.2.4
Chrome Extension Clean Package

INSTALL
1. Extract this ZIP completely to a normal folder.
2. Open Chrome and go to chrome://extensions/
3. Enable Developer mode.
4. Click "Load unpacked".
5. Select the extracted folder containing manifest.json.
6. Pin YURIKA Audio from the extensions menu if desired.

UPDATE
When replacing a previous unpacked YURIKA version, either:
- select this new extracted folder as a new unpacked extension, or
- replace the old folder contents while Chrome is closed, then press Reload on chrome://extensions/.

REMOTE MOBILE / SONOBUS
- Use "SonoBus -> Smartphone Headphones/IEM" for the dataset-free parametric HRTF route.
- Use "SonoBus -> Smartphone Speaker" when the phone itself is the acoustic output; HRTF is not applied to that target.
- End-to-end SonoBus/network/mobile latency is separate from Web Audio DSP latency.

VERSION
3.2.4


3.2.2 Chrome Capture UX Fix
- Mix画面の操作結果/エラーを常時見えるトーストとMix内ステータスへ表示。
- 背景YouTubeタブはChrome activeTab仕様に従い、先に対象タブでYURIKAを一度開いてCapture Readyにする方式へ変更。
- runtime.sendMessage失敗を画面へ表示。
- current tab検索をlastFocusedWindow基準へ修正。
- 音響DSP / Spatial / HRTFアルゴリズムは3.2.1から変更なし。


3.2.3 FIX:
- Fixed ReferenceError: headphoneMode is not defined.
- Headphone calibration now correctly checks localHeadphoneMode.
- Fix targets DJ stop -> re-arm / DSP reinitialization path.
- DSP coefficients, HRTF and Spatial algorithms are unchanged from 3.2.2.


3.2.4 FIX:
- Fixed Deck A/B assignment failure: "Cannot capture a tab with an active stream".
- When a YouTube tab is already running through Multi-Tab DSP, YURIKA now promotes the existing live MediaStream directly into the requested DJ Deck instead of starting a second tabCapture.
- Prevents the same tab from being assigned to both Deck A and Deck B simultaneously.
- Multi-Tab list marks Deck-owned tabs and disables redundant session capture.
- DSP coefficients, Spatial/HRTF processing and SonoBus Remote Mobile algorithms are unchanged.

3.3.1 startup fix:
- Restored createNoiseNode(), createSafetyMeterNode(), and createSparkMonitorNode() used by offscreen startup.
- Optional noise worklet remains fail-open to unity bypass if unavailable.
- Prevents GitHub/Chrome startup failure: createNoiseNode is not defined.

3.3.1: Adaptive Safety release is held during active program audio and recovers only in quiet windows to avoid gain-modulation THD+N contamination.
