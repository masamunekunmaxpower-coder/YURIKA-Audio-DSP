"use strict";

(() => {
  const ABI_VERSION = 1;
  const loadedWorklets = new WeakSet();

  async function ensureWorklet(ctx) {
    if (!ctx?.audioWorklet) throw new Error("AudioWorklet unavailable");
    if (!loadedWorklets.has(ctx)) {
      await ctx.audioWorklet.addModule(chrome.runtime.getURL("cpp-wasm-worklet.js"));
      loadedWorklets.add(ctx);
    }
  }

  async function compileLocalModule(moduleUrl) {
    const response = await fetch(moduleUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`C++/WASM module HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    return await WebAssembly.compile(bytes);
  }

  async function createStage(ctx, input, options = {}) {
    const channels = Math.max(1, Math.min(2, Number(options.channels) || 2));
    const fallback = ctx.createGain();
    fallback.gain.value = 1;
    const state = {
      available:false, backend:"bypass", error:null, node:null,
      abiVersion:ABI_VERSION, moduleUrl:String(options.moduleUrl || "")
    };
    try {
      if (!input) throw new Error("C++/WASM input node missing");
      if (!state.moduleUrl) throw new Error("C++/WASM moduleUrl missing");
      await ensureWorklet(ctx);
      const wasmModule = await compileLocalModule(state.moduleUrl);
      const node = new AudioWorkletNode(ctx, "yurika-cpp-wasm-dsp-v1", {
        numberOfInputs:1,
        numberOfOutputs:1,
        channelCount:channels,
        outputChannelCount:[channels],
        channelCountMode:"explicit",
        channelInterpretation:"speakers",
        processorOptions:{ wasmModule, channels, sampleRate:ctx.sampleRate }
      });
      state.node = node;
      state.available = true;
      state.backend = "cpp-wasm";
      node.port.onmessage = (event) => {
        const msg = event?.data || {};
        if (msg.type === "error") {
          state.error = String(msg.error || "C++/WASM runtime error");
          state.backend = "bypass";
        }
        if (msg.type === "ready") {
          state.error = null;
          state.backend = "cpp-wasm";
          state.abiVersion = Number(msg.abiVersion || ABI_VERSION);
        }
      };
      input.connect(node);
      return { output:node, state, setParam:(id,value)=>node.port.postMessage({type:"param", id, value}) };
    } catch (error) {
      state.error = String(error?.message || error);
      input.connect(fallback);
      return { output:fallback, state, setParam:()=>{} };
    }
  }

  globalThis.YurikaCppWasmHost = Object.freeze({ ABI_VERSION, createStage, compileLocalModule });
})();
