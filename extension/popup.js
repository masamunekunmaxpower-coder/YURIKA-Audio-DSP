"use strict";

const { DEFAULTS, sanitizeSettings } = globalThis.YurikaAudioCore;
const AdaptiveV29 = globalThis.YurikaAdaptiveV29;
const HeadphoneProfiles = globalThis.YurikaHeadphoneProfiles;
const SpatialProfiles = globalThis.YurikaSpatialDeviceProfiles;

const ids = [
  "enabled","preset","lowCutHz","bassDb","warmthDb","clarityDb","airDb","outputDb","compressor",
  "detail","width","reality","noiseReduction","spectralFill","hiResMode","dapMode","dapStrength",
  "selfDapEnabled","selfDapStrength","selfDapRestoration","selfDapRestorationCutoffKhz",
  "perspectiveEnabled","perspectiveDepth","spatialEnabled","spatialMode","spatialDeviceProfile","spatialOutputTarget","virtualAmpEnabled","adaptiveSafetyEnabled",
  "sceneEnabled","sceneStrength","sceneExponent","sceneInertia","sparkEnabled","sparkAmount","impactEnabled","impactAmount","seamNaturalizerEnabled","seamNaturalizerAmount","transientValleyEnabled","transientValleyAmount","transientEdgeEnabled","transientEdgeAmount","transientEdgeTone","orbitKeeperEnabled","deviceProfile","multiSpeakerEnabled","multiSpeakerAmount",
  "voiceMaterialEnabled","voiceMaterialAmount","voiceDepthMode","voiceTransparency","voiceAir","headphoneCorrectionEnabled","headphoneModel","headphoneCorrectionStrength","headphoneCalibrationEnabled","headphoneCalibrationStrength","hrtfEnabled","hrtfProfile","hrtfAmount","spatialTelemetryEnabled","reflectionCharacterEnabled","reflectionCharacterAmount","reflectionCharacterMode","avSyncEnabled","avSyncDelayMs",
  "dacMatrixMode","dacMatrixStrength","dacAkmWeight","dacEssWeight","dacTiWeight",
  "roomEnabled","roomMode","roomAmount","integrityEnabled","integrityMode","integrityStrength",
  "autoLevelEnabled","autoLevelProfile","autoLevelTargetDbfs",
  "djEnabled","djCrossfader","djAutoMixSeconds","deckAGainDb","deckBGainDb","deckALowDb","deckAMidDb","deckAHighDb","deckBLowDb","deckBMidDb","deckBHighDb",
  "cartridgeEnabled","cartridgeMode","cartridgeAResistance","cartridgeACapacitance","cartridgeAGainDb",
  "cartridgeBResistance","cartridgeBCapacitance","cartridgeBGainDb","cartridgeCResistance","cartridgeCCapacitance","cartridgeCGainDb",
  "cartridgeMixA","cartridgeMixB","cartridgeMixC"
];
const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const statusEl = document.getElementById("status");
const diagEl = {
  peak: document.getElementById("diagPeak"), rms: document.getElementById("diagRms"), corr: document.getElementById("diagCorr"),
  stereo: document.getElementById("diagStereo"), trim: document.getElementById("diagTrim"), limiter: document.getElementById("diagLimiter"),
  autoLevel: document.getElementById("diagAutoLevel"), sparkGain: document.getElementById("diagSparkGain"), impact: document.getElementById("diagImpact"), compEscape: document.getElementById("diagCompEscape"), seam: document.getElementById("diagSeam"), valley: document.getElementById("diagValley"), edge: document.getElementById("diagEdge"), voice: document.getElementById("diagVoice"), headphone: document.getElementById("diagHeadphone"), orbit: document.getElementById("diagOrbit"), effectiveGain: document.getElementById("diagEffectiveGain"),
  supervisor: document.getElementById("diagSupervisor"), scene: document.getElementById("diagScene"), device: document.getElementById("diagDevice"),
  spatialOn:document.getElementById("diagSpatialOn"), spatialMode:document.getElementById("diagSpatialMode"), spatialOutput:document.getElementById("diagSpatialOutput"), spatialProfile:document.getElementById("diagSpatialProfile"), spatialIo:document.getElementById("diagSpatialIo"), spatialHrtf:document.getElementById("diagSpatialHrtf"), spatialStrength:document.getElementById("diagSpatialStrength"), spatialCuePreserve:document.getElementById("diagSpatialCuePreserve"), spatialShape:document.getElementById("diagSpatialShape"), spatialElevation:document.getElementById("diagSpatialElevation"), spatialCues:document.getElementById("diagSpatialCues"), spatialReflection:document.getElementById("diagSpatialReflection"), spatialCrosstalk:document.getElementById("diagSpatialCrosstalk"), spatialLatency:document.getElementById("diagSpatialLatency"), spatialGain:document.getElementById("diagSpatialGain"), spatialHeadroom:document.getElementById("diagSpatialHeadroom"), spatialFallback:document.getElementById("diagSpatialFallback"),
  ampState:document.getElementById("diagAmpState"), ampBackend:document.getElementById("diagAmpBackend"), ampPower:document.getElementById("diagAmpPower"), ampThdn:document.getElementById("diagAmpThdn"), ampSnr:document.getElementById("diagAmpSnr"), ampLatency:document.getElementById("diagAmpLatency"), ampFault:document.getElementById("diagAmpFault"),
  itd:document.getElementById("diagItd"),ild:document.getElementById("diagIld"),iacc:document.getElementById("diagIacc"),localization:document.getElementById("diagLocalization"),hrtfCue:document.getElementById("diagHrtfCue"),avSync:document.getElementById("diagAvSync"),sessions:document.getElementById("diagSessions")
};
const RANGE_KEYS = new Set(["bassDb","warmthDb","clarityDb","airDb","outputDb","detail","width","reality","noiseReduction","spectralFill","dapStrength","selfDapStrength","perspectiveDepth",
  "sceneStrength","sceneExponent","sceneInertia","sparkAmount","impactAmount","seamNaturalizerAmount","transientValleyAmount","transientEdgeAmount","reflectionCharacterAmount","avSyncDelayMs","voiceMaterialAmount","voiceTransparency","voiceAir","headphoneCorrectionStrength","headphoneCalibrationStrength","hrtfAmount","multiSpeakerAmount","dacMatrixStrength","dacAkmWeight","dacEssWeight","dacTiWeight","roomAmount","integrityStrength","autoLevelTargetDbfs","djCrossfader","djAutoMixSeconds","deckAGainDb","deckBGainDb","deckALowDb","deckAMidDb","deckAHighDb","deckBLowDb","deckBMidDb","deckBHighDb","cartridgeMixA","cartridgeMixB","cartridgeMixC"]);
