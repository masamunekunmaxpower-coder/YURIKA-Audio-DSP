(() => {
  "use strict";

  const freeze = (value) => Object.freeze(value);

  const DEFAULT_PROFILE_ID = "generic-stereo-speaker";
  const PROFILES = freeze({
    "generic-headphone": freeze({
      id:"generic-headphone", label:"Generic Headphone", deviceType:"headphone", channelLayout:"stereo",
      sampleRatePreference:48000, spatialStrength:0.56, hrtfProfile:"existing-or-natural", crossfeedAmount:0.035,
      crosstalkControl:0, lowFrequencyPolicy:"center-stable", earlyReflectionAmount:0.030,
      itdScale:0.52, ildScale:0.34, elevationStrength:0.22, distanceStrength:0.32,
      outputGainCompensation:-0.55, latencyCompensation:0, safeHeadroom:1.6
    }),
    "generic-iem": freeze({
      id:"generic-iem", label:"Generic IEM", deviceType:"iem", channelLayout:"stereo",
      sampleRatePreference:48000, spatialStrength:0.50, hrtfProfile:"existing-or-natural", crossfeedAmount:0.028,
      crosstalkControl:0, lowFrequencyPolicy:"center-stable", earlyReflectionAmount:0.024,
      itdScale:0.45, ildScale:0.30, elevationStrength:0.18, distanceStrength:0.27,
      outputGainCompensation:-0.48, latencyCompensation:0, safeHeadroom:1.5
    }),
    "generic-earbuds": freeze({
      id:"generic-earbuds", label:"Generic Earbuds", deviceType:"earbuds", channelLayout:"stereo",
      sampleRatePreference:48000, spatialStrength:0.48, hrtfProfile:"existing-or-natural", crossfeedAmount:0.025,
      crosstalkControl:0, lowFrequencyPolicy:"center-stable", earlyReflectionAmount:0.022,
      itdScale:0.42, ildScale:0.28, elevationStrength:0.16, distanceStrength:0.24,
      outputGainCompensation:-0.45, latencyCompensation:0, safeHeadroom:1.4
    }),
    "generic-stereo-speaker": freeze({
      id:"generic-stereo-speaker", label:"Generic Stereo Speaker", deviceType:"speaker", channelLayout:"stereo",
      sampleRatePreference:48000, spatialStrength:0.50, hrtfProfile:"none", crossfeedAmount:0,
      crosstalkControl:0, lowFrequencyPolicy:"center-stable", earlyReflectionAmount:0.027,
      itdScale:0.22, ildScale:0.26, elevationStrength:0.10, distanceStrength:0.30,
      outputGainCompensation:-0.50, latencyCompensation:0, safeHeadroom:1.5
    }),
    "laptop-speaker": freeze({
      id:"laptop-speaker", label:"Laptop Speaker", deviceType:"laptop", channelLayout:"stereo",
      sampleRatePreference:48000, spatialStrength:0.38, hrtfProfile:"none", crossfeedAmount:0,
      crosstalkControl:0, lowFrequencyPolicy:"strict-center", earlyReflectionAmount:0.018,
      itdScale:0.16, ildScale:0.18, elevationStrength:0.06, distanceStrength:0.18,
      outputGainCompensation:-0.38, latencyCompensation:0, safeHeadroom:1.2
    }),
    "tv": freeze({
      id:"tv", label:"TV", deviceType:"tv", channelLayout:"stereo",
      sampleRatePreference:48000, spatialStrength:0.42, hrtfProfile:"none", crossfeedAmount:0,
      crosstalkControl:0, lowFrequencyPolicy:"center-stable", earlyReflectionAmount:0.020,
      itdScale:0.18, ildScale:0.20, elevationStrength:0.07, distanceStrength:0.22,
      outputGainCompensation:-0.42, latencyCompensation:0, safeHeadroom:1.3
    }),
    "bluetooth-speaker": freeze({
      id:"bluetooth-speaker", label:"Bluetooth Speaker", deviceType:"portable-speaker", channelLayout:"stereo",
      sampleRatePreference:48000, spatialStrength:0.36, hrtfProfile:"none", crossfeedAmount:0,
      crosstalkControl:0, lowFrequencyPolicy:"strict-center", earlyReflectionAmount:0.015,
      itdScale:0.14, ildScale:0.16, elevationStrength:0.05, distanceStrength:0.16,
      outputGainCompensation:-0.35, latencyCompensation:0, safeHeadroom:1.2
    }),
    "studio-monitor": freeze({
      id:"studio-monitor", label:"Studio Monitor", deviceType:"studio-monitor", channelLayout:"stereo",
      sampleRatePreference:48000, spatialStrength:0.34, hrtfProfile:"none", crossfeedAmount:0,
      crosstalkControl:0, lowFrequencyPolicy:"center-stable", earlyReflectionAmount:0.012,
      itdScale:0.12, ildScale:0.14, elevationStrength:0.04, distanceStrength:0.14,
      outputGainCompensation:-0.30, latencyCompensation:0, safeHeadroom:1.0
    }),
    "sennheiser-hd600": freeze({
      id:"sennheiser-hd600", label:"Sennheiser HD600", deviceType:"headphone", channelLayout:"stereo",
      sampleRatePreference:48000, spatialStrength:0.52, hrtfProfile:"existing-or-natural", crossfeedAmount:0.032,
      crosstalkControl:0, lowFrequencyPolicy:"center-stable", earlyReflectionAmount:0.027,
      itdScale:0.48, ildScale:0.31, elevationStrength:0.20, distanceStrength:0.29,
      outputGainCompensation:-0.50, latencyCompensation:0, safeHeadroom:1.5
    }),
    "sony-wh1000xm5": freeze({
      id:"sony-wh1000xm5", label:"Sony WH-1000XM5", deviceType:"headphone", channelLayout:"stereo",
      sampleRatePreference:48000, spatialStrength:0.46, hrtfProfile:"existing-or-natural", crossfeedAmount:0.028,
      crosstalkControl:0, lowFrequencyPolicy:"strict-center", earlyReflectionAmount:0.022,
      itdScale:0.42, ildScale:0.28, elevationStrength:0.16, distanceStrength:0.25,
      outputGainCompensation:-0.47, latencyCompensation:0, safeHeadroom:1.5
    }),
    "airpods-family": freeze({
      id:"airpods-family", label:"AirPods family", deviceType:"earbuds", channelLayout:"stereo",
      sampleRatePreference:48000, spatialStrength:0.44, hrtfProfile:"existing-or-natural", crossfeedAmount:0.024,
      crosstalkControl:0, lowFrequencyPolicy:"strict-center", earlyReflectionAmount:0.020,
      itdScale:0.40, ildScale:0.26, elevationStrength:0.15, distanceStrength:0.23,
      outputGainCompensation:-0.44, latencyCompensation:0, safeHeadroom:1.4
    }),
    "sonobus-mobile-binaural": freeze({
      id:"sonobus-mobile-binaural", label:"SonoBus → Smartphone Headphones/IEM", deviceType:"remote-binaural", channelLayout:"stereo",
      sampleRatePreference:48000, spatialStrength:0.40, hrtfProfile:"dataset-free-parametric", crossfeedAmount:0.012,
      crosstalkControl:0, lowFrequencyPolicy:"strict-center", earlyReflectionAmount:0.004,
      itdScale:0.46, ildScale:0.30, elevationStrength:0.14, distanceStrength:0.14,
      outputGainCompensation:-0.46, latencyCompensation:0, safeHeadroom:1.5
    }),
    "remote-smartphone-speaker": freeze({
      id:"remote-smartphone-speaker", label:"SonoBus → Smartphone Speaker", deviceType:"remote-speaker", channelLayout:"stereo",
      sampleRatePreference:48000, spatialStrength:0.24, hrtfProfile:"none", crossfeedAmount:0,
      crosstalkControl:0, lowFrequencyPolicy:"strict-center", earlyReflectionAmount:0.006,
      itdScale:0.08, ildScale:0.10, elevationStrength:0.02, distanceStrength:0.10,
      outputGainCompensation:-0.30, latencyCompensation:0, safeHeadroom:1.4
    })
  });

  const LABEL_RULES = freeze([
    freeze({ re:/\bsonobus\b/i, profileId:"sonobus-mobile-binaural", confidence:0.86 }),
    freeze({ re:/\bath[-\s]?ws\s*330bt\b|audio[- ]?technica.*\bath[-\s]?ws\s*330bt\b/i, profileId:"generic-headphone", confidence:0.99 }),
    freeze({ re:/\baudio[- ]?technica\b.*\bath[-\s]?[a-z0-9]+|\bath[-\s]?[a-z0-9]+\b/i, profileId:"generic-headphone", confidence:0.90 }),
    freeze({ re:/\bhd\s*-?600\b|sennheiser.*600/i, profileId:"sennheiser-hd600", confidence:0.98 }),
    freeze({ re:/wh\s*-?1000xm5|sony.*xm5/i, profileId:"sony-wh1000xm5", confidence:0.98 }),
    freeze({ re:/airpods|air pods/i, profileId:"airpods-family", confidence:0.94 }),
    freeze({ re:/\biem\b|in[- ]?ear|earphone/i, profileId:"generic-iem", confidence:0.76 }),
    freeze({ re:/headphone|headset|headphones|ヘッドホン|ヘッドセット/i, profileId:"generic-headphone", confidence:0.72 }),
    freeze({ re:/studio monitor|monitor speaker|モニタースピーカー/i, profileId:"studio-monitor", confidence:0.78 }),
    freeze({ re:/television|\btv\b|テレビ/i, profileId:"tv", confidence:0.70 }),
    freeze({ re:/laptop|notebook|built[- ]?in.*speaker|内蔵.*スピーカー/i, profileId:"laptop-speaker", confidence:0.68 }),
    freeze({ re:/bluetooth.*speaker|bt speaker|portable speaker/i, profileId:"bluetooth-speaker", confidence:0.70 }),
    freeze({ re:/speaker|スピーカー/i, profileId:"generic-stereo-speaker", confidence:0.58 })
  ]);

  function get(profileId) {
    return PROFILES[profileId] || PROFILES[DEFAULT_PROFILE_ID];
  }

  function list() {
    return Object.values(PROFILES).map((p) => ({ ...p }));
  }

  function fallbackForLegacyDeviceProfile(deviceProfile) {
    switch (String(deviceProfile || "stereo")) {
      case "headphone": return "generic-headphone";
      case "smartphone": return "generic-earbuds";
      case "tv": return "tv";
      case "portable": return "bluetooth-speaker";
      case "multispeaker": return "generic-stereo-speaker";
      default: return DEFAULT_PROFILE_ID;
    }
  }

  function matchLabel(label = "") {
    const text = String(label || "").trim();
    if (!text) return { profileId:null, confidence:0, reason:"label-unavailable" };
    for (const rule of LABEL_RULES) {
      if (rule.re.test(text)) return { profileId:rule.profileId, confidence:rule.confidence, reason:"label-rule" };
    }
    return { profileId:null, confidence:0.15, reason:"label-unmatched" };
  }

  function resolve({ requestedProfile="auto", outputTarget="local", label="", legacyDeviceProfile="stereo", headphoneIntent=false } = {}) {
    if (outputTarget === "sonobus-mobile-headphones") {
      return { profile:PROFILES["sonobus-mobile-binaural"], profileId:"sonobus-mobile-binaural", confidence:1, reason:"remote-target" };
    }
    if (outputTarget === "sonobus-mobile-speaker") {
      return { profile:PROFILES["remote-smartphone-speaker"], profileId:"remote-smartphone-speaker", confidence:1, reason:"remote-target" };
    }
    if (requestedProfile && requestedProfile !== "auto" && PROFILES[requestedProfile]) {
      return { profile:PROFILES[requestedProfile], profileId:requestedProfile, confidence:1, reason:"manual" };
    }
    const matched = matchLabel(label);
    // Explicit local listening intent outranks an unavailable or stale OS label.
    // This is especially important for Bluetooth headphones whose default output label
    // may be hidden until speaker-selection permission is granted.
    if (Boolean(headphoneIntent) || String(legacyDeviceProfile||"") === "headphone") {
      const matchedHeadphone = matched.profileId && ["generic-headphone","generic-iem","generic-earbuds","sennheiser-hd600","sony-wh1000xm5","airpods-family"].includes(matched.profileId);
      const profileId = matchedHeadphone ? matched.profileId : "generic-headphone";
      return {
        profile:PROFILES[profileId], profileId,
        confidence:matchedHeadphone ? matched.confidence : 0.95,
        reason:matchedHeadphone ? matched.reason : (matched.profileId ? "headphone-intent-overrides-non-headphone-label" : "headphone-intent")
      };
    }
    const profileId = matched.profileId || fallbackForLegacyDeviceProfile(legacyDeviceProfile);
    return {
      profile:PROFILES[profileId] || PROFILES[DEFAULT_PROFILE_ID],
      profileId,
      confidence:matched.profileId ? matched.confidence : 0.45,
      reason:matched.profileId ? matched.reason : (label ? "legacy-fallback-after-unmatched-label" : "legacy-fallback")
    };
  }

  globalThis.YurikaSpatialDeviceProfiles = freeze({
    VERSION:"1.2.0",
    DEFAULT_PROFILE_ID,
    PROFILES,
    get,
    list,
    matchLabel,
    resolve,
    fallbackForLegacyDeviceProfile
  });
})();
