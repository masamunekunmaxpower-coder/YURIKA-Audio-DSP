"use strict";
const fs = require("fs");
const path = require("path");
(async () => {
  const wasmPath = path.join(__dirname, "example-unity.wasm");
  const bytes = fs.readFileSync(wasmPath);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const e = instance.exports;
  if (e.yurika_cpp_abi_version() !== 1) throw new Error("ABI version mismatch");
  const ptr = Number(e.yurika_cpp_buffer());
  const buf = new Float32Array(e.memory.buffer, ptr, 512);
  e.yurika_cpp_reset(48000, 2);
  const input = [0.25, -0.5, 0.75, -1.0];
  input.forEach((v,i)=>buf[i]=v);
  e.yurika_cpp_process(2,2);
  for (let i=0;i<input.length;i++) {
    if (Math.abs(buf[i]-input[i]) > 1e-7) throw new Error(`unity mismatch at ${i}: ${buf[i]} != ${input[i]}`);
  }
  e.yurika_cpp_set_param(0, 0.5);
  input.forEach((v,i)=>buf[i]=v);
  e.yurika_cpp_process(2,2);
  for (let i=0;i<input.length;i++) {
    if (Math.abs(buf[i]-input[i]*0.5) > 1e-7) throw new Error(`gain mismatch at ${i}`);
  }
  console.log(JSON.stringify({ok:true, abi:e.yurika_cpp_abi_version(), wasm:path.basename(wasmPath)}));
})().catch(err => { console.error(err); process.exit(1); });
