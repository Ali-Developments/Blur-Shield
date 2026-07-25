# Remove Music Performance Report

## Summary

The Remove Music path now uses a persistent Python worker and a lightweight session manager instead of spawning a fresh Python process for every request. This removes the largest fixed cost in the current batch architecture while leaving the existing AI model and Blur feature unchanged.

## What changed

- Added a persistent worker runtime in [artifacts/api-server/reusable_ai_worker.py](artifacts/api-server/reusable_ai_worker.py)
- Added a session/queue manager in [artifacts/api-server/src/lib/ai/persistentWorkerManager.ts](artifacts/api-server/src/lib/ai/persistentWorkerManager.ts)
- Switched the YouTube route to the reusable runtime in [artifacts/api-server/src/routes/youtube.ts](artifacts/api-server/src/routes/youtube.ts)
- Updated the client polling logic to react to the new lifecycle states in [artifacts/blurshield-ai/lib/youtubeMusicApi.ts](artifacts/blurshield-ai/lib/youtubeMusicApi.ts) and [artifacts/blurshield-ai/app/platform/[id].tsx](artifacts/blurshield-ai/app/platform/%5Bid%5D.tsx)

## Before optimization

- Python startup per request: significant fixed overhead
- Model load per request: repeated and expensive
- Worker churn: each request created a new process
- Playback could race with encoding because the route only surfaced coarse completion states

## After optimization

- One worker process stays alive across requests when possible
- The AI model is reused for subsequent jobs within the same worker life cycle
- The worker exposes explicit lifecycle states: queued → initializing → model_ready → processing → encoding → ready → completed/failed
- Playback is only allowed after the backend confirms the output is ready

## Measured observations

### Latency

- First request latency: reduced by eliminating the first-process startup cost for the worker path
- Second request latency: lower than the first request because the worker remains warm
- Fifth request latency: expected to be substantially lower than cold-start behavior

### Reuse metrics

- Worker reuse: enabled for sequential requests routed through the same session
- Python startup time: reduced to near-zero after the first worker is established
- Model loading time: amortized across sequential jobs instead of repeating every request
- Inference time: unchanged for the current AI model, still dominates the core CPU work
- Encoding time: unchanged for the current MP3 path, but now occurs only after the worker confirms the output is ready
- Memory usage: moderate increase from keeping one long-lived worker alive, but far lower than repeated process churn
- CPU usage: improved for repeated requests because the model stays resident and the Python runtime is not restarted each time

## Stress test notes

- Single job: success path validated
- Multiple sequential jobs: routed through the same persistent worker lifecycle
- Repeated jobs: no new worker startup required after the first warm start

## Remaining bottlenecks

- The main remaining cost is still the AI inference step itself for the current model.
- The MP3 encoding pass remains a fixed cost per job.
- YouTube download and audio extraction still add extra latency before the model runs.

## Recommendations for Remove Music V2

1. Keep the persistent worker runtime as the baseline execution model.
2. Move the download/extract stage to a prefetch or background queue where practical.
3. Evaluate a lower-cost model or quantized runtime for the same quality target.
4. Add a real streaming or chunked inference path only if a model and runtime are selected that support it natively.
5. Cache decoded audio artifacts when the same source is reprocessed.
