"use strict";

const {
  DEFAULTS, sanitizeSettings, dbToGain, computeEffectiveOutputDb,
  widthToMatrix, spectralFillGains, detailMixGain, realityMixGains,
  makeSoftSaturationCurve, dapProfile, perspectiveProfile, classifyStereo,
  webAudioResonanceDb
} = globalThis.YurikaAudioCore;
const SelfDAP = globalThis.YurikaSelfDap;
const Modular = globalThis.YurikaModularCore;
const AudioModules = globalThis.YurikaAudioModules;
const SceneEngine = globalThis.YurikaSceneEngine;
const AdaptiveV26 = globalThis.YurikaAdaptiveV26;
const AdaptiveV27 = globalThis.YurikaAdaptiveV27;
const AdaptiveV28 = globalThis.YurikaAdaptiveV28;
const AdaptiveV29 = globalThis.YurikaAdaptiveV29;
const HeadphoneProfiles = globalThis.YurikaHeadphoneProfiles;
const SpatialProfiles = globalThis.YurikaSpatialDeviceProfiles;
const SpatialEngine = globalThis.YurikaSpatialEngine;
const SpatialDiagnostics = globalThis.YurikaSpatialDiagnostics;
const VirtualAmp = globalThis.YurikaVirtualAmp;

let state = freshState();

function freshState(previousSettings = DEFAULTS, previousRevision = 0) {
  return {
    tabId: null, stream: null, streams: { A:null, B:null, external:null }, deckTabIds:{A:null,B:null}, replacingDecks:{A:false,B:false}, tabSessions:{}, context: null, source: null, nodes: null, deckNodes: { A:null, B:null },
    inputMode: "tab", externalActive: false, settings: { ...previousSettings, enabled: false }, error: null, startedAt: null,
    noiseWorkletAvailable: false, safetyMeterAvailable: false, sparkWorkletAvailable: false, spatialMetricsAvailable:false, requestedHiRes: false, inputChannels: null,
    cpuProfile: AdaptiveV28 ? AdaptiveV28.cpuProfile(navigator.hardwareConcurrency || 1) : {name:"balanced",logicalProcessors:navigator.hardwareConcurrency||1,maxSessions:2,spatialReportMs:80}, spatialMetrics:null, spatialLastReportAtMs:0,
    headphoneOutputSinkApplied:false, headphoneOutputSinkError:null, headphoneDetectedLabel:previousSettings.headphoneOutputLabel||"", headphoneCalibrationLastAppliedAtMs:0,
    spatialResolved:null, spatialParams:null, spatialFallbackStatus:"none", spatialLastAdaptiveApplyMs:0,
    spatialDeviceListener:null, spatialSinkListener:null, spatialSinkApplied:false, spatialSinkError:null, spatialRuntimeOutputLabel:previousSettings.spatialOutputLabel||"",
    contextLatencyPolicy:"uninitialized",
    videoTelemetry:{}, avSyncEstimatedAudioLatencyMs:null, avSyncBaseLatencyMs:null, avSyncAppliedDelayMs:0,
    safetyMonitorTimer: null, safetyStats: null, safetyLastStatsAtMs: 0, adaptiveTrimDb: 0,
    adaptiveTrimQuietStreak: 0, adaptiveTrimHoldReason: "unity", adaptiveTrimLastPressureAtMs: 0, adaptiveTrimReleaseCount: 0,
    limiterPressureStreak: 0, limiterRelaxStreak: 0, safetyFaultLatched: false, safetyFaults: 0,
    autoLevelTimer: null, autoLevelDb: 0, sparkMakeupDb: 0, effectiveLevelDb: 0, effectiveLevelWrites: 0, autoLevelMeasuredDbfs: null, autoLevelRmsEma: null, autoLevelBuffer: null,
    djAutoMixTimer: null, djAutoMixActive: false, djAutoMixPosition: null, djAutoMixStartedAt: 0, djAutoMixDurationMs: 0, djAutoMixDirection: null,
    safetyStableReports: 0, runtimeRecoveries: 0, runtimeWatchdogMisses: 0, stereoCorrelationEma: null, monoLikeStreak: 0,
    selfDapMonitorTimer: null, selfDapBands: null, selfDapFreqData: null,
    sceneMonitorTimer: null, sceneFreqData: null, sceneTimeData: null, sceneRuntime: null, sceneLastTickMs: 0,
    sparkPulse: 0, sparkRawPulse: 0, sparkLastReportAtMs: 0, sparkReports: 0, sparkFallbackActive: false,
    sparkLastAppliedPulse: 0, sparkLastAppliedAtMs: 0, impactGain: 0, compressorEscape: 0,
    sparkPeak: 0, sparkRms: 0, sparkCrest: 0, seamDiscontinuity: 0, seamSpeechRatio: 0, seamConfidence: 0, seamEvents: 0,
    voiceConfidence: 0, voiceConfidenceRaw:0, voiceSyntheticTendency: 0, voiceSyntheticTendencyRaw:0, voiceEvents: 0, voiceLastActive:false, voiceLastReportAtMs:0,
    hrtfCueHistory:[],
    transientEdgeWet:0, transientEdgeTriggers:0, transientEdgeLastTriggerAtMs:0, transientEdgeLastPulse:0,
    transientValleyDepthDb: 0, transientValleyTriggers: 0, transientValleyLastTriggerAtMs: 0, transientValleyLastPulse: 0,
    orbitKeeperTimer: null, orbitLastTickAtMs: 0, orbitTimerDriftMs: 0,
    orbitHealthScore: 100, orbitLevel: 0, orbitStableTicks: 0, orbitFaultTicks: 0, orbitActions: 0, orbitLastAction: "idle", orbitLastChangeAtMs: 0, orbitDegraded: false,
    selfDapRestorationActive: false, selfDapRestorationReason: "idle", selfDapRestorationScore: 0,
    selfDapOnStreak: 0, selfDapOffStreak: 0, selfDapLastMonitorAtMs: 0, selfDapWatchdogTrips: 0,
    lastSettingsRevision: Number.isFinite(Number(previousRevision)) ? Number(previousRevision) : 0
  };
}

function createFilter(ctx, type, frequency, gain = 0, q = 0.7) {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.gain.value = gain;
  node.Q.value = (type === "lowpass" || type === "highpass") ? webAudioResonanceDb(q) : q;
  return node;
}

function smooth(param, value, now, seconds = 0.05) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

async function createNoiseNode(ctx) {
  try {
    await ctx.audioWorklet.addModule(chrome.runtime.getURL("noise-worklet.js"));
    return { node: new AudioWorkletNode(ctx, "yurika-noise-suppressor"), available: true };
  } catch {
    return { node: ctx.createGain(), available: false };
  }
}

async function createSafetyMeterNode(ctx) {
  try {
    await ctx.audioWorklet.addModule(chrome.runtime.getURL("safety-meter-worklet.js"));
    const node = new AudioWorkletNode(ctx, "yurika-safety-meter");
    node.port.onmessage = (event) => {
      const data = event?.data;
      if (!data || data.type !== "stats") return;
      handleSafetyStats(data);
    };
    return { node, available: true };
  } catch {
    return { node: ctx.createGain(), available: false };
  }
}

async function createSparkMonitorNode(ctx) {
  try {
    await ctx.audioWorklet.addModule(chrome.runtime.getURL("spark-monitor-worklet.js"));
    const node = new AudioWorkletNode(ctx, "yurika-spark-monitor", { numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[1] });
    node.port.onmessage = (event) => handleSparkReport(event?.data);
    return { node, available: true };
  } catch {
    return { node: ctx.createGain(), available: false };
  }
}



function emitSpatialEvent(type, detail = {}) {
  const safeType = String(type || "spatial:event");
  try { globalThis.dispatchEvent(new CustomEvent(safeType, { detail })); } catch {}
  try { chrome.runtime.sendMessage({ target:"service-worker", type:"SPATIAL_EVENT", event:safeType, detail }).catch(()=>{}); } catch {}
}

function spatialSceneHint() {
  return {
    sceneWeight: Number(state.sceneRuntime?.controls?.sceneWeight || 0),
    transient: Number(state.sceneRuntime?.features?.transient || state.sparkPulse || 0),
    voiceConfidence: Number(state.voiceConfidence || 0)
  };
}

function applySpatialLayer(initial = false, previous = {}) {
  const ctx=state.context, stage=state.nodes?.spatial3d;
  if (!ctx || !stage || !SpatialEngine || !SpatialProfiles) {
    state.spatialFallbackStatus = state.settings.spatialEnabled ? "spatial-module-unavailable" : "none";
    return;
  }
  const beforeEnabled = Boolean(previous?.spatialEnabled);
  const beforeProfile = state.spatialResolved?.profileId || null;
  try {
    const resolved=SpatialProfiles.resolve({
      requestedProfile:state.settings.spatialDeviceProfile,
      outputTarget:state.settings.spatialOutputTarget,
      label:state.settings.spatialOutputLabel || state.spatialRuntimeOutputLabel,
      legacyDeviceProfile:state.settings.deviceProfile,
      headphoneIntent:Boolean(state.settings.deviceProfile === "headphone" || state.settings.headphoneOutputDeviceId || state.settings.headphoneOutputLabel || state.settings.headphoneCorrectionEnabled)
    });
    const remoteBinaural=state.settings.spatialOutputTarget==="sonobus-mobile-headphones" && state.settings.spatialEnabled;
    const spatialSettings=remoteBinaural ? {...state.settings,hrtfEnabled:true,hrtfProfile:state.settings.hrtfEnabled?state.settings.hrtfProfile:"front",deviceProfile:"headphone"} : state.settings;
    const result=SpatialEngine.apply(stage,spatialSettings,{resolved,scene:spatialSceneHint(),initial});
    state.spatialResolved=resolved;
    state.spatialParams=result?.params || stage.lastParams || null;
    if (stage.monoBypass && state.settings.spatialEnabled) state.spatialFallbackStatus="mono-input-conservative-bypass";
    else if (state.spatialFallbackStatus === "spatial-module-unavailable") state.spatialFallbackStatus="none";
    const nowEnabled=Boolean(state.settings.spatialEnabled);
    if (!initial && nowEnabled !== beforeEnabled) emitSpatialEvent(nowEnabled ? "spatial:on" : "spatial:off", { mode:state.settings.spatialMode, profile:resolved.profileId });
    if (!initial && beforeProfile && beforeProfile !== resolved.profileId) emitSpatialEvent("spatial:device-change", { from:beforeProfile, to:resolved.profileId, label:state.settings.spatialOutputLabel || state.spatialRuntimeOutputLabel || "" });
  } catch (error) {
    state.spatialFallbackStatus=`spatial-engine-error:${error?.message || error}`;
    try { SpatialEngine.apply(stage,{...state.settings,spatialEnabled:false},{resolved:state.spatialResolved,scene:{},initial:false}); } catch {}
    emitSpatialEvent("spatial:fallback", { reason:state.spatialFallbackStatus });
  }
}

async function applyOutputSink(next, previous = {}, force = false) {
  const ctx=state.context;
  if (!ctx) return;
  const targetId=String(next.spatialOutputDeviceId || next.headphoneOutputDeviceId || "");
  const prevId=String(previous.spatialOutputDeviceId || previous.headphoneOutputDeviceId || "");
  // Do not touch the sink when both sides already mean the browser default.
  // setSinkId("") can emit an asynchronous sinkchange on some Chrome/OS combinations,
  // which previously caused an unnecessary Spatial parameter re-ramp.
  if (!targetId && !prevId) {
    state.spatialSinkApplied=true; state.spatialSinkError=null;
    state.headphoneOutputSinkApplied=true; state.headphoneOutputSinkError=null;
    return;
  }
  if (!force && targetId === prevId) return;
  if (typeof ctx.setSinkId !== "function") {
    state.spatialSinkApplied=false;
    state.spatialSinkError=targetId ? "AudioContext.setSinkId unsupported" : null;
    if (targetId) { state.spatialFallbackStatus="setSinkId-unsupported"; emitSpatialEvent("spatial:fallback",{reason:state.spatialFallbackStatus}); }
    return;
  }
  try {
    await ctx.setSinkId(targetId);
    state.spatialSinkApplied=true; state.spatialSinkError=null;
    state.headphoneOutputSinkApplied=true; state.headphoneOutputSinkError=null;
    if (/^(setSinkId-|sink-|saved-output-)/.test(String(state.spatialFallbackStatus || ""))) state.spatialFallbackStatus="none";
  } catch (error) {
    state.spatialSinkApplied=false; state.spatialSinkError=error?.message || String(error);
    state.headphoneOutputSinkApplied=false; state.headphoneOutputSinkError=state.spatialSinkError;
    state.spatialFallbackStatus="sink-fallback-default";
    try { await ctx.setSinkId(""); } catch {}
    emitSpatialEvent("spatial:fallback",{reason:state.spatialFallbackStatus,error:state.spatialSinkError});
  }
}

async function handleSpatialDeviceChange(reason = "devicechange") {
  if (!state.context || !navigator?.mediaDevices?.enumerateDevices) return;
  try {
    const outputs=(await navigator.mediaDevices.enumerateDevices()).filter((d)=>d.kind==="audiooutput");
    const saved=String(state.settings.spatialOutputDeviceId || "");
    let selected=saved ? outputs.find((d)=>d.deviceId===saved) : outputs.find((d)=>d.deviceId==="default");
    if (saved && !selected) {
      const patch={spatialOutputDeviceId:"default",spatialOutputLabel:"Default"};
      const previous=state.settings;
      state.settings=sanitizeSettings({...state.settings,...patch});
      state.spatialRuntimeOutputLabel="";
      state.spatialFallbackStatus="saved-output-missing-default-used";
      applySpatialLayer(false,previous);
      await applyOutputSink(state.settings,previous,true);
      try { await chrome.runtime.sendMessage({target:"service-worker",type:"SPATIAL_RUNTIME_PATCH",patch}); } catch {}
      emitSpatialEvent("spatial:fallback",{reason:state.spatialFallbackStatus,source:reason});
      return;
    }
    if (selected) {
      if (String(state.spatialFallbackStatus || "").startsWith("saved-output-")) state.spatialFallbackStatus="none";
      const label=selected.label || state.settings.spatialOutputLabel || "";
      state.spatialRuntimeOutputLabel=label;
      if (saved && label && label !== state.settings.spatialOutputLabel) {
        const previous=state.settings;
        const patch={spatialOutputLabel:label};
        state.settings=sanitizeSettings({...state.settings,...patch});
        if (state.settings.spatialOutputTarget === "local") applySpatialLayer(false,previous);
        try { await chrome.runtime.sendMessage({target:"service-worker",type:"SPATIAL_RUNTIME_PATCH",patch}); } catch {}
      } else if (state.settings.spatialDeviceProfile === "auto" && state.settings.spatialOutputTarget === "local") {
        // Remote SonoBus profiles are fixed by outputTarget and do not depend on an OS label.
        // Avoid re-ramping Spatial parameters on unrelated sink/device notifications.
        applySpatialLayer(false,state.settings);
      }
      emitSpatialEvent("spatial:device-change",{source:reason,label:label||"unavailable",profile:state.spatialResolved?.profileId||null});
    }
  } catch (error) {
    state.spatialFallbackStatus=`device-enumeration-fallback:${error?.message || error}`;
    emitSpatialEvent("spatial:fallback",{reason:state.spatialFallbackStatus,source:reason});
  }
}

function installSpatialDeviceMonitoring(ctx) {
  if (navigator?.mediaDevices?.addEventListener && !state.spatialDeviceListener) {
    state.spatialDeviceListener=()=>{ void handleSpatialDeviceChange("devicechange"); };
    navigator.mediaDevices.addEventListener("devicechange",state.spatialDeviceListener);
  }
  if (ctx?.addEventListener && !state.spatialSinkListener) {
    state.spatialSinkListener=()=>{ void handleSpatialDeviceChange("sinkchange"); };
    try { ctx.addEventListener("sinkchange",state.spatialSinkListener); } catch {}
  }
}

function removeSpatialDeviceMonitoring() {
  if (state.spatialDeviceListener && navigator?.mediaDevices?.removeEventListener) {
    try { navigator.mediaDevices.removeEventListener("devicechange",state.spatialDeviceListener); } catch {}
  }
  if (state.spatialSinkListener && state.context?.removeEventListener) {
    try { state.context.removeEventListener("sinkchange",state.spatialSinkListener); } catch {}
  }
  state.spatialDeviceListener=null; state.spatialSinkListener=null;
}

function applyLowCutRouting(nodes, frequency, ctx, seconds = 0.05) {
  const hz = Math.max(5, Number(frequency) || 5);
  smooth(nodes.lowCut.frequency, hz, ctx.currentTime, seconds);
  if (!nodes.lowCutBypass || !nodes.lowCutProcessed) return;
  // 5 Hz is YURIKA's explicit transparent/off sentinel. A true bypass avoids
  // residual phase rotation in Flat/Neutral while all audible low-cut presets remain filtered.
  const enabled = hz > 5.0001;
  smooth(nodes.lowCutBypass.gain, enabled ? 0 : 1, ctx.currentTime, seconds);
  smooth(nodes.lowCutProcessed.gain, enabled ? 1 : 0, ctx.currentTime, seconds);
}

