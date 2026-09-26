"use strict";

class YurikaSafetyMeterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.resetAccumulators();
    this.reportEveryFrames = 4096;
  }

  resetAccumulators() {
    this.frames = 0;
    this.channelCount = 0;
    this.peak = 0;
    this.sumSq = 0;
    this.sampleCount = 0;
    this.nonFiniteCount = 0;
    this.clipCount = 0;
    this.sumL = 0;
    this.sumR = 0;
    this.sumLL = 0;
    this.sumRR = 0;
    this.sumLR = 0;
    this.stereoCount = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    const channels = Math.min(input.length, output.length);
    const frames = channels ? Math.min(...input.slice(0, channels).map((ch) => ch.length)) : 0;
    this.channelCount = Math.max(this.channelCount, channels);

    for (let ch = 0; ch < output.length; ch++) {
      const out = output[ch];
      const src = input[ch];
      if (!src) {
        out.fill(0);
        continue;
      }
      for (let i = 0; i < out.length; i++) {
        let value = Number(src[i]);
        if (!Number.isFinite(value)) {
          value = 0;
          this.nonFiniteCount++;
        }
        out[i] = value;
        const abs = Math.abs(value);
        if (abs > this.peak) this.peak = abs;
        if (abs >= 0.9999) this.clipCount++;
        this.sumSq += value * value;
        this.sampleCount++;
      }
    }

    if (channels >= 2 && frames > 0) {
      const left = input[0], right = input[1];
      for (let i = 0; i < frames; i++) {
        const l0 = Number(left[i]), r0 = Number(right[i]);
        const l = Number.isFinite(l0) ? l0 : 0;
        const r = Number.isFinite(r0) ? r0 : 0;
        this.sumL += l;
        this.sumR += r;
        this.sumLL += l * l;
        this.sumRR += r * r;
        this.sumLR += l * r;
        this.stereoCount++;
      }
    }

    this.frames += frames;
    if (this.frames >= this.reportEveryFrames) {
      const rms = this.sampleCount ? Math.sqrt(this.sumSq / this.sampleCount) : 0;
      let corr = null, rmsL = null, rmsR = null, balanceDb = null;
      if (this.stereoCount > 8) {
        const n = this.stereoCount;
        const meanL = this.sumL / n;
        const meanR = this.sumR / n;
        const varL = Math.max(0, this.sumLL / n - meanL * meanL);
        const varR = Math.max(0, this.sumRR / n - meanR * meanR);
        const cov = this.sumLR / n - meanL * meanR;
        const denom = Math.sqrt(varL * varR);
        corr = denom > 1e-14 ? Math.max(-1, Math.min(1, cov / denom)) : null;
        rmsL = Math.sqrt(this.sumLL / n);
        rmsR = Math.sqrt(this.sumRR / n);
        if (rmsL > 1e-12 && rmsR > 1e-12) balanceDb = 20 * Math.log10(rmsL / rmsR);
      }
      this.port.postMessage({
        type: "stats",
        channels: this.channelCount,
        frames: this.frames,
        peak: this.peak,
        rms,
        correlation: corr,
        rmsL,
        rmsR,
        balanceDb,
        nonFiniteCount: this.nonFiniteCount,
        clipCount: this.clipCount
      });
      this.resetAccumulators();
    }
    return true;
  }
}

registerProcessor("yurika-safety-meter", YurikaSafetyMeterProcessor);
