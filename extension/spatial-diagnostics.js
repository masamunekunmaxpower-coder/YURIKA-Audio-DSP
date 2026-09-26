(() => {
  "use strict";

  const freeze = (v) => Object.freeze(v);
  const finite = (v, fallback=null) => Number.isFinite(Number(v)) ? Number(v) : fallback;

  function snapshot({ settings={}, resolved=null, params=null, runtime={}, context=null, inputChannels=2 } = {}) {
    const enabled = Boolean(settings.spatialEnabled);
    const p = params || {};
    const profile = resolved?.profile || {};
    const cueDelayMs = finite(p.sideDelaySeconds, 0) * 1000;
    const reflectionDelayMs = finite(p.reflectionDelaySeconds, 0) * 1000;
    return freeze({
      enabled,
      mode: settings.spatialMode || "auto",
      outputTarget: settings.spatialOutputTarget || "local",
      outputDevice: settings.spatialOutputLabel || runtime.outputLabel || "Default / label unavailable",
      requestedDeviceProfile: settings.spatialDeviceProfile || "auto",
      resolvedDeviceProfile: resolved?.profileId || profile.id || "unknown",
      deviceProfileReason: resolved?.reason || "unknown",
      deviceProfileConfidence: finite(resolved?.confidence, 0),
      outputChannels: Number(inputChannels) >= 2 ? 2 : 1,
      sampleRate: finite(context?.sampleRate),
      hrtfProfile: p.hrtfStatus || "none",
      spatialStrength: finite(p.strength, 0),
      cuePreservationFactor: finite(p.cuePreservationFactor, 1),
      depth: finite(p.depth, 0),
      width: finite(p.width, 0),
      elevation: finite(p.elevation, 0),
      itdAmountMs: cueDelayMs,
      ildAmountDb: finite(p.ildAmountDb, 0),
      earlyReflection: finite(p.earlyReflection, 0),
      estimatedSpatialCrosstalk: finite(p.estimatedCrosstalk, 0),
      addedLatencyMs: 0,
      audioContextBaseLatencyMs: finite(context?.baseLatency, null) == null ? null : finite(context?.baseLatency,0) * 1000,
      audioContextOutputLatencyMs: finite(context?.outputLatency, null) == null ? null : finite(context?.outputLatency,0) * 1000,
      transportLatencyKind: String(settings.spatialOutputTarget || "local").startsWith("sonobus-") ? "external-SonoBus-network-latency-not-measured-by-browser" : "local-output",
      cueDelayMs,
      reflectionDelayMs,
      latencyKind:"direct-path-zero; spatial cue/reflection delays are parallel or side-only",
      gainCompensationDb: finite(p.outputGainCompensationDb, 0),
      peakHeadroomDb: finite(p.safeHeadroomDb, 0),
      fallbackStatus: runtime.fallbackStatus || (Number(inputChannels) < 2 ? "mono-input-bypass" : "none"),
      wetConnected: Boolean(runtime.wetConnected),
      sinkApplied: Boolean(runtime.sinkApplied),
      sinkError: runtime.sinkError || null,
      metricsKind:"configured/derived parameters; final peak/RMS/correlation come from existing measured diagnostics"
    });
  }

  globalThis.YurikaSpatialDiagnostics = freeze({ VERSION:"1.2.0", snapshot });
})();
