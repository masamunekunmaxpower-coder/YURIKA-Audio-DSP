# Benchmarks and interpretation

The benchmark values published with YURIKA Audio are internal test results from the project's evaluator. They are useful for regression testing and engineering comparison, but they are not a substitute for independent lab measurements or controlled listening tests.

## Neutral path

The neutral path is intended to be effectively transparent and is checked with multiple independent criteria rather than one score.

- SI-SDR: 149.49 dB
- FR offset / flatness / span: approximately 0.00 dB in the referenced run
- Multitone magnitude and phase: effectively unchanged at the evaluator's displayed precision

## Virtual amplifier

Referenced 3.3.2 internal bench:

- THD+N: -101.10 dB L/R
- THD: -101.14 dB L/R
- S/N: 121.34 dB unweighted, 124.95 dBA
- Crosstalk: approximately -120 dB
- FR flatness: 0.00000 dB
- Maximum phase error: 0.0000°
- Added alignment latency: 0.0000 ms in the DSP-stage measurement

The electrical wattage, impedance, damping-factor and slew-rate labels are reference-model metadata. They do not mean a browser physically drives a low-impedance load at those power levels.

## Spatial metrics

The azimuth values are objective **cue proxies** derived from signal behavior. They are not statements that a human listener will localize a source with the same angular error.

Referenced 3.3.2 run:

- HRTF-stage azimuth cue-proxy MAE: 0.04°
- Full HRTF + Spatial azimuth cue-proxy MAE: 16.86°
- Direction-sign accuracy: 100%
- Azimuth monotonicity: 1.000 Spearman
- ITD cue MAE: 9.1 µs in Full HRTF + Spatial
- ILD cue MAE: 4.56 dB in Full HRTF + Spatial