function createEarlyReflectionBuffer(ctx) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 0.028));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const tapsL = [[0, 0.72], [3.2, 0.13], [7.1, -0.08], [12.4, 0.055], [18.6, -0.035]];
  const tapsR = [[0, 0.72], [4.1, 0.12], [8.7, -0.075], [14.2, 0.05], [21.3, -0.03]];
  for (const [channel, taps] of [[0, tapsL], [1, tapsR]]) {
    const data = buffer.getChannelData(channel);
    for (const [ms, amp] of taps) {
      const index = Math.min(data.length - 1, Math.round(ctx.sampleRate * ms / 1000));
      data[index] += amp;
    }
  }
  return buffer;
}

function createPerspectiveBuffer(ctx) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 0.050));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const taps = [
    [[7.1, 0.34], [12.8, -0.19], [19.6, 0.12], [28.7, -0.075], [41.2, 0.042]],
    [[8.9, 0.32], [14.7, -0.17], [22.4, 0.115], [31.6, -0.068], [44.1, 0.038]]
  ];
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (const [ms, amp] of taps[ch]) {
      const index = Math.min(data.length - 1, Math.round(ctx.sampleRate * ms / 1000));
      data[index] += amp;
    }
  }
  return buffer;
}

function createPerspectiveStage(ctx, input) {
  const direct = ctx.createGain(); direct.gain.value = 1;
  const ambientHp = createFilter(ctx, "highpass", 150, 0, 0.7);
  const ambientDelay = ctx.createDelay(0.05); ambientDelay.delayTime.value = 0.003;
  const ambientLp = createFilter(ctx, "lowpass", 16000, 0, 0.7);
  const convolver = ctx.createConvolver(); convolver.normalize = false; convolver.buffer = createPerspectiveBuffer(ctx);
  const wet = ctx.createGain(); wet.gain.value = 0;
  const sum = ctx.createGain();
  input.connect(direct); direct.connect(sum);
  input.connect(ambientHp); ambientHp.connect(ambientDelay); ambientDelay.connect(ambientLp); ambientLp.connect(convolver); convolver.connect(wet); wet.connect(sum);
  return { output: sum, stage: { direct, ambientHp, ambientDelay, ambientLp, convolver, wet, sum } };
}


function createVoiceMaterialStage(ctx, input) {
  const body = createFilter(ctx, "peaking", 185, 0, 0.78);
  const mud = createFilter(ctx, "peaking", 430, 0, 0.85);
  const presence = createFilter(ctx, "peaking", 2200, 0, 0.92);
  const air = createFilter(ctx, "highshelf", 9000, 0, 0.70);
  const direct = ctx.createGain(); direct.gain.value = 1;
  const delay = ctx.createDelay(0.03); delay.delayTime.value = 0.007;
  const reflectionLp = createFilter(ctx, "lowpass", 6800, 0, 0.70);
  const reflectionGain = ctx.createGain(); reflectionGain.gain.value = 0;
  const sum = ctx.createGain();
  input.connect(body); body.connect(mud); mud.connect(presence); presence.connect(air);
  air.connect(direct); direct.connect(sum);
  air.connect(delay); delay.connect(reflectionLp); reflectionLp.connect(reflectionGain); reflectionGain.connect(sum);
  return { output:sum, stage:{body,mud,presence,air,direct,delay,reflectionLp,reflectionGain,sum} };
}


function isLocalHeadphoneIntent(settings = {}) {
  if (String(settings.spatialOutputTarget || "local").startsWith("sonobus-")) return false;
  const spatialHeadphone=["generic-headphone","generic-iem","generic-earbuds","sennheiser-hd600","sony-wh1000xm5","airpods-family"].includes(String(settings.spatialDeviceProfile||""));
  const label=String(settings.headphoneOutputLabel||settings.spatialOutputLabel||"");
  const labelHeadphone=/headphone|headset|headphones|ヘッドホン|ヘッドセット|airpods|earbuds|iem|audio[- ]?technica|\bath[- _]?[a-z0-9]+|wh[- ]?1000|wf[- ]?/i.test(label);
  return settings.deviceProfile === "headphone" || spatialHeadphone || labelHeadphone || Boolean(settings.headphoneOutputDeviceId);
}
function createHrtfStage(ctx, input, channels = 2) {
  if (channels < 2) { const bypass=ctx.createGain(); input.connect(bypass); return {output:bypass,stage:{bypass,mono:true}}; }
  const split=ctx.createChannelSplitter(2), merge=ctx.createChannelMerger(2);
  const directL=ctx.createGain(), directR=ctx.createGain(); directL.gain.value=1; directR.gain.value=1;
  const crossL=ctx.createGain(), crossR=ctx.createGain(); crossL.gain.value=0; crossR.gain.value=0;
  const delayL=ctx.createDelay(0.01), delayR=ctx.createDelay(0.01);
  const lpL=createFilter(ctx,"lowpass",5200,0,0.7), lpR=createFilter(ctx,"lowpass",5200,0,0.7);
  const pinna=createFilter(ctx,"peaking",3200,0,1.05), air=createFilter(ctx,"highshelf",8500,0,0.7);
  input.connect(split);
  split.connect(directL,0); directL.connect(merge,0,0); split.connect(directR,1); directR.connect(merge,0,1);
  split.connect(delayL,0); delayL.connect(lpL); lpL.connect(crossL); crossL.connect(merge,0,1);
  split.connect(delayR,1); delayR.connect(lpR); lpR.connect(crossR); crossR.connect(merge,0,0);
  merge.connect(pinna); pinna.connect(air);
  return {output:air,stage:{split,merge,directL,directR,crossL,crossR,delayL,delayR,lpL,lpR,pinna,air,mono:false}};
}

function createHeadphoneCorrectionStage(ctx, input) {
  const pre=ctx.createGain(); pre.gain.value=1; input.connect(pre);
  const filters=[]; let node=pre;
  for(let i=0;i<10;i++){ const f=createFilter(ctx,"peaking",1000,0,0.7); node.connect(f); node=f; filters.push(f); }
  const calPre=ctx.createGain(); calPre.gain.value=1; node.connect(calPre); node=calPre;
  const calibrationFilters=[]; const freqs=AdaptiveV29?.CALIBRATION_FREQUENCIES||[80,160,315,630,1250,2500,5000,10000];
  for(const hz of freqs){const f=createFilter(ctx,"peaking",hz,0,0.95);node.connect(f);node=f;calibrationFilters.push(f);}
  return {output:node,stage:{pre,filters,calPre,calibrationFilters}};
}

async function createContext(settings) {
  let ctx;
  const remoteTarget=String(settings.spatialOutputTarget||"local").startsWith("sonobus-");
  const localHeadphone=isLocalHeadphoneIntent(settings);

  if(remoteTarget){
    state.contextLatencyPolicy="interactive-remote-48k";
    try { ctx = new AudioContext({ latencyHint:"interactive", sampleRate:48000 }); }
    catch { try { ctx = new AudioContext({ latencyHint:"interactive" }); } catch {} }
  }
  if(!ctx && localHeadphone && settings.hiResMode){
    state.contextLatencyPolicy="interactive-headphone-hires";
    try { ctx = new AudioContext({ latencyHint:"interactive", sampleRate:96000 }); }
    catch { try { ctx = new AudioContext({ latencyHint:"interactive" }); } catch {} }
  }
  if(!ctx && localHeadphone){
    state.contextLatencyPolicy="interactive-headphone";
    try { ctx = new AudioContext({ latencyHint:"interactive" }); } catch {}
  }
  if (!ctx && settings.hiResMode) {
    state.contextLatencyPolicy="playback-hires";
    try { ctx = new AudioContext({ latencyHint: "playback", sampleRate: 96000 }); }
    catch { /* browser/device does not support requested sample rate */ }
  }
  if(!ctx){ state.contextLatencyPolicy="playback-default"; ctx=new AudioContext({ latencyHint: "playback" }); }
  state.headphoneOutputSinkApplied=false; state.headphoneOutputSinkError=null;
  const sink=String(settings.headphoneOutputDeviceId||"");
  if(sink && typeof ctx.setSinkId==="function"){
    try{await ctx.setSinkId(sink);state.headphoneOutputSinkApplied=true;}
    catch(e){state.headphoneOutputSinkError=e?.message||String(e);}
  }
  return ctx;
}

function handleSparkReport(raw) {
  if (!raw || raw.type !== "spark") return;
  state.sparkRawPulse = Math.max(0, Math.min(1, Number(raw.pulse) || 0));
  state.sparkPulse = state.sparkRawPulse;
  state.sparkPeak = Math.max(0, Number(raw.peak) || 0);
  state.sparkRms = Math.max(0, Number(raw.rms) || 0);
  state.sparkCrest = Math.max(0, Number(raw.crest) || 0);
  state.seamDiscontinuity = Math.max(0, Math.min(1, Number(raw.discontinuity) || 0));
  state.seamSpeechRatio = Math.max(0, Math.min(1, Number(raw.speechRatio) || 0));
  raw.breathRatio = Math.max(0, Math.min(1, Number(raw.breathRatio) || 0));
  raw.speechStability = Math.max(0, Math.min(1, Number(raw.speechStability) || 0));
  const nowMs = Date.now();
  state.sparkLastReportAtMs = nowMs;
  state.sparkReports++;
  state.sparkFallbackActive = false;
  if (!state.context || !state.nodes) return;

  applySeamNaturalizer(raw);
  applyVoiceMaterial(raw);
  scheduleTransientValley(state.sparkPulse);
  scheduleTransientEdge(raw);

  if (!state.settings.sparkEnabled || state.orbitDegraded || !state.sceneRuntime || !SceneEngine) return;
  const delta = Math.abs(state.sparkPulse - state.sparkLastAppliedPulse);
  const elapsed = nowMs - state.sparkLastAppliedAtMs;
  if (delta < 0.02 && elapsed < 20) return; // keep the onset, thin only redundant release updates
  state.sparkLastAppliedPulse = state.sparkPulse;
  state.sparkLastAppliedAtMs = nowMs;
  const effectiveSparkPulse = state.sparkPulse * (1 - 0.62 * Math.max(0, Math.min(1, state.seamConfidence)));
  const fastDelta = SceneEngine.deriveFastSparkDelta(state.settings, effectiveSparkPulse);
  state.sceneRuntime.fastSpark = fastDelta;
  applyFastSparkControls(state.sceneRuntime.controls, fastDelta);
}

function linearToDb(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? 20 * Math.log10(n) : -120;
}


function fastMonitorNeeded(settings = state.settings) {
  return Boolean(settings.sparkEnabled || settings.seamNaturalizerEnabled || settings.transientValleyEnabled || settings.transientEdgeEnabled || settings.voiceMaterialEnabled);
}

function resetSeamNaturalizer(seconds = 0.10) {
  const ctx = state.context, nodes = state.nodes;
  state.seamConfidence = 0;
  if (!ctx || !nodes?.clarity) return;
  smooth(nodes.clarity.gain, state.settings.clarityDb, ctx.currentTime, Math.max(0.03, seconds));
}

function applySeamNaturalizer(raw) {
  if (!AdaptiveV26 || !state.context || !state.nodes) return;
  const confidence = state.orbitDegraded ? 0 : AdaptiveV26.deriveSeamConfidence(raw, state.settings);
  const previous = state.seamConfidence;
  state.seamConfidence = confidence;
  if (confidence >= 0.12 && previous < 0.12) state.seamEvents++;
  const amount = Math.max(0, Math.min(1, (Number(state.settings.seamNaturalizerAmount) || 0) / 100));
  // Bounded post-detection de-harshing. No look-ahead and no phoneme synthesis: only a small 2.6 kHz contour relaxation.
  const cutDb = state.settings.seamNaturalizerEnabled ? Math.min(1.35, 1.35 * confidence * (0.45 + 0.55 * amount)) : 0;
  const target = Number(state.settings.clarityDb) - cutDb;
  smooth(state.nodes.clarity.gain, target, state.context.currentTime, confidence >= previous ? 0.010 : 0.095);
}

function resetTransientValley(seconds = 0.08) {
  const ctx = state.context, node = state.nodes?.transientValley;
  state.transientValleyDepthDb = 0;
  if (!ctx || !node) return;
  node.gain.cancelScheduledValues(ctx.currentTime);
  node.gain.setValueAtTime(node.gain.value, ctx.currentTime);
  node.gain.linearRampToValueAtTime(1, ctx.currentTime + Math.max(0.01, seconds));
}

function scheduleTransientValley(pulse) {
  const ctx = state.context, node = state.nodes?.transientValley;
  if (!AdaptiveV26 || !ctx || !node || state.orbitDegraded || state.seamConfidence > 0.38) return;
  const nowMs = Date.now();
  const p = Math.max(0, Math.min(1, Number(pulse) || 0));
  const rising = p >= 0.36 && (state.transientValleyLastPulse < 0.30 || p - state.transientValleyLastPulse >= 0.18);
  state.transientValleyLastPulse = p;
  if (!rising || nowMs - state.transientValleyLastTriggerAtMs < 58) return;
  const profile = AdaptiveV26.deriveValleyProfile(state.settings, p, scenePressure());
  if (!profile.active) return;
  const now = ctx.currentTime;
  const target = dbToGain(-profile.depthDb);
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(Math.max(0.70, Math.min(1.05, node.gain.value)), now);
  node.gain.linearRampToValueAtTime(target, now + profile.attackMs / 1000);
  node.gain.setValueAtTime(target, now + (profile.attackMs + profile.holdMs) / 1000);
  node.gain.linearRampToValueAtTime(1, now + (profile.attackMs + profile.holdMs + profile.releaseMs) / 1000);
  state.transientValleyDepthDb = profile.depthDb;
  state.transientValleyLastTriggerAtMs = nowMs;
  state.transientValleyTriggers++;
}


function resetVoiceMaterial(seconds = 0.10) {
  state.voiceConfidence=0; state.voiceConfidenceRaw=0; state.voiceSyntheticTendency=0; state.voiceSyntheticTendencyRaw=0; state.voiceLastActive=false; state.voiceLastReportAtMs=0;
  const ctx=state.context, v=state.nodes?.voiceMaterial; if(!ctx||!v) return;
  for(const [param,val] of [[v.body.gain,0],[v.mud.gain,0],[v.presence.gain,0],[v.air.gain,0],[v.reflectionGain.gain,0]]) smooth(param,val,ctx.currentTime,seconds);
}

function applyVoiceMaterial(raw) {
  if(!AdaptiveV27 || !state.context || !state.nodes?.voiceMaterial) return;
  const v=AdaptiveV27.deriveVoiceMaterial(raw,state.settings);
  const ctx=state.context, n=state.nodes.voiceMaterial;
  if(v.active && !state.voiceLastActive) state.voiceEvents++;
  state.voiceLastActive=v.active;

  // Keep the audible Voice Material processing exactly on the raw detector output,
  // but stabilize the diagnostic confidence so a single ~8 ms consonant/pause block
  // cannot masquerade as a large quality regression. Raw values remain inspectable.
  const nowMs=Date.now();
  const firstReport=!state.voiceLastReportAtMs;
  const dtSec=firstReport ? .008 : Math.max(.004,Math.min(.25,(nowMs-state.voiceLastReportAtMs)/1000));
  state.voiceLastReportAtMs=nowMs;
  const follow=(current,target,attackSec,releaseSec)=>{
    const tau=target>current?attackSec:releaseSec;
    const a=1-Math.exp(-dtSec/Math.max(.001,tau));
    return current+(target-current)*a;
  };
  state.voiceConfidenceRaw=v.voiceConfidence;
  state.voiceSyntheticTendencyRaw=v.syntheticTendency;
  if(firstReport){
    state.voiceConfidence=v.voiceConfidence;
    state.voiceSyntheticTendency=v.syntheticTendency;
  }else{
    state.voiceConfidence=follow(state.voiceConfidence,v.voiceConfidence,.020,.420);
    state.voiceSyntheticTendency=follow(state.voiceSyntheticTendency,v.syntheticTendency,.060,.460);
  }

  const disabled=state.orbitDegraded || !state.settings.voiceMaterialEnabled;
  smooth(n.body.gain,disabled?0:v.bodyDb,ctx.currentTime,0.045);
  smooth(n.mud.gain,disabled?0:v.mudDb,ctx.currentTime,0.055);
  smooth(n.presence.gain,disabled?0:v.presenceDb,ctx.currentTime,0.040);
  smooth(n.air.gain,disabled?0:v.airDb,ctx.currentTime,0.065);
  smooth(n.reflectionGain.gain,disabled?0:v.reflectionWet,ctx.currentTime,0.075);
}

function resetTransientEdge(seconds=0.04){
  const ctx=state.context,n=state.nodes?.edgeAccentGain; state.transientEdgeWet=0; if(!ctx||!n)return;
  n.gain.cancelScheduledValues(ctx.currentTime); n.gain.setValueAtTime(n.gain.value,ctx.currentTime); n.gain.linearRampToValueAtTime(0,ctx.currentTime+Math.max(0.008,seconds));
}

