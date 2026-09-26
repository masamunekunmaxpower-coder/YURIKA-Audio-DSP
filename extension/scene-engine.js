(() => {
  "use strict";

  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Number(v) : lo));
  const lerp = (a, b, t) => a + (b - a) * clamp(t);
  const dbToLin = (db) => Math.pow(10, db / 20);

  const DEVICE_PROFILES = Object.freeze({
    headphone:   Object.freeze({ lowCutMin:20, widthMax:82, depthMax:72, bassMax:4.0, airMax:4.0, warmBias:0.00, spatial:1.00, spark:0.90, sparkGainMaxDb:0.80, impactMax:0.20 }),
    stereo:      Object.freeze({ lowCutMin:24, widthMax:68, depthMax:60, bassMax:3.5, airMax:3.5, warmBias:0.00, spatial:0.88, spark:1.00, sparkGainMaxDb:0.80, impactMax:0.24 }),
    smartphone:  Object.freeze({ lowCutMin:72, widthMax:24, depthMax:18, bassMax:0.25, airMax:1.8, warmBias:0.55, spatial:0.34, spark:0.78, sparkGainMaxDb:0.20, impactMax:0.095 }),
    tv:          Object.freeze({ lowCutMin:48, widthMax:38, depthMax:30, bassMax:1.2, airMax:2.2, warmBias:0.25, spatial:0.52, spark:0.86, sparkGainMaxDb:0.45, impactMax:0.14 }),
    portable:    Object.freeze({ lowCutMin:55, widthMax:34, depthMax:28, bassMax:0.8, airMax:2.0, warmBias:0.35, spatial:0.48, spark:0.84, sparkGainMaxDb:0.20, impactMax:0.07 }),
    multispeaker:Object.freeze({ lowCutMin:24, widthMax:90, depthMax:84, bassMax:3.5, airMax:3.5, warmBias:0.00, spatial:1.18, spark:1.00, sparkGainMaxDb:0.80, impactMax:0.24 })
  });

  function profileFor(name) {
    return DEVICE_PROFILES[name] || DEVICE_PROFILES.stereo;
  }

  function rmsOf(timeData) {
    if (!timeData?.length) return 0;
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i];
    return Math.sqrt(sum / timeData.length);
  }

  function bandEnergy(freqData, sampleRate, lowHz, highHz) {
    if (!freqData?.length || !sampleRate) return 0;
    const nyquist = sampleRate / 2;
    const lo = Math.max(0, Math.floor((lowHz / nyquist) * freqData.length));
    const hi = Math.min(freqData.length - 1, Math.ceil((highHz / nyquist) * freqData.length));
    if (hi < lo) return 0;
    let sum = 0, n = 0;
    for (let i = lo; i <= hi; i++) {
      const db = Number(freqData[i]);
      if (!Number.isFinite(db)) continue;
      const lin = dbToLin(Math.max(-120, Math.min(0, db)));
      sum += lin * lin;
      n++;
    }
    return n ? Math.sqrt(sum / n) : 0;
  }

  function extractFeatures(freqData, timeData, sampleRate, previous = null) {
    const rms = rmsOf(timeData);
    const rmsDb = rms > 1e-9 ? 20 * Math.log10(rms) : -120;
    const sub = bandEnergy(freqData, sampleRate, 25, 90);
    const low = bandEnergy(freqData, sampleRate, 90, 320);
    const mid = bandEnergy(freqData, sampleRate, 320, 2500);
    const presence = bandEnergy(freqData, sampleRate, 2500, 7000);
    const air = bandEnergy(freqData, sampleRate, 7000, Math.min(18000, sampleRate * 0.45));
    const sum = sub + low + mid + presence + air + 1e-9;
    const lowRatio = (sub + low) / sum;
    const midRatio = mid / sum;
    const highRatio = (presence + air) / sum;
    const energy = clamp((rmsDb + 46) / 34);
    const prevRms = Number(previous?.rms) || rms;
    const transient = clamp((rms - prevRms) / Math.max(0.012, prevRms) * 2.4);
    const crest = clamp((Math.max(...timeData.map ? timeData.map(Math.abs) : Array.from(timeData || [], Math.abs)) - rms) / 0.55);
    const brightness = clamp(highRatio * 2.0);
    const density = clamp(midRatio * 1.8 + energy * 0.45);
    const confidence = clamp(0.20 + energy * 0.48 + Math.abs(highRatio - lowRatio) * 0.45, 0, 1);
    return { rms, rmsDb, sub, low, mid, presence, air, lowRatio, midRatio, highRatio, energy, transient, crest, brightness, density, confidence };
  }

  function sceneTarget(features) {
    const f = features || {};
    const coolWarm = clamp(0.5 + (f.highRatio - f.lowRatio) * 1.25);
    const open = clamp(0.28 + f.highRatio * 1.05 + f.crest * 0.18 - f.density * 0.12);
    const energy = clamp(f.energy);
    const spark = clamp(f.transient * 0.72 + f.brightness * 0.36 + f.crest * 0.22);
    const presence = clamp(f.midRatio * 1.05 + f.presence / Math.max(1e-9, f.mid + f.presence + f.air) * 0.45);
    const distance = clamp(0.55 + open * 0.25 - presence * 0.28 - energy * 0.10);
    const night = clamp(0.70 - energy * 0.58 - f.brightness * 0.16 + distance * 0.14);
    return { coolWarm, open, energy, spark, presence, distance, night };
  }

  function smoothDna(previous, target, amount) {
    const out = {};
    for (const k of ["coolWarm","open","energy","spark","presence","distance","night"]) {
      out[k] = lerp(Number(previous?.[k] ?? target[k]), target[k], amount);
    }
    return out;
  }

  function quantizedPatternId(dna) {
    const keys = ["coolWarm","open","energy","spark","presence","distance","night"];
    let id = 0;
    for (const k of keys) id = id * 5 + Math.min(4, Math.floor(clamp(dna?.[k]) * 5));
    return id; // 0..78124 => 78,125 addressable scene cells
  }

  function accentCode(dna, features) {
    const x = (dna.spark * 31 + dna.open * 23 + dna.energy * 19 + dna.night * 17 + (features?.lowRatio || 0) * 11) % 1;
    return Math.max(0, Math.min(99, Math.floor(x * 100)));
  }

  function multispeakerMap(dna, amount) {
    const t = clamp(amount / 100);
    return {
      front: clamp(0.82 + dna.presence * 0.18),
      wide: clamp((0.18 + dna.open * 0.45 + dna.spark * 0.12) * t),
      ambient: clamp((0.10 + dna.distance * 0.40 + dna.night * 0.12) * t),
      rear: clamp((0.06 + dna.distance * 0.28 + dna.open * 0.16) * t),
      height: clamp((0.04 + dna.open * 0.22 + dna.coolWarm * 0.08) * t)
    };
  }

  function deriveControls(settings, dna, features) {
    const profile = profileFor(settings.deviceProfile);
    const sceneOn = Boolean(settings.sceneEnabled);
    const sceneStrength = sceneOn ? clamp(settings.sceneStrength / 100) : 0;
    const gamma = Math.max(0.5, Math.min(2.2, Number(settings.sceneExponent) || 1.15));
    const confidence = clamp(features?.confidence ?? 0);
    const sceneWeight = sceneOn ? Math.pow(confidence * sceneStrength, gamma) : 0;
    // Scene/Multi are the slow baseline. Fast Spark is derived separately and may only add above it.
    const sparkSource = 0;
    const sparkWeight = 0;
    const sparkMakeupDb = 0;
    const multiWeight = settings.multiSpeakerEnabled ? clamp(settings.multiSpeakerAmount / 100) : 0;

    const openOffset = (dna.open - 0.5) * 42 * sceneWeight * profile.spatial;
    const multiWidth = 18 * multiWeight * (0.35 + dna.open * 0.65);
    const width = Math.min(profile.widthMax, Math.max(0, Number(settings.width) + openOffset + multiWidth));

    const depthBase = settings.perspectiveEnabled ? Number(settings.perspectiveDepth) : 0;
    const depthScene = 34 * sceneWeight * (0.45 * dna.distance + 0.55 * dna.open) * profile.spatial;
    const depthMulti = 20 * multiWeight * (0.35 + 0.65 * dna.distance);
    const perspectiveDepth = Math.min(profile.depthMax, Math.max(0, depthBase + depthScene + depthMulti));

    const detail = Math.min(100, Math.max(0, Number(settings.detail) + 8 * sceneWeight * dna.spark));
    const reality = Math.min(100, Math.max(0, Number(settings.reality) + 18 * sceneWeight * dna.distance + 12 * multiWeight));

    let lowCutHz = Math.max(Number(settings.lowCutHz), profile.lowCutMin);
    let bassDb = Math.min(Number(settings.bassDb), profile.bassMax);
    let warmthDb = Number(settings.warmthDb) + profile.warmBias + (0.5 - dna.coolWarm) * 0.65 * sceneWeight;
    let airDb = Number(settings.airDb) + (dna.coolWarm - 0.5) * 0.9 * sceneWeight + dna.open * 0.25 * sceneWeight;
    airDb = Math.min(profile.airMax, airDb);

    if (settings.deviceProfile === "smartphone") {
      lowCutHz = Math.max(lowCutHz, 72);
      bassDb = Math.min(bassDb, 0.25);
      warmthDb = Math.max(warmthDb, -0.2) + 0.35 * sceneWeight; // body proxy; do not force sub-bass boost
    }

    // Global spatial/harmonic budget: stronger parallel ambience reduces simultaneous enhancement depth.
    const spatialBudget = Math.min(1, (width / Math.max(1, profile.widthMax)) * 0.45 + (perspectiveDepth / Math.max(1, profile.depthMax)) * 0.55);
    const budgetScale = spatialBudget > 0.88 ? 0.88 / spatialBudget : 1;

    return {
      sceneWeight, sparkWeight, sparkSource, sparkMakeupDb,
      width: width * budgetScale, perspectiveDepth: perspectiveDepth * budgetScale,
      detail: detail * (0.92 + 0.08 * budgetScale), reality: reality * budgetScale,
      lowCutHz, bassDb, warmthDb, airDb,
      virtualMulti: multispeakerMap(dna, Number(settings.multiSpeakerAmount) || 0)
    };
  }


  function deriveFastSparkDelta(settings, pulse) {
    const profile = profileFor(settings.deviceProfile);
    const sparkSource = clamp(Number(pulse) || 0);
    const impactEnabled = settings.impactEnabled !== false;
    if (!settings.sparkEnabled || sparkSource <= 0) {
      return { sparkSource, sparkWeight:0, sparkMakeupDb:0, widthDelta:0, detailDelta:0, realityDelta:0, impactWeight:0, impactGain:0, compressorEscape:0 };
    }
    const amount = clamp((Number(settings.sparkAmount) || 0) / 100);
    // Ignore tiny detector motion, then expand clear attacks. Default 45 reaches roughly +0.4 dB at strong hits.
    const active = clamp((sparkSource - 0.10) / 0.90);
    const curve = Math.pow(active, 0.55);
    const sparkWeight = clamp(amount * curve * profile.spark);
    const sparkMakeupDb = Math.min(profile.sparkGainMaxDb, profile.sparkGainMaxDb * Math.pow(sparkWeight, 0.65));

    // Impact Liberation is a second, faster lane. It never cuts the baseline.
    // More masking stages being active raises the compensation slightly, but all device caps remain hard.
    const impactAmount = impactEnabled ? clamp((Number(settings.impactAmount) || 0) / 100) : 0;
    const impactCurve = Math.pow(active, 0.42);
    const masking = clamp(0.58 + (settings.compressor ? 0.24 : 0) + (settings.roomEnabled ? 0.07 : 0) + (settings.selfDapEnabled ? 0.06 : 0) + ((Number(settings.reality) || 0) / 100) * 0.05);
    const impactWeight = clamp(impactAmount * impactCurve * profile.spark * masking);
    const impactGain = Math.min(profile.impactMax, profile.impactMax * impactWeight);
    const compressorEscape = settings.compressor ? Math.min(0.92, impactWeight * 1.18) : 0;

    return {
      sparkSource, sparkWeight, sparkMakeupDb, impactWeight, impactGain, compressorEscape,
      widthDelta: 6.0 * sparkWeight,
      detailDelta: 22.0 * sparkWeight,
      realityDelta: 7.0 * sparkWeight
    };
  }


  function composeFastSparkTargets(base, delta, deviceProfile, pressure = 0) {
    const profile = profileFor(deviceProfile);
    const b = base || {};
    const d = delta || {};
    const scale = clamp(1 - clamp(Number(pressure) || 0));
    const add = (value) => Math.max(0, Number(value) || 0) * scale;
    const baseWidth = Math.max(0, Number(b.width) || 0);
    const baseDetail = Math.max(0, Number(b.detail) || 0);
    const baseReality = Math.max(0, Number(b.reality) || 0);
    return {
      width: Math.min(profile.widthMax, Math.max(baseWidth, baseWidth + add(d.widthDelta))),
      detail: Math.min(100, Math.max(baseDetail, baseDetail + add(d.detailDelta))),
      reality: Math.min(100, Math.max(baseReality, baseReality + add(d.realityDelta))),
      sparkMakeupDb: add(d.sparkMakeupDb),
      impactGain: Math.min(profile.impactMax, add(d.impactGain)),
      compressorEscape: Math.min(0.92, add(d.compressorEscape)),
      impactWeight: add(d.impactWeight)
    };
  }

  function updateRuntime(previous, freqData, timeData, sampleRate, settings, dtSeconds = 0.05) {
    const features = extractFeatures(freqData, timeData, sampleRate, previous?.features);
    const target = sceneTarget(features);
    const inertia = clamp((Number(settings.sceneInertia) || 65) / 100);
    const tau = 0.18 + inertia * 3.8;
    const alpha = 1 - Math.exp(-Math.max(0.01, dtSeconds) / tau);
    const dna = smoothDna(previous?.dna, target, alpha);
    const patternId = quantizedPatternId(dna);
    const accent = accentCode(dna, features);
    const controls = deriveControls(settings, dna, features);
    return { features, dna, patternId, accent, controls, updatedAt: Date.now() };
  }

  globalThis.YurikaSceneEngine = Object.freeze({
    DEVICE_PROFILES, profileFor, extractFeatures, sceneTarget, quantizedPatternId, accentCode,
    multispeakerMap, deriveControls, deriveFastSparkDelta, composeFastSparkTargets, updateRuntime
  });
})();
