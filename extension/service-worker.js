"use strict";

importScripts("modular-core.js", "dsp-core.js", "adaptive-v28.js");
const AdaptiveV28 = globalThis.YurikaAdaptiveV28;
const {
  DEFAULTS, SETTINGS_SCHEMA_VERSION, sanitizeSettings, sanitizeSettingsPatch, sanitizeManualPatch,
  migrateStoredSettings, applyPreset, diffSettings, isYoutubeUrl
} = globalThis.YurikaAudioCore;

const OFFSCREEN_PATH = "offscreen.html";
let creatingOffscreen = null;
let canonicalSettings = null;
let canonicalRevision = 0;
let canonicalLoad = null;
let actionQueue = Promise.resolve();

const CAPTURE_GRANT_REGISTRY_KEY = "yurikaCaptureGrantRegistryV1";

function tabOrigin(url = "") {
  try { const u = new URL(url); return (u.protocol === "https:" || u.protocol === "http:") ? u.origin : ""; } catch { return ""; }
}

async function getCaptureGrantRegistry() {
  try {
    const raw = await chrome.storage.session.get(CAPTURE_GRANT_REGISTRY_KEY);
    const v = raw?.[CAPTURE_GRANT_REGISTRY_KEY];
    return v && typeof v === "object" ? v : {};
  } catch { return {}; }
}

async function setCaptureGrantRegistry(registry) {
  try { await chrome.storage.session.set({ [CAPTURE_GRANT_REGISTRY_KEY]: registry || {} }); } catch {}
}

async function currentBrowserTab() {
  const [tab] = await chrome.tabs.query({ active:true, lastFocusedWindow:true });
  return tab || null;
}

async function registerActiveTabGrant() {
  const tab = await currentBrowserTab();
  const origin = tabOrigin(tab?.url || "");
  if (!tab?.id || !origin) return { ok:true, registered:false, tabId:tab?.id ?? null, reason:"current tab is not an http(s) page" };
  const registry = await getCaptureGrantRegistry();
  registry[String(tab.id)] = { origin, url:tab.url || "", grantedAt:Date.now() };
  await setCaptureGrantRegistry(registry);
  return { ok:true, registered:true, tabId:tab.id, origin, title:tab.title || "" };
}

async function revokeRecordedTabGrant(tabId) {
  const registry = await getCaptureGrantRegistry();
  if (Object.prototype.hasOwnProperty.call(registry, String(tabId))) {
    delete registry[String(tabId)];
    await setCaptureGrantRegistry(registry);
  }
}

function recordedGrantMatches(registry, tab) {
  if (!tab?.id) return false;
  const rec = registry?.[String(tab.id)];
  return Boolean(rec && rec.origin && rec.origin === tabOrigin(tab.url || ""));
}

function enqueueAction(task) {
  const run = actionQueue.then(task, task);
  actionQueue = run.catch(() => {});
  return run;
}

function nextRevision() {
  const now = Date.now();
  canonicalRevision = Math.max(now, canonicalRevision + 1);
  return canonicalRevision;
}

async function ensureOffscreen() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [offscreenUrl] });
  if (contexts.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["AUDIO_PLAYBACK", "USER_MEDIA", "WORKERS"],
      justification: "Process user-invoked YouTube tab audio locally with Web Audio DSP and AudioWorklet."
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function closeOffscreenIfPresent() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [offscreenUrl] });
  if (contexts.length) await chrome.offscreen.closeDocument();
}

async function currentYoutubeTab() {
  const tab = await currentBrowserTab();
  return tab?.id && isYoutubeUrl(tab.url || "") ? tab : null;
}

async function currentCapturableTab() {
  const tab = await currentBrowserTab();
  return tab?.id && tabOrigin(tab.url || "") ? tab : null;
}

async function extensionCaptureActive() {
  try {
    const captured = await chrome.tabCapture.getCapturedTabs();
    return captured.some((x) => x.status === "active" || x.status === "pending");
  } catch {
    return false;
  }
}