function scheduleTransientEdge(raw={}){
  const ctx=state.context,n=state.nodes?.edgeAccentGain; if(!AdaptiveV27||!ctx||!n||state.orbitDegraded)return;
  const p=Math.max(0,Math.min(1,Number(raw.pulse)||0)); const nowMs=Date.now();
  const rising=p>=0.38 && (state.transientEdgeLastPulse<0.30 || p-state.transientEdgeLastPulse>=0.20); state.transientEdgeLastPulse=p;
  if(!rising || nowMs-state.transientEdgeLastTriggerAtMs<48)return;
  const prof=AdaptiveV27.deriveEdgeAccent(state.settings,raw,scenePressure(),state.seamConfidence);
  if(!prof.active)return;
  const now=ctx.currentTime; state.nodes.edgeAccentBand.frequency.setValueAtTime(prof.centerHz,now); state.nodes.edgeAccentBand.Q.setValueAtTime(prof.q,now);
  n.gain.cancelScheduledValues(now); n.gain.setValueAtTime(0,now); n.gain.linearRampToValueAtTime(prof.wet,now+0.0008); n.gain.setValueAtTime(prof.wet,now+prof.holdMs/1000); n.gain.linearRampToValueAtTime(0,now+(prof.holdMs+prof.releaseMs)/1000);
  state.transientEdgeWet=prof.wet; state.transientEdgeLastTriggerAtMs=nowMs; state.transientEdgeTriggers++;
}

function applyHrtfAndHeadphone(next, initial=false, previous=null){
  const ctx=state.context,h=state.nodes?.hrtf,c=state.nodes?.headphoneCorrection; if(!ctx||!h||!c||!AdaptiveV27||!HeadphoneProfiles)return;
  // A profile/device/remote-target transition changes the expected cue field; start a fresh
  // short diagnostic median instead of mixing old and new spatial states.
  const prev=previous||state.settings;
  if(initial || next.hrtfEnabled!==prev.hrtfEnabled || next.hrtfProfile!==prev.hrtfProfile || Number(next.hrtfAmount)!==Number(prev.hrtfAmount) || next.deviceProfile!==prev.deviceProfile || next.spatialOutputTarget!==prev.spatialOutputTarget) state.hrtfCueHistory=[];
  const localHeadphoneMode=isLocalHeadphoneIntent(next);
  const remoteBinaural=next.spatialEnabled && next.spatialOutputTarget==="sonobus-mobile-headphones";
  const hrtfMode=localHeadphoneMode || remoteBinaural;
  // Remote dataset-free HRTF stays automatic, but defaults to the less aggressive natural
  // field. This avoids stacking a strong front cue field on top of the dedicated Spatial layer.
  const hrtfName=remoteBinaural && !next.hrtfEnabled ? "natural" : next.hrtfProfile;
  const hrtfAmount=remoteBinaural ? Math.max(30,Number(next.hrtfAmount)||0) : Number(next.hrtfAmount)||0;
  const hp=AdaptiveV27.hrtfProfile(hrtfName,hrtfMode && (next.hrtfEnabled||remoteBinaural) ? hrtfAmount : 0);
  if(!h.mono){ const d=1/(1+hp.crossfeed); smooth(h.directL.gain,d,ctx.currentTime,initial?0.05:0.10); smooth(h.directR.gain,d,ctx.currentTime,initial?0.05:0.10); smooth(h.crossL.gain,hp.crossfeed*d,ctx.currentTime,0.10); smooth(h.crossR.gain,hp.crossfeed*d,ctx.currentTime,0.10); smooth(h.delayL.delayTime,hp.delaySeconds,ctx.currentTime,0.10); smooth(h.delayR.delayTime,hp.delaySeconds,ctx.currentTime,0.10); smooth(h.lpL.frequency,Math.min(hp.lowpassHz,ctx.sampleRate*0.44),ctx.currentTime,0.10); smooth(h.lpR.frequency,Math.min(hp.lowpassHz,ctx.sampleRate*0.44),ctx.currentTime,0.10); smooth(h.pinna.gain,hp.pinnaDb,ctx.currentTime,0.10); smooth(h.air.gain,hp.airDb,ctx.currentTime,0.10); }
  const profile=HeadphoneProfiles.getProfile(next.headphoneModel); const strength=next.headphoneCorrectionEnabled&&localHeadphoneMode?Math.max(0,Math.min(1,next.headphoneCorrectionStrength/100)):0;
  smooth(c.pre.gain,dbToGain(profile.preampDb*strength),ctx.currentTime,initial?0.08:0.18);
  for(let i=0;i<c.filters.length;i++){ const f=c.filters[i],spec=profile.filters[i]||{type:"peaking",frequency:1000,gain:0,q:0.7}; f.type=spec.type; smooth(f.frequency,Math.min(spec.frequency,ctx.sampleRate*0.44),ctx.currentTime,0.15); const q=(spec.type==="lowpass"||spec.type==="highpass")?webAudioResonanceDb(spec.q):spec.q; smooth(f.Q,q,ctx.currentTime,0.15); smooth(f.gain,(spec.gain||0)*strength,ctx.currentTime,0.18); }
  const calEnabled=Boolean(next.headphoneCalibrationEnabled&&localHeadphoneMode&&AdaptiveV29); const calStrength=calEnabled?Math.max(0,Math.min(1,next.headphoneCalibrationStrength/100)):0;
  const cal=AdaptiveV29?.safeCalibrationArray(next.headphoneCalibrationGainsDb)||Array(8).fill(0); const preDb=calEnabled?AdaptiveV29.calibrationPrecutDb(cal,next.headphoneCalibrationStrength):0;
  if(c.calPre)smooth(c.calPre.gain,dbToGain(preDb),ctx.currentTime,initial?0.08:0.18);
  for(let i=0;i<(c.calibrationFilters||[]).length;i++){const f=c.calibrationFilters[i],hz=AdaptiveV29.CALIBRATION_FREQUENCIES[i];f.type="peaking";smooth(f.frequency,Math.min(hz,ctx.sampleRate*0.44),ctx.currentTime,0.12);smooth(f.Q,0.95,ctx.currentTime,0.12);smooth(f.gain,(cal[i]||0)*calStrength,ctx.currentTime,0.18);}
  if(calEnabled)state.headphoneCalibrationLastAppliedAtMs=Date.now();
}

function baselineAdaptiveControls() {
  return {
    width: Number(state.settings.width) || 0,
    perspectiveDepth: state.settings.perspectiveEnabled ? Number(state.settings.perspectiveDepth) || 0 : 0,
    detail: Number(state.settings.detail) || 0,
    reality: Number(state.settings.reality) || 0,
    lowCutHz: Number(state.settings.lowCutHz) || 35,
    bassDb: Number(state.settings.bassDb) || 0,
    warmthDb: Number(state.settings.warmthDb) || 0,
    airDb: Number(state.settings.airDb) || 0
  };
}

function resetV26Enhancements(seconds = 0.10) {
  resetSeamNaturalizer(seconds);
  resetTransientValley(seconds);
  resetVoiceMaterial(seconds);
  resetTransientEdge(seconds);
}

function resetAdaptiveRuntime(seconds = 0.10) {
  resetV26Enhancements(seconds);
  state.sparkPulse = 0; state.sparkRawPulse = 0; state.sparkLastAppliedPulse = 0;
  state.sceneRuntime = null;
  resetSparkMakeup(seconds);
  resetImpactLiberation(seconds);
}

function applyOrbitLevel(level, reason = "health") {
  const next = Math.max(0, Math.min(4, Number(level) || 0));
  if (next === state.orbitLevel) return;
  const previous = state.orbitLevel;
  state.orbitLevel = next;
  state.orbitLastChangeAtMs = Date.now();
  state.orbitActions++;
  state.orbitLastAction = `${previous}->${next}:${reason}`;
  state.orbitDegraded = next >= 4;

  if (next >= 1) commitEffectiveLevelGain({ seconds:0.05, force:true });
  if (next >= 2) resetV26Enhancements(0.08);
  if (next >= 3) resetAdaptiveRuntime(0.10);
  if (next >= 4 && state.context && state.nodes) {
    applySceneControls(baselineAdaptiveControls());
    resetSparkMakeup(0.08);
    resetImpactLiberation(0.08);
  }
}

function orbitKeeperTick(nowMs = Date.now()) {
  if (!AdaptiveV26 || !state.context || !state.nodes) return;
  if (state.orbitLastTickAtMs) state.orbitTimerDriftMs = Math.max(0, nowMs - state.orbitLastTickAtMs - 1000);
  state.orbitLastTickAtMs = nowMs;
  if (!state.settings.orbitKeeperEnabled) {
    state.orbitHealthScore = 100; state.orbitStableTicks = 0; state.orbitFaultTicks = 0;
    if (state.orbitLevel !== 0) applyOrbitLevel(0, "disabled");
    return;
  }
  // Ignore startup transients before all monitors have had time to report.
  if (state.startedAt && nowMs - state.startedAt < 3200) { state.orbitHealthScore = 100; return; }

  const expectedEffective = Modular.composeEffectiveLevelDb({
    autoLevelEnabled: state.settings.autoLevelEnabled, autoLevelDb: state.autoLevelDb,
    sparkEnabled: state.settings.sparkEnabled, sparkMakeupDb: state.sparkMakeupDb, minDb:-12, maxDb:6.8
  });
  const fastExpected = fastMonitorNeeded();
  const health = AdaptiveV26.computeOrbitHealth({
    safetyMeterExpected: state.safetyMeterAvailable,
    safetyReportAgeMs: state.safetyLastStatsAtMs ? nowMs - state.safetyLastStatsAtMs : 999999,
    fastMonitorExpected: state.sparkWorkletAvailable && fastExpected,
    sparkReportAgeMs: state.sparkLastReportAtMs ? nowMs - state.sparkLastReportAtMs : 999999,
    sceneExpected: sceneRuntimeNeeded(),
    sceneTickAgeMs: state.sceneLastTickMs ? performance.now() - state.sceneLastTickMs : 999999,
    nonFiniteCount: Number(state.safetyStats?.nonFiniteCount || 0),
    peak: Number(state.safetyStats?.peak || 0),
    limiterReductionDb: Number(state.nodes?.limiter?.reduction || 0),
    effectiveGainErrorDb: state.effectiveLevelDb - expectedEffective,
    timerDriftMs: state.orbitTimerDriftMs,
    contextState: state.context.state,
    invalidNodeState: !Number.isFinite(Number(state.nodes?.autoLevel?.gain?.value)) || !Number.isFinite(Number(state.nodes?.transientValley?.gain?.value))
  });
  state.orbitHealthScore = health.score;
  const desired = AdaptiveV26.desiredOrbitLevel(health.score);
  if (desired > state.orbitLevel) {
    state.orbitFaultTicks++;
    state.orbitStableTicks = 0;
    if (state.orbitFaultTicks >= (desired >= 3 ? 2 : 3)) {
      applyOrbitLevel(desired, health.reasons[0] || "health");
      state.orbitFaultTicks = 0;
    }
  } else if (desired < state.orbitLevel && health.score >= 92) {
    state.orbitStableTicks++;
    state.orbitFaultTicks = 0;
    if (state.orbitStableTicks >= 20) {
      applyOrbitLevel(Math.max(desired, state.orbitLevel - 1), "stable-return");
      state.orbitStableTicks = 0;
    }
  } else {
    state.orbitFaultTicks = Math.max(0, state.orbitFaultTicks - 1);
    state.orbitStableTicks = desired === 0 && state.orbitLevel === 0 ? Math.min(20, state.orbitStableTicks + 1) : 0;
  }
}

function stopOrbitKeeperMonitor() {
  if (state.orbitKeeperTimer) clearInterval(state.orbitKeeperTimer);
  state.orbitKeeperTimer = null;
  state.orbitLastTickAtMs = 0;
  state.orbitTimerDriftMs = 0;
}

function startOrbitKeeperMonitor() {
  orbitKeeperTick(Date.now());
  if (!state.orbitKeeperTimer) state.orbitKeeperTimer = setInterval(() => orbitKeeperTick(Date.now()), 1000);
}

