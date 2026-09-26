(() => {
  "use strict";

  const SAMPLE_MS = 500;
  let last = 0;
  let timer = null;
  let stopped = false;

  function runtimeAlive() {
    try {
      return !!(globalThis.chrome && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    try {
      document.removeEventListener("visibilitychange", sample);
    } catch (_) {}
  }

  function handleSendFailure() {
    // After an extension reload/update, the old content script may remain in an
    // already-open YouTube tab while its extension context is gone. In that
    // case, stop this stale sampler instead of throwing every 500 ms.
    if (!runtimeAlive()) stop();
  }

  function sample() {
    if (stopped) return;
    if (!runtimeAlive()) {
      stop();
      return;
    }

    const v = document.querySelector("video");
    if (!v || !Number.isFinite(v.currentTime)) return;

    const now = performance.now();
    if (now - last < SAMPLE_MS) return;
    last = now;

    const message = {
      target: "service-worker",
      type: "VIDEO_TELEMETRY",
      payload: {
        mediaTime: v.currentTime,
        paused: v.paused,
        playbackRate: v.playbackRate,
        readyState: v.readyState,
        wallTimeMs: Date.now()
      }
    };

    try {
      const pending = chrome.runtime.sendMessage(message);
      if (pending && typeof pending.catch === "function") {
        pending.catch(handleSendFailure);
      }
    } catch (_) {
      // chrome.runtime.sendMessage can throw synchronously when the extension
      // context has been invalidated by reload/update.
      stop();
    }
  }

  timer = setInterval(sample, SAMPLE_MS);
  document.addEventListener("visibilitychange", sample, { passive: true });
  window.addEventListener("pagehide", stop, { once: true });
  sample();
})();