const pendingTimers = new Map();
const fieldGeneration = new Map();
let uiState = { ...DEFAULTS };
let actionQueue = Promise.resolve();
let initialized = false;
let statusTimer = null;

const dbText = (v) => `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(1)} dB`;
async function send(type, extra = {}) {
  try {
    return await chrome.runtime.sendMessage({ target:"service-worker", type, ...extra });
  } catch (error) {
    return { ok:false, error:`拡張内部通信エラー: ${error?.message || String(error)}` };
  }
}

function setActionStatus(text, state="info") {
  const message = String(text || "");
  const mix = document.getElementById("mixActionStatus");
  const toast = document.getElementById("giroActionToast");
  if (mix) { mix.textContent = message; mix.dataset.state = state; }
  if (toast) { toast.textContent = message; toast.dataset.state = state; toast.classList.add("visible"); }
}

function enqueueUiAction(task) {
  const run = actionQueue.then(task, task);
  actionQueue = run.catch(() => {});
  return run;
}

function readControlValue(key) {
  const node = el[key];
  if (!node) return undefined;
  if (node.type === "checkbox") return Boolean(node.checked);
  if (node.type === "range" || node.tagName === "SELECT" && ["lowCutHz","selfDapRestorationCutoffKhz"].includes(key)) return Number(node.value);
  return node.value;
}

function render(settings) {
  uiState = sanitizeSettings({ ...DEFAULTS, ...(settings || {}) });
  for (const [key, value] of Object.entries(uiState)) {
    if (!el[key]) continue;
    if (el[key].type === "checkbox") el[key].checked = Boolean(value);
    else el[key].value = String(value);
  }
  updateOutputs();
  updateAvSyncUi();
}

function updateOutputs() {
  for (const key of ["bassDb","warmthDb","clarityDb","airDb","outputDb","deckAGainDb","deckBGainDb"]) { const o=document.getElementById(`${key}Out`); if(o)o.textContent=dbText(el[key].value); }
  for (const key of ["detail","width","reality","noiseReduction","spectralFill","dapStrength","selfDapStrength","perspectiveDepth","sceneStrength","sceneExponent","sceneInertia","sparkAmount","impactAmount","seamNaturalizerAmount","transientValleyAmount","transientEdgeAmount","reflectionCharacterAmount","avSyncDelayMs","voiceMaterialAmount","voiceTransparency","voiceAir","headphoneCorrectionStrength","headphoneCalibrationStrength","hrtfAmount","multiSpeakerAmount","dacMatrixStrength","dacAkmWeight","dacEssWeight","dacTiWeight","roomAmount","integrityStrength","djCrossfader","deckALowDb","deckAMidDb","deckAHighDb","deckBLowDb","deckBMidDb","deckBHighDb","cartridgeMixA","cartridgeMixB","cartridgeMixC"]) { const o=document.getElementById(`${key}Out`); if(o)o.textContent=Number(el[key].value).toFixed(1); }
  const expOut=document.getElementById("sceneExponentOut"); if(expOut) expOut.textContent=Number(el.sceneExponent.value).toFixed(2);
  const target=document.getElementById("autoLevelTargetDbfsOut"); if(target)target.textContent=`${Number(el.autoLevelTargetDbfs.value).toFixed(1)} dBFS`;
  const mixSeconds=document.getElementById("djAutoMixSecondsOut"); if(mixSeconds)mixSeconds.textContent=`${Number(el.djAutoMixSeconds.value).toFixed(1)} s`;
}

function updateAvSyncUi(){
  if(!el.avSyncDelayMs)return;
  const enabled=Boolean(uiState.avSyncEnabled);
  el.avSyncDelayMs.disabled=!enabled;
  el.avSyncDelayMs.setAttribute("aria-disabled",String(!enabled));
  const label=el.avSyncDelayMs.closest("label");
  if(label)label.style.opacity=enabled?"1":"0.62";
}

function updateLocalField(key) {
  fieldGeneration.set(key, (fieldGeneration.get(key) || 0) + 1);
  const rawValue = readControlValue(key);
  const next = sanitizeSettings({ ...uiState, [key]: rawValue, enabled: uiState.enabled, preset: uiState.preset });
  uiState = next;
  if (el[key]) {
    if (el[key].type === "checkbox") el[key].checked = Boolean(next[key]);
    else el[key].value = String(next[key]);
  }
  updateOutputs();
  if(key==="avSyncEnabled"||key==="avSyncDelayMs")updateAvSyncUi();
  return next[key];
}

async function flushField(key) {
  const timer = pendingTimers.get(key);
  if (timer) clearTimeout(timer);
  pendingTimers.delete(key);
  const value = uiState[key];
  const generation = fieldGeneration.get(key) || 0;
  return enqueueUiAction(async () => {
    const result = await send("APPLY_PATCH", { patch: { [key]: value } });
    if (!result?.ok) {
      statusEl.textContent = result?.error || "設定更新に失敗";
      setActionStatus(statusEl.textContent, "error");
      const canonical = await send("GET_SETTINGS");
      if (canonical?.ok) render(canonical.settings);
      return result;
    }
    // Only accept the acknowledged field. Never repaint unrelated layers from a slider response.
    if (result.settings && Object.prototype.hasOwnProperty.call(result.settings, key) && (fieldGeneration.get(key) || 0) === generation) {
      uiState = sanitizeSettings({ ...uiState, [key]: result.settings[key], enabled: uiState.enabled, preset: uiState.preset });
      if (el[key]?.type === "checkbox") el[key].checked = Boolean(uiState[key]);
      else if (el[key]) el[key].value = String(uiState[key]);
      updateOutputs();
    }
    if (key === "hiResMode" || key === "virtualAmpEnabled" || key === "spatialEnabled" || key === "spatialMode" || key === "spatialDeviceProfile" || key === "spatialOutputTarget" || key === "selfDapEnabled" || key === "perspectiveEnabled" || key === "dapMode" || key === "sceneEnabled" || key === "sparkEnabled" || key === "impactEnabled" || key === "seamNaturalizerEnabled" || key === "transientValleyEnabled" || key === "transientEdgeEnabled" || key === "transientEdgeTone" || key === "voiceMaterialEnabled" || key === "voiceDepthMode" || key === "headphoneCorrectionEnabled" || key === "headphoneModel" || key === "hrtfEnabled" || key === "hrtfProfile" || key === "spatialTelemetryEnabled" || key === "reflectionCharacterEnabled" || key === "reflectionCharacterMode" || key === "avSyncEnabled" || key === "orbitKeeperEnabled" || key === "deviceProfile" || key === "multiSpeakerEnabled") await refreshStatus();
    return result;
  });
}