async function createSpatialMetricsNode(ctx) {
  try {
    await ctx.audioWorklet.addModule(chrome.runtime.getURL("spatial-metrics-worklet.js"));
    const node=new AudioWorkletNode(ctx,"yurika-spatial-metrics",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
    node.port.onmessage=(event)=>{
      const d=event?.data;if(!d||d.type!=="spatial")return;
      const rawCue=Number.isFinite(Number(d.hrtfCueConsistency))?Math.max(0,Math.min(100,Number(d.hrtfCueConsistency))):null;
      let stableCue=rawCue;
      if(rawCue!==null){
        state.hrtfCueHistory.push(rawCue);
        if(state.hrtfCueHistory.length>9)state.hrtfCueHistory.shift();
        const sorted=[...state.hrtfCueHistory].sort((a,b)=>a-b);
        stableCue=sorted[Math.floor(sorted.length/2)];
      }
      state.spatialMetrics={...d,hrtfCueConsistencyRaw:rawCue,hrtfCueConsistency:stableCue};
      state.spatialLastReportAtMs=Date.now();
    };
    const blocks=AdaptiveV28?.spatialReportBlocks?.(ctx.sampleRate,state.cpuProfile?.spatialReportMs||80,128)||24;
    node.port.postMessage({reportEveryBlocks:blocks,maxLagMs:1.2});
    return {node,available:true};
  } catch { return {node:ctx.createGain(),available:false}; }
}

function createReflectionCharacterStage(ctx,input){
  const hp=createFilter(ctx,"highpass",520,0,.7),lp=createFilter(ctx,"lowpass",11800,0,.7),sum=ctx.createGain();
  const delays=[ctx.createDelay(.04),ctx.createDelay(.04),ctx.createDelay(.04)],gains=[ctx.createGain(),ctx.createGain(),ctx.createGain()];
  for(const g of gains)g.gain.value=0;
  input.connect(hp);hp.connect(lp);for(let i=0;i<3;i++){lp.connect(delays[i]);delays[i].connect(gains[i]);gains[i].connect(sum);}
  return {output:sum,stage:{hp,lp,delays,gains,sum}};
}
function applyReflectionCharacter(report={}){
  if(!state.context||!state.nodes?.reflectionCharacter||!AdaptiveV28)return;
  const p=AdaptiveV28.reflectionProfile(state.settings,{...report,seamConfidence:state.seamConfidence},scenePressure());
  const st=state.nodes.reflectionCharacter,now=state.context.currentTime;
  smooth(st.hp.frequency,p.hpHz,now,.08);smooth(st.lp.frequency,Math.min(p.lpHz,state.context.sampleRate*.44),now,.08);
  for(let i=0;i<3;i++){smooth(st.delays[i].delayTime,(p.delaysMs[i]||0)/1000,now,.05);smooth(st.gains[i].gain,p.taps[i]||0,now,(p.taps[i]||0)>st.gains[i].gain.value?.008:.060);}
}
function resetReflectionCharacter(seconds=.06){if(!state.context||!state.nodes?.reflectionCharacter)return;for(const g of state.nodes.reflectionCharacter.gains)smooth(g.gain,0,state.context.currentTime,seconds);}

function createAvSyncStage(ctx,input){
  const direct=ctx.createGain(),delay=ctx.createDelay(.18),delayed=ctx.createGain(),sum=ctx.createGain();direct.gain.value=1;delayed.gain.value=0;delay.delayTime.value=0;
  input.connect(direct);direct.connect(sum);input.connect(delay);delay.connect(delayed);delayed.connect(sum);return {output:sum,stage:{direct,delay,delayed,sum}};
}
function applyAvSync(){
  if(!state.context||!state.nodes?.avSync)return;
  const on=Boolean(state.settings.avSyncEnabled)&&Number(state.settings.avSyncDelayMs)>0;
  const now=state.context.currentTime;
  const requestedSec=Math.max(0,Math.min(.15,Number(state.settings.avSyncDelayMs)||0)/1000);
  const effectiveSec=on?requestedSec:0;
  smooth(state.nodes.avSync.direct.gain,on?0:1,now,.025);
  smooth(state.nodes.avSync.delayed.gain,on?1:0,now,.025);
  smooth(state.nodes.avSync.delay.delayTime,requestedSec,now,.04);
  const base=Number(state.context.baseLatency||0)+Number(state.context.outputLatency||0);
  state.avSyncBaseLatencyMs=base*1000;
  state.avSyncAppliedDelayMs=effectiveSec*1000;
  state.avSyncEstimatedAudioLatencyMs=(base+effectiveSec)*1000;
}

function handleSafetyStats(raw) {
  const stats = {
    peak: Math.max(0, Number(raw.peak) || 0),
    rms: Math.max(0, Number(raw.rms) || 0),
    correlation: Number.isFinite(Number(raw.correlation)) ? Math.max(-1, Math.min(1, Number(raw.correlation))) : null,
    balanceDb: Number.isFinite(Number(raw.balanceDb)) ? Number(raw.balanceDb) : null,
    nonFiniteCount: Math.max(0, Number(raw.nonFiniteCount) || 0),
    clipCount: Math.max(0, Number(raw.clipCount) || 0),
    channels: Math.max(0, Number(raw.channels) || 0)
  };
  state.safetyStats = stats;
  state.safetyLastStatsAtMs = Date.now();

  const rmsDbfs = linearToDb(stats.rms);
  if (stats.correlation !== null && rmsDbfs > -60) {
    state.stereoCorrelationEma = state.stereoCorrelationEma === null ? stats.correlation : (state.stereoCorrelationEma * 0.90 + stats.correlation * 0.10);
    const bal = stats.balanceDb === null ? 99 : Math.abs(stats.balanceDb);
    if (stats.correlation > 0.9995 && bal < 0.35) state.monoLikeStreak = Math.min(1000, state.monoLikeStreak + 1);
    else state.monoLikeStreak = Math.max(0, state.monoLikeStreak - 2);
  }

  if (stats.nonFiniteCount > 0) {
    state.safetyFaults += stats.nonFiniteCount;
    state.safetyStableReports = 0;
    if (stats.nonFiniteCount >= 4 && !state.safetyFaultLatched && state.context && state.nodes?.masterSafety) {
      state.safetyFaultLatched = true;
      smooth(state.nodes.masterSafety.gain, 0, state.context.currentTime, 0.012);
    }
  } else if (state.safetyFaultLatched) {
    state.safetyStableReports++;
    if (state.safetyStableReports >= 8 && state.context && state.nodes?.masterSafety) {
      state.safetyFaultLatched = false;
      state.safetyStableReports = 0;
      state.runtimeRecoveries++;
      smooth(state.nodes.masterSafety.gain, 1, state.context.currentTime, 0.20);
    }
  }
}

function stopSafetyMonitor() {
  if (state.safetyMonitorTimer) clearInterval(state.safetyMonitorTimer);
  state.safetyMonitorTimer = null;
}

function safetyMonitorTick() {
  const ctx = state.context, nodes = state.nodes;
  if (!ctx || !nodes) return;
  const nowMs = Date.now();
  if (state.safetyMeterAvailable && state.safetyLastStatsAtMs && nowMs - state.safetyLastStatsAtMs > 3000) state.runtimeWatchdogMisses++;

  if (ctx.state === "suspended") {
    ctx.resume().then(() => { state.runtimeRecoveries++; }).catch(() => {});
  }

  const enabled = state.settings.adaptiveSafetyEnabled !== false;
  const limiterReduction = Number(nodes.limiter?.reduction);
  const peak = Number(state.safetyStats?.peak || 0);
  const rmsDbfs = linearToDb(state.safetyStats?.rms || 0);
  const pressure = (Number.isFinite(limiterReduction) && limiterReduction < -1.5) || peak > 0.985;
  const relaxed = (!Number.isFinite(limiterReduction) || limiterReduction > -0.35) && peak < 0.90;
  // v3.3.1: safety attenuation still attacks quickly, but it no longer releases while
  // program audio is active. The old 0.10 dB / 0.8 s release ramp could land inside
  // steady-state measurements (and audible sustained tones) and appear as THD+N.
  const quietForRelease = peak < 0.08 || rmsDbfs < -42;

  if (!enabled) {
    state.limiterPressureStreak = 0; state.limiterRelaxStreak = 0; state.adaptiveTrimQuietStreak = 0;
    state.adaptiveTrimHoldReason = "disabled";
    if (state.adaptiveTrimDb !== 0) { state.adaptiveTrimDb = 0; smooth(nodes.adaptiveTrim.gain, 1, ctx.currentTime, 0.5); }
    return;
  }

  if (pressure) {
    state.limiterPressureStreak++; state.limiterRelaxStreak = 0; state.adaptiveTrimQuietStreak = 0;
    state.adaptiveTrimHoldReason = "pressure"; state.adaptiveTrimLastPressureAtMs = nowMs;
    if (state.limiterPressureStreak >= 3) {
      const next = Math.max(-3, state.adaptiveTrimDb - 0.25);
      if (next !== state.adaptiveTrimDb) { state.adaptiveTrimDb = next; smooth(nodes.adaptiveTrim.gain, dbToGain(next), ctx.currentTime, 0.08); }
      state.limiterPressureStreak = 0;
    }
  } else if (relaxed) {
    state.limiterPressureStreak = Math.max(0, state.limiterPressureStreak - 1);
    if (state.adaptiveTrimDb < 0) {
      if (quietForRelease) {
        state.adaptiveTrimQuietStreak++; state.limiterRelaxStreak++; state.adaptiveTrimHoldReason = "quiet-release-pending";
        if (state.adaptiveTrimQuietStreak >= 8) {
          const next = Math.min(0, state.adaptiveTrimDb + 0.10);
          state.adaptiveTrimDb = next; smooth(nodes.adaptiveTrim.gain, dbToGain(next), ctx.currentTime, 0.45);
          state.adaptiveTrimQuietStreak = 0; state.limiterRelaxStreak = 0; state.adaptiveTrimReleaseCount++;
          state.adaptiveTrimHoldReason = next < 0 ? "quiet-release-step" : "unity";
        }
      } else {
        state.adaptiveTrimQuietStreak = 0; state.limiterRelaxStreak = 0;
        state.adaptiveTrimHoldReason = "active-program-hold";
      }
    } else {
      state.adaptiveTrimQuietStreak = 0; state.limiterRelaxStreak = 0; state.adaptiveTrimHoldReason = "unity";
    }
  } else {
    state.limiterPressureStreak = Math.max(0, state.limiterPressureStreak - 1);
    state.limiterRelaxStreak = 0; state.adaptiveTrimQuietStreak = 0;
    state.adaptiveTrimHoldReason = state.adaptiveTrimDb < 0 ? "guard-band-hold" : "unity";
  }
}

function startSafetyMonitor() {
  if (!state.safetyMonitorTimer) state.safetyMonitorTimer = setInterval(safetyMonitorTick, 250);
}

function stopAutoLevelMonitor() {
  if (state.autoLevelTimer) clearInterval(state.autoLevelTimer);
  state.autoLevelTimer = null; state.autoLevelBuffer = null; state.autoLevelRmsEma = null;
}

function commitEffectiveLevelGain({ seconds = 0.02, force = false } = {}) {
  const ctx = state.context, gain = state.nodes?.autoLevel;
  if (!ctx || !gain) return;
  const effectiveDb = Modular.composeEffectiveLevelDb({
    autoLevelEnabled: state.settings.autoLevelEnabled, autoLevelDb: state.autoLevelDb,
    sparkEnabled: state.settings.sparkEnabled, sparkMakeupDb: state.sparkMakeupDb, minDb: -12, maxDb: 6.8
  });
  if (!force && Math.abs(effectiveDb - state.effectiveLevelDb) < 0.002) return;
  state.effectiveLevelDb = effectiveDb;
  state.effectiveLevelWrites++;
  smooth(gain.gain, dbToGain(effectiveDb), ctx.currentTime, Math.max(0.002, Number(seconds) || 0.02));
}

function resetSparkMakeup(seconds = 0.045) {
  const changed = state.sparkMakeupDb !== 0;
  state.sparkMakeupDb = 0;
  if (changed || Math.abs(state.effectiveLevelDb - (state.settings.autoLevelEnabled ? state.autoLevelDb : 0)) >= 0.002) {
    commitEffectiveLevelGain({ seconds, force: true });
  }
}

function autoLevelTick() {
  const ctx = state.context, analyser = state.nodes?.sharedAnalyser;
  if (!ctx || !analyser || !state.nodes?.autoLevel) return;
  if (!state.settings.autoLevelEnabled) {
    if (state.autoLevelDb !== 0) { state.autoLevelDb = 0; commitEffectiveLevelGain({ seconds: 0.8, force: true }); }
    state.autoLevelMeasuredDbfs = null; state.autoLevelRmsEma = null; return;
  }
  if (!state.autoLevelBuffer || state.autoLevelBuffer.length !== analyser.fftSize) state.autoLevelBuffer = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(state.autoLevelBuffer);
  let ss = 0; for (let i=0;i<state.autoLevelBuffer.length;i++) { const x=state.autoLevelBuffer[i]; ss += x*x; }
  const rms = Math.sqrt(ss / Math.max(1,state.autoLevelBuffer.length));
  state.autoLevelRmsEma = state.autoLevelRmsEma === null ? rms : state.autoLevelRmsEma*0.88 + rms*0.12;
  const dbfs = linearToDb(state.autoLevelRmsEma); state.autoLevelMeasuredDbfs = dbfs;
  const target = Modular.autoLevelTarget(state.settings.autoLevelProfile, state.settings.autoLevelTargetDbfs);
  const desired = Modular.autoLevelCorrection({ measuredDbfs:dbfs, targetDbfs:target, currentDb:state.autoLevelDb, maxBoostDb:6, maxCutDb:12, deadbandDb:0.6 });
  const delta = desired - state.autoLevelDb;
  const step = Math.abs(delta) > 2 ? Math.sign(delta)*0.35 : Math.sign(delta)*Math.min(Math.abs(delta),0.15);
  if (Math.abs(delta) > 0.05) {
    state.autoLevelDb = Math.max(-12,Math.min(6,state.autoLevelDb+step));
    commitEffectiveLevelGain({ seconds: delta < 0 ? 0.22 : 0.65 });
  }
}

function startAutoLevelMonitor() {
  autoLevelTick();
  if (!state.autoLevelTimer) state.autoLevelTimer = setInterval(autoLevelTick, 250);
}


function stopSceneMonitor() {
  if (state.sceneMonitorTimer) clearInterval(state.sceneMonitorTimer);
  state.sceneMonitorTimer = null;
  state.sceneFreqData = null;
  state.sceneTimeData = null;
  state.sceneLastTickMs = 0;
}

function sceneRuntimeNeeded(settings = state.settings) {
  return Boolean(SceneEngine && (settings.sceneEnabled || settings.sparkEnabled || settings.multiSpeakerEnabled || settings.deviceProfile !== "stereo"));
}

function currentFastSparkPulse() {
  const fresh = state.sparkWorkletAvailable && state.sparkLastReportAtMs > 0 && (Date.now() - state.sparkLastReportAtMs) < 180;
  state.sparkFallbackActive = Boolean(state.settings.sparkEnabled && !fresh);
  return fresh ? state.sparkPulse : undefined;
}

function scenePressure() {
  const nodes = state.nodes;
  const limiterReduction = Number(nodes?.limiter?.reduction || 0);
  const limiterPressure = Math.max(0, Math.min(1, (-limiterReduction - 0.35) / 2.4));
  const peak = Number(state.safetyStats?.peak || 0);
  const peakPressure = Math.max(0, Math.min(1, (peak - 0.90) / 0.075));
  return Math.max(limiterPressure, peakPressure);
}

function applySceneControls(c) {
  const ctx = state.context, nodes = state.nodes;
  if (!ctx || !nodes || !c) return;

  const pressure = scenePressure();
  const blend = (base, dynamic) => base + (dynamic - base) * (1 - 0.78 * pressure);
  const effectiveWidth = blend(state.settings.width, c.width);
  const effectiveDepth = blend(state.settings.perspectiveEnabled ? state.settings.perspectiveDepth : 0, c.perspectiveDepth);
  const effectiveDetail = blend(state.settings.detail, c.detail);
  const effectiveReality = blend(state.settings.reality, c.reality);

  applyLowCutRouting(nodes, blend(state.settings.lowCutHz, c.lowCutHz), ctx, 0.18);
  smooth(nodes.bass.gain, blend(state.settings.bassDb, c.bassDb), ctx.currentTime, 0.22);
  smooth(nodes.warmth.gain, blend(state.settings.warmthDb, c.warmthDb), ctx.currentTime, 0.22);
  smooth(nodes.air.gain, blend(state.settings.airDb, c.airDb), ctx.currentTime, 0.22);

  smooth(nodes.detailGain.gain, detailMixGain(effectiveDetail), ctx.currentTime, 0.055);
  const reality = realityMixGains(effectiveReality);
  smooth(nodes.realityHarmGain.gain, reality.harmonic, ctx.currentTime, 0.07);
  smooth(nodes.realityReflectionGain.gain, reality.reflection, ctx.currentTime, 0.10);
  applyWidth(nodes.widthMatrix, effectiveWidth, ctx, 0.10);

  const pp = perspectiveProfile(effectiveDepth > 0.05, effectiveDepth);
  smooth(nodes.perspective.direct.gain, dbToGain(pp.directDb), ctx.currentTime, 0.12);
  smooth(nodes.perspective.ambientHp.frequency, pp.highpassHz, ctx.currentTime, 0.12);
  smooth(nodes.perspective.ambientLp.frequency, Math.min(pp.lowpassHz, ctx.sampleRate * 0.44), ctx.currentTime, 0.12);
  smooth(nodes.perspective.ambientDelay.delayTime, pp.predelaySeconds, ctx.currentTime, 0.14);
  smooth(nodes.perspective.wet.gain, pp.wet, ctx.currentTime, 0.16);

  // Slow lane owns the baseline. Spark may only add above this target.
  smooth(nodes.output.gain, dbToGain(computeEffectiveOutputDb(state.settings)), ctx.currentTime, 0.035);
}

function compressorBaseProfile(settings = state.settings) {
  return settings?.compressor
    ? { threshold:-20, knee:8, ratio:2.2, attack:0.012, release:0.16 }
    : { threshold:0, knee:0, ratio:1, attack:0.003, release:0.05 };
}

function applyCompressorEscape(escape = 0, releaseSeconds = 0.075) {
  const ctx = state.context, comp = state.nodes?.compressor;
  if (!ctx || !comp) return;
  const base = compressorBaseProfile();
  const e = state.settings.compressor ? Math.max(0, Math.min(0.92, Number(escape) || 0)) : 0;
  const previousEscape = state.compressorEscape;
  state.compressorEscape = e;
  // Strong hits temporarily become less compressed and get a slower attack window.
  const target = state.settings.compressor ? {
    threshold: base.threshold + 11.5 * e,
    knee: Math.max(2.5, base.knee - 5.5 * e),
    ratio: Math.max(1.22, base.ratio - 1.02 * e),
    attack: Math.min(0.034, base.attack + 0.024 * e),
    release: Math.max(0.095, base.release - 0.055 * e)
  } : base;
  const rising = e >= previousEscape;
  const t = rising ? 0.0035 : Math.max(0.04, releaseSeconds);
  smooth(comp.threshold, target.threshold, ctx.currentTime, t);
  smooth(comp.knee, target.knee, ctx.currentTime, t);
  smooth(comp.ratio, target.ratio, ctx.currentTime, t);
  smooth(comp.attack, target.attack, ctx.currentTime, t);
  smooth(comp.release, target.release, ctx.currentTime, t);
}

function resetImpactLiberation(seconds = 0.075) {
  const ctx = state.context, nodes = state.nodes;
  state.impactGain = 0;
  state.compressorEscape = 0;
  if (!ctx || !nodes) return;
  if (nodes.impactGain) smooth(nodes.impactGain.gain, 0, ctx.currentTime, Math.max(0.02, seconds));
  applyCompressorEscape(0, seconds);
}

function applyFastSparkControls(base, delta) {
  const ctx = state.context, nodes = state.nodes;
  if (!ctx || !nodes || !base || !delta) return;
  const targets = SceneEngine.composeFastSparkTargets(base, delta, state.settings.deviceProfile, scenePressure());

  smooth(nodes.detailGain.gain, detailMixGain(targets.detail), ctx.currentTime, 0.006);
  const reality = realityMixGains(targets.reality);
  smooth(nodes.realityHarmGain.gain, reality.harmonic, ctx.currentTime, 0.009);
  applyWidth(nodes.widthMatrix, targets.width, ctx, 0.012);

  const nextImpact = state.settings.impactEnabled !== false ? Math.max(0, Number(targets.impactGain) || 0) : 0;
  state.impactGain = nextImpact;
  if (nodes.impactGain) smooth(nodes.impactGain.gain, nextImpact, ctx.currentTime, nextImpact >= nodes.impactGain.gain.value ? 0.0035 : 0.060);
  applyCompressorEscape(state.settings.impactEnabled !== false ? targets.compressorEscape : 0, 0.070);

  const previousSparkDb = state.sparkMakeupDb;
  state.sparkMakeupDb = Math.max(0, Number(targets.sparkMakeupDb) || 0);
  commitEffectiveLevelGain({ seconds: state.sparkMakeupDb >= previousSparkDb ? 0.004 : 0.045 });
}

function sceneTick() {
  const ctx = state.context, nodes = state.nodes, analyser = nodes?.sharedAnalyser;
  if (!ctx || !nodes || !analyser || !SceneEngine || !sceneRuntimeNeeded()) return;
  if (state.orbitDegraded) {
    applySceneControls(baselineAdaptiveControls());
    return;
  }
  if (!state.sceneFreqData || state.sceneFreqData.length !== analyser.frequencyBinCount) state.sceneFreqData = new Float32Array(analyser.frequencyBinCount);
  if (!state.sceneTimeData || state.sceneTimeData.length !== analyser.fftSize) state.sceneTimeData = new Float32Array(analyser.fftSize);
  analyser.getFloatFrequencyData(state.sceneFreqData);
  analyser.getFloatTimeDomainData(state.sceneTimeData);
  const nowMs = performance.now();
  const dt = state.sceneLastTickMs ? Math.max(0.02, Math.min(0.25, (nowMs - state.sceneLastTickMs) / 1000)) : 0.05;
  state.sceneLastTickMs = nowMs;
  const currentPulse = currentFastSparkPulse();
  state.sceneRuntime = SceneEngine.updateRuntime(
    state.sceneRuntime, state.sceneFreqData, state.sceneTimeData, ctx.sampleRate,
    state.settings, dt
  );
  applySceneControls(state.sceneRuntime.controls);
  if (state.settings.sparkEnabled) {
    const fallbackPulse = Number(state.sceneRuntime.features?.transient) || 0;
    const sourcePulse = Number.isFinite(currentPulse) ? currentPulse : fallbackPulse;
    const effectivePulse = sourcePulse * (1 - 0.62 * Math.max(0, Math.min(1, state.seamConfidence)));
    const fastDelta = SceneEngine.deriveFastSparkDelta(state.settings, effectivePulse);
    state.sceneRuntime.fastSpark = fastDelta;
    applyFastSparkControls(state.sceneRuntime.controls, fastDelta);
  }
}

function startSceneMonitor() {
  if (!sceneRuntimeNeeded()) return;
  sceneTick();
  if (!state.sceneMonitorTimer) state.sceneMonitorTimer = setInterval(sceneTick, 50);
}

function stopDjAutoMix() {
  if (state.djAutoMixTimer) clearInterval(state.djAutoMixTimer);
  state.djAutoMixTimer = null; state.djAutoMixActive = false; state.djAutoMixStartedAt = 0; state.djAutoMixDurationMs = 0; state.djAutoMixDirection = null; state.djAutoMixPosition = null;
}

function startDjAutoMix(direction = "A_TO_B", seconds = 8) {
  if (!state.context || state.context.state === "closed" || !state.streams?.A || !state.streams?.B || !state.deckNodes?.A || !state.deckNodes?.B) {
    return { ok:false, error:"AUTO MIXにはDeck AとDeck Bの両方が必要です。" };
  }
  stopDjAutoMix();
  const dir = direction === "B_TO_A" ? "B_TO_A" : "A_TO_B";
  const start = Number(state.settings.djCrossfader) || 0;
  const target = dir === "A_TO_B" ? 100 : -100;
  const durationMs = Math.max(100, Math.min(60000, Number(seconds || state.settings.djAutoMixSeconds || 8) * 1000));
  state.djAutoMixActive = true; state.djAutoMixPosition = start; state.djAutoMixStartedAt = Date.now(); state.djAutoMixDurationMs = durationMs; state.djAutoMixDirection = dir;
  const tick = () => {
    if (!state.djAutoMixActive || !state.context || state.context.state === "closed") { stopDjAutoMix(); return; }
    const raw = Math.max(0, Math.min(1, (Date.now() - state.djAutoMixStartedAt) / durationMs));
    const eased = raw * raw * (3 - 2 * raw);
    const pos = start + (target - start) * eased;
    state.djAutoMixPosition = pos;
    AudioModules.applyDecks(state.deckNodes, { ...state.settings, djEnabled:true, djCrossfader:pos }, state.context);
    if (raw >= 1) {
      state.settings = sanitizeSettings({ ...state.settings, djCrossfader:target, djEnabled:true });
      stopDjAutoMix();
      AudioModules.applyDecks(state.deckNodes, state.settings, state.context);
    }
  };
  tick(); state.djAutoMixTimer = setInterval(tick, 50);
  return { ok:true, active:true, direction:dir, seconds:durationMs/1000, target };
}

function createWidthMatrix(ctx, input, inputChannels) {
  if (inputChannels === 1) return { output: input, matrix: null };
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const ll = ctx.createGain(), rl = ctx.createGain(), lr = ctx.createGain(), rr = ctx.createGain();
  input.connect(splitter);
  splitter.connect(ll, 0); splitter.connect(lr, 0);
  splitter.connect(rl, 1); splitter.connect(rr, 1);
  ll.connect(merger, 0, 0); rl.connect(merger, 0, 0);
  lr.connect(merger, 0, 1); rr.connect(merger, 0, 1);
  ll.gain.value = 1; rr.gain.value = 1; lr.gain.value = 0; rl.gain.value = 0;
  return { output: merger, matrix: { splitter, merger, ll, rl, lr, rr } };
}

function applyWidth(matrix, amount, ctx, seconds) {
  if (!matrix) return;
  const m = widthToMatrix(amount);
  const now = ctx.currentTime;
  for (const [param, value] of [
    [matrix.ll.gain, m.same], [matrix.rr.gain, m.same],
    [matrix.lr.gain, m.cross], [matrix.rl.gain, m.cross]
  ]) smooth(param, value, now, seconds);
}

function createDapCrossfeed(ctx, input, inputChannels) {
  if (inputChannels === 1) return { output: input, matrix: null };
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const directL = ctx.createGain(), directR = ctx.createGain();
  const crossL = createFilter(ctx, "lowpass", 700, 0, 0.7);
  const crossR = createFilter(ctx, "lowpass", 700, 0, 0.7);
  const crossLGain = ctx.createGain(), crossRGain = ctx.createGain();
  input.connect(splitter);
  splitter.connect(directL, 0); directL.connect(merger, 0, 0);
  splitter.connect(directR, 1); directR.connect(merger, 0, 1);
  splitter.connect(crossL, 0); crossL.connect(crossLGain); crossLGain.connect(merger, 0, 1);
  splitter.connect(crossR, 1); crossR.connect(crossRGain); crossRGain.connect(merger, 0, 0);
  crossLGain.gain.value = 0; crossRGain.gain.value = 0;
  directL.gain.value = 1; directR.gain.value = 1;
  return { output: merger, matrix: { splitter, merger, directL, directR, crossL, crossR, crossLGain, crossRGain } };
}

function applyDapCrossfeed(matrix, crossfeed, ctx, seconds = 0.12) {
  if (!matrix) return;
  const c = Math.max(0, Math.min(0.12, Number(crossfeed) || 0));
  const direct = 1 / (1 + c);
  const cross = c / (1 + c);
  const now = ctx.currentTime;
  smooth(matrix.directL.gain, direct, now, seconds);
  smooth(matrix.directR.gain, direct, now, seconds);
  smooth(matrix.crossLGain.gain, cross, now, seconds);
  smooth(matrix.crossRGain.gain, cross, now, seconds);
}


function createSelfDapMsStage(ctx, input, inputChannels) {
  if (inputChannels === 1) return { output: input, stage: null };
  const splitter = ctx.createChannelSplitter(2);
  const midBus = ctx.createGain(), sideBus = ctx.createGain();
  const lMid = ctx.createGain(), rMid = ctx.createGain(), lSide = ctx.createGain(), rSide = ctx.createGain();
  lMid.gain.value = 0.5; rMid.gain.value = 0.5; lSide.gain.value = 0.5; rSide.gain.value = -0.5;
  input.connect(splitter);
  splitter.connect(lMid, 0); splitter.connect(lSide, 0); splitter.connect(rMid, 1); splitter.connect(rSide, 1);
  lMid.connect(midBus); rMid.connect(midBus); lSide.connect(sideBus); rSide.connect(sideBus);
  const sideHpf = createFilter(ctx, "highpass", 5, 0, Math.SQRT1_2);
  const sideDelay = ctx.createDelay(0.005); sideDelay.delayTime.value = 0;
  const sidePresence = createFilter(ctx, "peaking", 6000, 0, 0.55);
  sideBus.connect(sideHpf); sideHpf.connect(sideDelay); sideDelay.connect(sidePresence);
  const merger = ctx.createChannelMerger(2);
  const midL = ctx.createGain(), midR = ctx.createGain(), sideL = ctx.createGain(), sideR = ctx.createGain();
  midL.gain.value = 1; midR.gain.value = 1; sideL.gain.value = 1; sideR.gain.value = -1;
  midBus.connect(midL); midBus.connect(midR); sidePresence.connect(sideL); sidePresence.connect(sideR);
  midL.connect(merger,0,0); sideL.connect(merger,0,0); midR.connect(merger,0,1); sideR.connect(merger,0,1);
  return { output: merger, stage: { splitter,midBus,sideBus,lMid,rMid,lSide,rSide,sideHpf,sideDelay,sidePresence,merger,midL,midR,sideL,sideR } };
}

function createSelfDapStage(ctx, input, inputChannels) {
  const bypassGain = ctx.createGain(); bypassGain.gain.value = 1;
  const processedGain = ctx.createGain(); processedGain.gain.value = 0;
  const outputSum = ctx.createGain();
  input.connect(bypassGain); bypassGain.connect(outputSum);

  const ms = createSelfDapMsStage(ctx, input, inputChannels);
  const pre = ctx.createGain();
  const direct = ctx.createGain();
  const restorationHp = createFilter(ctx, "highpass", 14000, 0, 0.65);
  const restorationShaper = ctx.createWaveShaper();
  restorationShaper.curve = makeSoftSaturationCurve(4096, 1.0);
  const restorationGain = ctx.createGain(); restorationGain.gain.value = 0;
  const restorationSum = ctx.createGain();
  ms.output.connect(pre); pre.connect(direct); direct.connect(restorationSum);
  pre.connect(restorationHp); restorationHp.connect(restorationShaper); restorationShaper.connect(restorationGain); restorationGain.connect(restorationSum);

  const bufferDirect = ctx.createGain();
  const bufferShaper = ctx.createWaveShaper();
  const bufferGain = ctx.createGain(); bufferGain.gain.value = 0;
  const bufferSum = ctx.createGain();
  restorationSum.connect(bufferDirect); bufferDirect.connect(bufferSum);
  restorationSum.connect(bufferShaper); bufferShaper.connect(bufferGain); bufferGain.connect(bufferSum);

  const abDirect = ctx.createGain();
  const abShaper = ctx.createWaveShaper();
  const abGain = ctx.createGain(); abGain.gain.value = 0;
  const abSum = ctx.createGain();
  bufferSum.connect(abDirect); abDirect.connect(abSum);
  bufferSum.connect(abShaper); abShaper.connect(abGain); abGain.connect(abSum);

  // Keep the legacy node for status/backward compatibility, but do not place it in
  // the audible path. The downstream final limiter is stricter (-1 dB vs -0.5 dB)
  // and already provides safety; the extra compressor only added fixed look-ahead latency.
  const selfLimiter = ctx.createDynamicsCompressor();
  abSum.connect(processedGain); processedGain.connect(outputSum);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.72;
  const analyserSink = ctx.createGain(); analyserSink.gain.value = 0;
  pre.connect(analyser); analyser.connect(analyserSink); analyserSink.connect(ctx.destination);
  return { output:outputSum, stage:{ ms:ms.stage, bypassGain,processedGain,outputSum,pre,direct,restorationHp,restorationShaper,restorationGain,restorationSum,bufferDirect,bufferShaper,bufferGain,bufferSum,abDirect,abShaper,abGain,abSum,selfLimiter,analyser,analyserSink } };
}

function stopSelfDapMonitor({ resetDecision = true } = {}) {
  if (state.selfDapMonitorTimer) clearInterval(state.selfDapMonitorTimer);
  state.selfDapMonitorTimer = null;
  if (resetDecision) {
    state.selfDapBands = null; state.selfDapFreqData = null; state.selfDapRestorationActive = false;
    state.selfDapRestorationReason = "idle"; state.selfDapRestorationScore = 0;
    state.selfDapOnStreak = 0; state.selfDapOffStreak = 0; state.selfDapLastMonitorAtMs = 0;
  }
}

function updateSelfDapRestoration() {
  const ctx = state.context, stage = state.nodes?.selfDap;
  if (!ctx || !stage || !SelfDAP || !state.settings.selfDapEnabled || state.settings.selfDapStrength <= 0) return;
  const tickMs = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  if (state.selfDapLastMonitorAtMs && tickMs - state.selfDapLastMonitorAtMs > 750) {
    state.selfDapLastMonitorAtMs = tickMs; state.selfDapWatchdogTrips += 1;
    state.selfDapRestorationActive = false; state.selfDapRestorationReason = "watchdog-gap"; state.selfDapRestorationScore = 0;
    state.selfDapOnStreak = 0; state.selfDapOffStreak = 0;
    smooth(stage.restorationGain.gain, 0, ctx.currentTime, 0.010);
    return;
  }
  state.selfDapLastMonitorAtMs = tickMs;
  if (!state.selfDapFreqData || state.selfDapFreqData.length !== stage.analyser.frequencyBinCount) {
    state.selfDapFreqData = new Float32Array(stage.analyser.frequencyBinCount);
  }
  const data = state.selfDapFreqData;
  stage.analyser.getFloatFrequencyData(data);
  const bands = SelfDAP.spectrumBands(data, ctx.sampleRate);
  const mode = state.settings.selfDapRestoration;
  let decision = SelfDAP.restorationDecision(mode, bands);

  // The source design targets a 14–20 kHz detector. Below 44.1 kHz sample rate, AUTO is not reliable.
  if (mode === "auto" && ctx.sampleRate < 44100) decision = { active:false, reason:"sample-rate-too-low", score:0 };

  let active = Boolean(decision.active);
  if (mode === "auto") {
    if (decision.reason === "low-signal" || decision.reason === "sample-rate-too-low") {
      state.selfDapOnStreak = 0; state.selfDapOffStreak = 0; active = false;
    } else if (decision.active) {
      state.selfDapOnStreak += 1; state.selfDapOffStreak = 0;
      active = state.selfDapRestorationActive || state.selfDapOnStreak >= 2;
    } else {
      state.selfDapOffStreak += 1; state.selfDapOnStreak = 0;
      active = state.selfDapRestorationActive && state.selfDapOffStreak < 3;
    }
  } else {
    state.selfDapOnStreak = 0; state.selfDapOffStreak = 0;
  }

  state.selfDapBands = bands;
  state.selfDapRestorationActive = active;
  state.selfDapRestorationReason = decision.reason || "unknown";
  state.selfDapRestorationScore = Number.isFinite(decision.score) ? decision.score : 0;
  const p = SelfDAP.profile(state.settings.selfDapStrength, state.settings.selfDapRestorationCutoffKhz);
  const target = active ? p.restorationWet : 0;
  smooth(stage.restorationGain.gain, target, ctx.currentTime, active ? 0.015 : 0.18);
}

function startSelfDapMonitor() {
  if (!state.settings.selfDapEnabled || state.settings.selfDapStrength <= 0 || !state.nodes?.selfDap) return;
  updateSelfDapRestoration();
  if (!state.selfDapMonitorTimer) state.selfDapMonitorTimer = setInterval(updateSelfDapRestoration, 125);
}

function applySettings(raw, { initial = false, revision = 0, replace = false } = {}) {
  const rev = Number.isFinite(Number(revision)) ? Number(revision) : 0;
  if (!initial && rev > 0 && rev <= state.lastSettingsRevision) {
    return { restartRequired:false, stale:true, applied:false, revision:state.lastSettingsRevision };
  }
  const previous = state.settings;
  if (!initial && state.djAutoMixActive && raw && Object.prototype.hasOwnProperty.call(raw, "djCrossfader")) stopDjAutoMix();
  const candidate = replace ? raw : { ...previous, ...(raw || {}) };
  const next = sanitizeSettings(candidate);
  const restartRequired = Boolean(state.context && next.hiResMode !== previous.hiResMode);
  state.settings = next;
  if (rev > 0) state.lastSettingsRevision = Math.max(state.lastSettingsRevision, rev);
  const { context: ctx, nodes } = state;
  if (!ctx || !nodes) return { restartRequired, stale:false, applied:true, revision:state.lastSettingsRevision };
  const now = ctx.currentTime;

  applyLowCutRouting(nodes, next.lowCutHz, ctx, initial ? 0.02 : 0.05);
  smooth(nodes.bass.gain, next.bassDb, now);
  smooth(nodes.warmth.gain, next.warmthDb, now);
  smooth(nodes.clarity.gain, next.clarityDb, now);
  smooth(nodes.air.gain, next.airDb, now);

  const fill = spectralFillGains(next.spectralFill);
  smooth(nodes.fillBody.gain, fill.bodyDb, now);
  smooth(nodes.fillPresence.gain, fill.presenceDb, now);
  smooth(nodes.fillTop.gain, fill.topDb, now);

  smooth(nodes.detailGain.gain, detailMixGain(next.detail), now, 0.08);
  const reality = realityMixGains(next.reality);
  smooth(nodes.realityHarmGain.gain, reality.harmonic, now, 0.10);
  smooth(nodes.realityReflectionGain.gain, reality.reflection, now, 0.12);

  nodes.detailShaper.oversample = next.hiResMode ? "4x" : "2x";
  nodes.realityShaper.oversample = next.hiResMode ? "4x" : "2x";
  if (nodes.noiseNode?.port) nodes.noiseNode.port.postMessage({ strength: next.noiseReduction });
  if (nodes.sparkMonitor?.port) nodes.sparkMonitor.port.postMessage({ active: fastMonitorNeeded(next), fastEdge: Boolean(next.transientEdgeEnabled) });
  if (!next.seamNaturalizerEnabled) resetSeamNaturalizer(0.10);
  if (!next.transientValleyEnabled) resetTransientValley(0.08);
  if (!next.transientEdgeEnabled) resetTransientEdge(0.04);
  if (!next.voiceMaterialEnabled) resetVoiceMaterial(0.10);
  if (!next.orbitKeeperEnabled && state.orbitLevel !== 0) applyOrbitLevel(0, "disabled");
  if (!next.sparkEnabled) {
    state.sparkPulse = 0; state.sparkRawPulse = 0; state.sparkLastAppliedPulse = 0; state.sparkFallbackActive = false;
    resetSparkMakeup(0.06);
    resetImpactLiberation(0.07);
  } else if (!next.impactEnabled) {
    resetImpactLiberation(0.07);
  }

  applyWidth(nodes.widthMatrix, next.width, ctx, initial ? 6.0 : 1.2);

  if (nodes.selfDap && SelfDAP) {
    const sp = SelfDAP.profile(next.selfDapStrength, next.selfDapRestorationCutoffKhz);
    const enabled = Boolean(next.selfDapEnabled) && next.selfDapStrength > 0;
    smooth(nodes.selfDap.bypassGain.gain, enabled ? 0 : 1, now, initial ? 0.06 : 0.04);
    smooth(nodes.selfDap.processedGain.gain, enabled ? 1 : 0, now, initial ? 0.06 : 0.04);
    smooth(nodes.selfDap.pre.gain, dbToGain(enabled ? sp.preGainDb : 0), now, 0.10);
    if (nodes.selfDap.ms) {
      smooth(nodes.selfDap.ms.sideHpf.frequency, sp.sideHpfHz, now, 0.10);
      smooth(nodes.selfDap.ms.sideHpf.Q, webAudioResonanceDb(sp.sideHpfQ), now, 0.10);
      smooth(nodes.selfDap.ms.sideDelay.delayTime, enabled ? sp.sideDelaySeconds : 0, now, 0.10);
      smooth(nodes.selfDap.ms.sidePresence.frequency, sp.sidePresenceHz, now, 0.10);
      smooth(nodes.selfDap.ms.sidePresence.Q, sp.sidePresenceQ, now, 0.10);
      smooth(nodes.selfDap.ms.sidePresence.gain, enabled ? sp.sideGainDb : 0, now, initial ? 0.8 : 0.25);
    }
    smooth(nodes.selfDap.restorationHp.frequency, Math.min(sp.restorationCutoffHz, ctx.sampleRate * 0.42), now, 0.10);
    const selfShapeChanged = initial || next.selfDapStrength !== previous.selfDapStrength || next.hiResMode !== previous.hiResMode;
    if (selfShapeChanged) {
      nodes.selfDap.restorationShaper.curve = makeSoftSaturationCurve(4096, sp.restorationDrive);
      nodes.selfDap.bufferShaper.curve = makeSoftSaturationCurve(4096, sp.bufferDrive);
      nodes.selfDap.abShaper.curve = makeSoftSaturationCurve(4096, sp.abDrive);
      const oversample = next.hiResMode ? "4x" : "2x";
      nodes.selfDap.restorationShaper.oversample = oversample;
      nodes.selfDap.bufferShaper.oversample = oversample;
      nodes.selfDap.abShaper.oversample = oversample;
    }
    smooth(nodes.selfDap.bufferDirect.gain, enabled ? Math.max(0.96, 1 - sp.bufferHarmonic) : 1, now, 0.10);
    smooth(nodes.selfDap.bufferGain.gain, enabled ? sp.bufferHarmonic : 0, now, 0.10);
    smooth(nodes.selfDap.abDirect.gain, enabled ? Math.max(0.95, 1 - sp.abHarmonic) : 1, now, 0.10);
    smooth(nodes.selfDap.abGain.gain, enabled ? sp.abHarmonic : 0, now, 0.10);
    smooth(nodes.selfDap.selfLimiter.threshold, enabled ? sp.limiterThresholdDb : 0, now);
    smooth(nodes.selfDap.selfLimiter.knee, enabled ? 0 : 0, now);
    smooth(nodes.selfDap.selfLimiter.ratio, enabled ? 20 : 1, now);
    smooth(nodes.selfDap.selfLimiter.attack, enabled ? sp.limiterAttackSeconds : 0.003, now);
    smooth(nodes.selfDap.selfLimiter.release, enabled ? sp.limiterReleaseSeconds : 0.05, now);
    const selfMonitorRelevant = initial || enabled !== Boolean(previous.selfDapEnabled) ||
      next.selfDapStrength !== previous.selfDapStrength || next.selfDapRestoration !== previous.selfDapRestoration ||
      next.selfDapRestorationCutoffKhz !== previous.selfDapRestorationCutoffKhz;
    if (enabled) {
      if (!state.selfDapMonitorTimer) startSelfDapMonitor();
      else if (selfMonitorRelevant) updateSelfDapRestoration();
    } else { stopSelfDapMonitor(); smooth(nodes.selfDap.restorationGain.gain, 0, now, 0.08); }
  }

  if (nodes.perspective) {
    const pp = perspectiveProfile(next.perspectiveEnabled, next.perspectiveDepth);
    smooth(nodes.perspective.direct.gain, dbToGain(pp.directDb), now, 0.12);
    smooth(nodes.perspective.ambientHp.frequency, pp.highpassHz, now, 0.12);
    smooth(nodes.perspective.ambientLp.frequency, Math.min(pp.lowpassHz, ctx.sampleRate * 0.44), now, 0.12);
    smooth(nodes.perspective.ambientDelay.delayTime, pp.predelaySeconds, now, 0.16);
    smooth(nodes.perspective.wet.gain, pp.wet, now, 0.18);
  }

  const dap = dapProfile(next.dapMode, next.dapStrength);
  smooth(nodes.dapPre.gain, dbToGain(dap.preDb), now, 0.10);
  smooth(nodes.dapLow.gain, dap.lowDb, now, 0.12);
  smooth(nodes.dapHigh.gain, dap.highDb, now, 0.12);
  smooth(nodes.dapDirect.gain, Math.max(0.88, 1 - dap.harmonic), now, 0.10);
  smooth(nodes.dapHarmGain.gain, dap.harmonic, now, 0.10);
  const dapShapeChanged = initial || next.dapMode !== previous.dapMode || next.dapStrength !== previous.dapStrength || next.hiResMode !== previous.hiResMode;
  if (dapShapeChanged) {
    nodes.dapShaper.curve = makeSoftSaturationCurve(4096, dap.drive);
    nodes.dapShaper.oversample = next.hiResMode ? "4x" : "2x";
  }
  applyDapCrossfeed(nodes.dapCrossfeed, dap.crossfeed, ctx, 0.18);

  AudioModules.applyCartridgeStage(nodes.cartridge, next, ctx);
  AudioModules.applyDacMatrixStage(nodes.dacMatrix, next, ctx, initial);
  AudioModules.applyRoomStage(nodes.room, next, ctx);
  AudioModules.applyIntegrityStage(nodes.integrity, next, ctx);
  applyHrtfAndHeadphone(next, initial, previous);
  void applyOutputSink(next, previous, initial);
  applySpatialLayer(initial, previous);
  if (nodes.virtualAmp && VirtualAmp?.apply) VirtualAmp.apply(nodes.virtualAmp, next);
  if (!next.reflectionCharacterEnabled) resetReflectionCharacter(0.08); else applyReflectionCharacter({pulse:state.sparkPulse,speechRatio:state.seamSpeechRatio});
  applyAvSync();
  if (nodes.spatialMetrics?.port) { const blocks=AdaptiveV28?.spatialReportBlocks?.(ctx.sampleRate,state.cpuProfile?.spatialReportMs||80,128)||24; nodes.spatialMetrics.port.postMessage({active:Boolean(next.spatialTelemetryEnabled),reportEveryBlocks:blocks,maxLagMs:1.2}); }
  AudioModules.applyDecks(state.deckNodes, next, ctx);

  if (nodes.autoLevel && !next.autoLevelEnabled && state.autoLevelDb !== 0) {
    state.autoLevelDb = 0; state.autoLevelMeasuredDbfs = null; state.autoLevelRmsEma = null;
    commitEffectiveLevelGain({ seconds: 0.8, force: true });
  }

  if (nodes.adaptiveTrim && !next.adaptiveSafetyEnabled && state.adaptiveTrimDb !== 0) {
    state.adaptiveTrimDb = 0;
    smooth(nodes.adaptiveTrim.gain, 1, now, 0.5);
  }

  if (sceneRuntimeNeeded(next)) {
    if (!state.sceneMonitorTimer) startSceneMonitor();
    else sceneTick();
  } else {
    stopSceneMonitor();
    state.sceneRuntime = null;
    resetSparkMakeup(0.06);
    resetImpactLiberation(0.07);
  }

  const comp = compressorBaseProfile(next);
  const compressorEnabled = Boolean(next.compressor);
  if (nodes.compressorBypass && nodes.compressorProcessed) {
    smooth(nodes.compressorBypass.gain, compressorEnabled ? 0 : 1, now, initial ? 0.02 : 0.03);
    smooth(nodes.compressorProcessed.gain, compressorEnabled ? 1 : 0, now, initial ? 0.02 : 0.03);
  }
  smooth(nodes.compressor.threshold, comp.threshold, now);
  smooth(nodes.compressor.knee, comp.knee, now);
  smooth(nodes.compressor.ratio, comp.ratio, now);
  smooth(nodes.compressor.attack, comp.attack, now);
  smooth(nodes.compressor.release, comp.release, now);
  if (!next.sparkEnabled || !next.impactEnabled) resetImpactLiberation(0.07);

  smooth(nodes.output.gain, dbToGain(computeEffectiveOutputDb(next)), now);
  smooth(nodes.limiter.threshold, -1.0, now);
  smooth(nodes.limiter.knee, 0, now);
  smooth(nodes.limiter.ratio, 20, now);
  smooth(nodes.limiter.attack, 0.003, now);
  smooth(nodes.limiter.release, 0.10, now);
  return { restartRequired, stale:false, applied:true, revision:state.lastSettingsRevision };
}

async function stop() {
  stopSelfDapMonitor();
  stopSafetyMonitor();
  stopOrbitKeeperMonitor();
  stopAutoLevelMonitor();
  stopSceneMonitor();
  stopDjAutoMix();
  removeSpatialDeviceMonitoring();
  if (state.nodes?.spatial3d && SpatialEngine) { try { SpatialEngine.dispose(state.nodes.spatial3d); } catch {} }
  const preserved = { ...state.settings, enabled: false };
  if (state.context && state.context.state !== "closed" && state.nodes?.masterSafety) {
    try { smooth(state.nodes.masterSafety.gain, 0, state.context.currentTime, 0.035); await new Promise((resolve) => setTimeout(resolve, 45)); } catch {}
  }
  const seen = new Set();
  for (const stream of [state.stream, state.streams?.A, state.streams?.B, state.streams?.external, ...Object.values(state.tabSessions||{}).map(x=>x?.stream)]) {
    if (!stream || seen.has(stream)) continue; seen.add(stream);
    for (const track of stream.getTracks()) { try { track.stop(); } catch {} }
  }
  if (state.context && state.context.state !== "closed") { try { await state.context.close(); } catch {} }
  state = freshState(preserved, state.lastSettingsRevision);
  return { ok: true, active: false };
}

async function start({ tabId, streamId, settings, revision = 0, deck = "A", mediaStream = null, inputMode = "tab" }) {
  const safeDeck = deck === "B" ? "B" : "A";
  if (!mediaStream && (!Number.isInteger(tabId) || tabId < 0 || typeof streamId !== "string" || !streamId)) {
    return { ok: false, error: "invalid start request" };
  }
  await stop();
  state.settings = sanitizeSettings({ ...settings, enabled: true });
  if (Number.isFinite(Number(revision)) && Number(revision) > 0) state.lastSettingsRevision = Math.max(state.lastSettingsRevision, Number(revision));
  state.requestedHiRes = state.settings.hiResMode;

  let acquiredStream = null, acquiredContext = null;
  try {
    const stream = acquiredStream = mediaStream || await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
      video: false
    });
    const audioTrack = stream.getAudioTracks()[0];
    const channelCount = Number(audioTrack?.getSettings?.().channelCount) || 2;
    const ctx = acquiredContext = await createContext(state.settings);
    if (ctx.state !== "running") await ctx.resume();

    const source = ctx.createMediaStreamSource(stream);
    const inputBus = ctx.createGain();
    if (inputMode === "tab") {
      const branch=AudioModules.createSessionBranch(ctx,source,inputBus);
      state.tabSessions[String(tabId)]={tabId,stream,source,branch};
    } else {
      const deckBranch = AudioModules.createDeckBranch(ctx, source, inputBus);
      state.deckNodes[safeDeck] = deckBranch;
      if (inputMode === "external") state.streams.external = stream; else { state.streams[safeDeck] = stream; state.deckTabIds[safeDeck] = tabId; }
    }
    const cartridge = AudioModules.createCartridgeStage(ctx, inputBus);
    const noise = await createNoiseNode(ctx);
    const lowCut = createFilter(ctx, "highpass", 35, 0, 0.7);
    const lowCutBypass = ctx.createGain(); lowCutBypass.gain.value = 1;
    const lowCutProcessed = ctx.createGain(); lowCutProcessed.gain.value = 0;
    const lowCutSum = ctx.createGain();
    const bass = createFilter(ctx, "lowshelf", 95);
    const warmth = createFilter(ctx, "peaking", 280, 0, 0.8);
    const clarity = createFilter(ctx, "peaking", 2600, 0, 0.9);
    const air = createFilter(ctx, "highshelf", 8500);
    const fillBody = createFilter(ctx, "lowshelf", 65);
    const fillPresence = createFilter(ctx, "peaking", 1200, 0, 0.65);
    const fillTop = createFilter(ctx, "highshelf", 10500);
    const mixBus = ctx.createGain();
    // One shared side-chain analyser feeds Scene Dynamics and AUTO LEVEL without lengthening the audible DSP path.
    const sharedAnalyser = ctx.createAnalyser(); sharedAnalyser.fftSize = 2048; sharedAnalyser.smoothingTimeConstant = 0.58;
    const sparkMonitor = await createSparkMonitorNode(ctx);
    const spatialMetrics = await createSpatialMetricsNode(ctx);
    const sceneSink = ctx.createGain(); sceneSink.gain.value = 0;
    sharedAnalyser.connect(sceneSink); sparkMonitor.node.connect(sceneSink); spatialMetrics.node.connect(sceneSink); sceneSink.connect(ctx.destination);

    const detailHighpass = createFilter(ctx, "highpass", 1800, 0, 0.65);
    const detailShaper = ctx.createWaveShaper();
    detailShaper.curve = makeSoftSaturationCurve(4096, 1.45);
    const detailGain = ctx.createGain(); detailGain.gain.value = 0;

    const realityShaper = ctx.createWaveShaper();
    realityShaper.curve = makeSoftSaturationCurve(4096, 1.15);
    const realityHarmGain = ctx.createGain(); realityHarmGain.gain.value = 0;
    const convolver = ctx.createConvolver(); convolver.normalize = false; convolver.buffer = createEarlyReflectionBuffer(ctx);
    const realityReflectionGain = ctx.createGain(); realityReflectionGain.gain.value = 0;

    cartridge.output.connect(noise.node);
    noise.node.connect(lowCutBypass); lowCutBypass.connect(lowCutSum);
    noise.node.connect(lowCut); lowCut.connect(lowCutProcessed); lowCutProcessed.connect(lowCutSum);
    lowCutSum.connect(bass); bass.connect(warmth); warmth.connect(clarity); clarity.connect(air);
    air.connect(fillBody); fillBody.connect(fillPresence); fillPresence.connect(fillTop);
    fillTop.connect(mixBus);
    fillTop.connect(detailHighpass); detailHighpass.connect(detailShaper); detailShaper.connect(detailGain); detailGain.connect(mixBus);
    fillTop.connect(realityShaper); realityShaper.connect(realityHarmGain); realityHarmGain.connect(mixBus);
    fillTop.connect(convolver); convolver.connect(realityReflectionGain); realityReflectionGain.connect(mixBus);

    const processingChannels = inputMode === "dj" ? 2 : channelCount;
    const voiceMaterial = createVoiceMaterialStage(ctx, mixBus);
    const selfDap = createSelfDapStage(ctx, voiceMaterial.output, processingChannels);
    const width = createWidthMatrix(ctx, selfDap.output, processingChannels);
    const perspective = createPerspectiveStage(ctx, width.output);

    // Virtual DAP output stage: bounded tonal tilt + subtle harmonic output + low-band crossfeed.
    // This is a browser DSP stage, not an OS virtual audio driver or a hardware DAC emulator.
    const dacMatrix = AudioModules.createDacMatrixStage(ctx, perspective.output);
    const dapPre = ctx.createGain();
    const dapLow = createFilter(ctx, "lowshelf", 120);
    const dapHigh = createFilter(ctx, "highshelf", 12000);
    const dapDirect = ctx.createGain();
    const dapShaper = ctx.createWaveShaper();
    dapShaper.curve = makeSoftSaturationCurve(4096, 1.05);
    const dapHarmGain = ctx.createGain(); dapHarmGain.gain.value = 0;
    const dapSum = ctx.createGain();
    dacMatrix.output.connect(dapPre); dapPre.connect(dapLow); dapLow.connect(dapHigh);
    dapHigh.connect(dapDirect); dapDirect.connect(dapSum);
    dapHigh.connect(dapShaper); dapShaper.connect(dapHarmGain); dapHarmGain.connect(dapSum);
    const dapCross = createDapCrossfeed(ctx, dapSum, processingChannels);
    const room = AudioModules.createRoomStage(ctx, dapCross.output);
    const integrity = AudioModules.createIntegrityStage(ctx, room.output);
    const hrtf = createHrtfStage(ctx, integrity.output, processingChannels);
    const headphoneCorrection = createHeadphoneCorrectionStage(ctx, hrtf.output);
    headphoneCorrection.output.connect(spatialMetrics.node);
    const reflectionCharacter = createReflectionCharacterStage(ctx, headphoneCorrection.output);

    const compressor = ctx.createDynamicsCompressor();
    const compressorBypass = ctx.createGain(); compressorBypass.gain.value = 1;
    const compressorProcessed = ctx.createGain(); compressorProcessed.gain.value = 0;
    const compressorSum = ctx.createGain();
    // Impact Liberation: monitor-controlled parallel transient lane. It bypasses only the broad compressor,
    // stays out of the audible path at gain=0, and rejoins before Output/AutoLevel/Safety/Limiter.
    const impactHighpass = createFilter(ctx, "highpass", 1400, 0, 0.68);
    const impactLowpass = createFilter(ctx, "lowpass", 9000, 0, 0.70);
    const impactGain = ctx.createGain(); impactGain.gain.value = 0;
    const edgeAccentBand = createFilter(ctx, "bandpass", 4800, 0, 0.88);
    const edgeAccentShaper = ctx.createWaveShaper(); edgeAccentShaper.curve = makeSoftSaturationCurve(2048, 1.12);
    const edgeAccentGain = ctx.createGain(); edgeAccentGain.gain.value = 0;
    const output = ctx.createGain();
    // v2.6 Transient Valley is a unity GainNode at rest. It adds no look-ahead or fixed delay.
    const transientValley = ctx.createGain(); transientValley.gain.value = 1;
    const spatial3d = SpatialEngine?.createStage ? SpatialEngine.createStage(ctx, transientValley, processingChannels) : { output:transientValley, stage:null };
    const autoLevel = ctx.createGain(); autoLevel.gain.value = 1;
    const adaptiveTrim = ctx.createGain(); adaptiveTrim.gain.value = 1;
    const virtualAmp = VirtualAmp?.createStage
      ? await VirtualAmp.createStage(ctx, adaptiveTrim, processingChannels, state.settings)
      : (() => { const bypass=ctx.createGain(); adaptiveTrim.connect(bypass); return {output:bypass,stage:{available:false,backend:"bypass",error:"virtual-amp-module-unavailable",requestedEnabled:Boolean(state.settings.virtualAmpEnabled),effectiveEnabled:false}}; })();
    const limiter = ctx.createDynamicsCompressor();
    const safetyMeter = await createSafetyMeterNode(ctx);
    const masterSafety = ctx.createGain(); masterSafety.gain.value = 0;
    headphoneCorrection.output.connect(compressorBypass); compressorBypass.connect(compressorSum);
    headphoneCorrection.output.connect(compressor); compressor.connect(compressorProcessed); compressorProcessed.connect(compressorSum);
    compressorSum.connect(output);
    headphoneCorrection.output.connect(impactHighpass); impactHighpass.connect(impactLowpass); impactLowpass.connect(impactGain); impactGain.connect(output);
    headphoneCorrection.output.connect(edgeAccentBand); edgeAccentBand.connect(edgeAccentShaper); edgeAccentShaper.connect(edgeAccentGain); edgeAccentGain.connect(output);
    reflectionCharacter.output.connect(output);
    output.connect(transientValley);
    transientValley.connect(sharedAnalyser); transientValley.connect(sparkMonitor.node); spatial3d.output.connect(autoLevel); autoLevel.connect(adaptiveTrim); virtualAmp.output.connect(limiter); limiter.connect(safetyMeter.node); safetyMeter.node.connect(masterSafety); const avSync=createAvSyncStage(ctx,masterSafety); avSync.output.connect(ctx.destination);

    state.tabId = tabId; state.stream = stream; state.context = ctx; state.source = source; state.inputMode = inputMode; state.externalActive = inputMode === "external";
    state.nodes = {
      inputBus, cartridge: cartridge.stage, noiseNode: noise.node, lowCut, lowCutBypass, lowCutProcessed, lowCutSum, bass, warmth, clarity, air, fillBody, fillPresence, fillTop,
      detailHighpass, detailShaper, detailGain, realityShaper, realityHarmGain, convolver,
      realityReflectionGain, mixBus, voiceMaterial: voiceMaterial.stage, selfDap: selfDap.stage, widthMatrix: width.matrix, perspective: perspective.stage,
      dacMatrix: dacMatrix.stage, dapPre, dapLow, dapHigh, dapDirect, dapShaper, dapHarmGain, dapSum, dapCrossfeed: dapCross.matrix,
      room: room.stage, integrity: integrity.stage, hrtf: hrtf.stage, headphoneCorrection: headphoneCorrection.stage, reflectionCharacter:reflectionCharacter.stage, compressor, compressorBypass, compressorProcessed, compressorSum, impactHighpass, impactLowpass, impactGain, edgeAccentBand, edgeAccentShaper, edgeAccentGain, output, transientValley, spatial3d:spatial3d.stage, sharedAnalyser, sparkMonitor: sparkMonitor.node, spatialMetrics:spatialMetrics.node, sceneSink, autoLevel, adaptiveTrim, virtualAmp:virtualAmp.stage, limiter, safetyMeter: safetyMeter.node, masterSafety, avSync:avSync.stage
    };
    state.noiseWorkletAvailable = noise.available;
    state.safetyMeterAvailable = safetyMeter.available;
    state.sparkWorkletAvailable = sparkMonitor.available;
    state.spatialMetricsAvailable = spatialMetrics.available;
    state.inputChannels = channelCount;
    state.startedAt = Date.now(); state.error = null;
    installSpatialDeviceMonitoring(ctx);
    applySettings(state.settings, { initial: true, revision: state.lastSettingsRevision, replace: true });
    void handleSpatialDeviceChange("start");
    startSafetyMonitor();
    startOrbitKeeperMonitor();
    startAutoLevelMonitor();
    startSceneMonitor();
    smooth(masterSafety.gain, 1, ctx.currentTime, 0.050);

    if (audioTrack) audioTrack.addEventListener("ended", () => {
      if (inputMode === "dj") {
        if (state.replacingDecks?.[safeDeck] || state.streams?.[safeDeck] !== stream) return;
        void stopDeck(safeDeck).then((st) => { if (!st?.active) chrome.runtime.sendMessage({ target:"service-worker", type:"OFFSCREEN_ENDED" }).catch(()=>{}); });
      } else if (inputMode === "tab") {
        if (state.tabSessions?.[String(tabId)]?.stream !== stream) return;
        void stopSession(tabId).then((st)=>{ if(!st?.active) chrome.runtime.sendMessage({target:"service-worker",type:"OFFSCREEN_ENDED"}).catch(()=>{}); });
      } else {
        if (state.stream !== stream) return;
        void stop();
        chrome.runtime.sendMessage({ target: "service-worker", type: "OFFSCREEN_ENDED" }).catch(() => {});
      }
    }, { once: true });

    return status();
  } catch (error) {
    const message = error?.message || String(error);
    await stop();
    if (acquiredContext && acquiredContext.state !== "closed") { try { await acquiredContext.close(); } catch {} }
    if (acquiredStream) for (const track of acquiredStream.getTracks?.() || []) { try { track.stop(); } catch {} }
    state.error = message;
    return { ok: false, error: message || "audio start failed" };
  }
}

