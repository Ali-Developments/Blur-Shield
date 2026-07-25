# DEBUG SESSION — blur-engine-render-block

- **Session ID:** `blur-engine-render-block`
- **Status:** `[OPEN]`
- **Opened:** 2026-07-25
- **Owner:** TRAE-debugger (scientific workflow)
- **Bug Class:** WebView injected script → page render freeze
- **Affected sites:** youtube.com, tiktok.com, instagram.com
- **Symptom:** App + WebView launch OK ✅, inject OK ✅, lifecycle logs appear OK ✅. The moment Blur Protection is toggled **ON**, videos never start, pages stop rendering, buttons unresponsive. Blur **OFF** → everything works.

## Mandatory Protocol (enforced per user directive, 2026-07-25)
- DO NOT optimize.
- DO NOT rewrite.
- DO NOT implement new features.
- ONLY objective: **binary search to the exact statement/line** that causes YT/TT/IG to stop rendering.
- Sequence: outer module split A–J → one at a time → PASS/FAIL table → inner bisect failing module → exact line → minimal fix.

## Session Artifacts
| File | Purpose |
|------|---------|
| `debug-blur-engine-render-block.md` | This file — session log + decisions |
| `artifacts/blurshield-ai/lib/blurScript.ts` | Under audit. DB1 will ADD module-gating instrumentation (no logic changes). |
| `artifacts/blurshield-ai/app/platform/[id].tsx` | Host UI. Host exposes per-module toggle via postMessage bridge. |

## Step DB0 — Hypotheses (Falsifiable)
Each MUST be confirmed or rejected by the binary-search evidence. Not "code inspection guesses."

| # | Hypothesis | Mechanism | Predicted failing module |
|---|------------|-----------|---------------------------|
| H1 | CSS overlay compositor block | `position:fixed` + `z-index:2147483647` + translucent `backdrop-filter-blur` on the full-viewport overlay layer forces Chrome to composite the ENTIRE viewport every frame; YT/TT/IG video swapchains are starved of GPU budget. | Module F (Overlay manager) + Module G (Blur renderer) |
| H2 | MutationObserver → MO recursion | MO observes `{childList, subtree, attributes}`. The blur script itself writes DOM (`#__bs_overlay_layer` creation, per-track `<canvas>` insertion, inline style mutations). Those writes fall inside the observed `document.documentElement` subtree → MO fires → triggers `scanFaces()` → writes more DOM → MO fires again → unbounded recursion; main thread never yields. | Module C (MutationObserver) |
| H3 | Forced synchronous layout chain per RAF | RAF loop interleaves `getBoundingClientRect()` (forced style+layout) → `el.style.left = …` (invalidates layout) → next track `getBoundingClientRect()` (re-runs style+layout). For N=10 tracks this is O(N²) style/layouts every 16 ms. Page never reaches stable paint. | Module D (RAF loop) + Module H (Tracking) |
| H4 | CORS canvas readback throws per frame | `ctx.drawImage(crossOriginVideo, …); ctx.getImageData(…);` → YT/TT/IG CDN video has no CORS headers → canvas CORS-tainted → every call throws `SecurityError`. 60 exceptions/s into catch{}; V8 exception handler saturates main thread; page JS never runs. | Module G (Blur renderer) |
| H5 | Duplicate RAF / double inject | Host `useEffect` at `[id].tsx:L290` calls BOTH `blurUpdateJS` AND `blurInitJS` on every settings change. `reapplyInjectedScripts` also injects at onLoadEnd+onNav. Result: 2× MO, 2× RAF loop, 2× overlay layer fighting per frame. | Module D (RAF loop) OR Module A (Initialization re-inject guard) |

## Step DB1 Status
Instrumentation ONLY: split `buildAIBlurJS()` into 10 module gates `window.__BS_MOD_A … __BS_MOD_J`. No logic changes; each block merely `if (!window.__BS_MOD_X) return;` at the top of its functional region. Host adds per-module toggle messages + default: ALL disabled (enables the outer binary search).

## Step DB2 Status — Outer PASS/FAIL Table
| Module | Label | Enable Order | YouTube PASS/FAIL | TikTok PASS/FAIL | Instagram PASS/FAIL |
|--------|-------|:------------:|:-----------------:|:----------------:|:-------------------:|
| A | Initialization / re-inject guard | 1 | — | — | — |
| B | Lifecycle logging | 2 | — | — | — |
| C | MutationObserver | 3 | — | — | — |
| D | requestAnimationFrame loop | 4 | — | — | — |
| E | Detection scheduler / scanFaces | 5 | — | — | — |
| F | Overlay manager (create layer + per-track canvases) | 6 | — | — | — |
| G | Blur renderer (backdrop-filter + canvas draw) | 7 | — | — | — |
| H | Tracking per-element getBoundingClientRect | 8 | — | — | — |
| I | Fullscreen support | 9 | — | — | — |
| J | SPA navigation (history hooks + hashchange) | 10 | — | — | — |

First FAIL module (lowest index): **TBD (DB2 output)**.

## Step DB3 Status — Inner Bisect
TBD after DB2 isolates a failing module. Will split into HALF1/HALF2, record PASS/FAIL, repeat until 1 exact line/statement.

## Step DB4 — Evidence Decision Matrix
| Hypothesis | Evidence Required | Confirmed? |
|------------|-------------------|:----------:|
| H1 (CSS overlay) | FAIL when ONLY Module F + G enabled. PASS if we set `backdrop-filter:none` in G. | — |
| H2 (MO recursion) | FAIL when ONLY Module C enabled. `__bs_stats.observerSuppressed` counter does not increment (meaning MO fires on own DOM writes). | — |
| H3 (Layout thrash) | FAIL when ONLY Module D + H enabled. PASS in D if all H calls are stubbed returning cached rects. | — |
| H4 (CORS getImageData) | FAIL when ONLY Module G enabled. PASS in G if the single `getImageData` call is removed. | — |
| H5 (Duplicate RAF) | FAIL when A has no idempotency guard. PASS with guard `if (window.__bsAIRunning) return;`. | — |

## Step DB5 — ROOT_CAUSE_ANALYSIS.md
Will be produced ONLY after DB3 converges to 1 exact statement. Will contain:
- Exact file path
- Exact function name
- Exact line number
- Why breaks YouTube (mechanism)
- Why breaks TikTok
- Why breaks Instagram
- Minimal patch (≤5 lines ideally)
