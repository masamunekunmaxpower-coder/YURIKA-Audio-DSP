# Architecture

YURIKA Audio 3.3.2 is structured as a Chrome Manifest V3 audio system rather than a single effect.

## Control plane

`service-worker.js` manages tab capture, persisted settings, sessions and the Offscreen document. `popup.js` is the main user-facing controller.

## Audio runtime

`offscreen.js` owns the primary AudioContext and builds the real-time graph. The pipeline is modular and includes tonal shaping, Self-DAP, width/perspective processing, room/integrity stages, HRTF, headphone correction, dynamics, 3D spatial processing, adaptive gain stages, the virtual amplifier, limiter and safety supervision.

## C++ / WebAssembly layer

`cpp-sdk/` defines a reusable DSP ABI and a working example module. `virtual-amp-core.cpp` is compiled to `virtual-amp-core.wasm` and hosted through an AudioWorklet. The host is fail-safe: a module failure falls back to unity rather than stopping playback.

## Spatial layer

`spatial-engine.js`, `spatial-device-profiles.js`, `spatial-diagnostics.js`, and `spatial-metrics-worklet.js` separate spatial rendering, device assumptions and diagnostic measurements. When HRTF processing is active, the spatial engine reduces additive lateral cues to avoid simply stacking full-strength ITD/ILD cues twice.

## Safety and observability

The extension exposes live peak/RMS and spatial/amp state, while limiter and safety stages prevent runaway output. Diagnostics are engineering aids, not perceptual quality scores.