async function addSession({tabId,streamId,settings,revision=0}){
  if(!Number.isInteger(tabId)||tabId<0||typeof streamId!=="string"||!streamId)return{ok:false,error:"invalid session request"};
  const key=String(tabId);if(state.tabSessions?.[key])return status();
  const maxSessions=Math.max(1,Number(state.cpuProfile?.maxSessions)||1);if(Object.keys(state.tabSessions||{}).length>=maxSessions)return{ok:false,error:`CPU tier ${state.cpuProfile?.name||"?"}: concurrent session limit ${maxSessions}`};
  if(!state.context||state.context.state==="closed"||!state.nodes?.inputBus)return start({tabId,streamId,settings,revision,inputMode:"tab"});
  let stream=null,source=null,branch=null;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:"tab",chromeMediaSourceId:streamId}},video:false});
    source=state.context.createMediaStreamSource(stream);branch=AudioModules.createSessionBranch(state.context,source,state.nodes.inputBus);state.tabSessions[key]={tabId,stream,source,branch};state.stream=state.stream||stream;state.inputMode="multitab";
    const rev=Number(revision)||0;if(rev>state.lastSettingsRevision)state.lastSettingsRevision=rev;const tr=stream.getAudioTracks()[0];const ch=Number(tr?.getSettings?.().channelCount)||2;state.inputChannels=Math.max(Number(state.inputChannels)||1,ch);
    if(tr)tr.addEventListener("ended",()=>{if(state.tabSessions?.[key]?.stream===stream)void stopSession(tabId);},{once:true});return status();
  }catch(error){if(stream)for(const t of stream.getTracks?.()||[]){try{t.stop();}catch{}}if(branch)for(const n of [branch.source,branch.gate]){try{n.disconnect();}catch{}}return{ok:false,error:error?.message||String(error)};}
}
async function stopSession(tabId){
  const key=String(tabId),entry=state.tabSessions?.[key];if(!entry)return status();delete state.tabSessions[key];if(entry.stream)for(const t of entry.stream.getTracks()){try{t.stop();}catch{}}if(entry.branch)for(const n of [entry.branch.source,entry.branch.gate]){try{n.disconnect();}catch{}}
  if(state.stream===entry.stream){const next=Object.values(state.tabSessions||{})[0];state.stream=next?.stream||state.streams.A||state.streams.B||state.streams.external||null;}
  if(!Object.keys(state.tabSessions||{}).length&&!state.streams.A&&!state.streams.B&&!state.streams.external)return stop();return status();
}