function scheduleFieldPatch(key) {
  const old = pendingTimers.get(key);
  if (old) clearTimeout(old);
  pendingTimers.set(key, setTimeout(() => { void flushField(key); }, 40));
}

function flushAllPendingBestEffort() {
  for (const key of [...pendingTimers.keys()]) void flushField(key);
}

async function setEnabled(enabled) {
  el.enabled.disabled = true;
  try {
    await enqueueUiAction(async () => {
      statusEl.textContent = enabled ? "DSPを開始しています…" : "DSPを停止しています…";
      const response = await send("SET_ENABLED", { enabled });
      if (!response?.ok) {
        uiState = sanitizeSettings({ ...uiState, enabled:false });
        el.enabled.checked = false;
        statusEl.textContent = response?.error || "開始できませんでした";
        return;
      }
      uiState = sanitizeSettings({ ...uiState, enabled:Boolean(response.settings?.enabled) });
      el.enabled.checked = uiState.enabled;
      await refreshStatus();
    });
  } catch (error) {
    uiState = sanitizeSettings({ ...uiState, enabled:false });
    el.enabled.checked = false;
    statusEl.textContent = error?.message || String(error);
  } finally {
    el.enabled.disabled = false;
  }
}

function dbfs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "-∞ dBFS";
  return `${(20 * Math.log10(n)).toFixed(1)} dBFS`;
}

