#include <stdint.h>

// YURIKA Virtual Class-A Amplifier core.
// Software reference electrical model, not a physical power-output claim.
// Runtime is intentionally tiny: no allocation, no convolution, no lookahead.

extern "C" {

static float io_buffer[256 * 2];
static uint32_t rng_state = 0x6D2B79F5u;
static int amp_enabled = 1;
static float cubic_k = 0.0000600f;      // ~-100 dB 3rd harmonic near 8 W ref level
static float noise_scale = 0.00000080f; // ~122 dB(A)-class reference S/N at rated level
static float crosstalk = 0.00000100f;   // -120 dB linear coupling

static inline float sanitize(float x) {
  if (!(x == x)) return 0.0f; // NaN
  if (x > 4.0f) return 4.0f;
  if (x < -4.0f) return -4.0f;
  if (x > -1.0e-30f && x < 1.0e-30f) return 0.0f;
  return x;
}

static inline float prng_uniform() {
  uint32_t x = rng_state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  rng_state = x ? x : 0xA341316Cu;
  const float u = (float)(rng_state & 0x00FFFFFFu) * (1.0f / 16777215.0f);
  return u * 2.0f - 1.0f;
}

float* amp_buffer() { return io_buffer; }

void amp_reset(uint32_t seed) {
  rng_state = seed ? seed : 0x6D2B79F5u;
}

void amp_set_enabled(int enabled) { amp_enabled = enabled ? 1 : 0; }

void amp_set_model(float thd_cubic, float noise, float xtalk) {
  if (thd_cubic >= 0.0f && thd_cubic <= 0.001f) cubic_k = thd_cubic;
  if (noise >= 0.0f && noise <= 0.00001f) noise_scale = noise;
  if (xtalk >= 0.0f && xtalk <= 0.0001f) crosstalk = xtalk;
}

void amp_process(int frames, int channels) {
  if (frames < 0) return;
  if (frames > 256) frames = 256;
  if (channels < 1) channels = 1;
  if (channels > 2) channels = 2;

  for (int i = 0; i < frames; ++i) {
    float l = sanitize(io_buffer[i * 2]);
    float r = channels > 1 ? sanitize(io_buffer[i * 2 + 1]) : l;

    if (amp_enabled) {
      // Crossover-free ultra-clean residual model. Unity direct term preserves the
      // existing YURIKA frequency response; only tiny nonlinear/noise residuals
      // are added to the upstream signal.
      const float in_l = l + crosstalk * r;
      const float in_r = r + crosstalk * l;
      l = in_l + cubic_k * in_l * in_l * in_l + noise_scale * prng_uniform();
      r = in_r + cubic_k * in_r * in_r * in_r + noise_scale * prng_uniform();
    }

    io_buffer[i * 2] = sanitize(l);
    io_buffer[i * 2 + 1] = sanitize(r);
  }
}

}