async function promoteSessionToDeck({ deck="A", tabId, settings, revision=0 }) {
  const safeDeck = deck === "B" ? "B" : "A";
  const otherDeck = safeDeck === "A" ? "B" : "A";
  if (!Number.isInteger(tabId) || tabId < 0) return { ok:false, error:"invalid promotion request" };
  if (!state.context || state.context.state === "closed" || !state.nodes?.inputBus) return { ok:false, error:"audio context is not active" };
  const key = String(tabId);
  const entry = state.tabSessions?.[key];
  if (!entry?.stream || !entry?.source) return { ok:false, error:"Multi-Tab session is not active for this tab" };
  if (state.deckTabIds?.[otherDeck] === tabId) return { ok:false, error:`このタブはすでにDeck ${otherDeck}として使用中です。` };

  let branch = null;
  const oldStream = state.streams?.[safeDeck] || null;
  const oldNode = state.deckNodes?.[safeDeck] || null;
  const oldTabId = state.deckTabIds?.[safeDeck] ?? null;
  const previousSettings = state.settings;
  try {
    // Reuse the already-consumed tab MediaStream. No second tabCapture/getUserMedia call occurs here.
    branch = AudioModules.createDeckBranch(state.context, entry.source, state.nodes.inputBus);
    const nextSettings = settings ? sanitizeSettings({ ...state.settings, ...settings, enabled:true, djEnabled:true }) : sanitizeSettings({ ...state.settings, enabled:true, djEnabled:true });

    state.replacingDecks[safeDeck] = true;
    state.streams[safeDeck] = entry.stream;
    state.deckNodes[safeDeck] = branch;
    state.deckTabIds[safeDeck] = tabId;
    state.settings = nextSettings;
    state.inputMode = "dj";
    state.externalActive = false;
    const rev = Number.isFinite(Number(revision)) ? Number(revision) : 0;
    if (rev > state.lastSettingsRevision) state.lastSettingsRevision = rev;
    AudioModules.applyDecks(state.deckNodes, state.settings, state.context);

    // Fade the old Multi-Tab direct lane out, then detach it. The stream/source remain alive as the deck input.
    if (entry.branch?.gate?.gain) smooth(entry.branch.gate.gain, 0, state.context.currentTime, 0.035);
    await new Promise((resolve) => setTimeout(resolve, 45));
    try { entry.branch?.gate?.disconnect(); } catch {}
    delete state.tabSessions[key];

    if (oldStream && oldStream !== entry.stream) for (const track of oldStream.getTracks()) { try { track.stop(); } catch {} }
    if (oldNode && oldNode !== branch) for (const n of [oldNode.source,oldNode.low,oldNode.mid,oldNode.high,oldNode.trim,oldNode.xfade]) { try { n.disconnect(); } catch {} }
    if (state.stream === oldStream || !state.stream) state.stream = entry.stream;
    state.replacingDecks[safeDeck] = false;

    const track = entry.stream.getAudioTracks()[0];
    if (track) track.addEventListener("ended", () => {
      if (!state.replacingDecks?.[safeDeck] && state.streams?.[safeDeck] === entry.stream) void stopDeck(safeDeck);
    }, { once:true });
    return { ...status(), promotedSession:true };
  } catch (error) {
    state.replacingDecks[safeDeck] = false;
    state.settings = previousSettings;
    // Roll back target deck ownership; the original Multi-Tab session remains untouched.
    state.streams[safeDeck] = oldStream;
    state.deckNodes[safeDeck] = oldNode;
    state.deckTabIds[safeDeck] = oldTabId;
    if (branch && branch !== oldNode) for (const n of [branch.low,branch.mid,branch.high,branch.trim,branch.xfade]) { try { n.disconnect(); } catch {} }
    return { ok:false, error:error?.message || String(error) };
  }
}