function renderDiagnostics(s) {
  if (!diagEl.peak) return;
  diagEl.peak.textContent = Number.isFinite(Number(s?.safetyPeak)) ? dbfs(s.safetyPeak) : "--";
  diagEl.rms.textContent = Number.isFinite(Number(s?.safetyRms)) ? dbfs(s.safetyRms) : "--";
  diagEl.corr.textContent = Number.isFinite(Number(s?.stereoCorrelation)) ? Number(s.stereoCorrelation).toFixed(5) : "--";
  diagEl.stereo.textContent = s?.stereoClass || "--";
  diagEl.trim.textContent = Number.isFinite(Number(s?.adaptiveTrimDb)) ? `${Number(s.adaptiveTrimDb).toFixed(2)} dB` : "0.00 dB";
  if (diagEl.limiter) diagEl.limiter.textContent = Number.isFinite(Number(s?.limiterReductionDb)) ? `${Number(s.limiterReductionDb).toFixed(2)} dB` : "--";
  if (diagEl.autoLevel) diagEl.autoLevel.textContent = Number.isFinite(Number(s?.autoLevelDb)) ? `${Number(s.autoLevelDb).toFixed(2)} dB` : "0.00 dB";
  if (diagEl.sparkGain) diagEl.sparkGain.textContent = Number.isFinite(Number(s?.sparkMakeupDb)) ? `+${Math.max(0, Number(s.sparkMakeupDb)).toFixed(3)} dB` : "+0.000 dB";
  if (diagEl.impact) diagEl.impact.textContent = Number.isFinite(Number(s?.impactGain)) ? Number(s.impactGain).toFixed(4) : "0.0000";
  if (diagEl.compEscape) diagEl.compEscape.textContent = Number.isFinite(Number(s?.compressorEscape)) ? `${(Math.max(0,Number(s.compressorEscape))*100).toFixed(0)}%` : "0%";
  if (diagEl.seam) diagEl.seam.textContent = Number.isFinite(Number(s?.seamConfidence)) ? `${Number(s.seamConfidence).toFixed(3)} / ${Number(s.seamEvents||0)}` : "0.000";
  if (diagEl.valley) diagEl.valley.textContent = Number.isFinite(Number(s?.transientValleyDepthDb)) ? `-${Number(s.transientValleyDepthDb).toFixed(3)} dB / ${Number(s.transientValleyTriggers||0)}` : "0.000 dB";
  if (diagEl.edge) diagEl.edge.textContent = Number.isFinite(Number(s?.transientEdgeWet)) ? `${Number(s.transientEdgeWet).toFixed(4)} / ${Number(s.transientEdgeTriggers||0)}` : "0.0000";
  if (diagEl.voice) {
    const stable=Number(s?.voiceConfidence), raw=Number(s?.voiceConfidenceRaw), syn=Number(s?.voiceSyntheticTendency), synRaw=Number(s?.voiceSyntheticTendencyRaw);
    diagEl.voice.textContent=Number.isFinite(stable)?`${stable.toFixed(3)} / syn ${Number.isFinite(syn)?syn.toFixed(3):"0.000"}`:"0.000";
    diagEl.voice.title=Number.isFinite(raw)?`Raw Voice ${raw.toFixed(3)} / Raw synthetic ${Number.isFinite(synRaw)?synRaw.toFixed(3):"0.000"}`:"";
  }
  if (diagEl.headphone) diagEl.headphone.textContent = s?.headphoneEffectiveMode ? `${s.headphoneModel || "generic"}${s.headphoneCalibrationEnabled ? " / CAL" : ""}${s.hrtfEffectiveEnabled ? ` / HRTF ${s.hrtfEffectiveProfile||s.hrtfProfile}` : ""}` : "inactive"; const hpState=document.getElementById("headphoneAutoState"); if(hpState)hpState.textContent=`Output: ${s?.headphoneOutputLabel||"not selected"} / sink:${s?.headphoneOutputSinkApplied?"active":(s?.headphoneOutputDeviceSelected?"selected":"default")} / calibration:${s?.headphoneCalibrationEnabled?"measurement":"profile only"}`;
  if (diagEl.orbit) diagEl.orbit.textContent = Number.isFinite(Number(s?.orbitHealthScore)) ? `${Number(s.orbitHealthScore).toFixed(0)} / L${Number(s.orbitLevel||0)}${s?.orbitDegraded ? " SAFE" : ""}` : "--";
  const sm=s?.spatialMetrics||{};
  if(diagEl.itd)diagEl.itd.textContent=Number.isFinite(Number(sm.itdMs))?`${Number(sm.itdMs).toFixed(3)} ms`:"--";
  if(diagEl.ild)diagEl.ild.textContent=Number.isFinite(Number(sm.ildDb))?`${Number(sm.ildDb).toFixed(2)} dB`:"--";
  if(diagEl.iacc)diagEl.iacc.textContent=Number.isFinite(Number(sm.iacc))?`${Number(sm.iacc).toFixed(4)}${Number.isFinite(Number(sm.iaccSigned))&&Number(sm.iaccSigned)<0?" (inv)":""}`:"--";
  if(diagEl.localization)diagEl.localization.textContent=Number.isFinite(Number(sm.localizationErrorProxyDeg))?`${Number(sm.localizationErrorProxyDeg).toFixed(1)}° proxy`:"--";
  if(diagEl.hrtfCue){
    const stable=Number(sm.hrtfCueConsistency),raw=Number(sm.hrtfCueConsistencyRaw);
    diagEl.hrtfCue.textContent=Number.isFinite(stable)?`${stable.toFixed(0)}/100`:"--";
    diagEl.hrtfCue.title=Number.isFinite(raw)?`Raw HRTF cue ${raw.toFixed(1)}/100 / stable=9-report median`:"";
  }
  if(diagEl.avSync){
    const total=Number(s?.avSyncEstimatedAudioLatencyMs),base=Number(s?.avSyncBaseLatencyMs),applied=Number(s?.avSyncAppliedDelayMs);
    if(Number.isFinite(total)){
      diagEl.avSync.textContent=Number.isFinite(applied)&&applied>0.05?`${total.toFixed(1)} ms (+${applied.toFixed(1)} A/V)`:`${total.toFixed(1)} ms`;
      diagEl.avSync.title=Number.isFinite(base)?`Base ${base.toFixed(1)} ms / Applied A/V delay ${Number.isFinite(applied)?applied.toFixed(1):"0.0"} ms / Policy ${s?.contextLatencyPolicy||"unknown"}`:"";
    }else{diagEl.avSync.textContent="--";diagEl.avSync.title="";}
  }
  if(diagEl.sessions)diagEl.sessions.textContent=`${Number(s?.sessionCount||0)} / ${Number(s?.maxSessions||1)}`;
  if (diagEl.effectiveGain) diagEl.effectiveGain.textContent = Number.isFinite(Number(s?.effectiveLevelDb)) ? `${Number(s.effectiveLevelDb).toFixed(3)} dB` : "0.000 dB";
  const sup = s?.safetyMeterAvailable ? (s?.safetyFaultLatched ? "MUTED / recovery" : "ACTIVE") : "fallback";
  diagEl.supervisor.textContent = `${sup}${Number(s?.runtimeRecoveries || 0) ? ` / rec ${s.runtimeRecoveries}` : ""}`;
  if (diagEl.scene) diagEl.scene.textContent = s?.scenePatternId === null || s?.scenePatternId === undefined ? "--" : `#${s.scenePatternId} / A${String(s.sceneAccent ?? 0).padStart(2,"0")}`;
  if (diagEl.device) diagEl.device.textContent = s?.deviceProfile || "stereo";
  const sp=s?.spatial3d||{};
  if(diagEl.spatialOn)diagEl.spatialOn.textContent=sp.enabled?"ON":"OFF";
  if(diagEl.spatialMode)diagEl.spatialMode.textContent=sp.mode||"--";
  if(diagEl.spatialOutput)diagEl.spatialOutput.textContent=sp.outputDevice||"Default";
  if(diagEl.spatialProfile)diagEl.spatialProfile.textContent=sp.resolvedDeviceProfile||"--";
  if(diagEl.spatialIo)diagEl.spatialIo.textContent=Number.isFinite(Number(sp.sampleRate))?`${Number(sp.outputChannels||0)}ch / ${(Number(sp.sampleRate)/1000).toFixed(1)} kHz`:`${Number(sp.outputChannels||0)}ch / --`;
  if(diagEl.spatialHrtf)diagEl.spatialHrtf.textContent=sp.hrtfProfile||"--";
  if(diagEl.spatialStrength)diagEl.spatialStrength.textContent=Number.isFinite(Number(sp.spatialStrength))?Number(sp.spatialStrength).toFixed(3):"--";
  if(diagEl.spatialCuePreserve)diagEl.spatialCuePreserve.textContent=Number.isFinite(Number(sp.cuePreservationFactor))?Number(sp.cuePreservationFactor).toFixed(2):"--";
  if(diagEl.spatialShape)diagEl.spatialShape.textContent=Number.isFinite(Number(sp.width))?`${Number(sp.width).toFixed(3)} / ${Number(sp.depth||0).toFixed(3)}`:"--";
  if(diagEl.spatialElevation)diagEl.spatialElevation.textContent=Number.isFinite(Number(sp.elevation))?Number(sp.elevation).toFixed(3):"--";
  if(diagEl.spatialCues)diagEl.spatialCues.textContent=Number.isFinite(Number(sp.itdAmountMs))?`${Number(sp.itdAmountMs).toFixed(3)} ms / ${Number(sp.ildAmountDb||0).toFixed(2)} dB`:"--";
  if(diagEl.spatialReflection)diagEl.spatialReflection.textContent=Number.isFinite(Number(sp.earlyReflection))?Number(sp.earlyReflection).toFixed(4):"--";
  if(diagEl.spatialCrosstalk)diagEl.spatialCrosstalk.textContent=Number.isFinite(Number(sp.estimatedSpatialCrosstalk))?Number(sp.estimatedSpatialCrosstalk).toFixed(4):"--";
  if(diagEl.spatialLatency){
    const dsp=Number.isFinite(Number(sp.addedLatencyMs))?`${Number(sp.addedLatencyMs).toFixed(2)} ms DSP`:"--";
    const base=Number.isFinite(Number(sp.audioContextBaseLatencyMs))?` / base ${Number(sp.audioContextBaseLatencyMs).toFixed(2)} ms`:"";
    diagEl.spatialLatency.textContent=`${dsp}${base}`;
    diagEl.spatialLatency.title=sp.transportLatencyKind||"";
  }
  if(diagEl.spatialGain)diagEl.spatialGain.textContent=Number.isFinite(Number(sp.gainCompensationDb))?`${Number(sp.gainCompensationDb).toFixed(2)} dB`:"--";
  if(diagEl.spatialHeadroom)diagEl.spatialHeadroom.textContent=Number.isFinite(Number(sp.peakHeadroomDb))?`${Number(sp.peakHeadroomDb).toFixed(2)} dB`:"--";
  if(diagEl.spatialFallback)diagEl.spatialFallback.textContent=sp.fallbackStatus||"none";
  const spatialState=document.getElementById("spatialOutputState");if(spatialState)spatialState.textContent=`Target: ${sp.outputTarget||uiState.spatialOutputTarget||"local"} / PC Output: ${sp.outputDevice||"Default"} / Profile: ${sp.resolvedDeviceProfile||uiState.spatialDeviceProfile||"auto"}${sp.sinkError?` / fallback: ${sp.sinkError}`:""}`;
  const amp=s?.virtualAmp||{};
  const ampRequested=Boolean(amp.requestedEnabled ?? uiState.virtualAmpEnabled);
  const ampEffective=Boolean(amp.effectiveEnabled);
  const ampStateText=!ampRequested?"OFF":amp.neutralBypass?"NEUTRAL BYPASS":ampEffective?"ACTIVE":"BYPASS";
  if(diagEl.ampState)diagEl.ampState.textContent=ampStateText;
  if(diagEl.ampBackend)diagEl.ampBackend.textContent=amp.backend||"--";
  if(diagEl.ampPower)diagEl.ampPower.textContent=Number.isFinite(Number(amp.ratedPowerWPerChannel))?`${Number(amp.ratedPowerWPerChannel).toFixed(0)} W/ch rated / ${Number(amp.maxPowerWPerChannel||0).toFixed(0)} W max @ ${Number(amp.loadOhm||6).toFixed(0)}Ω`:"--";
  if(diagEl.ampThdn)diagEl.ampThdn.textContent=Number.isFinite(Number(amp.ampOnlyThdnDb))?`${Number(amp.ampOnlyThdnDb).toFixed(1)} dB contribution`:"--";
  if(diagEl.ampSnr)diagEl.ampSnr.textContent=Number.isFinite(Number(amp.snrDbA))?`${Number(amp.snrDbA).toFixed(0)} dB(A)`:"--";
  if(diagEl.ampLatency)diagEl.ampLatency.textContent=Number.isFinite(Number(amp.addedAlgorithmicLatencyFrames))?`${Number(amp.addedAlgorithmicLatencyFrames)} frames / ${Number(amp.addedAlgorithmicLatencyMs||0).toFixed(2)} ms*`:"--";
  if(diagEl.ampFault)diagEl.ampFault.textContent=amp.error||"none";
  const ampStateEl=document.getElementById("virtualAmpState");
  if(ampStateEl){
    const base=`Amp: ${ampStateText} / ${amp.backend||"--"}`;
    ampStateEl.textContent=amp.error?`${base} / ERROR: ${amp.error}`:amp.neutralBypass?`${base} / Neutral transparency protection`:base;
    ampStateEl.dataset.state=amp.error?"error":amp.neutralBypass?"warn":ampEffective?"ok":"info";
  }
}

