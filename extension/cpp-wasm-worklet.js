"use strict";

class YurikaCppWasmDspV1 extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.exports = null;
    this.buffer = null;
    this.bufferPtr = 0;
    this.runtimeError = null;
    try {
      const module = options?.processorOptions?.wasmModule;
      if (!module) throw new Error("C++/WASM module missing");
      const instance = new WebAssembly.Instance(module, {});
      const e = instance.exports;
      for (const name of ["memory","yurika_cpp_abi_version","yurika_cpp_buffer","yurika_cpp_reset","yurika_cpp_set_param","yurika_cpp_process"]) {
        if (!e[name]) throw new Error(`C++/WASM ABI export missing: ${name}`);
      }
      const abi = Number(e.yurika_cpp_abi_version());
      if (abi !== 1) throw new Error(`C++/WASM ABI mismatch: ${abi}`);
      this.exports = e;
      this.bufferPtr = Number(e.yurika_cpp_buffer());
      this.buffer = new Float32Array(e.memory.buffer, this.bufferPtr, 512);
      e.yurika_cpp_reset(Number(options?.processorOptions?.sampleRate || sampleRate), Number(options?.processorOptions?.channels || 2));
      this.port.postMessage({type:"ready", backend:"cpp-wasm", abiVersion:abi});
    } catch (error) {
      this.runtimeError = String(error?.message || error);
      this.port.postMessage({type:"error", error:this.runtimeError, backend:"bypass"});
    }
    this.port.onmessage = (event) => {
      const msg = event?.data || {};
      if (msg.type === "param" && this.exports) {
        const id = Number(msg.id);
        const value = Number(msg.value);
        if (Number.isInteger(id) && Number.isFinite(value)) this.exports.yurika_cpp_set_param(id, value);
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    const outL = output[0];
    const outR = output[1];
    if (!outL) return true;
    const frames = Math.min(256, outL.length || 128);
    const channels = Math.max(1, Math.min(2, output.length || input.length || 1));
    const inL = input[0];
    const inR = input[1] || input[0];

    const dry = () => {
      for (let i=0;i<frames;i++) {
        const l = inL?.[i] || 0;
        const r = inR?.[i] ?? l;
        outL[i] = l;
        if (outR) outR[i] = r;
      }
    };

    if (!this.exports || !this.buffer) { dry(); return true; }
    try {
      for (let i=0;i<frames;i++) {
        this.buffer[i*2] = inL?.[i] || 0;
        this.buffer[i*2+1] = inR?.[i] ?? this.buffer[i*2];
      }
      this.exports.yurika_cpp_process(frames, channels);
      for (let i=0;i<frames;i++) {
        const l = this.buffer[i*2];
        const r = this.buffer[i*2+1];
        if (!Number.isFinite(l) || !Number.isFinite(r)) throw new Error("C++/WASM produced non-finite audio");
        outL[i] = l;
        if (outR) outR[i] = r;
      }
    } catch (error) {
      if (!this.runtimeError) {
        this.runtimeError = String(error?.message || error);
        this.port.postMessage({type:"error", error:this.runtimeError, backend:"bypass"});
      }
      dry();
    }
    return true;
  }
}

registerProcessor("yurika-cpp-wasm-dsp-v1", YurikaCppWasmDspV1);