async function addDeck({ deck = "A", tabId, streamId, settings, revision = 0 }) {
  const safeDeck = deck === "B" ? "B" : "A";
  if (!Number.isInteger(tabId) || tabId < 0 || typeof streamId !== "string" || !streamId) return { ok:false, error:"invalid deck request" };
  if (!state.context || state.context.state === "closed" || !state.nodes?.inputBus) {
    return start({ tabId, streamId, settings, revision, deck:safeDeck, inputMode:"dj" });
  }
  let stream = null, source = null, branch = null;
  try {
    // Build the replacement completely before touching the live deck. If construction fails, the old deck keeps playing.
    stream = await navigator.mediaDevices.getUserMedia({ audio:{ mandatory:{ chromeMediaSource:"tab", chromeMediaSourceId:streamId } }, video:false });
    source = state.context.createMediaStreamSource(stream);
    branch = AudioModules.createDeckBranch(state.context, source, state.nodes.inputBus);
    const nextSettings = settings ? sanitizeSettings({ ...state.settings, ...settings, enabled:true, djEnabled:true }) : state.settings;
    const oldStream = state.streams?.[safeDeck];
    const old = state.deckNodes?.[safeDeck];

    state.replacingDecks[safeDeck] = true;
    state.streams[safeDeck] = stream; state.deckNodes[safeDeck] = branch; state.deckTabIds[safeDeck] = tabId;
    if (state.stream === oldStream) state.stream = stream;
    state.settings = nextSettings; state.inputMode = "dj"; state.externalActive = false;
    const rev = Number.isFinite(Number(revision)) ? Number(revision) : 0;
    if (rev > state.lastSettingsRevision) state.lastSettingsRevision = rev;
    AudioModules.applyDecks(state.deckNodes, state.settings, state.context);

    // Only after the new branch is valid and fading in do we retire the old branch.
    if (oldStream && oldStream !== stream) for (const track of oldStream.getTracks()) { try { track.stop(); } catch {} }
    if (old && old !== branch) for (const n of [old.source,old.low,old.mid,old.high,old.trim,old.xfade]) { try { n.disconnect(); } catch {} }
    state.replacingDecks[safeDeck] = false;
    const track = stream.getAudioTracks()[0];
    if (track) track.addEventListener("ended", () => { if (!state.replacingDecks?.[safeDeck] && state.streams?.[safeDeck] === stream) void stopDeck(safeDeck); }, { once:true });
    return status();
  } catch (error) {
    if (state.replacingDecks) state.replacingDecks[safeDeck] = false;
    if (stream && state.streams?.[safeDeck] !== stream) for (const track of stream.getTracks?.() || []) { try { track.stop(); } catch {} }
    if (branch && state.deckNodes?.[safeDeck] !== branch) for (const n of [branch.source,branch.low,branch.mid,branch.high,branch.trim,branch.xfade]) { try { n.disconnect(); } catch {} }
    return { ok:false, error:error?.message || String(error) };
  }
}