async function persistCanonical() {
  await chrome.storage.local.set({
    ...canonicalSettings,
    settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
    settingsRevision: canonicalRevision
  });
}

async function loadCanonical() {
  if (canonicalSettings) return canonicalSettings;
  if (!canonicalLoad) {
    canonicalLoad = (async () => {
      const raw = await chrome.storage.local.get(null);
      const migrated = migrateStoredSettings(raw);
      canonicalSettings = sanitizeSettings(migrated);
      canonicalRevision = Number.isFinite(Number(raw.settingsRevision)) ? Number(raw.settingsRevision) : 0;

      // Browser restart does not preserve tab capture. Reconcile stale stored `enabled` with real capture state.
      const active = await extensionCaptureActive();
      if (canonicalSettings.enabled !== active) canonicalSettings = sanitizeSettings({ ...canonicalSettings, enabled: active });

      if (raw.settingsSchemaVersion !== SETTINGS_SCHEMA_VERSION || raw.enabled !== canonicalSettings.enabled) {
        nextRevision();
        await persistCanonical();
      }
      return canonicalSettings;
    })().finally(() => { canonicalLoad = null; });
  }
  return canonicalLoad;
}

async function startForTab(tab, settings, { revision = 0 } = {}) {
  if (!tab?.id || !isYoutubeUrl(tab.url || "")) return { ok:false, error:"YouTubeのタブを指定してください。" };
  await ensureOffscreen();
  let st=null; try{st=await chrome.runtime.sendMessage({target:"offscreen",type:"STATUS"});}catch{}
  if (st?.deckATabId === tab.id || st?.deckBTabId === tab.id) {
    const deck = st?.deckATabId === tab.id ? "A" : "B";
    return { ok:false, error:`このタブはDeck ${deck}として使用中です。Multi-Tab DSPへ重複キャプチャはできません。` };
  }
  if (Array.isArray(st?.sessionTabIds) && st.sessionTabIds.includes(tab.id)) {
    const update=await chrome.runtime.sendMessage({target:"offscreen",type:"UPDATE_SETTINGS",settings:sanitizeSettings(settings),replace:true,revision});
    return {ok:true,reused:true,...(update||{})};
  }
  const cpu=AdaptiveV28?.cpuProfile?.(navigator?.hardwareConcurrency||1)||{maxSessions:1};
  const count=Number(st?.sessionCount)||0; if(count>=cpu.maxSessions)return{ok:false,error:`CPU tier ${cpu.name}: 同時YouTube上限 ${cpu.maxSessions}`};
  let streamId;
  try { streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId:tab.id }); }
  catch (error) {
    await revokeRecordedTabGrant(tab.id);
    return { ok:false, error:`タブ音声の取得に失敗: ${error?.message||error} / 対象タブを前面に出してYURIKAを一度開き、Capture Readyにしてから再試行してください。` };
  }
  return (await chrome.runtime.sendMessage({target:"offscreen",type:"ADD_SESSION",tabId:tab.id,streamId,settings:sanitizeSettings({...settings,enabled:true}),revision}))||{ok:false,error:"DSP側から応答がありません。"};
}
async function startForActiveTab(settings, { forceRestart = false, revision = 0 } = {}) {
  const tab=await currentYoutubeTab();if(!tab)return{ok:false,error:"YouTubeのタブで実行してください。"};
  if(forceRestart){try{await chrome.runtime.sendMessage({target:"offscreen",type:"STOP_SESSION",tabId:tab.id});}catch{}}
  return startForTab(tab,settings,{revision});
}
async function stopTabSession(tabId){
  try { const r=(await chrome.runtime.sendMessage({target:"offscreen",type:"STOP_SESSION",tabId}))||{ok:true}; if(r?.active===false) await closeOffscreenIfPresent(); return r; }
  catch { return {ok:true}; }
}
async function listYoutubeTabs(){
  const tabs=await chrome.tabs.query({}); let st={};try{st=await chrome.runtime.sendMessage({target:"offscreen",type:"STATUS"})||{};}catch{}
  const current=await currentBrowserTab();
  const registry=await getCaptureGrantRegistry();
  const activeIds=new Set(st.sessionTabIds||[]);const cpu=AdaptiveV28?.cpuProfile?.(navigator?.hardwareConcurrency||1)||{name:"conservative",maxSessions:1,logicalProcessors:1};
  return {ok:true,tabs:tabs.filter(t=>t.id&&isYoutubeUrl(t.url||"")).map(t=>({
    id:t.id,title:t.title||"YouTube",url:t.url||"",active:activeIds.has(t.id),
    current:t.id===current?.id,
    deck: st?.deckATabId===t.id ? "A" : st?.deckBTabId===t.id ? "B" : "",
    captureReady:activeIds.has(t.id)||recordedGrantMatches(registry,t)
  })),sessionCount:activeIds.size,cpuProfile:cpu};
}

