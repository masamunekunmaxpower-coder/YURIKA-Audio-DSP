"use strict";

class YurikaNoiseSuppressor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.strength = 0;
    this.envelope = 0;
    this.gainState = 1;
    this.port.onmessage = (event) => {
      const n = Number(event.data?.strength);
      this.strength = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.length || !output?.length) return true;

    const frames = output[0]?.length || 128;
    const t = this.strength / 100;
    const thresholdDb = -62 + 14 * t;
    const threshold = Math.pow(10, thresholdDb / 20);
    const minGain = Math.pow(10, (-12 * t) / 20);
    const envAttack = Math.exp(-1 / (sampleRate * 0.006));
    const envRelease = Math.exp(-1 / (sampleRate * 0.180));
    const openCoeff = Math.exp(-1 / (sampleRate * 0.010));
    const closeCoeff = Math.exp(-1 / (sampleRate * 0.220));

    for (let i = 0; i < frames; i++) {
      let level = 0;
      for (let ch = 0; ch < input.length; ch++) {
        const sample = input[ch]?.[i] || 0;
        level = Math.max(level, Math.abs(sample));
      }
      const envCoeff = level > this.envelope ? envAttack : envRelease;
      this.envelope = envCoeff * this.envelope + (1 - envCoeff) * level;

      let target = 1;
      if (t > 0 && this.envelope < threshold) {
        const ratio = Math.max(0, Math.min(1, this.envelope / Math.max(threshold, 1e-8)));
        target = minGain + (1 - minGain) * Math.pow(ratio, 0.75);
      }
      const gCoeff = target > this.gainState ? openCoeff : closeCoeff;
      this.gainState = gCoeff * this.gainState + (1 - gCoeff) * target;

      for (let ch = 0; ch < output.length; ch++) {
        output[ch][i] = (input[ch]?.[i] || 0) * this.gainState;
      }
    }
    return true;
  }
}

registerProcessor("yurika-noise-suppressor", YurikaNoiseSuppressor);
