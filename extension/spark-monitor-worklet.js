"use strict";

class YurikaSparkMonitorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = Number.isFinite(sampleRate) ? sampleRate : 48000;
    const coeff = (ms) => Math.exp(-1 / Math.max(1, sr * ms / 1000));
    this.fastAttack = coeff(2.0);
    this.fastRelease = coeff(25.0);
    this.slowAttack = coeff(35.0);
    this.slowRelease = coeff(160.0);
    this.pulseRelease = coeff(45.0);
    this.lp300Coeff = Math.exp(-2 * Math.PI * 300 / sr);
    this.lp5000Coeff = Math.exp(-2 * Math.PI * Math.min(5000, sr * 0.20) / sr);
    this.fastPower = 0;
    this.slowPower = 0;
    this.pulse = 0;
    this.lp300 = 0;
    this.lp5000 = 0;
    this.prevMono = 0;
    this.prevSign = 0;
    this.resetBlock();
    this.framesSinceReport = 0;
    this.normalReportEveryFrames = Math.max(128, Math.round((sr * 0.008) / 128) * 128); // ~8 ms
    this.fastReportEveryFrames = Math.max(128, Math.round((sr * 0.004) / 128) * 128); // ~4 ms when Edge Accent is armed
    this.reportEveryFrames = this.normalReportEveryFrames;
    this.fastEdge = false;
    this.previousSpeechRatio = 0;
    this.active = false;
    this.port.onmessage = (event) => {
      const active = Boolean(event?.data?.active);
      this.fastEdge = Boolean(event?.data?.fastEdge);
      this.reportEveryFrames = this.fastEdge ? this.fastReportEveryFrames : this.normalReportEveryFrames;
      if (active && !this.active) {
        this.fastPower = 0; this.slowPower = 0; this.pulse = 0;
        this.lp300 = 0; this.lp5000 = 0; this.prevMono = 0; this.prevSign = 0; this.previousSpeechRatio = 0;
        this.framesSinceReport = 0; this.resetBlock();
      }
      this.active = active;
    };
  }

  resetBlock() {
    this.blockPeak = 0;
    this.blockSumSq = 0;
    this.blockSpeechSq = 0;
    this.blockHighSq = 0;
    this.blockSamples = 0;
    this.blockDiffPeak = 0;
    this.blockDiffSumSq = 0;
    this.blockZeroCrossings = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    const channels = input.length;
    const frames = channels ? input[0].length : (output[0]?.length || 128);

    // Monitor-only side-chain. It never contributes signal to the audible graph.
    for (const out of output) out.fill(0);
    if (!this.active) return true;

    for (let i = 0; i < frames; i++) {
      let magnitude = 0;
      let mono = 0;
      for (let ch = 0; ch < channels; ch++) {
        const value = Number(input[ch]?.[i]);
        const finite = Number.isFinite(value) ? value : 0;
        mono += finite;
        const abs = Math.abs(finite);
        if (abs > magnitude) magnitude = abs;
      }
      mono = channels ? mono / channels : 0;

      const power = magnitude * magnitude;
      const fastCoeff = power > this.fastPower ? this.fastAttack : this.fastRelease;
      const slowCoeff = power > this.slowPower ? this.slowAttack : this.slowRelease;
      this.fastPower = fastCoeff * this.fastPower + (1 - fastCoeff) * power;
      this.slowPower = slowCoeff * this.slowPower + (1 - slowCoeff) * power;

      const fastEnv = Math.sqrt(Math.max(0, this.fastPower));
      const slowEnv = Math.sqrt(Math.max(0, this.slowPower));
      const delta = Math.max(0, fastEnv - slowEnv);
      const normalized = delta / Math.max(0.008, slowEnv + 0.004);
      const target = Math.max(0, Math.min(1, (normalized - 0.24) * 4.0));
      this.pulse = target > this.pulse ? target : this.pulseRelease * this.pulse;

      this.lp300 = this.lp300Coeff * this.lp300 + (1 - this.lp300Coeff) * mono;
      this.lp5000 = this.lp5000Coeff * this.lp5000 + (1 - this.lp5000Coeff) * mono;
      const speechBand = this.lp5000 - this.lp300;
      const highBand = mono - this.lp5000;
      const diff = Math.abs(mono - this.prevMono);
      if (diff > this.blockDiffPeak) this.blockDiffPeak = diff;
      this.blockDiffSumSq += diff * diff;
      const sign = mono > 1e-6 ? 1 : (mono < -1e-6 ? -1 : 0);
      if (sign && this.prevSign && sign !== this.prevSign) this.blockZeroCrossings++;
      if (sign) this.prevSign = sign;
      this.prevMono = mono;

      if (magnitude > this.blockPeak) this.blockPeak = magnitude;
      this.blockSumSq += magnitude * magnitude;
      this.blockSpeechSq += speechBand * speechBand;
      this.blockHighSq += highBand * highBand;
      this.blockSamples++;
    }

    this.framesSinceReport += frames;
    if (this.framesSinceReport >= this.reportEveryFrames) {
      const n = Math.max(1, this.blockSamples);
      const rms = Math.sqrt(this.blockSumSq / n);
      const crest = rms > 1e-7 ? this.blockPeak / rms : 0;
      const diffRms = Math.sqrt(this.blockDiffSumSq / n);
      // Isolated one-sample-ish derivative spikes are more splice-like than sustained HF energy.
      const diffExcess = Math.max(0, this.blockDiffPeak - 2.35 * diffRms);
      const discontinuity = Math.max(0, Math.min(1, diffExcess / Math.max(0.010, rms * 2.8 + 0.004)));
      const speechRatio = Math.max(0, Math.min(1, this.blockSpeechSq / Math.max(1e-12, this.blockSumSq)));
      const breathRatio = Math.max(0, Math.min(1, this.blockHighSq / Math.max(1e-12, this.blockSumSq)));
      const speechStability = Math.max(0, Math.min(1, 1 - Math.abs(speechRatio - this.previousSpeechRatio) * 2.2));
      this.previousSpeechRatio = speechRatio;
      const zcr = Math.max(0, Math.min(1, this.blockZeroCrossings / n));
      this.port.postMessage({
        type: "spark",
        pulse: Math.max(0, Math.min(1, this.pulse)),
        fastEnv: Math.sqrt(Math.max(0, this.fastPower)),
        slowEnv: Math.sqrt(Math.max(0, this.slowPower)),
        peak: this.blockPeak,
        rms,
        crest,
        discontinuity,
        speechRatio,
        breathRatio,
        speechStability,
        zcr,
        frames: this.framesSinceReport
      });
      this.framesSinceReport = 0;
      this.resetBlock();
    }
    return true;
  }
}

registerProcessor("yurika-spark-monitor", YurikaSparkMonitorProcessor);
