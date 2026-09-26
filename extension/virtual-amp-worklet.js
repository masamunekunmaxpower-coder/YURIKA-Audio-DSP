"use strict";

class YurikaVirtualClassAProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.instance = null;
    this.exports = null;
    this.buffer = null;
    this.bufferPtr = 0;
    this.targetMix = 0;
    this.mix = 0;
    this.reportCounter = 0;
    this.runtimeError = null;
    this.model = { cubic: 0.0000600, noise: 0.00000080, crosstalk: 0.00000100 };
    try {
      const module = options?.processorOptions?.wasmModule;
      if (!module) throw new Error("WASM module missing");
      this.instance = new WebAssembly.Instance(module, {});
      this.exports = this.instance.exports;
      this.bufferPtr = Number(this.exports.amp_buffer());
      this.buffer = new Float32Array(this.exports.memory.buffer, this.bufferPtr, 512);
      this.exports.amp_reset(0x6D2B79F5);
      this.exports.amp_set_model(this.model.cubic, this.model.noise, this.model.crosstalk);
      this.port.postMessage({ type:"ready", backend:"cpp-wasm" });
    } catch (error) {
      this.runtimeError = String(error?.message || error);
      this.port.postMessage({ type:"error", error:this.runtimeError, backend:"bypass" });
    }
    this.port.onmessage = (event) => {
      const msg = event?.data || {};
      if (msg.type !== "config") return;
      this.targetMix = msg.enabled ? 1 : 0;
      if (this.exports) {
        const cubic = Number.isFinite(Number(msg.cubic)) ? Number(msg.cubic) : this.model.cubic;
        const noise = Number.isFinite(Number(msg.noise)) ? Number(msg.noise) : this.model.noise;
        const crosstalk = Number.isFinite(Number(msg.crosstalk)) ? Number(msg.crosstalk) : this.model.crosstalk;
        this.model = { cubic, noise, crosstalk };
        this.exports.amp_set_model(cubic, noise, crosstalk);
        this.exports.amp_set_enabled(1);
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    const frames = output[0]?.length || 128;
    const channels = Math.max(1, Math.min(2, output.length || input.length || 1));
    const inL = input[0];
    const inR = input[1] || input[0];
    const outL = output[0];
    const outR = output[1];
    if (!outL) return true;

    if (!this.exports || !this.buffer) {
      for (let i=0;i<frames;i++) {
        const l = inL?.[i] || 0;
        const r = inR?.[i] ?? l;
        outL[i] = l;
        if (outR) outR[i] = r;
      }
      return true;
    }

    try {
      for (let i=0;i<frames;i++) {
        this.buffer[i*2] = inL?.[i] || 0;
        this.buffer[i*2+1] = inR?.[i] ?? this.buffer[i*2];
      }
      this.exports.amp_process(frames, channels);
      // 6 ms click-free wet/dry transition, no lookahead and no permanent delay.
      const rampStep = 1 / Math.max(1, sampleRate * 0.006);
      for (let i=0;i<frames;i++) {
        if (this.mix < this.targetMix) this.mix = Math.min(this.targetMix, this.mix + rampStep);
        else if (this.mix > this.targetMix) this.mix = Math.max(this.targetMix, this.mix - rampStep);
        const dryL = inL?.[i] || 0;
        const dryR = inR?.[i] ?? dryL;
        const wetL = this.buffer[i*2];
        const wetR = this.buffer[i*2+1];
        const l = dryL + (wetL - dryL) * this.mix;
        const r = dryR + (wetR - dryR) * this.mix;
        outL[i] = Number.isFinite(l) ? l : dryL;
        if (outR) outR[i] = Number.isFinite(r) ? r : dryR;
      }
      this.reportCounter++;
      if (this.reportCounter >= 192) {
        this.reportCounter = 0;
        this.port.postMessage({type:"runtime", mix:this.mix, backend:"cpp-wasm"});
      }
    } catch (error) {
      if (!this.runtimeError) {
        this.runtimeError = String(error?.message || error);
        this.port.postMessage({type:"error", error:this.runtimeError, backend:"bypass"});
      }
      this.targetMix = 0;
      this.mix = 0;
      for (let i=0;i<frames;i++) {
        const l = inL?.[i] || 0;
        const r = inR?.[i] ?? l;
        outL[i] = l;
        if (outR) outR[i] = r;
      }
    }
    return true;
  }
}

registerProcessor("yurika-virtual-class-a", YurikaVirtualClassAProcessor);
