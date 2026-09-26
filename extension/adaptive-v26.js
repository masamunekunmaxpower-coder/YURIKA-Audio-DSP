(() => {
  "use strict";

  const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number(x) || 0));
  const DEVICE_VALLEY_MAX_DB = Object.freeze({
    headphone: 1.10, stereo: 1.25, smartphone: 0.60, tv: 0.80, portable: 0.60, multispeaker: 1.25
  });

  function deriveSeamConfidence(report = {}, settings = {}) {
    if (!settings.seamNaturalizerEnabled) return 0;
    const amount = clamp((Number(settings.seamNaturalizerAmount) || 0) / 100);
    const jump = clamp(Number(report.discontinuity) || 0);
    const speech = clamp(Number(report.speechRatio) || 0);
    const pulse = clamp(Number(report.pulse) || 0);
    const rms = Math.max(0, Number(report.rms) || 0);
    const crest = Math.max(0, Number(report.crest) || 0);
    if (rms < 0.0015 || jump < 0.08 || amount <= 0) return 0;

    const jumpScore = clamp((jump - 0.08) / 0.58);
    const speechScore = clamp((speech - 0.16) / 0.66);
    // A real percussion transient is usually high-pulse/high-crest and not strongly speech-dominant.
    const genuineTransient = clamp(((pulse - 0.46) / 0.44)) * clamp((crest - 2.5) / 4.5) * (1 - 0.72 * speechScore);
    const sparkPenalty = 1 - 0.60 * pulse;
    return clamp(amount * jumpScore * (0.28 + 0.72 * speechScore) * sparkPenalty * (1 - 0.90 * genuineTransient));
  }

  function deriveValleyProfile(settings = {}, pulse = 0, pressure = 0) {
    if (!settings.transientValleyEnabled) return { active:false, depthDb:0, attackMs:3.5, holdMs:8, releaseMs:48 };
    const amount = clamp((Number(settings.transientValleyAmount) || 0) / 100);
    const p = clamp(pulse);
    const safety = clamp(pressure);
    const active = clamp((p - 0.34) / 0.66);
    const maxDb = DEVICE_VALLEY_MAX_DB[settings.deviceProfile] ?? DEVICE_VALLEY_MAX_DB.stereo;
    const depthDb = maxDb * amount * Math.pow(active, 0.62) * (1 - safety);
    return {
      active: depthDb >= 0.06,
      depthDb: clamp(depthDb, 0, maxDb),
      attackMs: 3.5,
      holdMs: 5 + 12 * active,
      releaseMs: 34 + 34 * active
    };
  }

  function computeOrbitHealth(snapshot = {}) {
    let score = 100;
    const reasons = [];
    const penalize = (points, reason) => { score -= points; reasons.push(reason); };

    const safetyAge = Math.max(0, Number(snapshot.safetyReportAgeMs) || 0);
    const sparkAge = Math.max(0, Number(snapshot.sparkReportAgeMs) || 0);
    const sceneAge = Math.max(0, Number(snapshot.sceneTickAgeMs) || 0);
    const nonFinite = Math.max(0, Number(snapshot.nonFiniteCount) || 0);
    const peak = Math.max(0, Number(snapshot.peak) || 0);
    const limiterReduction = Number(snapshot.limiterReductionDb);
    const gainError = Math.abs(Number(snapshot.effectiveGainErrorDb) || 0);
    const timerDrift = Math.max(0, Number(snapshot.timerDriftMs) || 0);

    if (snapshot.safetyMeterExpected && safetyAge > 3000) penalize(45, "safety-stale-hard");
    else if (snapshot.safetyMeterExpected && safetyAge > 1400) penalize(18, "safety-stale");
    if (snapshot.fastMonitorExpected && sparkAge > 1000) penalize(24, "fast-monitor-stale-hard");
    else if (snapshot.fastMonitorExpected && sparkAge > 240) penalize(9, "fast-monitor-stale");
    if (snapshot.sceneExpected && sceneAge > 800) penalize(20, "scene-stale-hard");
    else if (snapshot.sceneExpected && sceneAge > 260) penalize(7, "scene-stale");
    if (nonFinite >= 4) penalize(55, "nonfinite-hard");
    else if (nonFinite > 0) penalize(24, "nonfinite");
    if (peak > 1.002) penalize(30, "over-peak");
    else if (peak > 0.992) penalize(12, "peak-pressure");
    if (Number.isFinite(limiterReduction) && limiterReduction < -6) penalize(12, "limiter-heavy");
    if (gainError > 0.35) penalize(22, "gain-invariant");
    else if (gainError > 0.12) penalize(8, "gain-drift");
    if (timerDrift > 2500) penalize(20, "supervisor-timer-drift-hard");
    else if (timerDrift > 800) penalize(6, "supervisor-timer-drift");
    if (snapshot.contextState === "suspended") penalize(12, "context-suspended");
    if (snapshot.contextState === "closed") penalize(80, "context-closed");
    if (snapshot.invalidNodeState) penalize(45, "invalid-node-state");

    return { score: clamp(score, 0, 100), reasons };
  }

  function desiredOrbitLevel(score) {
    const s = clamp(score, 0, 100);
    if (s < 40) return 4;
    if (s < 58) return 3;
    if (s < 74) return 2;
    if (s < 88) return 1;
    return 0;
  }

  globalThis.YurikaAdaptiveV26 = Object.freeze({
    DEVICE_VALLEY_MAX_DB, deriveSeamConfidence, deriveValleyProfile, computeOrbitHealth, desiredOrbitLevel
  });
})();
