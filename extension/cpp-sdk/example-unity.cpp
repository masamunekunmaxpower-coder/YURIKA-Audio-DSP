#include "yurika_cpp_dsp_api.h"

// Minimal example C++ DSP module.
// Default is exact unity. Param 0 changes gain for development tests only.

static float io_buffer[YURIKA_CPP_DSP_BUFFER_FLOATS];
static float gain = 1.0f;

static inline float sanitize(float x) {
  if (!(x == x)) return 0.0f;
  if (x > 4.0f) return 4.0f;
  if (x < -4.0f) return -4.0f;
  if (x > -1.0e-30f && x < 1.0e-30f) return 0.0f;
  return x;
}

extern "C" {
uint32_t yurika_cpp_abi_version() { return YURIKA_CPP_DSP_ABI_VERSION; }
float* yurika_cpp_buffer() { return io_buffer; }
void yurika_cpp_reset(uint32_t, int) { gain = 1.0f; }
void yurika_cpp_set_param(int param_id, float value) {
  if (param_id == 0 && value >= 0.0f && value <= 2.0f) gain = value;
}
void yurika_cpp_process(int frames, int channels) {
  if (frames < 0) return;
  if (frames > YURIKA_CPP_DSP_MAX_FRAMES) frames = YURIKA_CPP_DSP_MAX_FRAMES;
  if (channels < 1) channels = 1;
  if (channels > YURIKA_CPP_DSP_MAX_CHANNELS) channels = YURIKA_CPP_DSP_MAX_CHANNELS;
  const int count = frames * channels;
  for (int i = 0; i < count; ++i) io_buffer[i] = sanitize(io_buffer[i] * gain);
}
}