async function armDeck(deck) {
  await loadCanonical();
  const safeDeck = deck === "B" ? "B" : "A";
  const otherDeck = safeDeck === "A" ? "B" : "A";
  const tab = await currentCapturableTab();
  if (!tab) return { ok:false, error:"通常のWebタブを開いてからDeckへ割り当ててください。" };
  await ensureOffscreen();

  let st = null;
  try { st = await chrome.runtime.sendMessage({ target:"offscreen", type:"STATUS" }); } catch {}
  const targetDeckTabId = safeDeck === "A" ? st?.deckATabId : st?.deckBTabId;
  const otherDeckTabId = otherDeck === "A" ? st?.deckATabId : st?.deckBTabId;

  if (otherDeckTabId === tab.id) {
    return { ok:false, error:`このタブはすでにDeck ${otherDeck}として使用中です。同じタブをDeck A/Bへ二重割り当てはできません。` };
  }

  const previous = canonicalSettings;
  canonicalSettings = sanitizeSettings({ ...canonicalSettings, enabled:true, djEnabled:true });
  let revision = nextRevision(); await persistCanonical();

  // Idempotent re-arm of the same deck/tab: update settings only. A second tabCapture request would fail.
  if (targetDeckTabId === tab.id) {
    let runtime;
    try { runtime = await chrome.runtime.sendMessage({ target:"offscreen", type:"UPDATE_SETTINGS", settings:canonicalSettings, replace:true, revision }); }
    catch (error) { runtime = { ok:false, error:error?.message || String(error) }; }
    if (!runtime?.ok) {
      canonicalSettings = previous; revision = nextRevision(); await persistCanonical();
      return { ok:false, error:runtime?.error || `Deck ${safeDeck} settings update failed`, settings:canonicalSettings, revision };
    }
    return { ok:true, reused:true, settings:canonicalSettings, revision, runtime };
  }

  // If Multi-Tab DSP already owns this tab's MediaStream, transfer that live stream to the deck.
  // Chrome explicitly rejects a second tabCapture for a tab with an active stream.
  if (Array.isArray(st?.sessionTabIds) && st.sessionTabIds.includes(tab.id)) {
    let runtime;
    try {
      runtime = await chrome.runtime.sendMessage({ target:"offscreen", type:"PROMOTE_SESSION_TO_DECK", deck:safeDeck, tabId:tab.id, settings:canonicalSettings, revision });
    } catch (error) {
      runtime = { ok:false, error:error?.message || String(error) };
    }
    if (!runtime?.ok) {
      canonicalSettings = previous; revision = nextRevision(); await persistCanonical();
      if (!previous.enabled) await closeOffscreenIfPresent();
      return { ok:false, error:runtime?.error || `Deck ${safeDeck} promotion failed`, settings:canonicalSettings, revision };
    }
    return { ok:true, promoted:true, settings:canonicalSettings, revision, runtime };
  }

  // Defensive collision check for a capture that exists but is not represented by our live offscreen ownership state.
  try {
    const captured = await chrome.tabCapture.getCapturedTabs();
    const collision = captured.find((x) => x.tabId === tab.id && (x.status === "active" || x.status === "pending"));
    if (collision) {
      canonicalSettings = previous; revision = nextRevision(); await persistCanonical();
      return { ok:false, error:`Deck ${safeDeck}: このタブには既存のキャプチャ (${collision.status}) があります。YURIKAのMulti-Tab/Deck割り当てを解除してから再試行してください。`, settings:canonicalSettings, revision };
    }
  } catch {}

  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId:tab.id });
  } catch (error) {
    await revokeRecordedTabGrant(tab.id);
    canonicalSettings = previous;
    revision = nextRevision(); await persistCanonical();
    if (!previous.enabled) await closeOffscreenIfPresent();
    const msg = String(error?.message || error || "");
    const collisionHint = /active stream/i.test(msg)
      ? "このタブはすでに別のYURIKA入力で使用中です。Multi-Tab DSPなら解除せず、そのままDeckへ再適用すると自動昇格します。"
      : "このタブでYURIKAを開き直してCapture Readyにしてから再試行してください。";
    return { ok:false, error:`Deck ${safeDeck} capture failed: ${msg} / ${collisionHint}`, settings:canonicalSettings, revision };
  }
  let runtime;
  try {
    runtime = await chrome.runtime.sendMessage({ target:"offscreen", type:"ADD_DECK", deck:safeDeck, tabId:tab.id, streamId, settings:canonicalSettings, revision });
  } catch (error) {
    runtime = { ok:false, error:error?.message || String(error) };
  }
  if (!runtime?.ok) {
    canonicalSettings = previous;
    revision = nextRevision(); await persistCanonical();
    if (!previous.enabled) await closeOffscreenIfPresent();
    return { ok:false, error:runtime?.error || "Deck start failed", settings:canonicalSettings, revision };
  }
  return { ok:true, settings:canonicalSettings, revision, runtime };
}

