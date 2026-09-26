# YURIKA C++ / WebAssembly DSP SDK v1

Chrome extensions do not execute `.cpp` source files directly. C++ modules are compiled **before loading/reloading the extension** into WebAssembly (`.wasm`), then executed inside an `AudioWorkletProcessor`.

This extension already proves the path with `virtual-amp-core.cpp -> virtual-amp-core.wasm`. The SDK generalizes that mechanism for future YURIKA DSP modules.

## Files

- `yurika_cpp_dsp_api.h` - stable ABI v1 contract.
- `example-unity.cpp` - allocation-free example module.
- `example-unity.wasm` - prebuilt example used by the self-test.
- `build-example.cmd` - Windows build helper. Tries LLVM `clang++`, then Emscripten `em++`.
- `selftest_node.js` - verifies ABI and numerical processing outside Chrome.
- root `cpp-wasm-host.js` - reusable extension-side loader/stage creator.
- root `cpp-wasm-worklet.js` - reusable real-time AudioWorklet host.

## ABI v1

A module exports:

- `memory`
- `yurika_cpp_abi_version()` -> `1`
- `yurika_cpp_buffer()` -> pointer to interleaved float32 buffer
- `yurika_cpp_reset(sample_rate, channels)`
- `yurika_cpp_set_param(param_id, value)`
- `yurika_cpp_process(frames, channels)`

Limits: max 256 frames, max 2 channels. Keep real-time code allocation-free, exception-free, blocking-free, and network-free.

## Build

On Windows, install either LLVM with the wasm32 backend or Emscripten, then run `build-example.cmd`.

The extension itself does **not** contain a C++ compiler and does not compile arbitrary C++ at runtime. Manifest V3 deliberately restricts runtime code generation. Ship the resulting `.wasm` as a local extension resource and reload the unpacked extension after changing it.

## Use from YURIKA

`YurikaCppWasmHost.createStage(ctx, inputNode, { moduleUrl: chrome.runtime.getURL("cpp-sdk/example-unity.wasm"), channels: 2 })`

The generic host is fail-open: loader/runtime failure leaves a unity bypass so audio continues. New production DSP modules should still have dedicated regression tests before being connected to the audible graph.

## Security

Keep WASM modules local to the extension package. Do not download executable WASM from remote servers. The manifest already contains the MV3 CSP token required for WebAssembly: `'wasm-unsafe-eval'`.