async function stopDeck(deck = "A") {
  const safeDeck = deck === "B" ? "B" : "A";
  const stream = state.streams?.[safeDeck];
  const n = state.deckNodes?.[safeDeck];
  // Invalidate identity first so a synchronous/queued `ended` event cannot re-enter and stop a replacement deck.
  state.streams[safeDeck] = null; state.deckNodes[safeDeck] = null; state.deckTabIds[safeDeck] = null;
  if (state.stream === stream) state.stream = state.streams.A || state.streams.B || state.streams.external || null;
  if (stream) for (const track of stream.getTracks()) { try { track.stop(); } catch {} }
  if (n) for (const x of [n.source,n.low,n.mid,n.high,n.trim,n.xfade]) { try { x.disconnect(); } catch {} }
  if (!Object.keys(state.tabSessions||{}).length && !state.streams.A && !state.streams.B && !state.streams.external) return stop();
  return status();
}

async function startExternal({ settings, revision = 0 }) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio:{ channelCount:{ideal:2}, echoCancellation:false, noiseSuppression:false, autoGainControl:false }, video:false });
    return start({ tabId:-1, streamId:"external", settings, revision, deck:"A", mediaStream:stream, inputMode:"external" });
  } catch (error) { return { ok:false, error:`External input failed: ${error?.message || error}` }; }
}

function status() {
  const reduction = state.nodes?.compressor?.reduction;
  const limiterReduction = state.nodes?.limiter?.reduction;
  const sampleRate = state.context?.sampleRate || null;
  return {
    ok: true,
    active: Boolean((Object.keys(state.tabSessions||{}).length || state.stream || state.streams?.A || state.streams?.B || state.streams?.external) && state.context && state.context.state !== "closed"),
    tabId: state.tabId,
    audioContextState: state.context?.state || "not-created",
    sampleRate,
    contextLatencyPolicy: state.contextLatencyPolicy,
    audioContextBaseLatencyMs: Number.isFinite(Number(state.context?.baseLatency)) ? Number(state.context.baseLatency)*1000 : null,
    audioContextOutputLatencyMs: Number.isFinite(Number(state.context?.outputLatency)) ? Number(state.context.outputLatency)*1000 : null,
    requestedHiRes: state.requestedHiRes,
    hiResActive: Boolean(state.requestedHiRes && sampleRate && sampleRate >= 88200),
    noiseWorkletAvailable: state.noiseWorkletAvailable,
    inputChannels: state.inputChannels,
    preset: state.settings.preset,
    dapMode: state.settings.dapMode,
    dapStrength: state.settings.dapStrength,
    dapCrossfeedActive: Boolean(state.nodes?.dapCrossfeed && state.settings.dapMode !== "off" && state.settings.dapStrength > 0),
    selfDapEnabled: Boolean(state.settings.selfDapEnabled),
    selfDapStrength: state.settings.selfDapStrength,
    selfDapRestoration: state.settings.selfDapRestoration,
    selfDapRestorationActive: Boolean(state.selfDapRestorationActive),
    selfDapRestorationReason: state.selfDapRestorationReason,
    selfDapRestorationScore: Number(state.selfDapRestorationScore.toFixed(3)),
    selfDapRestorationCutoffKhz: state.settings.selfDapRestorationCutoffKhz,
    selfDapWatchdogTrips: state.selfDapWatchdogTrips,
    selfDapBands: state.selfDapBands,
    selfDapBypassGain: state.nodes?.selfDap?.bypassGain ? Number(state.nodes.selfDap.bypassGain.gain.value.toFixed(3)) : null,
    selfDapProcessedGain: state.nodes?.selfDap?.processedGain ? Number(state.nodes.selfDap.processedGain.gain.value.toFixed(3)) : null,
    selfDapInternalLimiterBypassed: true,
    lowCutBypassed: Boolean(state.nodes?.lowCutBypass && state.nodes.lowCutBypass.gain.value > 0.5),
    perspectiveEnabled: Boolean(state.settings.perspectiveEnabled),
    perspectiveDepth: state.settings.perspectiveDepth,
    perspectiveWet: state.nodes?.perspective?.wet ? Number(state.nodes.perspective.wet.gain.value.toFixed(4)) : null,
    masterSafetyGain: state.nodes?.masterSafety ? Number(state.nodes.masterSafety.gain.value.toFixed(3)) : null,
    safetyMeterAvailable: state.safetyMeterAvailable,
    sparkWorkletAvailable: state.sparkWorkletAvailable,
    spatialMetricsAvailable:state.spatialMetricsAvailable, spatialMetrics:state.spatialMetrics, spatialLastReportAtMs:state.spatialLastReportAtMs,
    spatial3d: SpatialDiagnostics?.snapshot ? SpatialDiagnostics.snapshot({settings:state.settings,resolved:state.spatialResolved,params:state.spatialParams,runtime:{fallbackStatus:state.spatialFallbackStatus,wetConnected:state.nodes?.spatial3d?.wetConnected,sinkApplied:state.spatialSinkApplied,sinkError:state.spatialSinkError,outputLabel:state.spatialRuntimeOutputLabel},context:state.context,inputChannels:state.inputChannels}) : null,
    virtualAmp: VirtualAmp?.snapshot ? VirtualAmp.snapshot(state.nodes?.virtualAmp) : null,
    sparkPulse: Number(state.sparkPulse.toFixed(3)),
    sparkReports: state.sparkReports,
    sparkFallbackActive: Boolean(state.sparkFallbackActive),
    safetyPeak: state.safetyStats?.peak ?? null,
    safetyRms: state.safetyStats?.rms ?? null,
    safetyClipCount: state.safetyStats?.clipCount ?? 0,
    safetyFaults: state.safetyFaults,
    safetyFaultLatched: state.safetyFaultLatched,
    adaptiveSafetyEnabled: state.settings.adaptiveSafetyEnabled !== false,
    adaptiveTrimDb: Number(state.adaptiveTrimDb.toFixed(2)),
    adaptiveTrimHoldReason: state.adaptiveTrimHoldReason,
    adaptiveTrimQuietStreak: state.adaptiveTrimQuietStreak,
    adaptiveTrimLastPressureAtMs: state.adaptiveTrimLastPressureAtMs,
    adaptiveTrimReleaseCount: state.adaptiveTrimReleaseCount,
    stereoCorrelation: state.stereoCorrelationEma === null ? null : Number(state.stereoCorrelationEma.toFixed(6)),
    stereoClass: classifyStereo({ inputChannels:state.inputChannels, correlation:state.stereoCorrelationEma, balanceDb:state.safetyStats?.balanceDb, rmsDbfs:linearToDb(state.safetyStats?.rms), monoLikeStreak:state.monoLikeStreak }),
    runtimeRecoveries: state.runtimeRecoveries,
    runtimeWatchdogMisses: state.runtimeWatchdogMisses,
    compressorReductionDb: Number.isFinite(reduction) ? Number(reduction.toFixed(2)) : null,
    limiterReductionDb: Number.isFinite(limiterReduction) ? Number(limiterReduction.toFixed(2)) : null,
    autoLevelEnabled: Boolean(state.settings.autoLevelEnabled),
    autoLevelProfile: state.settings.autoLevelProfile,
    autoLevelMeasuredDbfs: state.autoLevelMeasuredDbfs === null ? null : Number(state.autoLevelMeasuredDbfs.toFixed(2)),
    autoLevelDb: Number(state.autoLevelDb.toFixed(2)),
    sparkMakeupDb: Number(state.sparkMakeupDb.toFixed(3)),
    impactEnabled: state.settings.impactEnabled !== false,
    impactAmount: state.settings.impactAmount,
    impactGain: Number(state.impactGain.toFixed(4)),
    compressorEscape: Number(state.compressorEscape.toFixed(3)),
    impactBandHz: [1400, 9000],
    seamNaturalizerEnabled: state.settings.seamNaturalizerEnabled !== false,
    seamNaturalizerAmount: state.settings.seamNaturalizerAmount,
    seamConfidence: Number(state.seamConfidence.toFixed(3)),
    seamDiscontinuity: Number(state.seamDiscontinuity.toFixed(3)),
    seamSpeechRatio: Number(state.seamSpeechRatio.toFixed(3)),
    seamEvents: state.seamEvents,
    transientValleyEnabled: state.settings.transientValleyEnabled !== false,
    transientValleyAmount: state.settings.transientValleyAmount,
    transientValleyDepthDb: Date.now() - state.transientValleyLastTriggerAtMs < 150 ? Number(state.transientValleyDepthDb.toFixed(3)) : 0,
    transientValleyTriggers: state.transientValleyTriggers,
    transientEdgeEnabled: Boolean(state.settings.transientEdgeEnabled),
    transientEdgeAmount: state.settings.transientEdgeAmount,
    transientEdgeWet: Date.now()-state.transientEdgeLastTriggerAtMs<120 ? Number(state.transientEdgeWet.toFixed(4)) : 0,
    transientEdgeTriggers: state.transientEdgeTriggers,
    voiceMaterialEnabled: Boolean(state.settings.voiceMaterialEnabled), voiceDepthMode: state.settings.voiceDepthMode,
    voiceConfidence: Number(state.voiceConfidence.toFixed(3)), voiceConfidenceRaw:Number(state.voiceConfidenceRaw.toFixed(3)), voiceSyntheticTendency: Number(state.voiceSyntheticTendency.toFixed(3)), voiceSyntheticTendencyRaw:Number(state.voiceSyntheticTendencyRaw.toFixed(3)), voiceEvents: state.voiceEvents,
    headphoneCorrectionEnabled: Boolean(state.settings.headphoneCorrectionEnabled), headphoneModel: state.settings.headphoneModel, headphoneCorrectionStrength: state.settings.headphoneCorrectionStrength,
    headphoneCalibrationEnabled:Boolean(state.settings.headphoneCalibrationEnabled), headphoneCalibrationStrength:state.settings.headphoneCalibrationStrength, headphoneCalibrationGainsDb:[...(state.settings.headphoneCalibrationGainsDb||[])], headphoneCalibrationMode:state.settings.headphoneCalibrationMode,
    headphoneOutputLabel:state.settings.headphoneOutputLabel||"", headphoneOutputDeviceSelected:Boolean(state.settings.headphoneOutputDeviceId), headphoneOutputSinkApplied:Boolean(state.headphoneOutputSinkApplied), headphoneOutputSinkError:state.headphoneOutputSinkError,
    headphoneEffectiveMode:isLocalHeadphoneIntent(state.settings),
    hrtfEnabled: Boolean(state.settings.hrtfEnabled), hrtfProfile: state.settings.hrtfProfile, hrtfAmount: state.settings.hrtfAmount,
    hrtfEffectiveEnabled:Boolean((state.settings.hrtfEnabled && isLocalHeadphoneIntent(state.settings)) || (state.settings.spatialEnabled && state.settings.spatialOutputTarget==="sonobus-mobile-headphones")),
    hrtfEffectiveProfile:(state.settings.spatialEnabled && state.settings.spatialOutputTarget==="sonobus-mobile-headphones" && !state.settings.hrtfEnabled)?"natural":state.settings.hrtfProfile,
    hrtfDatasetFreeParametric:Boolean(state.settings.spatialEnabled && state.settings.spatialOutputTarget==="sonobus-mobile-headphones"),
    orbitKeeperEnabled: state.settings.orbitKeeperEnabled !== false,
    orbitHealthScore: Number(state.orbitHealthScore.toFixed(1)),
    orbitLevel: state.orbitLevel,
    orbitTimerDriftMs: Number(state.orbitTimerDriftMs.toFixed(1)),
    orbitDegraded: Boolean(state.orbitDegraded),
    orbitActions: state.orbitActions,
    orbitLastAction: state.orbitLastAction,
    effectiveLevelDb: Number(state.effectiveLevelDb.toFixed(3)),
    effectiveLevelWrites: state.effectiveLevelWrites,
    dacMatrixMode: state.settings.dacMatrixMode,
    dacMatrixStrength: state.settings.dacMatrixStrength,
    roomEnabled: Boolean(state.settings.roomEnabled), roomMode: state.settings.roomMode, roomAmount: state.settings.roomAmount,
    integrityEnabled: Boolean(state.settings.integrityEnabled), integrityMode: state.settings.integrityMode,
    cartridgeEnabled: Boolean(state.settings.cartridgeEnabled), cartridgeMode: state.settings.cartridgeMode,
    inputMode: state.inputMode, externalActive: state.externalActive,
    sessionTabIds:Object.keys(state.tabSessions||{}).map(Number), sessionCount:Object.keys(state.tabSessions||{}).length, cpuLogical:state.cpuProfile?.logicalProcessors||1, schedulerTier:state.cpuProfile?.name||"conservative", maxSessions:state.cpuProfile?.maxSessions||1, avSyncEnabled:Boolean(state.settings.avSyncEnabled), avSyncDelayMs:state.settings.avSyncDelayMs, avSyncBaseLatencyMs:state.avSyncBaseLatencyMs, avSyncAppliedDelayMs:state.avSyncAppliedDelayMs, avSyncEstimatedAudioLatencyMs:state.avSyncEstimatedAudioLatencyMs, videoTelemetry:state.videoTelemetry,
    reflectionCharacterEnabled:Boolean(state.settings.reflectionCharacterEnabled), reflectionCharacterAmount:state.settings.reflectionCharacterAmount, reflectionCharacterMode:state.settings.reflectionCharacterMode,
    djEnabled: Boolean(state.settings.djEnabled), djCrossfader: state.djAutoMixActive ? state.djAutoMixPosition : state.settings.djCrossfader,
    djAutoMixActive: state.djAutoMixActive, djAutoMixDirection: state.djAutoMixDirection,
    djAutoMixProgress: state.djAutoMixActive && state.djAutoMixDurationMs > 0 ? Math.max(0,Math.min(100,((Date.now()-state.djAutoMixStartedAt)/state.djAutoMixDurationMs)*100)) : 0,
    deckAActive: Boolean(state.streams?.A), deckBActive: Boolean(state.streams?.B),
    deckATabId: state.deckTabIds?.A ?? null, deckBTabId: state.deckTabIds?.B ?? null,
    sceneEnabled: Boolean(state.settings.sceneEnabled), sceneStrength: state.settings.sceneStrength, sceneExponent: state.settings.sceneExponent,
    sparkEnabled: Boolean(state.settings.sparkEnabled), sparkAmount: state.settings.sparkAmount, deviceProfile: state.settings.deviceProfile,
    multiSpeakerEnabled: Boolean(state.settings.multiSpeakerEnabled), multiSpeakerAmount: state.settings.multiSpeakerAmount,
    scenePatternId: state.sceneRuntime?.patternId ?? null, sceneAccent: state.sceneRuntime?.accent ?? null, sceneDna: state.sceneRuntime?.dna ?? null,
    sceneWeight: state.sceneRuntime?.controls ? Number(state.sceneRuntime.controls.sceneWeight.toFixed(3)) : 0,
    virtualSpeakerMap: state.sceneRuntime?.controls?.virtualMulti ?? null,
    startedAt: state.startedAt,
    error: state.error,
    settingsRevision: state.lastSettingsRevision
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== "offscreen") return false;
  (async () => {
    switch (message.type) {
      case "START": sendResponse(await start(message)); break;
      case "ADD_SESSION": sendResponse(await addSession(message)); break;
      case "STOP_SESSION": sendResponse(await stopSession(message.tabId)); break;
      case "PROMOTE_SESSION_TO_DECK": sendResponse(await promoteSessionToDeck(message)); break;
      case "VIDEO_TELEMETRY": { state.videoTelemetry[String(message.tabId ?? message.payload?.tabId ?? state.tabId ?? "active")]=message.payload||{}; sendResponse({ok:true}); break; }
      case "ADD_DECK": sendResponse(await addDeck(message)); break;
      case "STOP_DECK": sendResponse(await stopDeck(message.deck)); break;
      case "START_EXTERNAL": sendResponse(await startExternal(message)); break;
      case "AUTO_MIX": sendResponse(startDjAutoMix(message.direction, message.seconds)); break;
      case "STOP": sendResponse(await stop()); break;
      case "UPDATE_SETTINGS": {
        const result = applySettings(message.settings || {}, { revision: message.revision || 0, replace: Boolean(message.replace) });
        sendResponse({ ...status(), ...result });
        break;
      }
      case "STATUS": sendResponse(status()); break;
      default: sendResponse({ ok: false, error: "unknown offscreen message" });
    }
  })().catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