async function releaseDeck(deck) {
  const safeDeck = deck === "B" ? "B" : "A";
  try {
    const result = (await chrome.runtime.sendMessage({target:"offscreen",type:"STOP_DECK",deck:safeDeck})) || {ok:true};
    if (result.active === false) {
      await loadCanonical(); canonicalSettings = sanitizeSettings({ ...canonicalSettings, enabled:false }); nextRevision(); await persistCanonical();
      await closeOffscreenIfPresent();
    }
    return result;
  } catch { return {ok:true}; }
}

async function startDjAutoMix(direction) {
  await loadCanonical();
  if (!canonicalSettings.enabled || !canonicalSettings.djEnabled) return { ok:false, error:"Deck A/BをArmしてDJ MixをONにしてください。", settings:canonicalSettings, revision:canonicalRevision };
  const dir = direction === "B_TO_A" ? "B_TO_A" : "A_TO_B";
  const target = dir === "A_TO_B" ? 100 : -100;
  await ensureOffscreen();
  let runtime;
  try { runtime = await chrome.runtime.sendMessage({ target:"offscreen", type:"AUTO_MIX", direction:dir, seconds:canonicalSettings.djAutoMixSeconds }); }
  catch (error) { runtime = { ok:false, error:error?.message || String(error) }; }
  if (!runtime?.ok) return { ok:false, error:runtime?.error || "AUTO MIX failed", settings:canonicalSettings, revision:canonicalRevision };
  canonicalSettings = sanitizeSettings({ ...canonicalSettings, djCrossfader:target });
  const revision = nextRevision(); await persistCanonical();
  return { ok:true, settings:canonicalSettings, revision, runtime };
}

async function startExternalInput() {
  await loadCanonical(); await ensureOffscreen();
  const previous = canonicalSettings;
  canonicalSettings = sanitizeSettings({ ...canonicalSettings, enabled:true, djEnabled:false });
  let revision = nextRevision(); await persistCanonical();
  let runtime;
  try {
    runtime = await chrome.runtime.sendMessage({ target:"offscreen", type:"START_EXTERNAL", settings:canonicalSettings, revision });
  } catch (error) {
    runtime = { ok:false, error:error?.message || String(error) };
  }
  if (!runtime?.ok) {
    canonicalSettings = previous;
    revision = nextRevision(); await persistCanonical();
    if (!previous.enabled) await closeOffscreenIfPresent();
    return {ok:false,error:runtime?.error||"External input failed",settings:canonicalSettings,revision};
  }
  return {ok:true,settings:canonicalSettings,revision,runtime};
}