async function refreshStatus() {
  try {
    const s = await send("STATUS");
    const active = Boolean(s?.ok && s.active);
    const activeTabEnabled = Boolean(s?.activeTabEnabled);
    renderDiagnostics(s);
    uiState = sanitizeSettings({ ...uiState, enabled:active });
    el.enabled.checked = activeTabEnabled;
    if (!s?.ok) statusEl.textContent = s?.error || "状態を取得できません";
    else if (!active) statusEl.textContent = "BYPASS / YouTube本来の音声";
    else {
      const rate = s.sampleRate ? `${(s.sampleRate/1000).toFixed(1)} kHz` : "? kHz";
      const hi = s.requestedHiRes ? (s.hiResActive ? " / Hi-Res active" : " / Hi-Res fallback") : "";
      const nr = s.noiseWorkletAvailable ? " / NR" : " / NR fallback";
      const lim = Number.isFinite(s.limiterReductionDb) && s.limiterReductionDb < -0.05 ? ` / LIM ${s.limiterReductionDb.toFixed(1)} dB` : "";
      const dap = s.dapMode && s.dapMode !== "off" ? ` / DAP ${s.dapMode} ${s.dapStrength ?? 0}` : "";
      const selfDap = s.selfDapEnabled ? ` / SELF-DAP ${s.selfDapStrength ?? 0} R:${s.selfDapRestorationActive ? "ON" : (s.selfDapRestoration || "auto")} @${s.selfDapRestorationCutoffKhz ?? 14}k` : "";
      const perspective = s.perspectiveEnabled ? ` / DEPTH ${s.perspectiveDepth ?? 0}` : "";
      const trim = Number(s.adaptiveTrimDb || 0) < -0.05 ? ` / SAFE ${Number(s.adaptiveTrimDb).toFixed(1)}dB` : "";
      const al = s.autoLevelEnabled ? ` / AL ${Number(s.autoLevelDb || 0).toFixed(1)}dB` : "";
      const dm = s.dacMatrixMode && s.dacMatrixMode !== "off" ? ` / DAC ${s.dacMatrixMode}` : "";
      const room = s.roomEnabled ? ` / ROOM ${s.roomMode}` : "";
      const input = s.inputMode ? ` / ${String(s.inputMode).toUpperCase()}` : "";
      const autoMix = s.djAutoMixActive ? ` / AUTO-MIX ${Number(s.djAutoMixProgress || 0).toFixed(0)}%` : "";
      const scene = s.sceneEnabled ? ` / SCENE #${s.scenePatternId ?? "--"}` : "";
      const spark = s.sparkEnabled ? ` / SPARK ${Number(s.sparkAmount || 0).toFixed(0)}` : "";
      const impact = s.impactEnabled ? ` / IMPACT ${Number(s.impactAmount || 0).toFixed(0)}` : "";
      const seam = s.seamNaturalizerEnabled ? ` / SEAM ${Number(s.seamNaturalizerAmount || 0).toFixed(0)}` : "";
      const valley = s.transientValleyEnabled ? ` / VALLEY ${Number(s.transientValleyAmount || 0).toFixed(0)}` : "";
      const edge = s.transientEdgeEnabled ? ` / EDGE ${Number(s.transientEdgeAmount || 0).toFixed(0)}` : "";
      const voice = s.voiceMaterialEnabled ? ` / VOICE ${s.voiceDepthMode || "normal"}` : "";
      const hp = s.headphoneEffectiveMode && s.headphoneCorrectionEnabled ? ` / HP ${s.headphoneModel || "generic"}${s.headphoneCalibrationEnabled?"+CAL":""}` : "";
      const hrtf = s.hrtfEffectiveEnabled ? ` / HRTF ${s.hrtfEffectiveProfile || s.hrtfProfile || "natural"}` : "";
      const orbit = s.orbitKeeperEnabled ? ` / ORBIT L${Number(s.orbitLevel || 0)}` : "";
      const spatTelemetry=s.spatialMetricsAvailable?` / SPAT-MET ${s.schedulerTier||"?"}`:""; const spatial3d=s.spatial3d?.enabled?` / 3D ${String(s.spatial3d.mode||"auto").toUpperCase()} ${s.spatial3d.resolvedDeviceProfile||"auto"}`:""; const refl=s.reflectionCharacterEnabled?` / REFL ${Number(s.reflectionCharacterAmount||0).toFixed(0)}`:""; const sessions=Number(s.sessionCount||0)>1?` / TABS ${s.sessionCount}`:"";
      const device = s.deviceProfile && s.deviceProfile !== "stereo" ? ` / OUT ${s.deviceProfile}` : "";
      const multi = s.multiSpeakerEnabled ? ` / VMS ${Number(s.multiSpeakerAmount || 0).toFixed(0)}` : "";
      const ampStatus=s.virtualAmp?.requestedEnabled?(s.virtualAmp?.effectiveEnabled?" / AMP A":" / AMP BYPASS"):"";
      statusEl.textContent = `DSP ON / ${rate}${hi}${nr}${dap}${selfDap}${perspective}${dm}${room}${scene}${spark}${impact}${seam}${valley}${edge}${voice}${hp}${hrtf}${orbit}${spatTelemetry}${spatial3d}${refl}${sessions}${device}${multi}${ampStatus}${al}${lim}${trim}${input}${autoMix}`;
      const deckState=document.getElementById("deckState"); if(deckState) deckState.textContent=`A: ${s.deckAActive?"ON":"--"} / B: ${s.deckBActive?"ON":"--"}`;
    }
  } catch {
    statusEl.textContent = "状態を取得できません";
  }
}

