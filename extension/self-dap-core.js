(() => {
  "use strict";

  const RESTORATION_MODES = Object.freeze(["off", "auto", "on"]);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));

  function profile(strength, restorationCutoffKhz = 14) {
    const t = clamp(strength, 0, 100) / 100;
    const cutoffKhz = clamp(restorationCutoffKhz, 9, 18);
    return Object.freeze({
      // The main YURIKA low-cut already provides sub-bass protection. Keep only a
      // fixed 5 Hz side DC/subsonic guard so Self-DAP does not collapse audible bass stereo.
      sideHpfHz: 5,
      sideHpfQ: Math.SQRT1_2, // Conventional Q; converted to Web Audio dB at the node boundary.
      sideDelaySeconds: 0, // Preserve inter-channel phase; no side-only delay.
      sidePresenceHz: 6000,
      sidePresenceQ: 0.55,
      sideGainDb: 1.0 * t,
      restorationCutoffHz: cutoffKhz * 1000,
      restorationWet: 0.22 * t,
      restorationDrive: 1 + 0.30 * t,
      bufferHarmonic: 0.006 * t,
      bufferDrive: 1 + 0.06 * t,
      abHarmonic: 0.009 * t,
      abDrive: 1 + 0.10 * t,
      preGainDb: -1.4 * t,
      limiterThresholdDb: -0.5,
      limiterAttackSeconds: 0.0003,
      limiterReleaseSeconds: 0.05
    });
  }

  function normalizeBands(raw = {}) {
    const n = (key, fallback = -120) => Number.isFinite(Number(raw[key])) ? Number(raw[key]) : fallback;
    return {
      b12_14: n("b12_14"), b14_16: n("b14_16"), b16_18: n("b16_18"), b18_20: n("b18_20"),
      overall: n("overall")
    };
  }

  function restorationDecision(mode, rawBands = {}) {
    const safeMode = RESTORATION_MODES.includes(mode) ? mode : "auto";
    if (safeMode === "off") return { active:false, reason:"off", score:0 };
    if (safeMode === "on") return { active:true, reason:"forced", score:1 };
    const b = normalizeBands(rawBands);
    if (b.overall < -72 || b.b14_16 < -78) return { active:false, reason:"low-signal", score:0 };
    const cliff = b.b14_16 - b.b18_20;
    const tail = b.b16_18 - b.b18_20;
    const transientProxy = b.b12_14 - b.b18_20;
    const score = Math.max(0, Math.min(1, (cliff - 5) / 10 + Math.max(0, tail - 2) / 16 + Math.max(0, transientProxy - 6) / 30));
    return { active: cliff >= 8 && tail >= 2, reason: cliff >= 8 && tail >= 2 ? "high-band-rolloff" : "spectrum-intact", score };
  }

  function bandAverageDb(freqData, sampleRate, lowHz, highHz) {
    if (!freqData || !freqData.length || !Number.isFinite(sampleRate) || sampleRate <= 0 ||
        !Number.isFinite(lowHz) || !Number.isFinite(highHz) || highHz <= lowHz) return -120;
    const binHz = (sampleRate / 2) / freqData.length;
    const lo = Math.max(0, Math.ceil(lowHz / binHz));
    const hi = Math.min(freqData.length - 1, Math.ceil(highHz / binHz) - 1);
    if (hi < lo) return -120;
    let power = 0, count = 0;
    for (let i = lo; i <= hi; i++) {
      const db = Number(freqData[i]);
      // -Infinity is a valid silent FFT bin and must remain in the divisor.
      if (db !== -Infinity && !Number.isFinite(db)) return -120;
      power += db === -Infinity ? 0 : Math.pow(10, db / 10); count++;
    }
    return count && Number.isFinite(power) ? 10 * Math.log10(Math.max(1e-12, power / count)) : -120;
  }

  function spectrumBands(freqData, sampleRate) {
    return {
      b12_14: bandAverageDb(freqData, sampleRate, 12000, 14000),
      b14_16: bandAverageDb(freqData, sampleRate, 14000, 16000),
      b16_18: bandAverageDb(freqData, sampleRate, 16000, 18000),
      b18_20: bandAverageDb(freqData, sampleRate, 18000, 20000),
      overall: bandAverageDb(freqData, sampleRate, 1000, Math.min(20000, sampleRate * 0.45))
    };
  }

  globalThis.YurikaSelfDap = Object.freeze({
    RESTORATION_MODES, profile, normalizeBands, restorationDecision, bandAverageDb, spectrumBands
  });
})();