async function stopProcessing() {
  try {
    const response = await chrome.runtime.sendMessage({ target: "offscreen", type: "STOP" });
    await closeOffscreenIfPresent();
    return response || { ok: true };
  } catch {
    await closeOffscreenIfPresent();
    return { ok: true };
  }
}

async function getStatus() {
  let captured = [];
  try { captured = await chrome.tabCapture.getCapturedTabs(); } catch {}
  const active = captured.filter((x) => x.status === "active" || x.status === "pending");
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  let contexts = [];
  try { contexts = await chrome.runtime.getContexts({ contextTypes:["OFFSCREEN_DOCUMENT"], documentUrls:[offscreenUrl] }); } catch {}
  if (!active.length && !contexts.length) return { ok:true, active:false, audioContextState:"not-created" };
  try {
    const st = await chrome.runtime.sendMessage({ target:"offscreen", type:"STATUS" });
    const tab=await currentYoutubeTab(); const activeTabEnabled=Boolean(tab?.id && Array.isArray(st?.sessionTabIds) && st.sessionTabIds.includes(tab.id));
    return { ok:true, active:Boolean(st?.active), activeTabId:tab?.id??null, activeTabEnabled, capturedTabIds:active.map(x=>x.tabId), ...(st||{}) };
  } catch {
    return { ok:true, active:active.length>0, capturedTabIds:active.map(x=>x.tabId), audioContextState:"unknown" };
  }
}

async function propagateCanonicalChange(previous, next, patch, revision) {
  if (!next.enabled) return { ok: true, inactive: true, revision };
  const hiResChanged = Boolean(previous.hiResMode) !== Boolean(next.hiResMode);
  const remoteLatencyChanged = String(previous.spatialOutputTarget||"local").startsWith("sonobus-") !== String(next.spatialOutputTarget||"local").startsWith("sonobus-");
  if (hiResChanged || remoteLatencyChanged) {
    const st = await getStatus();
    if (st?.inputMode === "dj" || st?.inputMode === "external") {
      const response = await chrome.runtime.sendMessage({ target:"offscreen", type:"UPDATE_SETTINGS", settings:patch, revision });
      return { ...(response||{ok:true}), restartRequired:true, note:"AudioContext latency/sample-rate policy change takes effect after re-arming the current input mode." };
    }
    // Do not tear down unrelated captured tabs merely because one canonical setting changed.
    // AudioContext sample-rate cannot be changed in place, so defer Hi-Res until sessions are re-armed.
    if (Number(st?.sessionCount || 0) > 1) {
      const livePatch = { ...(patch || {}) };
      delete livePatch.hiResMode;
      delete livePatch.spatialOutputTarget;
      let response = { ok:true, revision };
      if (Object.keys(livePatch).length) {
        response = (await chrome.runtime.sendMessage({ target:"offscreen", type:"UPDATE_SETTINGS", settings:livePatch, revision })) || response;
      }
      return { ...response, restartRequired:true, deferredContextPolicy:true, note:"AudioContext latency/sample-rate policy change is deferred until current multi-tab sessions are re-armed; existing tabs remain running." };
    }
    await stopProcessing();
    return startForActiveTab(next, { forceRestart: true, revision });
  }
  try {
    const response = await chrome.runtime.sendMessage({
      target: "offscreen", type: "UPDATE_SETTINGS", settings: patch, revision
    });
    return response || { ok: true, revision };
  } catch {
    // If capture disappeared while the popup was open, keep the settings but mark processing inactive.
    return { ok: true, inactive: true, revision };
  }
}