el.enabled.addEventListener("change", () => { if (initialized) void setEnabled(el.enabled.checked); });

el.preset.addEventListener("change", () => {
  if (!initialized) return;
  const name = el.preset.value;
  void enqueueUiAction(async () => {
    // Any pending manual action happened before this explicit preset selection and must be committed first.
    // Range `change` normally flushes it already; this branch handles keyboard/edge cases.
    for (const key of [...pendingTimers.keys()]) {
      const timer = pendingTimers.get(key); if (timer) clearTimeout(timer); pendingTimers.delete(key);
      const value = uiState[key];
      const r = await send("APPLY_PATCH", { patch:{ [key]:value } });
      if (!r?.ok) throw new Error(r?.error || `failed to flush ${key}`);
    }
    const result = await send("APPLY_PRESET", { name });
    if (!result?.ok) {
      statusEl.textContent = result?.error || "プリセット適用に失敗";
      const canonical = await send("GET_SETTINGS");
      if (canonical?.ok) render(canonical.settings);
      return;
    }
    render(result.settings);
    await refreshStatus();
  }).catch((error) => { statusEl.textContent = error?.message || String(error); });
});

for (const key of ids) {
  if (key === "enabled" || key === "preset") continue;
  if (RANGE_KEYS.has(key)) {
    el[key].addEventListener("input", () => {
      if (!initialized) return;
      updateLocalField(key);
      scheduleFieldPatch(key);
    });
    el[key].addEventListener("change", () => {
      if (!initialized) return;
      updateLocalField(key);
      void flushField(key);
    });
  } else {
    el[key].addEventListener("change", () => {
      if (!initialized) return;
      updateLocalField(key);
      void flushField(key);
    });
  }
}

for (const [id,profile] of [["autoQuiet","quiet"],["autoReference","reference"],["autoDj","dj"]]) {
  const b=document.getElementById(id); if(!b) continue; b.addEventListener("click",()=>{ void enqueueUiAction(async()=>{ b.disabled=true; try { const r=await send("APPLY_PATCH",{patch:{autoLevelEnabled:true,autoLevelProfile:profile}}); if(r?.ok&&r.settings)render(r.settings); else statusEl.textContent=r?.error||"Auto Level failed"; await refreshStatus(); } finally { b.disabled=false; } }); });
}
const autoOff=document.getElementById("autoOff"); if(autoOff) autoOff.addEventListener("click",()=>{ void enqueueUiAction(async()=>{ const r=await send("APPLY_PATCH",{patch:{autoLevelEnabled:false}}); if(r?.ok&&r.settings)render(r.settings); await refreshStatus(); }); });

async function primeExternalInputPermission(){
  if(!navigator?.mediaDevices?.getUserMedia) throw new Error("External Input: MediaDevices/getUserMedia is unavailable in this Chrome context.");
  let stream=null;
  try {
    stream=await navigator.mediaDevices.getUserMedia({
      audio:{channelCount:{ideal:2},echoCancellation:false,noiseSuppression:false,autoGainControl:false},
      video:false
    });
    return true;
  } catch(error) {
    const name=String(error?.name||"");
    const msg=String(error?.message||error||"permission denied");
    if(name==="NotAllowedError" || /permission|dismiss/i.test(msg)) {
      throw new Error("External Input: マイク/ライン入力の許可が必要です。Chromeの許可ダイアログで『許可』を選んでから再試行してください。");
    }
    throw new Error(`External Input permission failed: ${msg}`);
  } finally {
    if(stream) for(const track of stream.getTracks?.()||[]) { try { track.stop(); } catch {} }
  }
}

for (const [id,type,extra] of [["armDeckA","ARM_DECK",{deck:"A"}],["armDeckB","ARM_DECK",{deck:"B"}],["stopDeckA","STOP_DECK",{deck:"A"}],["stopDeckB","STOP_DECK",{deck:"B"}],["startExternal","START_EXTERNAL",{}]]) {
  const b=document.getElementById(id); if(!b) continue;
  b.addEventListener("click",()=>{ void enqueueUiAction(async()=>{
    flushAllPendingBestEffort(); b.disabled=true;
    try {
      if(type==="ARM_DECK") await send("REGISTER_ACTIVE_TAB_GRANT");
      if(type==="START_EXTERNAL") {
        setActionStatus("External Input: 入力デバイス許可を確認しています...","info");
        try { await primeExternalInputPermission(); }
        catch(error) {
          const message=error?.message||String(error);
          statusEl.textContent=message;
          setActionStatus(message,"error");
          return;
        }
      }
      const r=await send(type,extra);
      if(!r?.ok){statusEl.textContent=r?.error||`${type} failed`;setActionStatus(statusEl.textContent,"error");}
      else {
        const name=type==="ARM_DECK"?`Deck ${extra.deck} を現在タブへ適用しました`:type==="STOP_DECK"?`Deck ${extra.deck} を解除しました`:"外部入力を開始しました";
        setActionStatus(name,"ok");
      }
      if(r?.settings) render(r.settings); await refreshStatus(); if(type!=="START_EXTERNAL") await refreshTabSessions();
    } finally { b.disabled=false; }
  }); });
}

