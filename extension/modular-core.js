(() => {
  "use strict";

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v)));
  const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const dbToGain = (db) => Math.pow(10, finite(db) / 20);
  const gainToDb = (g) => g > 0 ? 20 * Math.log10(g) : -120;

  const DAC_MATRIX_MODES = Object.freeze(["off","neutral","akm-inspired","ess-inspired","ti-slow-inspired","fusion"]);
  const ROOM_MODES = Object.freeze(["off","absorption","diffusion","bass-control","balanced"]);
  const INTEGRITY_MODES = Object.freeze(["off","transparent","network-stable","ground-reference","stabilizer"]);
  const CARTRIDGE_MODES = Object.freeze(["off","a","b","c","mix","ab-split"]);

  function normalizedWeights(a, b, c) {
    const raw = [Math.max(0, finite(a)), Math.max(0, finite(b)), Math.max(0, finite(c))];
    const sum = raw[0] + raw[1] + raw[2];
    if (sum <= 0) return [1/3, 1/3, 1/3];
    return raw.map((x) => x / sum);
  }

  function dacMatrixProfile(mode, strength = 50, akm = 34, ess = 33, ti = 33) {
    const m = DAC_MATRIX_MODES.includes(mode) ? mode : "off";
    const t = clamp(finite(strength), 0, 100) / 100;
    const profiles = {
      off: { lowDb:0, presenceDb:0, highDb:0, harmonic:0, preDb:0, drive:1, cutoffHz:22000, q:0.707 },
      neutral: { lowDb:0, presenceDb:0, highDb:0, harmonic:0.002, preDb:-0.05, drive:1.03, cutoffHz:21000, q:0.707 },
      "akm-inspired": { lowDb:0.18, presenceDb:-0.08, highDb:0.12, harmonic:0.006, preDb:-0.18, drive:1.07, cutoffHz:20500, q:0.68 },
      "ess-inspired": { lowDb:-0.05, presenceDb:0.20, highDb:0.22, harmonic:0.004, preDb:-0.20, drive:1.05, cutoffHz:21500, q:0.82 },
      "ti-slow-inspired": { lowDb:0.10, presenceDb:-0.12, highDb:-0.20, harmonic:0.003, preDb:-0.15, drive:1.04, cutoffHz:19500, q:0.58 }
    };
    if (m !== "fusion") {
      const p = profiles[m];
      return Object.freeze({ mode:m, strength:t, lowDb:p.lowDb*t, presenceDb:p.presenceDb*t, highDb:p.highDb*t,
        harmonic:p.harmonic*t, preDb:p.preDb*t, drive:1+(p.drive-1)*t, cutoffHz:p.cutoffHz, q:p.q });
    }
    const [wa,we,wt] = normalizedWeights(akm,ess,ti);
    const pa = profiles["akm-inspired"], pe = profiles["ess-inspired"], pt = profiles["ti-slow-inspired"];
    const mix = (key) => pa[key]*wa + pe[key]*we + pt[key]*wt;
    return Object.freeze({ mode:m, strength:t, weights:{akm:wa,ess:we,ti:wt}, lowDb:mix("lowDb")*t,
      presenceDb:mix("presenceDb")*t, highDb:mix("highDb")*t, harmonic:mix("harmonic")*t,
      preDb:mix("preDb")*t, drive:1+(mix("drive")-1)*t, cutoffHz:mix("cutoffHz"), q:mix("q") });
  }

  function roomProfile(mode, amount = 35) {
    const m = ROOM_MODES.includes(mode) ? mode : "off";
    const t = clamp(finite(amount), 0, 100) / 100;
    const p = {
      off: { wet:0, directDb:0, lowDb:0, highDb:0, predelayMs:8, decayMs:32, diffusion:0 },
      absorption: { wet:0.028, directDb:-0.05, lowDb:-0.10, highDb:-0.45, predelayMs:6, decayMs:20, diffusion:0.20 },
      diffusion: { wet:0.060, directDb:-0.12, lowDb:0.00, highDb:-0.10, predelayMs:11, decayMs:46, diffusion:0.85 },
      "bass-control": { wet:0.025, directDb:-0.05, lowDb:-0.65, highDb:0, predelayMs:7, decayMs:24, diffusion:0.25 },
      balanced: { wet:0.045, directDb:-0.10, lowDb:-0.25, highDb:-0.22, predelayMs:9, decayMs:35, diffusion:0.55 }
    }[m];
    return Object.freeze({ mode:m, amount:t, enabled:m!=="off" && t>0, wet:p.wet*t, directDb:p.directDb*t,
      lowDb:p.lowDb*t, highDb:p.highDb*t, predelaySeconds:p.predelayMs/1000, decaySeconds:p.decayMs/1000, diffusion:p.diffusion*t });
  }

  function integrityProfile(mode, strength = 50) {
    const m = INTEGRITY_MODES.includes(mode) ? mode : "off";
    const t = clamp(finite(strength),0,100)/100;
    const base = {
      off: { dcBlockHz:0, smoothing:0.04, watchdog:false, softGuard:false },
      transparent: { dcBlockHz:0, smoothing:0.06, watchdog:true, softGuard:false },
      "network-stable": { dcBlockHz:3.5, smoothing:0.08, watchdog:true, softGuard:false },
      "ground-reference": { dcBlockHz:5.0, smoothing:0.10, watchdog:true, softGuard:true },
      stabilizer: { dcBlockHz:5.0, smoothing:0.14, watchdog:true, softGuard:true }
    }[m];
    return Object.freeze({ mode:m, enabled:m!=="off", strength:t, dcBlockHz:base.dcBlockHz,
      smoothingSeconds:base.smoothing*(0.65+0.7*t), watchdog:base.watchdog, softGuard:base.softGuard });
  }

  // Generic post-ADC loading-response model. It cannot reproduce the physical R/L/C interaction of a real cartridge
  // without the cartridge's electrical parameters. The mapping is intentionally bounded and conservative.
  function cartridgeProfile(resistanceOhm = 47000, capacitancePf = 100, gainDb = 0) {
    const r = clamp(finite(resistanceOhm,47000), 900, 100000);
    const c = clamp(finite(capacitancePf,100), 0, 1000);
    const rNorm = Math.log(r / 47000) / Math.log(100000 / 900);
    const cNorm = (c - 100) / 900;
    const highShelfDb = clamp(1.25*rNorm - 1.35*cNorm, -2.0, 1.2);
    const resonanceHz = clamp(11500 - c*6.0 + rNorm*1400, 5500, 14500);
    const resonanceDb = clamp(0.75*rNorm - 0.55*cNorm, -1.2, 0.9);
    return Object.freeze({ resistanceOhm:r, capacitancePf:c, gainDb:clamp(finite(gainDb),-12,12),
      highShelfDb, resonanceHz, resonanceDb, q:0.72 });
  }

  function cartridgeMixGains(a,b,c) {
    const [wa,wb,wc] = normalizedWeights(a,b,c);
    // Correlated branches can be nearly identical. Sum-normalized weights keep a unity signal at unity.
    return Object.freeze({ a:wa, b:wb, c:wc });
  }

  function equalPowerCrossfade(position = 0) {
    const p = clamp(finite(position), -100, 100);
    const x = (p + 100) / 200;
    return Object.freeze({ a:Math.cos(x*Math.PI/2), b:Math.sin(x*Math.PI/2), position:p });
  }

  function autoLevelTarget(profile, custom = -20) {
    const table = { quiet:-24, reference:-20, dj:-16, custom:clamp(finite(custom,-20),-30,-12) };
    return Object.prototype.hasOwnProperty.call(table, profile) ? table[profile] : -20;
  }

  function autoLevelCorrection({ measuredDbfs=-120, targetDbfs=-20, currentDb=0, maxBoostDb=6, maxCutDb=12, deadbandDb=0.5 } = {}) {
    const m = finite(measuredDbfs,-120), t = finite(targetDbfs,-20), cur = finite(currentDb,0);
    if (m < -70) return cur;
    const delta = t - m;
    if (Math.abs(delta) <= deadbandDb) return cur;
    const desired = clamp(delta, -Math.abs(maxCutDb), Math.abs(maxBoostDb));
    // bounded slew target; runtime will apply smoothing
    return clamp(desired, -Math.abs(maxCutDb), Math.abs(maxBoostDb));
  }

  function composeEffectiveLevelDb({ autoLevelEnabled=false, autoLevelDb=0, sparkEnabled=false, sparkMakeupDb=0, minDb=-12, maxDb=6.8 } = {}) {
    const base = autoLevelEnabled ? clamp(finite(autoLevelDb), -12, 6) : 0;
    const spark = sparkEnabled ? Math.max(0, finite(sparkMakeupDb)) : 0;
    return clamp(base + spark, finite(minDb,-12), finite(maxDb,6.8));
  }

  globalThis.YurikaModularCore = Object.freeze({
    DAC_MATRIX_MODES, ROOM_MODES, INTEGRITY_MODES, CARTRIDGE_MODES,
    clamp, finite, dbToGain, gainToDb, normalizedWeights, dacMatrixProfile, roomProfile, integrityProfile,
    cartridgeProfile, cartridgeMixGains, equalPowerCrossfade, autoLevelTarget, autoLevelCorrection, composeEffectiveLevelDb
  });
})();