async function applyManualSettingsPatch(rawPatch) {
  await loadCanonical();
  const patch = sanitizeManualPatch(rawPatch || {});
  if (!Object.keys(patch).length) return { ok: true, settings: canonicalSettings, revision: canonicalRevision, changed: {} };

  const previous = canonicalSettings;
  const next = sanitizeSettings({ ...previous, ...patch, enabled: previous.enabled, preset: previous.preset });
  const changed = diffSettings(previous, next);
  delete changed.enabled;
  delete changed.preset;
  if (!Object.keys(changed).length) return { ok: true, settings: canonicalSettings, revision: canonicalRevision, changed: {} };

  canonicalSettings = next;
  const revision = nextRevision();
  await persistCanonical();
  const runtime = await propagateCanonicalChange(previous, next, changed, revision);
  return { ok: true, settings: canonicalSettings, revision, changed, runtime };
}

async function applyExplicitPreset(name) {
  await loadCanonical();
  if (typeof name !== "string") return { ok: false, error: "invalid preset" };
  const previous = canonicalSettings;
  const next = applyPreset(previous, name, { preserveIndependentLayers: true });
  if (next.preset === "custom" && !globalThis.YurikaAudioCore.PRESETS[name]) return { ok: false, error: "unknown preset" };
  const changed = diffSettings(previous, next);
  canonicalSettings = next;
  const revision = nextRevision();
  await persistCanonical();
  const runtimePatch = { ...changed };
  delete runtimePatch.enabled;
  const runtime = await propagateCanonicalChange(previous, next, runtimePatch, revision);
  return { ok: true, settings: canonicalSettings, revision, changed, runtime };
}

async function setCanonicalEnabled(enabled) {
  await loadCanonical();
  const requested = Boolean(enabled);
  const previous = canonicalSettings;
  canonicalSettings = sanitizeSettings({ ...canonicalSettings, enabled: requested });
  let revision = nextRevision();
  await persistCanonical();

  let runtime;
  if (requested) runtime = await startForActiveTab(canonicalSettings, { revision });
  else { const tab=await currentYoutubeTab(); runtime=tab?.id ? await stopTabSession(tab.id) : {ok:true}; }

  if (!runtime?.ok) {
    canonicalSettings = sanitizeSettings({ ...canonicalSettings, enabled: false });
    revision = nextRevision();
    await persistCanonical();
    return { ok: false, error: runtime?.error || "開始できませんでした", settings: canonicalSettings, revision };
  }
  canonicalSettings = sanitizeSettings({ ...canonicalSettings, enabled:Boolean(runtime?.active ?? requested) });
  await persistCanonical();
  return { ok: true, settings: canonicalSettings, revision, runtime, changed: diffSettings(previous, canonicalSettings) };
}


async function applyRuntimeSpatialPatch(rawPatch = {}) {
  await loadCanonical();
  const allowed = new Set(["spatialOutputDeviceId","spatialOutputLabel","spatialDeviceProfile","spatialOutputTarget"]);
  const filtered = {};
  for (const [k,v] of Object.entries(rawPatch || {})) if (allowed.has(k)) filtered[k]=v;
  if (!Object.keys(filtered).length) return {ok:true,settings:canonicalSettings,revision:canonicalRevision,changed:{}};
  const previous=canonicalSettings;
  const next=sanitizeSettings({...canonicalSettings,...filtered});
  const changed=diffSettings(previous,next);
  canonicalSettings=next;
  const revision=nextRevision();
  await persistCanonical();
  return {ok:true,settings:canonicalSettings,revision,changed};
}

async function getCanonicalSettings() {
  await loadCanonical();
  return { ok: true, settings: canonicalSettings, revision: canonicalRevision };
}