for (const [id,direction] of [["autoMixAB","A_TO_B"],["autoMixBA","B_TO_A"]]) {
  const b=document.getElementById(id); if(!b) continue;
  b.addEventListener("click",()=>{ void enqueueUiAction(async()=>{ await flushField("djAutoMixSeconds"); b.disabled=true; try { const r=await send("AUTO_MIX",{direction}); if(!r?.ok){statusEl.textContent=r?.error||"AUTO MIX failed";setActionStatus(statusEl.textContent,"error");}else setActionStatus(`AUTO MIX ${direction==="A_TO_B"?"A → B":"B → A"} を開始しました`,"ok"); if(r?.settings) render(r.settings); await refreshStatus(); } finally { b.disabled=false; } }); });
}


async function chooseSpatialOutput(){
  if(!navigator?.mediaDevices)throw new Error("MediaDevices API unavailable");
  let d=null;
  if(typeof navigator.mediaDevices.selectAudioOutput==="function") d=await navigator.mediaDevices.selectAudioOutput();
  else {
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==="audiooutput"&&x.label);
    if(devices.length===1)d=devices[0];
    else throw new Error("出力選択APIが使えません。マイク権限は要求せずDefault出力へFallbackします。");
  }
  const match=SpatialProfiles?.resolve?.({requestedProfile:"auto",outputTarget:uiState.spatialOutputTarget||"local",label:d?.label||"",legacyDeviceProfile:uiState.deviceProfile,headphoneIntent:Boolean(uiState.deviceProfile==="headphone"||uiState.headphoneOutputDeviceId||uiState.headphoneOutputLabel||uiState.headphoneCorrectionEnabled)})||{profileId:"generic-stereo-speaker",confidence:0,reason:"registry-unavailable"};
  const patch={spatialOutputDeviceId:d?.deviceId||"",spatialOutputLabel:d?.label||"",spatialDeviceProfile:uiState.spatialDeviceProfile==="auto"?"auto":uiState.spatialDeviceProfile};
  const r=await send("APPLY_PATCH",{patch});if(!r?.ok)throw new Error(r?.error||"spatial output apply failed");if(r.settings)render(r.settings);
  const st=document.getElementById("spatialOutputState");if(st)st.textContent=`Output: ${d?.label||"unnamed"} / Auto match: ${match.profileId} / confidence ${Number(match.confidence||0).toFixed(2)}`;
  await refreshStatus(); return{device:d,match};
}

async function chooseHeadphoneOutput(){
  if(!navigator?.mediaDevices)throw new Error("MediaDevices API unavailable");
  let d=null;
  if(typeof navigator.mediaDevices.selectAudioOutput==="function")d=await navigator.mediaDevices.selectAudioOutput();
  else{
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==="audiooutput"&&x.label);
    if(devices.length===1)d=devices[0]; else throw new Error("出力選択APIが使えません。Chromeの対応環境で実行してください。");
  }
  const match=HeadphoneProfiles?.matchOutputLabel?.(d.label)||{profileId:"generic-neutral",confidence:0,reason:"matcher-unavailable"};
  const patch={deviceProfile:"headphone",headphoneCorrectionEnabled:true,headphoneModel:match.profileId,headphoneOutputDeviceId:d.deviceId||"",headphoneOutputLabel:d.label||"",headphoneCalibrationMode:"profile-only"};
  const r=await send("APPLY_PATCH",{patch}); if(!r?.ok)throw new Error(r?.error||"output apply failed"); if(r.settings)render(r.settings);
  const st=document.getElementById("headphoneAutoState");if(st)st.textContent=`Output: ${d.label||"unnamed"} / model:${match.profileId} / confidence:${Number(match.confidence||0).toFixed(2)} / ${match.reason}`;
  await refreshStatus(); return{device:d,match};
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function createCalibrationContext(deviceId=""){
  const ctx=new AudioContext({latencyHint:"interactive"});
  if(deviceId&&typeof ctx.setSinkId==="function")await ctx.setSinkId(deviceId);
  return ctx;
}
async function playTestSignal(){
  let sink=uiState.headphoneOutputDeviceId||""; if(!sink){const x=await chooseHeadphoneOutput();sink=x.device.deviceId||"";}
  const ctx=await createCalibrationContext(sink); const master=ctx.createGain();master.gain.value=0.018;master.connect(ctx.destination);
  try{for(const f of (AdaptiveV29?.CALIBRATION_FREQUENCIES||[80,160,315,630,1250,2500,5000,10000])){const o=ctx.createOscillator();const g=ctx.createGain();o.type="sine";o.frequency.value=f;g.gain.setValueAtTime(0,ctx.currentTime);g.gain.linearRampToValueAtTime(1,ctx.currentTime+.02);g.gain.setValueAtTime(1,ctx.currentTime+.12);g.gain.linearRampToValueAtTime(0,ctx.currentTime+.18);o.connect(g);g.connect(master);o.start();o.stop(ctx.currentTime+.20);await sleep(230);}}
  finally{await ctx.close();}
}
async function measureRms(analyser,ms){
  const buf=new Float32Array(analyser.fftSize);const vals=[];const end=performance.now()+ms;
  while(performance.now()<end){analyser.getFloatTimeDomainData(buf);let e=0;for(const x of buf)e+=x*x;vals.push(Math.sqrt(e/buf.length+1e-15));await sleep(30);}
  vals.sort((a,b)=>a-b);return vals.length?vals[Math.floor(vals.length/2)]:0;
}
async function runMeasurementCalibration(){
  if(!AdaptiveV29)throw new Error("calibration engine unavailable");
  let sink=uiState.headphoneOutputDeviceId||"";if(!sink){const x=await chooseHeadphoneOutput();sink=x.device.deviceId||"";}
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false});
  const ctx=await createCalibrationContext(sink);const src=ctx.createMediaStreamSource(stream),an=ctx.createAnalyser();an.fftSize=2048;src.connect(an);
  const master=ctx.createGain();master.gain.value=0.014;master.connect(ctx.destination);
  const stateEl=document.getElementById("headphoneAutoState");
  try{
    if(stateEl)stateEl.textContent="Calibration: measuring noise floor...";const noise=Math.max(1e-12,await measureRms(an,700));const noiseDb=20*Math.log10(noise);
    const measured=[];for(const f of AdaptiveV29.CALIBRATION_FREQUENCIES){if(stateEl)stateEl.textContent=`Calibration: ${f} Hz`;const o=ctx.createOscillator();const g=ctx.createGain();o.type="sine";o.frequency.value=f;g.gain.setValueAtTime(0,ctx.currentTime);g.gain.linearRampToValueAtTime(1,ctx.currentTime+.03);o.connect(g);g.connect(master);o.start();await sleep(260);const v=await measureRms(an,520);measured.push(20*Math.log10(Math.max(v,1e-12)));g.gain.linearRampToValueAtTime(0,ctx.currentTime+.04);await sleep(90);o.stop();}
    const cal=AdaptiveV29.deriveCalibrationGains(measured,noiseDb);if(!cal.ok)throw new Error(`測定を採用できません: ${cal.reason}. 測定マイク/カプラの位置とSNRを確認してください。`);
    const patch={deviceProfile:"headphone",headphoneCalibrationEnabled:true,headphoneCalibrationStrength:100,headphoneCalibrationGainsDb:cal.gainsDb,headphoneCalibrationMode:"measurement"};const r=await send("APPLY_PATCH",{patch});if(!r?.ok)throw new Error(r?.error||"calibration apply failed");if(r.settings)render(r.settings);
    if(stateEl)stateEl.textContent=`Calibration applied / confidence ${Number(cal.confidence).toFixed(2)} / gains ${cal.gainsDb.map(x=>Number(x).toFixed(1)).join(", ")} dB`;await refreshStatus();
  }finally{for(const t of stream.getTracks())t.stop();await ctx.close();}
}

