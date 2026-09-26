(() => {
  "use strict";

  const DAP_MODES = Object.freeze(["off", "reference", "warm", "natural", "tube"]);
  const SETTINGS_SCHEMA_VERSION = 16;
  const SETTINGS_KEYS = Object.freeze([
    "enabled","preset","lowCutHz","bassDb","warmthDb","clarityDb","airDb","outputDb","compressor",
    "detail","width","reality","noiseReduction","spectralFill","hiResMode",
    "dapMode","dapStrength","selfDapEnabled","selfDapStrength","selfDapRestoration","selfDapRestorationCutoffKhz",
    "perspectiveEnabled","perspectiveDepth","spatialEnabled","spatialMode","spatialDeviceProfile","spatialOutputTarget","spatialOutputDeviceId","spatialOutputLabel","virtualAmpEnabled","adaptiveSafetyEnabled",
    "sceneEnabled","sceneStrength","sceneExponent","sceneInertia","sparkEnabled","sparkAmount","impactEnabled","impactAmount","seamNaturalizerEnabled","seamNaturalizerAmount","transientValleyEnabled","transientValleyAmount","transientEdgeEnabled","transientEdgeAmount","transientEdgeTone","orbitKeeperEnabled","deviceProfile","multiSpeakerEnabled","multiSpeakerAmount",
    "voiceMaterialEnabled","voiceMaterialAmount","voiceDepthMode","voiceTransparency","voiceAir",
    "headphoneCorrectionEnabled","headphoneModel","headphoneCorrectionStrength","headphoneCalibrationEnabled","headphoneCalibrationStrength","headphoneCalibrationGainsDb","headphoneOutputDeviceId","headphoneOutputLabel","headphoneCalibrationMode","hrtfEnabled","hrtfProfile","hrtfAmount",
    "spatialTelemetryEnabled","reflectionCharacterEnabled","reflectionCharacterAmount","reflectionCharacterMode","avSyncEnabled","avSyncDelayMs",
    "dacMatrixMode","dacMatrixStrength","dacAkmWeight","dacEssWeight","dacTiWeight",
    "roomEnabled","roomMode","roomAmount",
    "integrityEnabled","integrityMode","integrityStrength",
    "autoLevelEnabled","autoLevelProfile","autoLevelTargetDbfs",
    "djEnabled","djCrossfader","djAutoMixSeconds","deckAGainDb","deckBGainDb","deckALowDb","deckAMidDb","deckAHighDb","deckBLowDb","deckBMidDb","deckBHighDb",
    "cartridgeEnabled","cartridgeMode","cartridgeAResistance","cartridgeACapacitance","cartridgeAGainDb",
    "cartridgeBResistance","cartridgeBCapacitance","cartridgeBGainDb",
    "cartridgeCResistance","cartridgeCCapacitance","cartridgeCGainDb",
    "cartridgeMixA","cartridgeMixB","cartridgeMixC"
  ]);
  const PRESET_AUDIO_KEYS = Object.freeze([
    "lowCutHz","bassDb","warmthDb","clarityDb","airDb","outputDb","compressor",
    "detail","width","reality","noiseReduction","spectralFill","hiResMode"
  ]);
  const VIRTUAL_DAP_KEYS = Object.freeze(["dapMode","dapStrength"]);
  const SELF_DAP_KEYS = Object.freeze(["selfDapEnabled","selfDapStrength","selfDapRestoration","selfDapRestorationCutoffKhz"]);
  const PERSPECTIVE_KEYS = Object.freeze(["perspectiveEnabled","perspectiveDepth"]);
  const SPATIAL_KEYS = Object.freeze(["spatialEnabled","spatialMode","spatialDeviceProfile","spatialOutputTarget","spatialOutputDeviceId","spatialOutputLabel"]);
  const VIRTUAL_AMP_KEYS = Object.freeze(["virtualAmpEnabled"]);
  const SAFETY_KEYS = Object.freeze(["adaptiveSafetyEnabled","autoLevelEnabled","autoLevelProfile","autoLevelTargetDbfs"]);
  const SCENE_KEYS = Object.freeze(["sceneEnabled","sceneStrength","sceneExponent","sceneInertia","sparkEnabled","sparkAmount","impactEnabled","impactAmount","seamNaturalizerEnabled","seamNaturalizerAmount","transientValleyEnabled","transientValleyAmount","transientEdgeEnabled","transientEdgeAmount","transientEdgeTone","orbitKeeperEnabled","deviceProfile","multiSpeakerEnabled","multiSpeakerAmount",
    "voiceMaterialEnabled","voiceMaterialAmount","voiceDepthMode","voiceTransparency","voiceAir","headphoneCorrectionEnabled","headphoneModel","headphoneCorrectionStrength","headphoneCalibrationEnabled","headphoneCalibrationStrength","headphoneCalibrationGainsDb","headphoneOutputDeviceId","headphoneOutputLabel","headphoneCalibrationMode","hrtfEnabled","hrtfProfile","hrtfAmount","spatialTelemetryEnabled","reflectionCharacterEnabled","reflectionCharacterAmount","reflectionCharacterMode","avSyncEnabled","avSyncDelayMs"]);
  const DAC_MATRIX_KEYS = Object.freeze(["dacMatrixMode","dacMatrixStrength","dacAkmWeight","dacEssWeight","dacTiWeight"]);
  const ROOM_KEYS = Object.freeze(["roomEnabled","roomMode","roomAmount"]);
  const INTEGRITY_KEYS = Object.freeze(["integrityEnabled","integrityMode","integrityStrength"]);
  const DJ_KEYS = Object.freeze(["djEnabled","djCrossfader","djAutoMixSeconds","deckAGainDb","deckBGainDb","deckALowDb","deckAMidDb","deckAHighDb","deckBLowDb","deckBMidDb","deckBHighDb"]);
  const CARTRIDGE_KEYS = Object.freeze(["cartridgeEnabled","cartridgeMode","cartridgeAResistance","cartridgeACapacitance","cartridgeAGainDb","cartridgeBResistance","cartridgeBCapacitance","cartridgeBGainDb","cartridgeCResistance","cartridgeCCapacitance","cartridgeCGainDb","cartridgeMixA","cartridgeMixB","cartridgeMixC"]);
  const SYSTEM_PRESET_NAMES = Object.freeze(["selfdap"]);
  const MANUAL_EDIT_KEYS = Object.freeze(SETTINGS_KEYS.filter((key) => key !== "enabled" && key !== "preset"));

  const DEFAULTS = Object.freeze({
    enabled: false,
    preset: "clean",
    lowCutHz: 35,
    bassDb: 1.5,
    warmthDb: -0.5,
    clarityDb: 1.5,
    airDb: 1.0,
    outputDb: 0,
    compressor: true,
    detail: 25,
    width: 15,
    reality: 10,
    noiseReduction: 15,
    spectralFill: 20,
    hiResMode: false,
    dapMode: "off",
    dapStrength: 35,
    selfDapEnabled: false,
    selfDapStrength: 65,
    selfDapRestoration: "auto",
    selfDapRestorationCutoffKhz: 14,
    perspectiveEnabled: false,
    perspectiveDepth: 35,
    spatialEnabled: false,
    spatialMode: "auto",
    spatialDeviceProfile: "auto",
    spatialOutputTarget: "local",
    spatialOutputDeviceId: "",
    spatialOutputLabel: "",
    virtualAmpEnabled: true,
    adaptiveSafetyEnabled: true,
    sceneEnabled: false,
    sceneStrength: 55,
    sceneExponent: 1.15,
    sceneInertia: 65,
    sparkEnabled: false,
    sparkAmount: 45,
    impactEnabled: true,
    impactAmount: 65,
    seamNaturalizerEnabled: true,
    seamNaturalizerAmount: 55,
    transientValleyEnabled: true,
    transientValleyAmount: 45,
    transientEdgeEnabled: false,
    transientEdgeAmount: 35,
    transientEdgeTone: "focused",
    orbitKeeperEnabled: true,
    voiceMaterialEnabled: false,
    voiceMaterialAmount: 55,
    voiceDepthMode: "normal",
    voiceTransparency: 45,
    voiceAir: 35,
    headphoneCorrectionEnabled: false,
    headphoneModel: "generic-neutral",
    headphoneCorrectionStrength: 100,
    headphoneCalibrationEnabled: false,
    headphoneCalibrationStrength: 100,
    headphoneCalibrationGainsDb: Object.freeze([0,0,0,0,0,0,0,0]),
    headphoneOutputDeviceId: "",
    headphoneOutputLabel: "",
    headphoneCalibrationMode: "profile-only",
    hrtfEnabled: false,
    hrtfProfile: "natural",
    hrtfAmount: 45,
    spatialTelemetryEnabled: true,
    reflectionCharacterEnabled: false,
    reflectionCharacterAmount: 35,
    reflectionCharacterMode: "balanced",
    avSyncEnabled: false,
    avSyncDelayMs: 0,
    deviceProfile: "stereo",
    multiSpeakerEnabled: false,
    multiSpeakerAmount: 45,
    dacMatrixMode: "off",
    dacMatrixStrength: 50,
    dacAkmWeight: 34,
    dacEssWeight: 33,
    dacTiWeight: 33,
    roomEnabled: false,
    roomMode: "balanced",
    roomAmount: 30,
    integrityEnabled: true,
    integrityMode: "transparent",
    integrityStrength: 50,
    autoLevelEnabled: false,
    autoLevelProfile: "reference",
    autoLevelTargetDbfs: -20,
    djEnabled: false,
    djCrossfader: 0,
    djAutoMixSeconds: 8,
    deckAGainDb: 0,
    deckBGainDb: 0,
    deckALowDb: 0, deckAMidDb: 0, deckAHighDb: 0,
    deckBLowDb: 0, deckBMidDb: 0, deckBHighDb: 0,
    cartridgeEnabled: false,
    cartridgeMode: "a",
    cartridgeAResistance: 47000, cartridgeACapacitance: 100, cartridgeAGainDb: 0,
    cartridgeBResistance: 23000, cartridgeBCapacitance: 220, cartridgeBGainDb: 0,
    cartridgeCResistance: 15000, cartridgeCCapacitance: 330, cartridgeCGainDb: 0,
    cartridgeMixA: 100, cartridgeMixB: 0, cartridgeMixC: 0
  });

  // Normal presets affect only the tone/engine layer. Virtual DAP and Self DAP are independent layers.
  // `selfdap` is the only explicit system preset and may configure all three layers when selected directly.
  const PRESETS = Object.freeze({
    flat: Object.freeze({ lowCutHz:5,bassDb:0,warmthDb:0,clarityDb:0,airDb:0,outputDb:0,compressor:false,detail:0,width:0,reality:0,noiseReduction:0,spectralFill:0,hiResMode:false }),
    clean: Object.freeze({ lowCutHz:35,bassDb:1.5,warmthDb:-0.5,clarityDb:1.5,airDb:1.0,outputDb:0,compressor:true,detail:25,width:15,reality:10,noiseReduction:15,spectralFill:20,hiResMode:false }),
    music: Object.freeze({ lowCutHz:28,bassDb:2.0,warmthDb:0.5,clarityDb:0.8,airDb:1.5,outputDb:-0.8,compressor:false,detail:35,width:35,reality:25,noiseReduction:10,spectralFill:30,hiResMode:false }),
    voice: Object.freeze({ lowCutHz:70,bassDb:-1,warmthDb:-1.5,clarityDb:3.0,airDb:1.2,outputDb:-0.8,compressor:true,detail:35,width:8,reality:5,noiseReduction:35,spectralFill:15,hiResMode:false }),
    night: Object.freeze({ lowCutHz:35,bassDb:0.5,warmthDb:0,clarityDb:1.0,airDb:0.2,outputDb:-2.0,compressor:true,detail:15,width:18,reality:8,noiseReduction:45,spectralFill:10,hiResMode:false }),
    studio: Object.freeze({ lowCutHz:25,bassDb:1.0,warmthDb:0.2,clarityDb:1.2,airDb:1.3,outputDb:-1.0,compressor:false,detail:45,width:25,reality:18,noiseReduction:20,spectralFill:35,hiResMode:true }),
    immersive: Object.freeze({ lowCutHz:28,bassDb:1.5,warmthDb:0.5,clarityDb:1.0,airDb:1.5,outputDb:-1.5,compressor:false,detail:35,width:70,reality:60,noiseReduction:15,spectralFill:30,hiResMode:true }),
    selfdap: Object.freeze({ lowCutHz:20,bassDb:0,warmthDb:0,clarityDb:0,airDb:0,outputDb:-1.0,compressor:false,detail:0,width:0,reality:0,noiseReduction:10,spectralFill:0,hiResMode:true,dapMode:"off",dapStrength:0,selfDapEnabled:true,selfDapStrength:70,selfDapRestoration:"auto",selfDapRestorationCutoffKhz:14 })
  });

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const dbToGain = (db) => Math.pow(10, db / 20);
  // Web Audio interprets BiquadFilterNode.Q as resonance in dB for lowpass/highpass,
  // while the rest of YURIKA's tuning tables use conventional linear Q values.
  const webAudioResonanceDb = (linearQ) => {
    const q = Number(linearQ);
    return 20 * Math.log10(Number.isFinite(q) && q > 0 ? q : Math.SQRT1_2);
  };

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? clamp(n, min, max) : fallback;
  }

  function sanitizeSettings(raw = {}) {
    const requestedDapMode = typeof raw.dapMode === "string" ? raw.dapMode : DEFAULTS.dapMode;
    return {
      enabled: Boolean(raw.enabled),
      preset: typeof raw.preset === "string" ? raw.preset.slice(0, 24) : DEFAULTS.preset,
      lowCutHz: clampNumber(raw.lowCutHz, 5, 120, DEFAULTS.lowCutHz),
      bassDb: clampNumber(raw.bassDb, -6, 6, DEFAULTS.bassDb),
      warmthDb: clampNumber(raw.warmthDb, -6, 6, DEFAULTS.warmthDb),
      clarityDb: clampNumber(raw.clarityDb, -6, 6, DEFAULTS.clarityDb),
      airDb: clampNumber(raw.airDb, -6, 6, DEFAULTS.airDb),
      outputDb: clampNumber(raw.outputDb, -12, 6, DEFAULTS.outputDb),
      compressor: raw.compressor !== false,
      detail: clampNumber(raw.detail, 0, 100, DEFAULTS.detail),
      width: clampNumber(raw.width, 0, 100, DEFAULTS.width),
      reality: clampNumber(raw.reality, 0, 100, DEFAULTS.reality),
      noiseReduction: clampNumber(raw.noiseReduction, 0, 100, DEFAULTS.noiseReduction),
      spectralFill: clampNumber(raw.spectralFill, 0, 100, DEFAULTS.spectralFill),
      hiResMode: Boolean(raw.hiResMode),
      dapMode: DAP_MODES.includes(requestedDapMode) ? requestedDapMode : DEFAULTS.dapMode,
      dapStrength: clampNumber(raw.dapStrength, 0, 100, DEFAULTS.dapStrength),
      selfDapEnabled: Boolean(raw.selfDapEnabled),
      selfDapStrength: clampNumber(raw.selfDapStrength, 0, 100, DEFAULTS.selfDapStrength),
      selfDapRestoration: ["off","auto","on"].includes(raw.selfDapRestoration) ? raw.selfDapRestoration : DEFAULTS.selfDapRestoration,
      selfDapRestorationCutoffKhz: clampNumber(raw.selfDapRestorationCutoffKhz, 9, 18, DEFAULTS.selfDapRestorationCutoffKhz),
      perspectiveEnabled: Boolean(raw.perspectiveEnabled),
      perspectiveDepth: clampNumber(raw.perspectiveDepth, 0, 100, DEFAULTS.perspectiveDepth),
      spatialEnabled: Boolean(raw.spatialEnabled),
      spatialMode: ["auto","natural","wide","deep"].includes(raw.spatialMode) ? raw.spatialMode : DEFAULTS.spatialMode,
      spatialDeviceProfile: ["auto","generic-headphone","generic-iem","generic-earbuds","generic-stereo-speaker","laptop-speaker","tv","bluetooth-speaker","studio-monitor","sennheiser-hd600","sony-wh1000xm5","airpods-family","sonobus-mobile-binaural","remote-smartphone-speaker"].includes(raw.spatialDeviceProfile) ? raw.spatialDeviceProfile : DEFAULTS.spatialDeviceProfile,
      spatialOutputTarget: ["local","sonobus-mobile-headphones","sonobus-mobile-speaker"].includes(raw.spatialOutputTarget) ? raw.spatialOutputTarget : DEFAULTS.spatialOutputTarget,
      spatialOutputDeviceId: typeof raw.spatialOutputDeviceId === "string" ? raw.spatialOutputDeviceId.slice(0,512) : "",
      spatialOutputLabel: typeof raw.spatialOutputLabel === "string" ? raw.spatialOutputLabel.slice(0,180) : "",
      virtualAmpEnabled: raw.virtualAmpEnabled !== false,
      adaptiveSafetyEnabled: raw.adaptiveSafetyEnabled !== false,
      sceneEnabled: Boolean(raw.sceneEnabled),
      sceneStrength: clampNumber(raw.sceneStrength, 0, 100, DEFAULTS.sceneStrength),
      sceneExponent: clampNumber(raw.sceneExponent, 0.5, 2.2, DEFAULTS.sceneExponent),
      sceneInertia: clampNumber(raw.sceneInertia, 0, 100, DEFAULTS.sceneInertia),
      sparkEnabled: Boolean(raw.sparkEnabled),
      sparkAmount: clampNumber(raw.sparkAmount, 0, 100, DEFAULTS.sparkAmount),
      impactEnabled: raw.impactEnabled !== false,
      impactAmount: clampNumber(raw.impactAmount, 0, 100, DEFAULTS.impactAmount),
      seamNaturalizerEnabled: raw.seamNaturalizerEnabled !== false,
      seamNaturalizerAmount: clampNumber(raw.seamNaturalizerAmount, 0, 100, DEFAULTS.seamNaturalizerAmount),
      transientValleyEnabled: raw.transientValleyEnabled !== false,
      transientValleyAmount: clampNumber(raw.transientValleyAmount, 0, 100, DEFAULTS.transientValleyAmount),
      transientEdgeEnabled: Boolean(raw.transientEdgeEnabled),
      transientEdgeAmount: clampNumber(raw.transientEdgeAmount, 0, 100, DEFAULTS.transientEdgeAmount),
      transientEdgeTone: ["soft","focused","sharp"].includes(raw.transientEdgeTone) ? raw.transientEdgeTone : DEFAULTS.transientEdgeTone,
      orbitKeeperEnabled: raw.orbitKeeperEnabled !== false,
      voiceMaterialEnabled: Boolean(raw.voiceMaterialEnabled),
      voiceMaterialAmount: clampNumber(raw.voiceMaterialAmount, 0, 100, DEFAULTS.voiceMaterialAmount),
      voiceDepthMode: ["shallow","normal","deep"].includes(raw.voiceDepthMode) ? raw.voiceDepthMode : DEFAULTS.voiceDepthMode,
      voiceTransparency: clampNumber(raw.voiceTransparency, 0, 100, DEFAULTS.voiceTransparency),
      voiceAir: clampNumber(raw.voiceAir, 0, 100, DEFAULTS.voiceAir),
      headphoneCorrectionEnabled: Boolean(raw.headphoneCorrectionEnabled),
      headphoneModel: ["generic-neutral","sennheiser-hd600","sony-wh1000xm5"].includes(raw.headphoneModel) ? raw.headphoneModel : DEFAULTS.headphoneModel,
      headphoneCorrectionStrength: clampNumber(raw.headphoneCorrectionStrength, 0, 100, DEFAULTS.headphoneCorrectionStrength),
      headphoneCalibrationEnabled: Boolean(raw.headphoneCalibrationEnabled),
      headphoneCalibrationStrength: clampNumber(raw.headphoneCalibrationStrength, 0, 100, DEFAULTS.headphoneCalibrationStrength),
      headphoneCalibrationGainsDb: Object.freeze(Array.from({length:8},(_,i)=>clampNumber(Array.isArray(raw.headphoneCalibrationGainsDb)?raw.headphoneCalibrationGainsDb[i]:0,-3,3,0))),
      headphoneOutputDeviceId: typeof raw.headphoneOutputDeviceId === "string" ? raw.headphoneOutputDeviceId.slice(0,512) : "",
      headphoneOutputLabel: typeof raw.headphoneOutputLabel === "string" ? raw.headphoneOutputLabel.slice(0,180) : "",
      headphoneCalibrationMode: ["profile-only","measurement"].includes(raw.headphoneCalibrationMode) ? raw.headphoneCalibrationMode : DEFAULTS.headphoneCalibrationMode,
      hrtfEnabled: Boolean(raw.hrtfEnabled),
      hrtfProfile: ["natural","near","wide","front"].includes(raw.hrtfProfile) ? raw.hrtfProfile : DEFAULTS.hrtfProfile,
      hrtfAmount: clampNumber(raw.hrtfAmount, 0, 100, DEFAULTS.hrtfAmount),
      spatialTelemetryEnabled: raw.spatialTelemetryEnabled !== false,
      reflectionCharacterEnabled: Boolean(raw.reflectionCharacterEnabled),
      reflectionCharacterAmount: clampNumber(raw.reflectionCharacterAmount, 0, 100, DEFAULTS.reflectionCharacterAmount),
      reflectionCharacterMode: ["subtle","balanced","lively"].includes(raw.reflectionCharacterMode) ? raw.reflectionCharacterMode : DEFAULTS.reflectionCharacterMode,
      avSyncEnabled: Boolean(raw.avSyncEnabled),
      avSyncDelayMs: clampNumber(raw.avSyncDelayMs, 0, 150, DEFAULTS.avSyncDelayMs),
      deviceProfile: ["headphone","stereo","smartphone","tv","portable","multispeaker"].includes(raw.deviceProfile) ? raw.deviceProfile : DEFAULTS.deviceProfile,
      multiSpeakerEnabled: Boolean(raw.multiSpeakerEnabled),
      multiSpeakerAmount: clampNumber(raw.multiSpeakerAmount, 0, 100, DEFAULTS.multiSpeakerAmount),
      dacMatrixMode: ["off","neutral","akm-inspired","ess-inspired","ti-slow-inspired","fusion"].includes(raw.dacMatrixMode) ? raw.dacMatrixMode : DEFAULTS.dacMatrixMode,
      dacMatrixStrength: clampNumber(raw.dacMatrixStrength, 0, 100, DEFAULTS.dacMatrixStrength),
      dacAkmWeight: clampNumber(raw.dacAkmWeight, 0, 100, DEFAULTS.dacAkmWeight),
      dacEssWeight: clampNumber(raw.dacEssWeight, 0, 100, DEFAULTS.dacEssWeight),
      dacTiWeight: clampNumber(raw.dacTiWeight, 0, 100, DEFAULTS.dacTiWeight),
      roomEnabled: Boolean(raw.roomEnabled),
      roomMode: ["off","absorption","diffusion","bass-control","balanced"].includes(raw.roomMode) ? raw.roomMode : DEFAULTS.roomMode,
      roomAmount: clampNumber(raw.roomAmount, 0, 100, DEFAULTS.roomAmount),
      integrityEnabled: raw.integrityEnabled !== false,
      integrityMode: ["off","transparent","network-stable","ground-reference","stabilizer"].includes(raw.integrityMode) ? raw.integrityMode : DEFAULTS.integrityMode,
      integrityStrength: clampNumber(raw.integrityStrength, 0, 100, DEFAULTS.integrityStrength),
      autoLevelEnabled: Boolean(raw.autoLevelEnabled),
      autoLevelProfile: ["quiet","reference","dj","custom"].includes(raw.autoLevelProfile) ? raw.autoLevelProfile : DEFAULTS.autoLevelProfile,
      autoLevelTargetDbfs: clampNumber(raw.autoLevelTargetDbfs, -30, -12, DEFAULTS.autoLevelTargetDbfs),
      djEnabled: Boolean(raw.djEnabled),
      djCrossfader: clampNumber(raw.djCrossfader, -100, 100, DEFAULTS.djCrossfader),
      djAutoMixSeconds: clampNumber(raw.djAutoMixSeconds, 1, 60, DEFAULTS.djAutoMixSeconds),
      deckAGainDb: clampNumber(raw.deckAGainDb, -18, 12, DEFAULTS.deckAGainDb),
      deckBGainDb: clampNumber(raw.deckBGainDb, -18, 12, DEFAULTS.deckBGainDb),
      deckALowDb: clampNumber(raw.deckALowDb, -12, 12, DEFAULTS.deckALowDb),
      deckAMidDb: clampNumber(raw.deckAMidDb, -12, 12, DEFAULTS.deckAMidDb),
      deckAHighDb: clampNumber(raw.deckAHighDb, -12, 12, DEFAULTS.deckAHighDb),
      deckBLowDb: clampNumber(raw.deckBLowDb, -12, 12, DEFAULTS.deckBLowDb),
      deckBMidDb: clampNumber(raw.deckBMidDb, -12, 12, DEFAULTS.deckBMidDb),
      deckBHighDb: clampNumber(raw.deckBHighDb, -12, 12, DEFAULTS.deckBHighDb),
      cartridgeEnabled: Boolean(raw.cartridgeEnabled),
      cartridgeMode: ["off","a","b","c","mix","ab-split"].includes(raw.cartridgeMode) ? raw.cartridgeMode : DEFAULTS.cartridgeMode,
      cartridgeAResistance: clampNumber(raw.cartridgeAResistance, 900, 100000, DEFAULTS.cartridgeAResistance),
      cartridgeACapacitance: clampNumber(raw.cartridgeACapacitance, 0, 1000, DEFAULTS.cartridgeACapacitance),
      cartridgeAGainDb: clampNumber(raw.cartridgeAGainDb, -12, 12, DEFAULTS.cartridgeAGainDb),
      cartridgeBResistance: clampNumber(raw.cartridgeBResistance, 900, 100000, DEFAULTS.cartridgeBResistance),
      cartridgeBCapacitance: clampNumber(raw.cartridgeBCapacitance, 0, 1000, DEFAULTS.cartridgeBCapacitance),
      cartridgeBGainDb: clampNumber(raw.cartridgeBGainDb, -12, 12, DEFAULTS.cartridgeBGainDb),
      cartridgeCResistance: clampNumber(raw.cartridgeCResistance, 900, 100000, DEFAULTS.cartridgeCResistance),
      cartridgeCCapacitance: clampNumber(raw.cartridgeCCapacitance, 0, 1000, DEFAULTS.cartridgeCCapacitance),
      cartridgeCGainDb: clampNumber(raw.cartridgeCGainDb, -12, 12, DEFAULTS.cartridgeCGainDb),
      cartridgeMixA: clampNumber(raw.cartridgeMixA, 0, 100, DEFAULTS.cartridgeMixA),
      cartridgeMixB: clampNumber(raw.cartridgeMixB, 0, 100, DEFAULTS.cartridgeMixB),
      cartridgeMixC: clampNumber(raw.cartridgeMixC, 0, 100, DEFAULTS.cartridgeMixC)
    };
  }

  function pickKeys(source, keys) {
    const out = {};
    for (const key of keys) if (Object.prototype.hasOwnProperty.call(source || {}, key)) out[key] = source[key];
    return out;
  }

  function sanitizeSettingsPatch(raw = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    const normalized = sanitizeSettings({ ...DEFAULTS, ...source });
    return pickKeys(normalized, SETTINGS_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(source, key)));
  }

  function migrateStoredSettings(raw = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    const settings = sanitizeSettings({ ...DEFAULTS, ...source });
    return { ...settings, settingsSchemaVersion: SETTINGS_SCHEMA_VERSION };
  }

  function applyPreset(current = DEFAULTS, presetName, { preserveIndependentLayers = true } = {}) {
    const name = typeof presetName === "string" ? presetName : "custom";
    const base = sanitizeSettings({ ...DEFAULTS, ...(current || {}) });
    const preset = PRESETS[name];
    if (!preset) return sanitizeSettings({ ...base, preset: "custom" });

    const systemPreset = SYSTEM_PRESET_NAMES.includes(name);
    let patch;
    if (systemPreset || !preserveIndependentLayers) patch = preset;
    else patch = pickKeys(preset, PRESET_AUDIO_KEYS);

    return sanitizeSettings({ ...base, ...patch, preset: name });
  }


  function sanitizeManualPatch(raw = {}) {
    const patch = sanitizeSettingsPatch(raw);
    const out = {};
    for (const key of MANUAL_EDIT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) out[key] = patch[key];
    }
    return out;
  }

  function applyManualPatch(current = DEFAULTS, rawPatch = {}) {
    const base = sanitizeSettings({ ...DEFAULTS, ...(current || {}) });
    const patch = sanitizeManualPatch(rawPatch);
    return sanitizeSettings({ ...base, ...patch, enabled: base.enabled, preset: base.preset });
  }

  function diffSettings(previous = DEFAULTS, next = DEFAULTS, keys = SETTINGS_KEYS) {
    const a = sanitizeSettings({ ...DEFAULTS, ...(previous || {}) });
    const b = sanitizeSettings({ ...DEFAULTS, ...(next || {}) });
    const out = {};
    for (const key of keys) {
      const av=a[key],bv=b[key];
      const same=Array.isArray(av)&&Array.isArray(bv) ? (av.length===bv.length && av.every((v,i)=>Object.is(v,bv[i]))) : Object.is(av,bv);
      if (!same) out[key] = bv;
    }
    return out;
  }

  function dapProfile(mode, strength) {
    const safeMode = DAP_MODES.includes(mode) ? mode : "off";
    const t = clampNumber(strength, 0, 100, 0) / 100;
    const profiles = {
      off:       { lowDb:0, highDb:0, harmonic:0, crossfeed:0, preDb:0, drive:1.05 },
      reference: { lowDb:0, highDb:0, harmonic:0.010, crossfeed:0.015, preDb:-0.15, drive:1.08 },
      warm:      { lowDb:0.8, highDb:-0.7, harmonic:0.035, crossfeed:0.035, preDb:-0.75, drive:1.22 },
      natural:   { lowDb:0.25, highDb:0.25, harmonic:0.018, crossfeed:0.075, preDb:-0.55, drive:1.14 },
      tube:      { lowDb:0.65, highDb:-0.35, harmonic:0.060, crossfeed:0.025, preDb:-1.15, drive:1.45 }
    };
    const p = profiles[safeMode];
    if (safeMode === "off") return { mode:safeMode, lowDb:0, highDb:0, harmonic:0, crossfeed:0, preDb:0, drive:p.drive };
    return {
      mode: safeMode,
      lowDb: p.lowDb * t,
      highDb: p.highDb * t,
      harmonic: p.harmonic * t,
      crossfeed: p.crossfeed * t,
      preDb: p.preDb * t,
      drive: 1 + (p.drive - 1) * t
    };
  }

  function perspectiveProfile(enabled, depth) {
    const t = Boolean(enabled) ? clampNumber(depth, 0, 100, 0) / 100 : 0;
    return Object.freeze({
      enabled: Boolean(enabled) && t > 0,
      depth: t,
      directDb: -0.60 * t,
      wet: 0.12 * t,
      highpassHz: 150,
      lowpassHz: 16000 - 7000 * t,
      predelaySeconds: 0.003 + 0.010 * t
    });
  }

  function computeAutoHeadroomDb(settings) {
    const s = sanitizeSettings(settings);
    const positiveEq = [s.bassDb, s.warmthDb, s.clarityDb, s.airDb]
      .reduce((sum, value) => sum + Math.max(0, value), 0);
    const enhancementBudget = (s.spectralFill * 0.028) + (s.detail * 0.012) + (s.reality * 0.010) + (s.width * 0.004);
    const dap = dapProfile(s.dapMode, s.dapStrength);
    const dapBudget = Math.max(0, dap.lowDb) * 0.55 + Math.max(0, dap.highDb) * 0.45 + dap.harmonic * 9 + dap.crossfeed * 2;
    const selfDapBudget = s.selfDapEnabled ? (s.selfDapStrength / 100) * 2.4 : 0;
    const perspective = perspectiveProfile(s.perspectiveEnabled, s.perspectiveDepth);
    const perspectiveBudget = perspective.wet * 8.0;
    const sceneBudget = (s.sceneEnabled ? (s.sceneStrength / 100) * 0.8 : 0) + (s.sparkEnabled ? (s.sparkAmount / 100) * 0.45 : 0) + (s.multiSpeakerEnabled ? (s.multiSpeakerAmount / 100) * 0.55 : 0);
    const modular = globalThis.YurikaModularCore;
    let modularBudget = 0;
    if (modular) {
      const dm = modular.dacMatrixProfile(s.dacMatrixMode, s.dacMatrixStrength, s.dacAkmWeight, s.dacEssWeight, s.dacTiWeight);
      const rp = modular.roomProfile(s.roomEnabled ? s.roomMode : "off", s.roomAmount);
      modularBudget += Math.max(0, dm.lowDb) * 0.5 + Math.max(0, dm.presenceDb) * 0.5 + Math.max(0, dm.highDb) * 0.5 + dm.harmonic * 8;
      modularBudget += rp.wet * 7 + Math.max(0, rp.lowDb) * 0.4 + Math.max(0, rp.highDb) * 0.4;
      if (s.cartridgeEnabled) modularBudget += 0.7;
    }
    return -Math.min(12, positiveEq * 0.45 + enhancementBudget + dapBudget + selfDapBudget + perspectiveBudget + modularBudget + sceneBudget);
  }

  // The final Web Audio DynamicsCompressorNode limiter measured +0.57 dB of
  // broadband make-up at unity settings in the synchronized browser harness.
  // Compensate that fixed stage here so outputDb=0 remains true acoustic unity.
  const FINAL_LIMITER_MAKEUP_COMPENSATION_DB = -0.57;

  function computeEffectiveOutputDb(settings) {
    const s = sanitizeSettings(settings);
    return clamp(s.outputDb + computeAutoHeadroomDb(s) + FINAL_LIMITER_MAKEUP_COMPENSATION_DB, -24, 6);
  }

  function widthToMatrix(widthAmount) {
    const amount = clampNumber(widthAmount, 0, 100, 0);
    const width = 1 + 0.35 * (amount / 100);
    return { width, same: (1 + width) / 2, cross: (1 - width) / 2 };
  }

  function spectralFillGains(amount) {
    const t = clampNumber(amount, 0, 100, 0) / 100;
    return { bodyDb: 1.4 * t, presenceDb: 1.1 * t, topDb: 1.6 * t };
  }

  function detailMixGain(amount) {
    return 0.14 * (clampNumber(amount, 0, 100, 0) / 100);
  }

  function realityMixGains(amount) {
    const t = clampNumber(amount, 0, 100, 0) / 100;
    return { harmonic: 0.055 * t, reflection: 0.065 * t };
  }

  const saturationCurveCache = new Map();

  function makeSoftSaturationCurve(size = 4096, drive = 1.35) {
    const n = Math.max(256, Math.min(16384, Number(size) || 4096));
    const d = Math.max(1, Math.min(3, Number(drive) || 1.35));
    const key = `${n}:${d.toFixed(4)}`;
    const cached = saturationCurveCache.get(key);
    if (cached) return cached;
    const curve = new Float32Array(n);
    const normalizer = Math.tanh(d);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(d * x) / normalizer;
    }
    saturationCurveCache.set(key, curve);
    if (saturationCurveCache.size > 32) saturationCurveCache.delete(saturationCurveCache.keys().next().value);
    return curve;
  }

  function classifyStereo({ inputChannels = 2, correlation = null, balanceDb = null, rmsDbfs = -120, monoLikeStreak = 0 } = {}) {
    if (Number(inputChannels) === 1) return "mono";
    if (!Number.isFinite(Number(rmsDbfs)) || Number(rmsDbfs) < -60) return "unknown";
    if (!Number.isFinite(Number(correlation))) return "unknown";
    const corr = Number(correlation);
    const bal = Number.isFinite(Number(balanceDb)) ? Math.abs(Number(balanceDb)) : 99;
    if (Number(monoLikeStreak) >= 24 && corr > 0.9995 && bal < 0.35) return "mono-like";
    if (corr < 0.985) return "stereo";
    return "center-heavy";
  }

  function isYoutubeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && (url.hostname === "www.youtube.com" || url.hostname === "youtube.com");
    } catch {
      return false;
    }
  }

  globalThis.YurikaAudioCore = Object.freeze({
    DEFAULTS, PRESETS, DAP_MODES, SETTINGS_SCHEMA_VERSION, SETTINGS_KEYS, PRESET_AUDIO_KEYS,
    VIRTUAL_DAP_KEYS, SELF_DAP_KEYS, PERSPECTIVE_KEYS, SPATIAL_KEYS, VIRTUAL_AMP_KEYS, SAFETY_KEYS, SCENE_KEYS, DAC_MATRIX_KEYS, ROOM_KEYS, INTEGRITY_KEYS, DJ_KEYS, CARTRIDGE_KEYS, SYSTEM_PRESET_NAMES, MANUAL_EDIT_KEYS, clamp, dbToGain, sanitizeSettings,
    sanitizeSettingsPatch, sanitizeManualPatch, migrateStoredSettings, applyPreset, applyManualPatch, diffSettings, computeAutoHeadroomDb,
    computeEffectiveOutputDb, dapProfile, perspectiveProfile, widthToMatrix, spectralFillGains, detailMixGain,
    realityMixGains, makeSoftSaturationCurve, classifyStereo, webAudioResonanceDb, isYoutubeUrl
  });
})();
