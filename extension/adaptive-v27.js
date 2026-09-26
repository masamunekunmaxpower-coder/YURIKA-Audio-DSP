(() => {
  "use strict";

  const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number(x) || 0));
  const EDGE_MAX_WET = Object.freeze({
    headphone:0.070, stereo:0.090, smartphone:0.040, tv:0.052, portable:0.040, multispeaker:0.090
  });

  function deriveVoiceMaterial(report = {}, settings = {}) {
    if (!settings.voiceMaterialEnabled) return { active:false, voiceConfidence:0, syntheticTendency:0, bodyDb:0, mudDb:0, presenceDb:0, airDb:0, reflectionWet:0 };
    const speech = clamp(report.speechRatio);
    const breath = clamp(report.breathRatio);
    const zcr = clamp(report.zcr);
    const stability = clamp(report.speechStability ?? 0.5);
    const rms = Math.max(0, Number(report.rms) || 0);
    const crest = Math.max(0, Number(report.crest) || 0);
    const seam = clamp(report.discontinuity);
    const amount = clamp((Number(settings.voiceMaterialAmount) || 0) / 100);
    if (rms < 0.0015 || speech < 0.10 || amount <= 0) return { active:false, voiceConfidence:0, syntheticTendency:0, bodyDb:0, mudDb:0, presenceDb:0, airDb:0, reflectionWet:0 };

    // Voice-likeness only. This intentionally does not identify a person or claim a hard Human/Vocaloid class.
    const speechScore = clamp((speech - 0.10) / 0.72);
    const zcrPenalty = clamp((zcr - 0.16) / 0.30);
    const transientPenalty = clamp((crest - 5.2) / 4.8);
    const voiceConfidence = clamp(amount * speechScore * (0.65 + 0.35 * stability) * (1 - 0.42*zcrPenalty) * (1 - 0.30*transientPenalty) * (1 - 0.35*seam));

    // A continuous "synthetic tendency" heuristic, not an identity/classification claim.
    const lowBreath = 1 - clamp(breath / 0.26);
    const lowZcr = 1 - clamp(zcr / 0.22);
    const syntheticTendency = clamp(voiceConfidence * (0.38*stability + 0.34*lowBreath + 0.28*lowZcr));
    const transparency = clamp((Number(settings.voiceTransparency) || 0) / 100);
    const air = clamp((Number(settings.voiceAir) || 0) / 100);
    const mode = ["shallow","normal","deep"].includes(settings.voiceDepthMode) ? settings.voiceDepthMode : "normal";
    const depth = mode === "deep" ? 1 : (mode === "shallow" ? -1 : 0);

    // Synthetic material gets slightly less body and slightly more de-mud/air; natural voices keep more chest/body.
    const bodyDb = voiceConfidence * (depth > 0 ? 1.10 : depth < 0 ? -0.85 : 0.10) * (1 - 0.35*syntheticTendency);
    const mudDb = -voiceConfidence * transparency * (0.55 + 0.55*syntheticTendency);
    const presenceDb = voiceConfidence * (0.15 + 0.65*transparency) * (depth < 0 ? 1.10 : depth > 0 ? 0.72 : 1.0);
    const airDb = voiceConfidence * air * (0.65 + 0.55*syntheticTendency);
    const reflectionWet = voiceConfidence * (depth > 0 ? 0.052 : depth < 0 ? 0.010 : 0.025) * (1 - 0.35*syntheticTendency);
    return { active:voiceConfidence >= 0.04, voiceConfidence, syntheticTendency, bodyDb, mudDb, presenceDb, airDb, reflectionWet };
  }

  function deriveEdgeAccent(settings = {}, report = {}, pressure = 0, seamConfidence = 0) {
    if (!settings.transientEdgeEnabled) return { active:false, wet:0, holdMs:1.0, releaseMs:12, centerHz:4800, q:0.85 };
    const amount = clamp((Number(settings.transientEdgeAmount) || 0) / 100);
    const pulse = clamp(report.pulse);
    const speech = clamp(report.speechRatio);
    const breath = clamp(report.breathRatio);
    const zcr = clamp(report.zcr);
    const safety = clamp(pressure);
    const seam = clamp(seamConfidence);
    const onset = clamp((pulse - 0.34) / 0.66);
    const sibilance = clamp((0.68*breath + 0.32*zcr) * (0.35 + 0.65*speech));
    const harshnessGuard = 1 - 0.88*sibilance;
    const seamGuard = 1 - 0.92*seam;
    const cap = EDGE_MAX_WET[settings.deviceProfile] ?? EDGE_MAX_WET.stereo;
    const wet = clamp(cap * amount * Math.pow(onset,0.72) * harshnessGuard * seamGuard * (1-safety), 0, cap);
    const tone = ["soft","focused","sharp"].includes(settings.transientEdgeTone) ? settings.transientEdgeTone : "focused";
    const centerHz = tone === "soft" ? 3600 : tone === "sharp" ? 6200 : 4800;
    const q = tone === "soft" ? 0.72 : tone === "sharp" ? 1.15 : 0.88;
    return { active:wet >= 0.0025, wet, holdMs:0.8 + 2.4*onset, releaseMs:10 + 12*onset, centerHz, q };
  }

  function hrtfProfile(name = "natural", amount = 45) {
    const t = clamp((Number(amount) || 0)/100);
    const profiles = {
      natural:{ crossfeed:0.060, delayMs:0.28, lowpassHz:5200, pinnaDb:0.35, airDb:-0.15 },
      near:{ crossfeed:0.082, delayMs:0.20, lowpassHz:4600, pinnaDb:0.18, airDb:-0.25 },
      wide:{ crossfeed:0.038, delayMs:0.42, lowpassHz:6500, pinnaDb:0.55, airDb:0.10 },
      front:{ crossfeed:0.070, delayMs:0.32, lowpassHz:5000, pinnaDb:0.70, airDb:-0.10 }
    };
    const p = profiles[name] || profiles.natural;
    return { crossfeed:p.crossfeed*t, delaySeconds:p.delayMs*t/1000, lowpassHz:p.lowpassHz, pinnaDb:p.pinnaDb*t, airDb:p.airDb*t };
  }

  globalThis.YurikaAdaptiveV27 = Object.freeze({ EDGE_MAX_WET, deriveVoiceMaterial, deriveEdgeAccent, hrtfProfile });
})();
