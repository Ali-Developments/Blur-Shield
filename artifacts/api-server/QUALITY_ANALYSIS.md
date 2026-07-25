# Remove Music pipeline quality analysis

## Executive summary

The current Remove Music path is failing before the final MP3 is delivered. The evidence from the local reproduction run shows that the separator model emits stems that are reported as near-silent/empty, and the current selector logic is not the primary failure point in this environment.

## What I verified

1. The input sample used for local reproduction is a valid MP3, but it is effectively silent.
   - ffprobe reports a 2-second stereo MP3 with a normal container and stream structure.
   - ffmpeg `volumedetect` reports `mean_volume: -91.0 dB` and `max_volume: -91.0 dB` for the sample, which indicates a near-silent input.

2. The separator run logs that both generated stems are near-silent/empty.
   - The separator wrote `input_(Instrumental)_1_HP-UVR.wav` and `input_(Vocals)_1_HP-UVR.wav`.
   - The logs include:
     - `Warning: stem_source array is near-silent or empty.`
   - The generated WAVs are effectively empty in the analysis run because the model produced no usable signal.

3. The current selector is a heuristic wrapper around the separator output files.
   - It only selects from the file names it gets back from `sep.separate(...)`.
   - It does not create audio content itself; it only chooses one of the model’s outputs.
   - In the reproduction run, the failure occurs earlier: the separator itself is producing unusable stems.

## Root cause

The most likely root cause is that the current separator model/runtime is not producing a usable vocal/instrumental separation for the available input. The evidence points to a model-level failure or a mismatch between the input audio and the model’s expected signal characteristics rather than a FFmpeg or selector bug.

## Why this is not a FFmpeg issue

The encoding stage is downstream of the separator. The local run shows the separator failing to produce meaningful stems before the final MP3 encoding is even reached. That makes the earlier separation stage the first clear failure point.

## Why this is not primarily the selector issue

The selector does not synthesize content. It only makes a choice between already-generated outputs. If the separator emits near-silent stems, the selector cannot recover speech from them. In the local reproduction run the selector never gets a usable audio signal to pick from.

## Recommended next step

Use a real, non-silent source audio file and re-run the same pipeline. If the model still produces near-silent stems for that input, then the issue is with the model or the preprocessing path rather than the downstream worker logic.

## Suggested follow-up actions

- Re-run the pipeline on a known-good, speech-heavy audio sample.
- Compare the separator’s output against the original waveform/spectrogram.
- If the model still fails on good input, replace or retrain the separation model or switch to a different separation backend.