async function refreshTabSessions(){
  const box=document.getElementById("multiTabList"),label=document.getElementById("cpuSchedulerState");if(!box)return;
  const r=await send("LIST_YOUTUBE_TABS");if(!r?.ok){box.textContent=r?.error||"tab list failed";setActionStatus(box.textContent,"error");return;}
  if(label)label.textContent=`CPU ${r.cpuProfile?.logicalProcessors||"?"} logical / ${r.cpuProfile?.name||"?"} / max ${r.cpuProfile?.maxSessions||1}`;
  box.textContent="";
  for(const t of r.tabs||[]){
    const row=document.createElement("label");row.className="check";
    const cb=document.createElement("input");cb.type="checkbox";cb.checked=Boolean(t.active);
    const deck=String(t.deck||"");
    const ready=Boolean(t.active||t.captureReady);cb.disabled=!ready||Boolean(deck);
    const title=document.createElement("span");
    const prefix=t.current?"▶ ":"";
    const suffix=deck?` [Deck ${deck}]`:t.active?" [DSP ON]":ready?" [Capture Ready]":" [要: このタブでYURIKAを開く]";
    title.textContent=`${prefix}${t.title}${suffix}`;
    if(deck) row.title=`このタブはDeck ${deck}として使用中です。Multi-Tab DSPとの二重キャプチャは無効です。`;
    else if(!ready) row.title="ChromeのactiveTab制約により、先にこのYouTubeタブを前面に出してYURIKAを一度開く必要があります。";
    cb.addEventListener("change",()=>{void enqueueUiAction(async()=>{
      cb.disabled=true;try{
        const want=cb.checked;const x=await send("SET_TAB_SESSION",{tabId:t.id,enabled:want});
        if(!x?.ok){cb.checked=!want;setActionStatus(x?.error||"session failed","error");}
        else setActionStatus(`${t.title}: DSP ${want?"ON":"OFF"}`,"ok");
        await refreshStatus();await refreshTabSessions();
      }finally{cb.disabled=false;}
    });});
    row.append(cb,title);box.appendChild(row);
  }
  if(!(r.tabs||[]).length)box.textContent="YouTubeタブなし";
}
const refreshTabs=document.getElementById("refreshTabs");if(refreshTabs)refreshTabs.addEventListener("click",()=>void enqueueUiAction(async()=>{
  setActionStatus("YouTubeタブ一覧を更新中…","info");
  const g=await send("REGISTER_ACTIVE_TAB_GRANT");
  if(g?.registered)setActionStatus("現在タブをCapture Readyとして登録しました。","ok");
  await refreshTabSessions();
}));


const spatialSelectOutput=document.getElementById("spatialSelectOutput");if(spatialSelectOutput)spatialSelectOutput.addEventListener("click",()=>void enqueueUiAction(async()=>{spatialSelectOutput.disabled=true;try{await chooseSpatialOutput();}catch(e){statusEl.textContent=e?.message||String(e);}finally{spatialSelectOutput.disabled=false;}}));
chrome.runtime.onMessage.addListener((message)=>{if(message?.target!=="popup"||message?.type!=="SPATIAL_EVENT")return false;try{window.dispatchEvent(new CustomEvent(message.event||"spatial:event",{detail:message.detail||{}}));}catch{}return false;});

const autoHp=document.getElementById("autoDetectHeadphone");if(autoHp)autoHp.addEventListener("click",()=>void enqueueUiAction(async()=>{autoHp.disabled=true;try{await chooseHeadphoneOutput();}catch(e){statusEl.textContent=e?.message||String(e);}finally{autoHp.disabled=false;}}));
const hpTest=document.getElementById("headphoneTestTone");if(hpTest)hpTest.addEventListener("click",()=>void enqueueUiAction(async()=>{hpTest.disabled=true;try{await playTestSignal();}catch(e){statusEl.textContent=e?.message||String(e);}finally{hpTest.disabled=false;}}));
const hpCal=document.getElementById("headphoneCalibrate");if(hpCal)hpCal.addEventListener("click",()=>void enqueueUiAction(async()=>{hpCal.disabled=true;try{await runMeasurementCalibration();}catch(e){statusEl.textContent=e?.message||String(e);}finally{hpCal.disabled=false;}}));
const hpReset=document.getElementById("headphoneCalibrationReset");if(hpReset)hpReset.addEventListener("click",()=>void enqueueUiAction(async()=>{const r=await send("APPLY_PATCH",{patch:{headphoneCalibrationEnabled:false,headphoneCalibrationGainsDb:[0,0,0,0,0,0,0,0],headphoneCalibrationMode:"profile-only"}});if(r?.settings)render(r.settings);await refreshStatus();}));

window.addEventListener("pagehide", () => { flushAllPendingBestEffort(); if (statusTimer) clearInterval(statusTimer); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAllPendingBestEffort(); });

(async () => {
  const grant = await send("REGISTER_ACTIVE_TAB_GRANT");
  if(grant?.registered) setActionStatus("現在タブ: Capture Ready","ok");
  const result = await send("GET_SETTINGS");
  render(result?.ok ? result.settings : DEFAULTS);
  initialized = true;
  await refreshStatus();
  await refreshTabSessions();
  statusTimer = setInterval(() => { if (document.visibilityState !== "hidden") void refreshStatus(); }, 500);
})().catch((error) => {
  render(DEFAULTS);
  initialized = true;
  statusEl.textContent = error?.message || "初期化に失敗";
});