try {
  chrome.tabs.onRemoved.addListener((tabId) => { void revokeRecordedTabGrant(tabId); });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo?.url) return;
    void (async () => {
      const registry = await getCaptureGrantRegistry();
      const rec = registry?.[String(tabId)];
      if (rec && rec.origin !== tabOrigin(tab?.url || changeInfo.url || "")) await revokeRecordedTabGrant(tabId);
    })();
  });
} catch {}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== "service-worker") return false;
  const serialized = new Set(["GET_SETTINGS", "REGISTER_ACTIVE_TAB_GRANT", "APPLY_PATCH", "APPLY_PRESET", "SET_ENABLED", "LIST_YOUTUBE_TABS", "SET_TAB_SESSION", "ARM_DECK", "STOP_DECK", "START_EXTERNAL", "AUTO_MIX", "START", "RESTART", "STOP", "UPDATE_SETTINGS", "SPATIAL_RUNTIME_PATCH", "OFFSCREEN_ENDED"]);
  const run = async () => {
    switch (message.type) {
      case "GET_SETTINGS": return getCanonicalSettings();
      case "REGISTER_ACTIVE_TAB_GRANT": return registerActiveTabGrant();
      case "APPLY_PATCH": return applyManualSettingsPatch(message.patch || {});
      case "APPLY_PRESET": return applyExplicitPreset(message.name);
      case "SET_ENABLED": return setCanonicalEnabled(message.enabled);
      case "LIST_YOUTUBE_TABS": return listYoutubeTabs();
      case "SET_TAB_SESSION": { await loadCanonical(); const tab=(await chrome.tabs.get(message.tabId).catch(()=>null)); if(!tab)return{ok:false,error:"tab not found"}; return message.enabled ? startForTab(tab,canonicalSettings,{revision:canonicalRevision}) : stopTabSession(tab.id); }
      case "VIDEO_TELEMETRY": { const tabId=_sender?.tab?.id; if(tabId) try{await chrome.runtime.sendMessage({target:"offscreen",type:"VIDEO_TELEMETRY",tabId,payload:message.payload||{}});}catch{} return {ok:true}; }
      case "ARM_DECK": return armDeck(message.deck);
      case "STOP_DECK": return releaseDeck(message.deck);
      case "START_EXTERNAL": return startExternalInput();
      case "AUTO_MIX": return startDjAutoMix(message.direction);
      case "SPATIAL_RUNTIME_PATCH": return applyRuntimeSpatialPatch(message.patch || {});
      case "SPATIAL_EVENT": {
        try { await chrome.runtime.sendMessage({target:"popup",type:"SPATIAL_EVENT",event:message.event,detail:message.detail||{}}); } catch {}
        return {ok:true};
      }

      // Backward-compatible protocol. New popup code does not use these paths.
      case "START": {
        await loadCanonical();
        const previous = canonicalSettings;
        canonicalSettings = sanitizeSettings({ ...canonicalSettings, ...(message.settings || {}), enabled: true });
        const revision = nextRevision();
        await persistCanonical();
        const runtime = await startForActiveTab(canonicalSettings, { revision });
        if (!runtime?.ok) {
          canonicalSettings = sanitizeSettings({ ...previous, enabled: false });
          nextRevision(); await persistCanonical();
        }
        return runtime?.ok ? { ok:true, settings:canonicalSettings, revision, runtime } : runtime;
      }
      case "RESTART": {
        await loadCanonical();
        canonicalSettings = sanitizeSettings({ ...canonicalSettings, ...(message.settings || {}) });
        const revision = nextRevision(); await persistCanonical();
        await stopProcessing();
        return startForActiveTab(canonicalSettings, { forceRestart:true, revision });
      }
      case "STOP": return setCanonicalEnabled(false);
      case "UPDATE_SETTINGS": return applyManualSettingsPatch(message.settings || {});
      case "STATUS": return getStatus();
      case "OFFSCREEN_ENDED": {
        await loadCanonical();
        if (canonicalSettings.enabled) {
          canonicalSettings = sanitizeSettings({ ...canonicalSettings, enabled:false });
          nextRevision(); await persistCanonical();
        }
        return { ok:true };
      }
      default: return { ok: false, error: "unknown message" };
    }
  };

  (serialized.has(message.type) ? enqueueAction(run) : run())
    .then(sendResponse)
    .catch((error) => sendResponse({ ok:false, error:error?.message || String(error) }));
  return true;
});
