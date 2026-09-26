(() => {
  "use strict";

  const Registry = globalThis.YurikaSpatialDeviceProfiles;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));
  const dbToGain = (db) => Math.pow(10, Number(db || 0) / 20);
  const freeze = (v) => Object.freeze(v);

  const MODE_SHAPES = freeze({
    auto: freeze({ strength:1.00, width:1.00, depth:1.00, elevation:1.00, reflection:1.00 }),
    natural: freeze({ strength:0.92, width:0.92, depth:0.90, elevation:0.90, reflection:0.90 }),
    wide: freeze({ strength:1.10, width:1.18, depth:0.90, elevation:0.92, reflection:0.92 }),
    deep: freeze({ strength:1.06, width:0.94, depth:1.22, elevation:1.06, reflection:1.18 })
  });

  function sceneShape(settings={}, scene={}) {
    let width = 1, depth = 1, reflection = 1, center = 1;
    const preset = String(settings.preset || "").toLowerCase();
    const voiceConfidence = clamp(scene.voiceConfidence, 0, 1);
    const transient = clamp(scene.transient, 0, 1);
    const sceneWeight = clamp(scene.sceneWeight, 0, 1);

    if (preset === "voice" || voiceConfidence > 0.58) {
      width *= 0.82; depth *= 0.88; reflection *= 0.78; center *= 1.06;
    }
    if (preset === "night") {
      width *= 0.82; depth *= 0.84; reflection *= 0.72;
    }
    if (preset === "immersive") {
      width *= 1.08; depth *= 1.10; reflection *= 1.08;
    }
    if (preset === "studio" || preset === "flat") {
      width *= 0.92; depth *= 0.90; reflection *= 0.82;
    }
    if (transient > 0.62) {
      width *= 1 - 0.08 * transient;
      reflection *= 1 - 0.16 * transient;
      center *= 1 + 0.035 * transient;
    }
    // Scene influence is deliberately bounded so scene changes cannot throw the image around.
    const blend = 0.35 * sceneWeight;
    return {
      width: 1 + (width - 1) * blend + (preset ? width - 1 : 0) * (1 - blend),
      depth: 1 + (depth - 1) * blend + (preset ? depth - 1 : 0) * (1 - blend),
      reflection: 1 + (reflection - 1) * blend + (preset ? reflection - 1 : 0) * (1 - blend),
      center
    };
  }

  function computeParameters(settings={}, { resolved=null, scene={}, sampleRate=48000, inputChannels=2 } = {}) {
    const r = resolved || Registry?.resolve?.({
      requestedProfile:settings.spatialDeviceProfile,
      label:settings.spatialOutputLabel,
      legacyDeviceProfile:settings.deviceProfile,
      outputTarget:settings.spatialOutputTarget,
      headphoneIntent:Boolean(settings.deviceProfile === "headphone" || settings.headphoneOutputDeviceId || settings.headphoneOutputLabel || settings.headphoneCorrectionEnabled)
    }) || { profile:{}, profileId:"generic-stereo-speaker", reason:"registry-unavailable", confidence:0 };
    const profile = r.profile || {};
    const mode = MODE_SHAPES[settings.spatialMode] || MODE_SHAPES.auto;
    const sc = sceneShape(settings, scene);
    const headphoneLike = ["headphone","iem","earbuds","remote-binaural"].includes(profile.deviceType);
    const speakerLike = !headphoneLike;
    const baseStrength = clamp(profile.spatialStrength, 0, 0.8);
    const strength = clamp(baseStrength * mode.strength, 0, 0.80);
    const hrtfAlreadyActive = Boolean(settings.hrtfEnabled) && headphoneLike;
    const remoteBinaural = profile.deviceType === "remote-binaural";
    // When HRTF already carries interaural localization cues, Spatial must add depth without
    // creating a second strong lateralization field. The factor intentionally preserves a
    // small amount of ambience/width while protecting HRTF azimuth cues.
    const cuePreservationFactor = hrtfAlreadyActive ? (remoteBinaural ? 0.26 : 0.30) : 1.0;

    const width = clamp(strength * mode.width * sc.width, 0, headphoneLike ? 0.72 : 0.62);
    const depth = clamp(strength * mode.depth * sc.depth, 0, 0.72);
    const elevation = clamp(strength * clamp(profile.elevationStrength, 0, 1) * mode.elevation, 0, 0.24);
    const lowCentering = profile.lowFrequencyPolicy === "strict-center" ? 0.78 : 0.62;
    const sideLowDb = -clamp((1.0 + 4.0 * width * lowCentering) * cuePreservationFactor, 0, 4.8);
    const sideHighDb = clamp((0.25 + 1.45 * width) * cuePreservationFactor, 0, 1.45);
    const sideGain = clamp(1 + 0.34 * width * cuePreservationFactor, 1, 1.22);
    const centerGain = clamp(sc.center, 0.98, 1.07);
    const sideDelaySeconds = Number(inputChannels) < 2 ? 0 : clamp((0.00005 + 0.00028 * clamp(profile.itdScale,0,1) * width) * cuePreservationFactor, 0, 0.00028);
    const ildAmountDb = clamp((0.15 + 1.0 * clamp(profile.ildScale,0,1) * width) * cuePreservationFactor, 0, 0.75);
    const reflection = Number(inputChannels) < 2 ? 0 : clamp(profile.earlyReflectionAmount * mode.reflection * sc.reflection * (0.55 + depth) * (hrtfAlreadyActive ? 0.68 : 1), 0, remoteBinaural ? 0.010 : 0.055);
    const reflectionDelaySeconds = clamp(0.0035 + 0.0105 * depth, 0.0035, 0.0125);
    const reflectionLowpassHz = clamp(14500 - 6500 * depth, 6500, Math.min(14500, sampleRate * 0.43));
    const reflectionHighpassHz = profile.lowFrequencyPolicy === "strict-center" ? 240 : 170;
    const crossfeed = headphoneLike ? clamp(profile.crossfeedAmount * (0.72 + 0.28 * strength) * (hrtfAlreadyActive ? 0.45 : 1), 0, 0.045) : 0;
    // Generic speaker crosstalk cancellation intentionally remains zero. Calibrated cancellation is a future profile feature.
    const crosstalkControl = speakerLike ? clamp(profile.crosstalkControl, -0.012, 0) : 0;
    const estimatedCrosstalk = headphoneLike ? crossfeed : Math.abs(crosstalkControl);
    const outputGainCompensationDb = clamp(Number(profile.outputGainCompensation || 0) - 0.28 * width - 0.22 * reflection * 10, -1.6, 0);
    const safeHeadroomDb = clamp(Number(profile.safeHeadroom || 1.2) + 0.35 * width, 0.8, 2.2);
    const pinnaGainDb = headphoneLike ? clamp(elevation * 2.2 * (hrtfAlreadyActive ? 0.45 : 1), 0, 0.50) : clamp(elevation * 1.2, 0, 0.20);

    return freeze({
      enabled:Boolean(settings.spatialEnabled) && Number(inputChannels) >= 1,
      mode:settings.spatialMode || "auto",
      profileId:r.profileId || profile.id || "unknown",
      deviceType:profile.deviceType || "speaker", remoteBinaural,
      strength,width,depth,elevation,cuePreservationFactor,
      centerGain, sideGain, sideLowDb, sideHighDb,
      sideDelaySeconds, ildAmountDb,
      earlyReflection:reflection, reflectionDelaySeconds, reflectionLowpassHz, reflectionHighpassHz,
      crossfeed, crosstalkControl, estimatedCrosstalk,
      pinnaGainDb,
      outputGainCompensationDb, safeHeadroomDb,
      hrtfStatus: headphoneLike ? (hrtfAlreadyActive ? `existing:${settings.hrtfProfile || "active"}` : "spatial-layer-no-second-hrtf") : "not-applicable",
      hrtfAlreadyActive,
      monoInput:Number(inputChannels) < 2
    });
  }

  function makeFilter(ctx, type, frequency, gain=0, q=0.707) {
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = frequency; f.gain.value = gain; f.Q.value = q;
    return f;
  }

  function smooth(param, value, now, seconds=0.18) {
    if (!param) return;
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(value, now + seconds);
    } catch {
      try { param.value = value; } catch {}
    }
  }

  function crossfade(stage, enabled, now, seconds=0.070) {
    const dry = stage.dryGain.gain, wet = stage.wetGain.gain;
    const currentDry = clamp(dry.value, 0, 1), currentWet = clamp(wet.value, 0, 1);
    let startT = Math.atan2(currentWet, Math.max(1e-6,currentDry)) / (Math.PI/2);
    if (!Number.isFinite(startT)) startT = enabled ? 0 : 1;
    const endT = enabled ? 1 : 0;
    const n = 17;
    const dryCurve = new Float32Array(n), wetCurve = new Float32Array(n);
    for (let i=0;i<n;i++) {
      const a = i/(n-1), t = startT + (endT-startT)*a, angle = t*(Math.PI/2);
      dryCurve[i] = Math.cos(angle);
      wetCurve[i] = Math.sin(angle);
    }
    for (const p of [dry,wet]) {
      try { p.cancelScheduledValues(now); p.setValueAtTime(p.value,now); } catch {}
    }
    try { dry.setValueCurveAtTime(dryCurve, now, seconds); wet.setValueCurveAtTime(wetCurve, now, seconds); }
    catch { smooth(dry, enabled?0:1, now, seconds); smooth(wet, enabled?1:0, now, seconds); }
  }

  function createStage(ctx, input, inputChannels=2) {
    const dryGain = ctx.createGain(); dryGain.gain.value = 1;
    const wetGain = ctx.createGain(); wetGain.gain.value = 0;
    const output = ctx.createGain();
    input.connect(dryGain); dryGain.connect(output);

    const wetIngress = ctx.createGain();
    const wetComp = ctx.createGain(); wetComp.gain.value = 1;
    let wetOutput = wetIngress;
    const stage = {
      ctx,input,inputChannels:Number(inputChannels)||2,dryGain,wetGain,output,wetIngress,wetComp,
      wetConnected:false,offTimer:null,lastEnabled:false,lastParams:null,resolved:null,
      monoBypass:false
    };

    if (stage.inputChannels < 2) {
      stage.monoBypass = true;
      wetIngress.connect(wetComp); wetOutput = wetComp;
    } else {
      const splitter = ctx.createChannelSplitter(2);
      const midBus = ctx.createGain(), sideBus = ctx.createGain();
      const lMid = ctx.createGain(), rMid = ctx.createGain(), lSide = ctx.createGain(), rSide = ctx.createGain();
      lMid.gain.value=0.5; rMid.gain.value=0.5; lSide.gain.value=0.5; rSide.gain.value=-0.5;
      wetIngress.connect(splitter);
      splitter.connect(lMid,0); splitter.connect(lSide,0); splitter.connect(rMid,1); splitter.connect(rSide,1);
      lMid.connect(midBus); rMid.connect(midBus); lSide.connect(sideBus); rSide.connect(sideBus);

      const midGain = ctx.createGain(); midGain.gain.value = 1;
      const sideLow = makeFilter(ctx,"lowshelf",170,0,0.707);
      const sideHigh = makeFilter(ctx,"highshelf",6500,0,0.707);
      const sideDelay = ctx.createDelay(0.002); sideDelay.delayTime.value = 0;
      const sideGain = ctx.createGain(); sideGain.gain.value = 1;
      midBus.connect(midGain);
      sideBus.connect(sideLow); sideLow.connect(sideHigh); sideHigh.connect(sideDelay); sideDelay.connect(sideGain);

      const baseMerger = ctx.createChannelMerger(2);
      const midL=ctx.createGain(), midR=ctx.createGain(), sideL=ctx.createGain(), sideR=ctx.createGain();
      midL.gain.value=1; midR.gain.value=1; sideL.gain.value=1; sideR.gain.value=-1;
      midGain.connect(midL); midGain.connect(midR); sideGain.connect(sideL); sideGain.connect(sideR);
      midL.connect(baseMerger,0,0); sideL.connect(baseMerger,0,0); midR.connect(baseMerger,0,1); sideR.connect(baseMerger,0,1);

      const reflDelayL=ctx.createDelay(0.03), reflDelayR=ctx.createDelay(0.03);
      const reflHpL=makeFilter(ctx,"highpass",170,0,0.707), reflHpR=makeFilter(ctx,"highpass",170,0,0.707);
      const reflLpL=makeFilter(ctx,"lowpass",10000,0,0.707), reflLpR=makeFilter(ctx,"lowpass",10000,0,0.707);
      const reflGainL=ctx.createGain(), reflGainR=ctx.createGain(); reflGainL.gain.value=0; reflGainR.gain.value=0;
      const reflectionMerger=ctx.createChannelMerger(2);
      splitter.connect(reflDelayL,1); reflDelayL.connect(reflHpL); reflHpL.connect(reflLpL); reflLpL.connect(reflGainL); reflGainL.connect(reflectionMerger,0,0);
      splitter.connect(reflDelayR,0); reflDelayR.connect(reflHpR); reflHpR.connect(reflLpR); reflLpR.connect(reflGainR); reflGainR.connect(reflectionMerger,0,1);

      const crossDelayL=ctx.createDelay(0.003), crossDelayR=ctx.createDelay(0.003);
      const crossLpL=makeFilter(ctx,"lowpass",1150,0,0.707), crossLpR=makeFilter(ctx,"lowpass",1150,0,0.707);
      const crossGainL=ctx.createGain(), crossGainR=ctx.createGain(); crossGainL.gain.value=0; crossGainR.gain.value=0;
      const crossMerger=ctx.createChannelMerger(2);
      splitter.connect(crossDelayL,1); crossDelayL.connect(crossLpL); crossLpL.connect(crossGainL); crossGainL.connect(crossMerger,0,0);
      splitter.connect(crossDelayR,0); crossDelayR.connect(crossLpR); crossLpR.connect(crossGainR); crossGainR.connect(crossMerger,0,1);

      const wetSum=ctx.createGain();
      baseMerger.connect(wetSum); reflectionMerger.connect(wetSum); crossMerger.connect(wetSum);
      const pinna = makeFilter(ctx,"peaking",8500,0,0.85);
      wetSum.connect(pinna); pinna.connect(wetComp); wetOutput=wetComp;

      Object.assign(stage,{splitter,midBus,sideBus,lMid,rMid,lSide,rSide,midGain,sideLow,sideHigh,sideDelay,sideGain,
        baseMerger,midL,midR,sideL,sideR,reflDelayL,reflDelayR,reflHpL,reflHpR,reflLpL,reflLpR,reflGainL,reflGainR,reflectionMerger,
        crossDelayL,crossDelayR,crossLpL,crossLpR,crossGainL,crossGainR,crossMerger,wetSum,pinna});
    }
    wetOutput.connect(wetGain); wetGain.connect(output);
    return { output, stage };
  }

  function ensureWetConnection(stage) {
    if (stage.wetConnected) return;
    try { stage.input.connect(stage.wetIngress); stage.wetConnected = true; } catch {}
  }

  function disconnectWetAfterFade(stage, ms=110) {
    if (stage.offTimer) clearTimeout(stage.offTimer);
    stage.offTimer = setTimeout(() => {
      stage.offTimer = null;
      if (stage.lastEnabled) return;
      try { stage.input.disconnect(stage.wetIngress); } catch {}
      stage.wetConnected = false;
    }, ms);
  }

  function apply(stage, settings={}, { resolved=null, scene={}, initial=false } = {}) {
    if (!stage?.ctx) return null;
    const ctx=stage.ctx, now=ctx.currentTime;
    const r = resolved || Registry?.resolve?.({ requestedProfile:settings.spatialDeviceProfile, outputTarget:settings.spatialOutputTarget, label:settings.spatialOutputLabel, legacyDeviceProfile:settings.deviceProfile, headphoneIntent:Boolean(settings.deviceProfile === "headphone" || settings.headphoneOutputDeviceId || settings.headphoneOutputLabel || settings.headphoneCorrectionEnabled) });
    const p = computeParameters(settings,{resolved:r,scene,sampleRate:ctx.sampleRate,inputChannels:stage.inputChannels});
    stage.resolved=r; stage.lastParams=p;
    const enabled=Boolean(settings.spatialEnabled);

    if (stage.offTimer) { clearTimeout(stage.offTimer); stage.offTimer=null; }
    if (enabled) ensureWetConnection(stage);

    if (!stage.monoBypass) {
      smooth(stage.midGain.gain,p.centerGain,now,initial?0.08:0.28);
      smooth(stage.sideLow.gain,p.sideLowDb,now,initial?0.08:0.30);
      smooth(stage.sideHigh.gain,p.sideHighDb,now,initial?0.08:0.30);
      smooth(stage.sideDelay.delayTime,p.sideDelaySeconds,now,initial?0.08:0.30);
      smooth(stage.sideGain.gain,p.sideGain,now,initial?0.08:0.30);
      smooth(stage.reflDelayL.delayTime,p.reflectionDelaySeconds,now,0.32);
      smooth(stage.reflDelayR.delayTime,Math.min(0.025,p.reflectionDelaySeconds*1.13),now,0.32);
      for (const f of [stage.reflHpL,stage.reflHpR]) smooth(f.frequency,p.reflectionHighpassHz,now,0.32);
      for (const f of [stage.reflLpL,stage.reflLpR]) smooth(f.frequency,p.reflectionLowpassHz,now,0.32);
      smooth(stage.reflGainL.gain,p.earlyReflection*0.96,now,0.34);
      smooth(stage.reflGainR.gain,p.earlyReflection,now,0.34);
      const cross = p.crossfeed + p.crosstalkControl;
      smooth(stage.crossGainL.gain,cross,now,0.30); smooth(stage.crossGainR.gain,cross,now,0.30);
      smooth(stage.crossDelayL.delayTime,0.00024 + p.sideDelaySeconds*0.35,now,0.30);
      smooth(stage.crossDelayR.delayTime,0.00024 + p.sideDelaySeconds*0.35,now,0.30);
      smooth(stage.pinna.gain,p.pinnaGainDb,now,0.32);
    }
    smooth(stage.wetComp.gain,dbToGain(p.outputGainCompensationDb),now,initial?0.06:0.24);

    if (initial) {
      stage.dryGain.gain.value = enabled ? 0 : 1;
      stage.wetGain.gain.value = enabled ? 1 : 0;
    } else if (enabled !== stage.lastEnabled) {
      crossfade(stage,enabled,now,0.070);
    }
    stage.lastEnabled=enabled;
    if (!enabled) disconnectWetAfterFade(stage,initial?30:115);
    return { resolved:r, params:p, wetConnected:stage.wetConnected };
  }

  function dispose(stage) {
    if (!stage) return;
    if (stage.offTimer) clearTimeout(stage.offTimer);
    stage.offTimer=null;
    try { stage.input.disconnect(stage.wetIngress); } catch {}
    stage.wetConnected=false;
  }

  globalThis.YurikaSpatialEngine = freeze({
    VERSION:"1.3.0", MODE_SHAPES, computeParameters, createStage, apply, dispose
  });
})();
