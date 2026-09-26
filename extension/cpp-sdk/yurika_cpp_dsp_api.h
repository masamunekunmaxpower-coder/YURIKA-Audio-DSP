#pragma once
#include <stdint.h>

// YURIKA C++/WASM DSP ABI v1
// Freestanding ABI for Chrome MV3 AudioWorklet modules.
// Keep modules allocation-free and real-time safe.

#define YURIKA_CPP_DSP_ABI_VERSION 1u
#define YURIKA_CPP_DSP_MAX_FRAMES 256
#define YURIKA_CPP_DSP_MAX_CHANNELS 2
#define YURIKA_CPP_DSP_BUFFER_FLOATS (YURIKA_CPP_DSP_MAX_FRAMES * YURIKA_CPP_DSP_MAX_CHANNELS)

extern "C" {
uint32_t yurika_cpp_abi_version();
float* yurika_cpp_buffer();
void yurika_cpp_reset(uint32_t sample_rate, int channels);
void yurika_cpp_set_param(int param_id, float value);
void yurika_cpp_process(int frames, int channels);
}
