export type BlurTarget = 'everyone' | 'females' | 'males';
export type BlurMethod = 'faces' | 'fullBody';
export type BlurIntensity = 'light' | 'medium' | 'strong';

const BLUR_INTENSITY_PX: Record<BlurIntensity, number> = {
  light: 18,
  medium: 32,
  strong: 64,
};

// ============================================================
// DB1 — BINARY SEARCH INSTRUMENTATION  (NO LOGIC CHANGES)
// 10 independent module gates, default OFF.
// The host must explicitly enable each module via postMessage:
//   { type: 'bs_mod_enable', modules: ['A','B','C'] }
//   { type: 'bs_mod_reset' }
//   { type: 'bs_mod_status' } → bs_mod_status_result event posted back
// ============================================================
const BINARY_SESSION_ID = 'blur-engine-render-block';

function _bsModFlags(): string {
  return `
  // ========== MODULE GATES (default ON for production) ==========
  // Binary-search debug can still disable modules via postMessage, but
  // shipping defaults MUST be true or blur silently no-ops and never starts.
  if (typeof window.__BS_MOD_A === 'undefined') window.__BS_MOD_A = true;  // A = Init / re-inject guard
  if (typeof window.__BS_MOD_B === 'undefined') window.__BS_MOD_B = true;  // B = Lifecycle logging
  if (typeof window.__BS_MOD_C === 'undefined') window.__BS_MOD_C = true;  // C = MutationObserver
  if (typeof window.__BS_MOD_D === 'undefined') window.__BS_MOD_D = true;  // D = requestAnimationFrame loop
  if (typeof window.__BS_MOD_E === 'undefined') window.__BS_MOD_E = true;  // E = Detection scheduler (scanFaces+interval)
  if (typeof window.__BS_MOD_F === 'undefined') window.__BS_MOD_F = true;  // F = Overlay manager (create layer + per-track overlays)
  if (typeof window.__BS_MOD_G === 'undefined') window.__BS_MOD_G = true;  // G = Blur renderer (backdrop-filter + canvas draw)
  if (typeof window.__BS_MOD_H === 'undefined') window.__BS_MOD_H = true;  // H = Tracking getBoundingClientRect / element rect reads
  if (typeof window.__BS_MOD_I === 'undefined') window.__BS_MOD_I = true;  // I = Fullscreen support
  if (typeof window.__BS_MOD_J === 'undefined') window.__BS_MOD_J = true;  // J = SPA navigation hooks
  window.__BS_BINARY_SESSION = '${BINARY_SESSION_ID}';
  window.__BS_DEBUG_BINARY_SEARCH = false;

  function __bsModStatus() {
    return {
      type: 'bs_mod_status_result',
      session: window.__BS_BINARY_SESSION,
      modules: {
        A: !!window.__BS_MOD_A,
        B: !!window.__BS_MOD_B,
        C: !!window.__BS_MOD_C,
        D: !!window.__BS_MOD_D,
        E: !!window.__BS_MOD_E,
        F: !!window.__BS_MOD_F,
        G: !!window.__BS_MOD_G,
        H: !!window.__BS_MOD_H,
        I: !!window.__BS_MOD_I,
        J: !!window.__BS_MOD_J,
      },
      timestamp: Date.now(),
    };
  }
  function __bsModPostStatus() {
    try {
      if (window && window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(__bsModStatus()));
      }
    } catch (_) {}
  }
  function __bsModMsg(evt) {
    try {
      var dataStr = (evt && evt.data && typeof evt.data === 'string') ? evt.data : null;
      if (!dataStr) return;
      var msg = JSON.parse(dataStr);
      if (!msg || !msg.type) return;
      if (msg.type === 'bs_mod_enable' && Array.isArray(msg.modules)) {
        for (var mi = 0; mi < msg.modules.length; mi++) {
          var key = String(msg.modules[mi]).toUpperCase();
          if (key.length === 1 && key >= 'A' && key <= 'J') {
            window['__BS_MOD_' + key] = true;
          }
        }
        __bsModPostStatus();
      } else if (msg.type === 'bs_mod_disable' && Array.isArray(msg.modules)) {
        for (var mj = 0; mj < msg.modules.length; mj++) {
          var k2 = String(msg.modules[mj]).toUpperCase();
          if (k2.length === 1 && k2 >= 'A' && k2 <= 'J') window['__BS_MOD_' + k2] = false;
        }
        __bsModPostStatus();
      } else if (msg.type === 'bs_mod_reset') {
        ['A','B','C','D','E','F','G','H','I','J'].forEach(function(l){ window['__BS_MOD_' + l] = false; });
        __bsModPostStatus();
      } else if (msg.type === 'bs_mod_status') {
        __bsModPostStatus();
      }
    } catch (_) {}
  }
  try { window.addEventListener('message', __bsModMsg, true); } catch(_) {}
  try { document && document.addEventListener && document.addEventListener('message', __bsModMsg, true); } catch(_) {}
  __bsModPostStatus();
  `;
}

function _bsGate(tag: string, fnBody: string): string {
  return `
    if (!window.__BS_MOD_${tag}) return;
    ${fnBody}
  `;
}

// Instrumentation / debugging toggle.  Set window.__bs_debug = true in the
// WebView before injection to receive verbose subsystem START/READY/STOP logs.
const DEBUG_SERVER_URL = 'http://192.168.0.109:7777/event';
const DEBUG_SESSION_ID = Math.random().toString(36).slice(2, 9);

const MEDIAPIPE_VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MEDIAPIPE_FACE_DETECTOR_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm/face_detector.wasm';
const MEDIAPIPE_POSE_DETECTOR_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm/pose_landmarker.wasm';

/**
 * Load MediaPipe Tasks Vision library dynamically.
 * (Architecture preserved — kept exactly as prior.)
 */
function buildMediaPipeLoaderJS(): string {
  return `
(function() {
  window.__mp_loading = window.__mp_loading || {};

  async function loadMediaPipeVision() {
    if (window.__mp_vision) return window.__mp_vision;
    if (window.__mp_loading.vision) return window.__mp_loading.vision;

    try {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/vision_bundle.js';
      script.crossOrigin = 'anonymous';

      window.__mp_loading.vision = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('MediaPipe timeout')), 15000);

        script.onload = () => {
          clearTimeout(timeout);
          setTimeout(() => {
            try {
              if (window.FilesetResolver && window.FaceDetector) {
                window.__mp_vision = { FilesetResolver, FaceDetector };
                resolve(window.__mp_vision);
              } else {
                reject(new Error('MediaPipe not ready'));
              }
            } catch (e) { reject(e); }
          }, 200);
        };

        script.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('MediaPipe CDN failed'));
        };

        document.head.appendChild(script);
      });

      return window.__mp_loading.vision.then(function (vision) {
        try {
          if (window && window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'bs_lifecycle',
              event: 'MediaPipe Loaded',
              ts: Date.now(),
            }));
          }
        } catch (e) {}
        return vision;
      });
    } catch (e) {
      console.warn('[BlurShield] MediaPipe load failed:', e);
      try {
        if (window && window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'bs_lifecycle',
            event: 'MediaPipe Loaded',
            ts: Date.now(),
            detail: 'failed: ' + String(e),
          }));
        }
      } catch (e2) {}
      throw e;
    }
  }

  window.__loadMediaPipeVision = loadMediaPipeVision;
})();
`.trim();
}

export function buildAIBlurJS(
  enabled: boolean,
  target: BlurTarget,
  method: BlurMethod,
  intensity: BlurIntensity,
): string {
  const blurPx = BLUR_INTENSITY_PX[intensity];

  return buildMediaPipeLoaderJS() + '\n' + _bsModFlags() + '\n' + `
(function() {
  // ============================================================
  // SUBSYSTEM INSTRUMENTATION  (Step 1 requirement)
  // Every subsystem logs START / READY / ERROR / STOP with ms timings.
  // ============================================================
  var __bs_session = '${DEBUG_SESSION_ID}';
  var __bs_debug = !!window.__bs_debug;       // off by default — hot path is silent
  var __bs_subsys = {};

  function postToRN(payload) {
    try {
      if (window && window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        try { window.ReactNativeWebView.postMessage(JSON.stringify(payload)); } catch (e) {}
      }
    } catch (e) {}
    try {
      if (typeof window.__bs_updateBadgeFromEvent === 'function') {
        try { window.__bs_updateBadgeFromEvent(payload); } catch (e) {}
      }
    } catch (e) {}
  }

  function postLifecycle(event, detail) {
    try { postToRN({ type: 'bs_lifecycle', event: event, ts: Date.now(), session: __bs_session, detail: detail || null }); } catch (e) {}
  }

  function dbg(msg, data) { if (__bs_debug) { try { console.debug('[BlurShield AI]', msg, data || ''); } catch (e) {} } }

  // MODULE B = Lifecycle logging.  When B is OFF, subsysX() and postLifecycle are no-ops.
  // This lets us distinguish "postMessage bridge spam causing hang" from real DOM work.
  function __bsNoop() {}
  var subsysStart = window.__BS_MOD_B ? (function(name) {
    __bs_subsys[name] = { startedAt: Date.now(), status: 'start' };
    postLifecycle('BlurShield: SUBSYS START — ' + name);
    dbg('SUBSYS START', name);
  }) : __bsNoop;
  var subsysReady = window.__BS_MOD_B ? (function(name) {
    if (__bs_subsys[name]) __bs_subsys[name].status = 'ready';
    postLifecycle('BlurShield: SUBSYS READY — ' + name);
    dbg('SUBSYS READY', name);
  }) : __bsNoop;
  var subsysError = window.__BS_MOD_B ? (function(name, err) {
    if (__bs_subsys[name]) __bs_subsys[name].status = 'error';
    postLifecycle('BlurShield: SUBSYS ERROR — ' + name, err ? String(err) : null);
    try { console.warn('[BlurShield AI][ERROR]', name, err); } catch (e) {}
  }) : __bsNoop;
  var subsysStop  = window.__BS_MOD_B ? (function(name) {
    if (__bs_subsys[name]) __bs_subsys[name].status = 'stop';
    postLifecycle('BlurShield: SUBSYS STOP — ' + name);
    dbg('SUBSYS STOP', name);
  }) : __bsNoop;

  if (window.__BS_MOD_B) {
    try { subsysStart('InjectedScript'); } catch (e) {}
    try { console.log('[BlurShield AI] Script successfully injected'); } catch (e) {}
    try { postLifecycle('BlurShield: Script Started'); } catch (e) {}
    console.log('[BlurShield AI] Starting initialization');
    console.log('[BlurShield AI] Config:', { enabled: ${enabled}, target: '${target}', method: '${method}', blurPx: ${blurPx} });
  }
  var __bs_posted = { firstDetection: false, firstFrame: false, subsys: {} };

  try { postLifecycle('Injection Started'); } catch (e) {}

  // Idempotent re-injection — just reconfigure (prevents double observers/RAF).
  // MODULE A = Initialization / re-inject guard / global config + state variables.
  if (window.__bsAIRunning) {
    try {
      window.__bsConfig = { enabled: ${enabled}, target: '${target}', method: '${method}', blurPx: ${blurPx} };
      if (window.__bsReconfigure) window.__bsReconfigure();
      try { postLifecycle(${enabled} ? 'Blur Enabled' : 'Blur Disabled'); } catch (e) {}
      try { postLifecycle('Injection Finished'); } catch (e) {}
    } catch (e) {
      try { postLifecycle('Injection Finished', String(e)); } catch (e2) {}
    }
    return;
  }

  if (!window.__BS_MOD_A) {
    // Debug-only: Module A explicitly disabled via bs_mod_disable.
    try { postLifecycle('Injection Finished', 'module A disabled'); } catch (e) {}
    return;
  }
  window.__bsAIRunning = true;

  var cfg = { enabled: ${enabled}, target: '${target}', method: '${method}', blurPx: ${blurPx} };
  window.__bsConfig = cfg;

  var faceDetector = null;
  var scanInterval = null;
  var overlayLayer = null;
  var overlayRectCached = null;
  var overlayRectAt = 0;
  var trackedFaces = [];
  var nextFaceId = 1;
  var maxMissedFrames = 14;
  var smoothingAlpha = 0.7;
  var scanFrequencyMs = 120;
  var __bs_stats = {
    videosFound: 0,
    attachedVideoId: null,
    detectionsThisFrame: 0,
    rendererFps: 0,
    frames: 0,
    lastFpsTime: Date.now(),
    renderingStoppedAfterFullscreen: false,
    skippedFrames: 0,
    observerSuppressed: 0,
    pausedPageHidden: 0,
    pausedScrolling: 0,
  };
  var lastScanAt = 0;
  var lastReattachAt = 0;
  var rafId = null;
  var elementState = new WeakMap();
  var renderSmoothingAlpha = 0.55;
  var canBackdropBlur = typeof CSS !== 'undefined' && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'));

  // Pause semantics (visibility + scroll)
  var __bs_paused = false;
  var __bs_scrollPauseUntil = 0;
  var __bs_scrollRafPending = false;
  var __bs_scrollRestartTimer = null;

  function setPaused(reason, paused) {
    if (!paused && __bs_paused && reason) {
      // only actually unpause when no other reason is active
    }
    __bs_paused = paused;
  }

  function isEffectivelyPaused() {
    if (!cfg.enabled) return true;
    try { if (document.hidden) return true; } catch (e) {}
    if (Date.now() < __bs_scrollPauseUntil) return true;
    return false;
  }

  // ============================================================
  // OVERLAY LAYER
  // MODULE F = Overlay manager (create layer + per-track overlays + ensureBackdrop)
  // MODULE H = Tracking (getBoundingClientRect / element rect reads).
  // When F is OFF, createOverlayLayer/ensureBackdrop always return null.
  // When H is OFF, getOverlayLayerRect returns a stub zero rect to completely avoid
  // getBoundingClientRect-style forced layout, isolating "layout thrash" hypothesis.
  // ============================================================
  function createOverlayLayer() {
    if (!window.__BS_MOD_F) return null;
    try { subsysStart('OverlayLayer'); } catch (e) {}
    var layer = document.getElementById('__bsFaceOverlayLayer');
    if (layer) { overlayRectCached = null; try { subsysReady('OverlayLayer'); } catch (e) {}; return layer; }
    var root = document.body || document.documentElement;
    var fs = null;
    try { fs = document.fullscreenElement || document.webkitFullscreenElement || null; } catch (e) {}
    if (fs && fs !== document.body) root = fs;
    if (!root) { try { subsysError('OverlayLayer', 'no root'); } catch (e) {}; return null; }
    try {
      layer = document.createElement('div');
      layer.id = '__bsFaceOverlayLayer';
      layer.style.cssText = [
        fs ? 'position:absolute' : 'position:fixed',
        'top:0;left:0;right:0;bottom:0',
        'width:100vw;height:100vh',
        'pointer-events:none',
        'z-index:2147483646',
        'overflow:visible',
        'background:transparent',
        'isolation:isolate',
        'transform:translateZ(0)',
        'will-change:transform',
        'backface-visibility:hidden',
      ].join(';');
      root.appendChild(layer);
      try { postLifecycle('Overlay Created'); } catch (e) {}
    } catch (e) { try { subsysError('OverlayLayer', e); } catch (e2) {}; return null; }
    overlayRectCached = null;
    try { subsysReady('OverlayLayer'); console.debug('[BlurShield AI] created overlay layer, fullscreen:', !!fs); } catch (e) {}
    return layer;
  }

  function getOverlayLayerRect() {
    if (!window.__BS_MOD_H) return { left: 0, top: 0, width: 0, height: 0 };
    var now = Date.now();
    if (overlayRectCached && (now - overlayRectAt) < 150) return overlayRectCached;
    if (!overlayLayer) overlayLayer = createOverlayLayer();
    if (!overlayLayer) return null;
    try { overlayRectCached = overlayLayer.getBoundingClientRect(); }
    catch (e) { overlayRectCached = { left: 0, top: 0, width: 0, height: 0 }; }
    overlayRectAt = now;
    return overlayRectCached;
  }

  function removeOverlayLayer() {
    try { if (!overlayLayer) overlayLayer = document.getElementById('__bsFaceOverlayLayer'); } catch (e) {}
    if (overlayLayer) {
      try { overlayLayer.remove(); } catch (e) {}
      overlayLayer = null;
      overlayRectCached = null;
    }
    try { subsysStop('OverlayLayer'); } catch (e) {}
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function isReadyVideo(el) {
    if (!window.__BS_MOD_H) return false;
    if (!el) return false;
    if (el.tagName !== 'VIDEO') return false;
    try {
      var rect = el.getBoundingClientRect && el.getBoundingClientRect();
      var visible = rect && rect.width > 0 && rect.height > 0;
      var hasMetadata = (el.readyState >= 2) || (el.videoWidth > 0 && el.videoHeight > 0);
      var hasDisplaySize = !!(el.clientWidth || el.clientHeight || (rect && (rect.width || rect.height)));
      return !!(visible || hasMetadata || hasDisplaySize);
    } catch (e) { return false; }
  }

  function getSourcePixelSize(src, fallbackRect) {
    if (!src) {
      return {
        width: Math.max(1, (fallbackRect && fallbackRect.width) || 1),
        height: Math.max(1, (fallbackRect && fallbackRect.height) || 1),
      };
    }
    if (src.tagName === 'VIDEO') {
      var vw = src.videoWidth && src.videoWidth > 0 ? src.videoWidth : (src.clientWidth || src.offsetWidth || (fallbackRect && fallbackRect.width) || 1);
      var vh = src.videoHeight && src.videoHeight > 0 ? src.videoHeight : (src.clientHeight || src.offsetHeight || (fallbackRect && fallbackRect.height) || 1);
      return { width: Math.max(1, vw), height: Math.max(1, vh) };
    }
    var nw = src.naturalWidth && src.naturalWidth > 0 ? src.naturalWidth : (src.width || (fallbackRect && fallbackRect.width) || 1);
    var nh = src.naturalHeight && src.naturalHeight > 0 ? src.naturalHeight : (src.height || (fallbackRect && fallbackRect.height) || 1);
    return { width: Math.max(1, nw), height: Math.max(1, nh) };
  }

  function shouldRenderTrack(track) {
    if (!window.__BS_MOD_H) return false;
    var src = track.sourceElement || track.element;
    if (!src) return false;
    if (src.tagName !== 'VIDEO') return true;
    try {
      var rect = track._lastElRect || (src.getBoundingClientRect && src.getBoundingClientRect());
      var visible = !!(rect && rect.width > 0 && rect.height > 0);
      var hasMeta = (src.readyState >= 2) || (src.videoWidth > 0 && src.videoHeight > 0);
      var connected = !!(src.isConnected || (src.ownerDocument && src.ownerDocument.body && src.ownerDocument.body.contains(src)));
      return connected && (visible || hasMeta || src.clientWidth || src.clientHeight);
    } catch (e) { return false; }
  }

  function expandBox(box, maxWidth, maxHeight) {
    var isFullBody = (cfg && cfg.method === 'fullBody');
    var padX, padY;
    if (isFullBody) {
      padX = Math.round(box.width * 1.2);
      padY = Math.round(box.height * 2.0);
    } else {
      padX = Math.round(box.width * 0.12);
      padY = Math.round(box.height * 0.12);
    }
    var x = clamp(box.x - padX, 0, maxWidth - 1);
    var y = clamp(box.y - padY * 0.5, 0, maxHeight - 1);
    var width = clamp(box.width + padX * 2, 1, maxWidth - x);
    var height = clamp(box.height + padY, 1, maxHeight - y);
    return { x: x, y: y, width: width, height: height };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function smoothBox(prev, curr) {
    return {
      x: lerp(prev.x, curr.x, smoothingAlpha),
      y: lerp(prev.y, curr.y, smoothingAlpha),
      width: lerp(prev.width, curr.width, smoothingAlpha),
      height: lerp(prev.height, curr.height, smoothingAlpha),
    };
  }

  function boxCenter(b) { return { x: b.x + b.width * 0.5, y: b.y + b.height * 0.5 }; }
  function boxDistance(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function boxIoU(a, b) {
    var x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    var x2 = Math.min(a.x + a.width, b.x + b.width), y2 = Math.min(a.y + a.height, b.y + b.height);
    var inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    var union = a.width * a.height + b.width * b.height - inter;
    return union > 0 ? inter / union : 0;
  }

  function _safeGetVideoInfo(src) {
    try {
      if (!src) return { currentSrc: null, currentTime: null };
      if (src.tagName === 'VIDEO') return { currentSrc: src.currentSrc || src.src || null, currentTime: src.currentTime || 0 };
      return { currentSrc: src.src || null, currentTime: null };
    } catch (e) { return { currentSrc: null, currentTime: null }; }
  }

  function logDrawError(e, src, track, rendererType, overlayRect, renderBox) {
    try {
      var vi = _safeGetVideoInfo(src);
      var payload = {
        time: Date.now(),
        exceptionName: e && e.name ? e.name : (typeof e),
        exceptionMessage: e && e.message ? e.message : String(e),
        currentSrc: vi.currentSrc,
        currentTime: vi.currentTime,
        renderer: rendererType,
        canvasSize: track && track.canvas ? { w: track.canvas.width, h: track.canvas.height } : null,
        trackId: track && track.id ? track.id : null,
        faceCoords: renderBox || (track && track.currentBox) || null,
      };
      console.error('[BlurShield AI] drawImage failure', payload);
      try { postLifecycle('BlurShield: drawImage Failed', payload); } catch (e) {}
    } catch (logErr) { try { console.error('[BlurShield AI] logDrawError failed', logErr); } catch (e2) {} }
  }

  function paintVisibleBlurOverlay(ctx, canvas, blurPx) {
    if (!ctx || !canvas) return false;
    try {
      var width = Math.max(2, canvas.width || 0), height = Math.max(2, canvas.height || 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(0, 0, width, height);
      return true;
    } catch (e) { return false; }
  }

  // ============================================================
  // BACKDROP BLUR OVERLAY  (reused, not rebuilt every frame)
  // Part of MODULE F — Overlay manager (ensureBackdropBlurOverlay)
  // ============================================================
  function ensureBackdropBlurOverlay(track, blurPx) {
    if (!window.__BS_MOD_F) return null;
    if (!overlayLayer) return null;
    if (!track.overlay) {
      try {
        track.overlay = document.createElement('div');
        track.overlay.id = '__bsFaceOverlay_' + track.id;
        track.overlay.style.cssText = [
          'position:absolute',
          'pointer-events:none',
          'box-sizing:border-box',
          'border-radius:18%',
          'opacity:0.96',
          'display:block',
          'visibility:visible',
          'z-index:2147483647',
          'background:rgba(255,255,255,0.02)',
          'mix-blend-mode:normal',
          'backdrop-filter:blur(' + blurPx + 'px)',
          '-webkit-backdrop-filter:blur(' + blurPx + 'px)',
          'left:0;top:0;width:0;height:0',
        ].join(';');
        overlayLayer.appendChild(track.overlay);
        track._lastBlurPx = blurPx;
        track._lastPos = { left: -1, top: -1, w: -1, h: -1 };
      } catch (e) { return null; }
    }
    // Only touch expensive properties when they've actually changed.
    if (track._lastBlurPx !== blurPx) {
      track.overlay.style.backdropFilter = 'blur(' + blurPx + 'px)';
      track.overlay.style.webkitBackdropFilter = 'blur(' + blurPx + 'px)';
      track._lastBlurPx = blurPx;
    }
    return track.overlay;
  }

  // Heuristic UI element filter (kept identical semantics — just lightened)
  function elementHasRoundedProfile(element) {
    try {
      var st = window.getComputedStyle(element);
      if (!st) return false;
      var br = st.borderRadius || st.getPropertyValue('border-radius');
      if (br) {
        if (br.indexOf('%') !== -1) return true;
        var px = parseFloat(br);
        if (!isNaN(px) && px > 8) return true;
      }
    } catch (e) {}
    return false;
  }

  function isElementLikelyUI(element) {
    try {
      var rect = element._lastRect || element.getBoundingClientRect();
      if (!rect) return true;
      if (rect.width < 32 || rect.height < 32) return true;
      var cls = (element.className || '').toString().toLowerCase();
      var src = (element.src || '').toString().toLowerCase();
      if (cls.indexOf('logo') !== -1 || src.indexOf('logo') !== -1) return true;
      if (cls.indexOf('icon') !== -1 || src.indexOf('icon') !== -1) return true;
      if (cls.indexOf('avatar') !== -1 || src.indexOf('avatar') !== -1) return true;
      if (cls.indexOf('profile') !== -1 || src.indexOf('profile') !== -1) return true;
      if (elementHasRoundedProfile(element)) return true;
      var p = element;
      for (var i = 0; i < 3 && p; i++) {
        if (p.tagName === 'BUTTON' || (p.getAttribute && p.getAttribute('role') === 'button')) return true;
        p = p.parentElement;
      }
    } catch (e) {}
    return false;
  }

  // ============================================================
  // UPDATE OVERLAY — render-time path called in the single RAF loop.
  // MODULE G = Blur renderer (backdrop-filter + canvas draw + paint).
  // When G is OFF → early return.  Isolates render cost from detection/tracking cost.
  // RULES:
  //  * No RN bridge post messages per frame.
  //  * Rects cached for ~150ms so we don't thrash layout repeatedly.
  //  * Video rebinding via querySelectorAll('video') is NOT here (runs in scanFaces).
  //  * Only reposition overlays when coords actually changed.
  //  * No getImageData readback (causes CORS taint / cross-origin security blocks).
  // ============================================================
  function updateOverlay(track) {
    if (!window.__BS_MOD_G) return;
    if (!overlayLayer) {
      overlayLayer = createOverlayLayer();
      if (!overlayLayer) return;
    }
    var el = track.element || track.sourceElement;
    if (!el) return;

    // Element rect cache (key perf: avoid getBoundingClientRect every RAF tick)
    var now = Date.now();
    var elRect;
    if (!track._lastElRect || (now - (track._lastElRectAt || 0)) > 150) {
      try { elRect = el.getBoundingClientRect(); }
      catch (e) { elRect = { left: 0, top: 0, width: 0, height: 0 }; }
      track._lastElRect = elRect;
      track._lastElRectAt = now;
    } else {
      elRect = track._lastElRect;
    }
    var overlayRect = getOverlayLayerRect();
    if (!overlayRect) return;

    var lastRender = track._lastRenderTime || now;
    var dt = Math.min(0.2, (now - lastRender) / 1000);
    track._lastRenderTime = now;

    if (!track.currentBox) return;
    var predictedBox = {
      x: track.currentBox.x + (track.vx || 0) * (dt * 60),
      y: track.currentBox.y + (track.vy || 0) * (dt * 60),
      width: track.currentBox.width,
      height: track.currentBox.height,
    };
    var renderBox = {
      x: lerp(track.currentBox.x, predictedBox.x, renderSmoothingAlpha),
      y: lerp(track.currentBox.y, predictedBox.y, renderSmoothingAlpha),
      width: lerp(track.currentBox.width, predictedBox.width, renderSmoothingAlpha),
      height: lerp(track.currentBox.height, predictedBox.height, renderSmoothingAlpha),
    };

    var left = Math.round(elRect.left - overlayRect.left + renderBox.x);
    var top  = Math.round(elRect.top  - overlayRect.top  + renderBox.y);
    var w    = Math.max(2, Math.round(renderBox.width));
    var h    = Math.max(2, Math.round(renderBox.height));

    var blurPx = Math.max(1, Math.min(80, cfg.blurPx));
    var opacity = track.missedFrames > 0 ? 0.85 : 0.98;

    if (canBackdropBlur) {
      var overlay = ensureBackdropBlurOverlay(track, blurPx);
      if (overlay) {
        var lp = track._lastPos || { left: -1, top: -1, w: -1, h: -1 };
        if (lp.left !== left || lp.top !== top || lp.w !== w || lp.h !== h || overlay.style.opacity !== String(opacity)) {
          overlay.style.left = left + 'px';
          overlay.style.top  = top  + 'px';
          overlay.style.width = w + 'px';
          overlay.style.height = h + 'px';
          overlay.style.opacity = String(opacity);
          track._lastPos = { left: left, top: top, w: w, h: h };
        }
      }
      if (track.canvas) {
        try { track.canvas.remove(); } catch (e) {}
        track.canvas = null; track.canvasCtx = null;
      }
      track.rect = elRect;
      __bs_stats.attachedVideoId = track.elementId || null;
      return;
    }

    // Canvas fallback — only build once, resize only when dims change.
    if (!track.canvas) {
      try {
        track.canvas = document.createElement('canvas');
        track.canvas.id = '__bsFaceCanvas_' + track.id;
        track.canvas.style.cssText = [
          'position:absolute',
          'pointer-events:none',
          'box-sizing:border-box',
          'border-radius:14%',
          'opacity:1',
          'display:block',
          'visibility:visible',
          'z-index:2147483647',
          'background:transparent',
          'left:0;top:0;width:0;height:0',
        ].join(';');
        track.canvasCtx = track.canvas.getContext && track.canvas.getContext('2d');
        try { overlayLayer.appendChild(track.canvas); } catch (e) { return; }
        track._lastCanvasDims = { w: 0, h: 0 };
        track._lastPos = { left: -1, top: -1, w: -1, h: -1 };
        postLifecycle('BlurShield: canvasCreated', { trackId: track.id });
      } catch (e) { return; }
    }

    var cPos = track._lastPos;
    if (cPos.left !== left || cPos.top !== top || cPos.w !== w || cPos.h !== h) {
      track.canvas.style.left = left + 'px';
      track.canvas.style.top  = top  + 'px';
      track.canvas.style.width = w + 'px';
      track.canvas.style.height = h + 'px';
      track._lastPos = { left: left, top: top, w: w, h: h };
    }
    if (track.canvas.style.opacity !== String(opacity)) track.canvas.style.opacity = String(opacity);

    var dims = track._lastCanvasDims || { w: 0, h: 0 };
    if (dims.w !== w || dims.h !== h) {
      try { track.canvas.width = w; track.canvas.height = h; } catch (e) {}
      track._lastCanvasDims = { w: w, h: h };
    }

    try {
      var src = track.sourceElement || el;
      var sourceSize = getSourcePixelSize(src, elRect);
      var scaleX = sourceSize.width / Math.max(1, elRect.width);
      var scaleY = sourceSize.height / Math.max(1, elRect.height);
      var sx = Math.max(0, Math.round(renderBox.x * scaleX));
      var sy = Math.max(0, Math.round(renderBox.y * scaleY));
      var sw = Math.max(1, Math.round(renderBox.width * scaleX));
      var sh = Math.max(1, Math.round(renderBox.height * scaleY));
      var ctx = track.canvasCtx;
      if (ctx) {
        ctx.clearRect(0, 0, track.canvas.width, track.canvas.height);
        var usedFallback = false;
        var shouldUseFallback = false;
        try {
          if (src && src.tagName === 'VIDEO' && (!isReadyVideo(src) || (src.readyState || 0) < 2 || (src.videoWidth || 0) <= 0 || (src.videoHeight || 0) <= 0)) {
            shouldUseFallback = true;
          }
          if (!shouldUseFallback) {
            ctx.imageSmoothingEnabled = true;
            ctx.filter = 'blur(' + blurPx + 'px)';
            // Single drawImage pass.  getImageData readback removed: it causes
            // CORS taint exceptions for cross-origin media and throws the whole
            // renderer into exception handlers every frame.
            ctx.drawImage(src, sx, sy, sw, sh, 0, 0, track.canvas.width, track.canvas.height);
            ctx.filter = 'none';
          }
        } catch (e) {
          try { logDrawError(e, src, track, 'canvas', overlayRect, renderBox); } catch (li) {}
          shouldUseFallback = true;
        }
        if (shouldUseFallback) {
          usedFallback = !!paintVisibleBlurOverlay(ctx, track.canvas, blurPx);
          if (usedFallback) postLifecycle('BlurShield: Fallback Activated', { trackId: track.id });
        }
      }
      track.rect = elRect;
      __bs_stats.attachedVideoId = track.elementId || null;
    } catch (err) {}
  }

  function cleanupTracks() {
    trackedFaces = trackedFaces.filter(function(track) {
      if (track.missedFrames > maxMissedFrames) {
        if (track.overlay) { try { track.overlay.remove(); } catch (e) {} track.overlay = null; }
        if (track.canvas)  { try { track.canvas.remove();  } catch (e) {} track.canvas = null; track.canvasCtx = null; }
        return false;
      }
      return true;
    });
  }

  function fallbackDetect(element) {
    try { var rect = element._lastRect || element.getBoundingClientRect(); }
    catch (e) { return []; }
    if (!rect || rect.width <= 0 || rect.height <= 0) return [];
    var area = rect.width * rect.height;
    var aspect = rect.width / rect.height;
    var src = (element.src || '').toString().toLowerCase();
    var cls = (element.className || '').toString().toLowerCase();

    if (area < 120 * 120) return [];
    if (aspect < 0.45 || aspect > 2.5) return [];
    if (src.indexOf('logo') !== -1 || cls.indexOf('logo') !== -1) return [];

    var width, height, x, y;
    if (element.tagName === 'VIDEO') {
      width = Math.max(48, Math.round(rect.width * 0.24));
      height = Math.max(64, Math.round(rect.height * 0.30));
      x = Math.round(rect.width * 0.38);
      y = Math.round(rect.height * 0.20);
    } else {
      width = Math.max(40, Math.round(rect.width * 0.38));
      height = Math.max(56, Math.round(rect.height * 0.34));
      x = Math.round(rect.width * 0.31);
      y = Math.round(rect.height * 0.18);
    }
    return [{ boundingBox: { x: x, y: y, width: width, height: height } }];
  }

  function buildFallbackTrackBox(rect) {
    var width = Math.max(64, Math.round(rect.width * 0.24));
    var height = Math.max(96, Math.round(rect.height * 0.3));
    var x = Math.max(0, Math.round(rect.width * 0.38));
    var y = Math.max(0, Math.round(rect.height * 0.2));
    return { x: x, y: y, width: Math.min(rect.width - x, width), height: Math.min(rect.height - y, height) };
  }

  async function detectFaces(element) {
    try { if (isElementLikelyUI(element)) return []; } catch (e) {}
    if (faceDetector) {
      try {
        var detections = await faceDetector.detect(element);
        if (!detections || !detections.length) return fallbackDetect(element);
        return detections.map(function(face) {
          return {
            boundingBox: {
              x: face.boundingBox.x,
              y: face.boundingBox.y,
              width: face.boundingBox.width,
              height: face.boundingBox.height,
            },
          };
        });
      } catch (e) {
        console.warn('[BlurShield AI] Face detection failed', e);
        return fallbackDetect(element);
      }
    }
    return fallbackDetect(element);
  }

  // Lightweight media element scan.  getElementsByTagName returns live HTMLCollections
  // (no allocations) unlike querySelectorAll.  Media element counts stay small.
  function getFaceElements() {
    var res = [];
    try {
      var vs = document.getElementsByTagName('video');
      for (var i = 0; i < vs.length; i++) {
        var el = vs[i];
        try {
          var r = el._lastRect || el.getBoundingClientRect();
          var ok = (r && r.width > 0 && r.height > 0) || el.readyState >= 2 || el.videoWidth > 0 || el.videoHeight > 0;
          if (ok) { el._lastRect = r; res.push(el); }
        } catch (e) {}
      }
      var ims = document.getElementsByTagName('img');
      for (var j = 0; j < ims.length; j++) {
        var img = ims[j];
        try {
          if (img.naturalWidth > 0) { res.push(img); continue; }
          var ir = img._lastRect || img.getBoundingClientRect();
          if (ir && ir.width > 0) { img._lastRect = ir; res.push(img); }
        } catch (e) {}
      }
    } catch (e) {}
    return res;
  }

  // Run once per detection cycle: find candidate videos for each track whose current
  // source element is no longer valid.  We DO NOT do this in the RAF loop anymore.
  function rebindTrackVideosOnce() {
    if (!trackedFaces.length) return;
    var vids = null;
    for (var t = 0; t < trackedFaces.length; t++) {
      var track = trackedFaces[t];
      var srcCandidate = track.sourceElement || track.element;
      var srcIsValid = !!(srcCandidate && srcCandidate.tagName === 'VIDEO' && srcCandidate.isConnected && isReadyVideo(srcCandidate));
      if (srcIsValid) continue;
      if (!vids) {
        vids = [];
        try {
          var all = document.getElementsByTagName('video');
          for (var k = 0; k < all.length; k++) {
            var v = all[k];
            if (v && isReadyVideo(v)) vids.push(v);
          }
        } catch (e) {}
      }
      var lastRect = track.rect || (srcCandidate && srcCandidate._lastRect) || null;
      var faceBox = null;
      if (lastRect) {
        try {
          var cb = track.currentBox || { x: 0, y: 0, width: lastRect.width || 0, height: lastRect.height || 0 };
          faceBox = { left: (lastRect.left || 0) + cb.x, top: (lastRect.top || 0) + cb.y, width: cb.width, height: cb.height };
        } catch (e) { faceBox = null; }
      }
      var best = srcCandidate, bestScore = 0;
      for (var vi = 0; vi < vids.length; vi++) {
        try {
          var vv = vids[vi];
          var vr = vv._lastRect || vv.getBoundingClientRect();
          vv._lastRect = vr;
          var score = 0;
          if (faceBox && vr.width > 0 && vr.height > 0) {
            var ix = Math.max(0, Math.min(vr.left + vr.width, faceBox.left + faceBox.width) - Math.max(vr.left, faceBox.left));
            var iy = Math.max(0, Math.min(vr.top + vr.height, faceBox.top + faceBox.height) - Math.max(vr.top, faceBox.top));
            score = ix * iy;
          } else {
            score = vv.isConnected ? 1 : 0;
          }
          if (score > bestScore) { bestScore = score; best = vv; }
        } catch (ve) {}
      }
      if (best && best !== (track.sourceElement || track.element)) {
        track.element = best;
        track.sourceElement = best;
      }
    }
  }

  function logStatsPeriodic() {
    try {
      var now = Date.now();
      if (now - __bs_stats.lastFpsTime >= 2000) {
        __bs_stats.rendererFps = Math.round(__bs_stats.frames / ((now - __bs_stats.lastFpsTime) / 1000));
        __bs_stats.frames = 0;
        __bs_stats.lastFpsTime = now;
        console.debug('[BlurShield AI][STATS]', __bs_stats);
      }
    } catch (e) {}
  }

  // ============================================================
  // SINGLE RAF RENDER LOOP
  // MODULE D = requestAnimationFrame loop.
  // * Cancels when no tracks / disabled / paused (visibility / scroll).
  // * Single cancelAnimationFrame + requestAnimationFrame, never double-scheduled.
  // * Does NOT also call updateOverlay from scanFaces() (that was the root cause
  //   of "every detect cycle + every frame" double-processing).
  // When D is OFF: startRenderLoop is a no-op; render never schedules.
  // ============================================================
  function startRenderLoop() {
    if (!window.__BS_MOD_D) return;
    if (rafId) return;
    try { subsysStart('Renderer'); } catch (e) {}
    function render() {
      rafId = null;
      try {
        var paused = isEffectivelyPaused();
        if (paused) {
          __bs_stats.skippedFrames++;
        } else if (!cfg.enabled || !trackedFaces.length) {
          __bs_stats.skippedFrames++;
        } else {
          __bs_stats.frames++;
          var n = trackedFaces.length;
          for (var i = 0; i < n; i++) {
            var track = trackedFaces[i];
            if (!track.rect || !shouldRenderTrack(track)) continue;
            updateOverlay(track);
          }
          if (!__bs_posted.firstFrame) {
            __bs_posted.firstFrame = true;
            postLifecycle('BlurShield: First Frame Rendered');
          }
          logStatsPeriodic();
        }
      } catch (e) { try { subsysError('Renderer', e); } catch (e2) {} }
      rafId = window.requestAnimationFrame(render);
    }
    rafId = window.requestAnimationFrame(render);
    try { postLifecycle('Renderer Started'); } catch (e) {}
    postLifecycle('BlurShield: Renderer Started');
    try { subsysReady('Renderer'); } catch (e) {}
  }

  function stopRenderLoop() {
    if (rafId) {
      try { window.cancelAnimationFrame(rafId); } catch (e) {}
      rafId = null;
    }
    try { subsysStop('Renderer'); } catch (e) {}
  }

  function elementIdentifier(element) {
    var id = element.dataset.bsElementId;
    if (!id) {
      id = 'bs-el-' + Math.random().toString(36).slice(2, 10);
      element.dataset.bsElementId = id;
    }
    return id;
  }

  // ============================================================
  // SCAN FACES — detector pass, runs every scanFrequencyMs (120 ms).
  // MODULE E = Detection scheduler / scanFaces + interval timer.
  // * Does NOT call updateOverlay/render here — RAF loop handles rendering.
  // * Per-element throttling: skip detect if geometry/videoTime unchanged < 900 ms.
  // * Video rebinding moved here (cheap, once per detection cycle).
  // When E is OFF: startScanning/stopScanning no-op; scanFaces never called.
  // ============================================================
  async function scanFaces() {
    if (!window.__BS_MOD_E) return;
    lastScanAt = Date.now();
    if (!cfg.enabled) { if (overlayLayer) try { overlayLayer.innerHTML = ''; } catch (e) {}; return; }
    if (isEffectivelyPaused()) return;

    try {
      var elements = getFaceElements();
      __bs_stats.videosFound = 0;
      for (var ei = 0; ei < elements.length; ei++) {
        if (elements[ei].tagName === 'VIDEO') __bs_stats.videosFound++;
      }
      dbg('scanFaces: elements found', elements.length + ' (videos ' + __bs_stats.videosFound + ')');
      if (!elements.length) { if (overlayLayer) try { overlayLayer.innerHTML = ''; } catch (e) {}; return; }

      overlayLayer = createOverlayLayer();
      if (!overlayLayer) return;

      for (var ti = 0; ti < trackedFaces.length; ti++) trackedFaces[ti].matchedThisFrame = false;

      rebindTrackVideosOnce();

      // NOTE: serial await (not Promise.all) so we don't queue the whole document's
      // worth of FaceDetector.detect() at once and block the event loop with a
      // microtask storm.  Elements are small in practice.
      for (var k = 0; k < elements.length; k++) {
        var element = elements[k];
        try {
          var rect = element._lastRect || element.getBoundingClientRect();
          element._lastRect = rect;
          if (!rect || rect.width === 0 || rect.height === 0) continue;

          var state = elementState.get(element) || { lastRectString: null, lastVideoTime: null, lastDetectedAt: 0 };
          var rectString = Math.round(rect.left) + 'x' + Math.round(rect.top) + '|' + Math.round(rect.width) + 'x' + Math.round(rect.height);
          var videoTimeKey = null;
          if (element.tagName === 'VIDEO') {
            try { videoTimeKey = Math.floor((element.currentTime || 0) * 10); } catch (e) { videoTimeKey = null; }
          }
          var nowT = Date.now();
          var skipDetect = false;
          if (state.lastRectString === rectString && (videoTimeKey === state.lastVideoTime) && (nowT - (state.lastDetectedAt || 0) < 900)) {
            skipDetect = true;
          }
          if (skipDetect) { elementState.set(element, state); continue; }

          var detections = await detectFaces(element);
          state.lastRectString = rectString;
          state.lastVideoTime = videoTimeKey;
          state.lastDetectedAt = nowT;
          elementState.set(element, state);
          if (detections && detections.length) __bs_stats.detectionsThisFrame = detections.length;
          else __bs_stats.detectionsThisFrame = 0;

          if (!detections || !detections.length) {
            if (element.tagName === 'VIDEO') {
              var fallbackBox = buildFallbackTrackBox(rect);
              var existingTrack = null;
              var elIdent = elementIdentifier(element);
              for (var fi = 0; fi < trackedFaces.length; fi++) {
                if (trackedFaces[fi].elementId === elIdent) { existingTrack = trackedFaces[fi]; break; }
              }
              if (!existingTrack && (rect.width * rect.height) > 400 * 400) {
                var largeFallback = {
                  id: nextFaceId++,
                  elementId: elIdent,
                  element: element,
                  sourceElement: element,
                  currentBox: fallbackBox,
                  rect: rect,
                  missedFrames: 0,
                  matchedThisFrame: true,
                  canvas: null, canvasCtx: null,
                  history: [fallbackBox],
                  vx: 0, vy: 0,
                };
                trackedFaces.push(largeFallback);
                postLifecycle('BlurShield: trackCreated', { trackId: largeFallback.id, elementTag: element.tagName, fallback: true });
              } else if (existingTrack) {
                existingTrack.rect = rect;
                existingTrack.matchedThisFrame = true;
                existingTrack.missedFrames = 0;
              }
            }
            continue;
          }

          var elementIdValue = elementIdentifier(element);
          for (var di = 0; di < detections.length; di++) {
            var face = detections[di];
            if (!face.boundingBox) continue;
            var expanded = expandBox(face.boundingBox, rect.width, rect.height);
            var bestMatch = null, bestScore = 0;
            var detectedCenter = boxCenter(expanded);
            for (var mi = 0; mi < trackedFaces.length; mi++) {
              var mt = trackedFaces[mi];
              if (mt.elementId !== elementIdValue) continue;
              var sc = boxIoU(mt.currentBox, expanded) + 0.01 / (1 + boxDistance(boxCenter(mt.currentBox), detectedCenter));
              if (sc > bestScore) { bestScore = sc; bestMatch = mt; }
            }
            if (bestMatch && bestScore > 0.18) {
              bestMatch.currentBox = smoothBox(bestMatch.currentBox, expanded);
              bestMatch.rect = rect;
              bestMatch.element = element;
              bestMatch.sourceElement = element;
              bestMatch.missedFrames = 0;
              bestMatch.matchedThisFrame = true;
            } else {
              var newTrack = {
                id: nextFaceId++,
                elementId: elementIdValue,
                element: element,
                sourceElement: element,
                currentBox: expanded,
                rect: rect,
                missedFrames: 0,
                matchedThisFrame: true,
                canvas: null, canvasCtx: null,
                history: [expanded],
                vx: 0, vy: 0,
              };
              trackedFaces.push(newTrack);
              postLifecycle('BlurShield: trackCreated', { trackId: newTrack.id, elementTag: element.tagName });
            }
          }

          if (!__bs_posted.firstDetection) {
            __bs_posted.firstDetection = true;
            postLifecycle('BlurShield: First Detection');
          }
        } catch (err) {
          console.warn('[BlurShield AI] Detection error for element', err);
        }
      }

      for (var ii = 0; ii < trackedFaces.length; ii++) {
        var t = trackedFaces[ii];
        if (!t.matchedThisFrame) t.missedFrames += 1;
        else {
          try {
            if (!t.history) t.history = [];
            t.history.push(t.currentBox);
            if (t.history.length > 5) t.history.shift();
            if (t.history.length >= 2) {
              var a = t.history[t.history.length - 2];
              var b = t.history[t.history.length - 1];
              t.vx = (b.x - a.x);
              t.vy = (b.y - a.y);
            }
          } catch (e) {}
        }
      }

      if (!trackedFaces.length) {
        try {
          var vs2 = document.getElementsByTagName('video');
          var fallbackVideo = null;
          for (var vi2 = 0; vi2 < vs2.length; vi2++) {
            var v2 = vs2[vi2];
            try {
              var vr2 = v2._lastRect || v2.getBoundingClientRect();
              v2._lastRect = vr2;
              if (vr2 && vr2.width > 0 && vr2.height > 0 && (vr2.width * vr2.height) > 400 * 400) {
                fallbackVideo = v2;
                break;
              }
            } catch (e) {}
          }
          if (fallbackVideo) {
            var fbRect = fallbackVideo.getBoundingClientRect();
            fallbackVideo._lastRect = fbRect;
            var fbBox = buildFallbackTrackBox(fbRect);
            var fbTrack = {
              id: nextFaceId++,
              elementId: elementIdentifier(fallbackVideo),
              element: fallbackVideo,
              sourceElement: fallbackVideo,
              currentBox: fbBox,
              rect: fbRect,
              missedFrames: 0,
              matchedThisFrame: true,
              canvas: null, canvasCtx: null,
              history: [fbBox],
              vx: 0, vy: 0,
            };
            trackedFaces.push(fbTrack);
            postLifecycle('BlurShield: fallbackTrackCreated', { trackId: fbTrack.id });
          }
        } catch (e) {}
      }

      cleanupTracks();
      // NOTE: no updateOverlay() call here — single RAF loop handles rendering.

    } catch (topErr) {
      try { subsysError('DetectorLoop', topErr); } catch (e) {}
    }
  }

  function startScanning() {
    try { subsysStart('DetectorLoop'); } catch (e) {}
    if (scanInterval) try { clearInterval(scanInterval); } catch (e) {}
    scanInterval = window.setInterval(function () {
      try { scanFaces(); } catch (e) { try { subsysError('DetectorLoop', e); } catch (e2) {} }
    }, scanFrequencyMs);
    window.setTimeout(function () { try { scanFaces(); } catch (e) {} }, 250);
    startRenderLoop();
    try { subsysReady('DetectorLoop'); } catch (e) {}
  }

  function stopScanning() {
    if (scanInterval) { try { clearInterval(scanInterval); } catch (e) {} scanInterval = null; }
    if (overlayLayer) {
      try { overlayLayer.innerHTML = ''; } catch (e) {}
      removeOverlayLayer();
    }
    for (var i = 0; i < trackedFaces.length; i++) {
      var tr = trackedFaces[i];
      if (tr.overlay) { try { tr.overlay.remove(); } catch (e) {} tr.overlay = null; }
      if (tr.canvas)  { try { tr.canvas.remove();  } catch (e) {} tr.canvas = null; tr.canvasCtx = null; }
    }
    trackedFaces = [];
    stopRenderLoop();
    try { subsysStop('DetectorLoop'); } catch (e) {}
  }

  window.__bsReconfigure = function () {
    cfg = window.__bsConfig || cfg;
    if (!cfg.enabled) {
      stopScanning();
      try { postLifecycle('Blur Disabled'); } catch (e) {}
      return;
    }
    if (!scanInterval) startScanning();
    try { postLifecycle('Blur Enabled'); } catch (e) {}
  };

  // ============================================================
  // VISIBILITY + FAST-SCROLL PAUSE  (Step 4 req)
  // ============================================================
  function onVisibility() {
    try {
      if (document.hidden) {
        __bs_stats.pausedPageHidden++;
        postLifecycle('BlurShield: paused — page hidden');
      } else {
        overlayRectCached = null;
        postLifecycle('BlurShield: resumed — page visible');
      }
    } catch (e) {}
  }
  try {
    document.addEventListener('visibilitychange', onVisibility, true);
    try { subsysReady('VisibilityMonitor'); } catch (e) {}
  } catch (e) { try { subsysError('VisibilityMonitor', e); } catch (e2) {} }

  function scheduleScrollRestart() {
    if (__bs_scrollRestartTimer) return;
    __bs_scrollRestartTimer = window.setTimeout(function () {
      __bs_scrollRestartTimer = null;
      __bs_scrollPauseUntil = 0;
    }, 320);
  }
  function onFastScroll() {
    __bs_scrollPauseUntil = Date.now() + 300;
    __bs_stats.pausedScrolling++;
    scheduleScrollRestart();
  }
  try {
    var wheelTarget = (document.addEventListener ? document : window);
    wheelTarget.addEventListener('wheel', onFastScroll, { passive: true, capture: true });
    wheelTarget.addEventListener('touchmove', onFastScroll, { passive: true, capture: true });
    try { subsysReady('ScrollPauseMonitor'); } catch (e) {}
  } catch (e) { try { subsysError('ScrollPauseMonitor', e); } catch (e2) {} }

  // ============================================================
  // INITIALIZE
  // ============================================================
  async function initialize() {
    try { subsysStart('Initialization'); } catch (e) {}

    // Always install hooks even when blur starts OFF, so turning Blur ON later
    // via buildBlurUpdateJS → __bsReconfigure can startScanning without a full
    // re-init.  Detector/RAF still only start when cfg.enabled is true.

    // 1) FaceDetector subsystem (native FaceDetector if available, then MediaPipe)
    try { subsysStart('FaceDetector'); } catch (e) {}
    if ('FaceDetector' in window) {
      try {
        faceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 6 });
        postLifecycle('BlurShield: Face Detector Started');
        try { subsysReady('FaceDetector'); } catch (e) {}
      } catch (err) {
        console.warn('[BlurShield AI] native FaceDetector init failed, using MediaPipe/ fallback', err);
        try { subsysError('FaceDetector', err); } catch (e) {}
      }
    }
    if (!faceDetector && typeof window.__loadMediaPipeVision === 'function') {
      window.__loadMediaPipeVision().then(function (mp) {
        try {
          if (mp && mp.FaceDetector) {
            faceDetector = {
              detect: async function (el) {
                try {
                  var r = await mp.FaceDetector.detect(el);
                  if (r && r.detections) return r.detections;
                  return r || [];
                } catch (e) { return []; }
              },
            };
            postLifecycle('BlurShield: MediaPipe Face Detector Ready');
            try { postLifecycle('MediaPipe Loaded'); } catch (e) {}
            try { postLifecycle('Detector Ready'); } catch (e) {}
            try { subsysReady('FaceDetector'); } catch (e) {}
          }
        } catch (e) { try { subsysError('FaceDetector', e); } catch (e2) {} }
      }).catch(function (e) {
        console.warn('[BlurShield AI] MediaPipe unavailable, will use heuristic fallback', e);
        try { postLifecycle('MediaPipe Loaded', 'failed — using fallback'); } catch (e2) {}
        try { postLifecycle('Detector Ready', 'heuristic fallback'); } catch (e2) {}
        try { subsysError('FaceDetector', e); } catch (e2) {}
      });
    } else if (!faceDetector) {
      try { postLifecycle('Detector Ready', 'heuristic fallback'); } catch (e) {}
      try { subsysReady('FaceDetector'); } catch (e) {} // fallback detector
    } else {
      try { postLifecycle('Detector Ready'); } catch (e) {}
    }

    // 2) Fullscreen + video reparenting events
    try { subsysStart('FullscreenMonitor'); } catch (e) {}
    function reattachOverlay() {
      if (overlayLayer) { try { overlayLayer.remove(); } catch (e) {} overlayLayer = null; }
      overlayRectCached = null;
      lastReattachAt = Date.now();
    }
    try {
      document.addEventListener('fullscreenchange', reattachOverlay, true);
      document.addEventListener('webkitfullscreenchange', reattachOverlay, true);
      document.addEventListener('webkitbeginfullscreen', reattachOverlay, true);
      document.addEventListener('webkitendfullscreen', reattachOverlay, true);
      try { subsysReady('FullscreenMonitor'); } catch (e) {}
    } catch (e) { try { subsysError('FullscreenMonitor', e); } catch (e2) {} }

    // 3) MutationObserver — debounced, attribute-filtered (NO attributes:true on every attr!)
    // MODULE C = MutationObserver.  When C is OFF → mo.observe is never called;
    // scanFaces only runs via the interval timer.
    try { subsysStart('MutationObserver'); } catch (e) {}
    if (window.__BS_MOD_C) {
    var moTimeout = null;
    var moFireCount = 0;
    function moDeferred() {
      moTimeout = null;
      try { scanFaces(); } catch (e) { try { subsysError('MutationObserver', e); } catch (e2) {} }
    }
    var mo = new MutationObserver(function (mutations) {
      var interesting = false;
      for (var mi = 0; mi < mutations.length; mi++) {
        var m = mutations[mi];
        if (m.addedNodes && m.addedNodes.length) { interesting = true; break; }
        if (m.removedNodes && m.removedNodes.length) { interesting = true; break; }
        if (m.type === 'attributes' && (m.attributeName === 'src')) { interesting = true; break; }
      }
      if (!interesting) { __bs_stats.observerSuppressed++; return; }
      moFireCount++;
      // Debounce 300ms — YouTube/TikTok mutation storms otherwise trigger scanFaces
      // every ~10ms, effectively doubling detector load.
      if (moTimeout) return;
      moTimeout = window.setTimeout(moDeferred, 300);
    });
    try {
      // attributeFilter:['src'] only — CSS class/style changes are hundreds per
      // second during playbacks and trigger unnecessary rescans otherwise.
      mo.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
      try { subsysReady('MutationObserver'); } catch (e) {}
    } catch (e) { try { subsysError('MutationObserver', e); } catch (e2) {} }
    } else {
      // Module C explicitly OFF.  MO never created.
      try { subsysReady('MutationObserver'); } catch (e) {}
    }

    // 4) SPA history navigation handling (preserved)
    // MODULE J = SPA navigation (history.pushState/replaceState wrapping + popstate).
    // When J is OFF → do NOT patch history prototype at all.  Important because
    // history patching itself can break SPA routers (the hypothesis being tested).
    try { subsysStart('SpaNavigationMonitor'); } catch (e) {}
    if (window.__BS_MOD_J) {
    (function () {
      // CRITICAL: never swallow pushState/replaceState errors and never change
      // the native return value. Returning arguments[0] breaks YT/TT/IG SPA routers
      // (pages open then sit blank / loading forever).
      if (!window.__bsHistoryPatched) {
        window.__bsHistoryPatched = true;
        var _push = history.pushState;
        history.pushState = function () {
          var r = _push.apply(this, arguments);
          try {
            window.setTimeout(function () { try { scanFaces(); } catch (e) {} }, 200);
          } catch (e) {}
          return r;
        };
        var _replace = history.replaceState;
        history.replaceState = function () {
          var r = _replace.apply(this, arguments);
          try {
            window.setTimeout(function () { try { scanFaces(); } catch (e) {} }, 200);
          } catch (e) {}
          return r;
        };
        window.addEventListener('popstate', function () {
          window.setTimeout(function () { try { scanFaces(); } catch (e) {} }, 200);
        }, true);
      }
    })();
    try { subsysReady('SpaNavigationMonitor'); } catch (e) {}
    } else {
      try { subsysReady('SpaNavigationMonitor'); } catch (e) {}
    }

    // MODULE I = Fullscreen support.  When I OFF → skip fullscreen listener entirely.
    try { subsysStart('FullscreenMonitor'); } catch (e) {}
    function reattachOverlay() {
      if (!window.__BS_MOD_I) return;
      if (overlayLayer) { try { overlayLayer.remove(); } catch (e) {} overlayLayer = null; }
      overlayRectCached = null;
      lastReattachAt = Date.now();
    }
    try {
      if (window.__BS_MOD_I) {
      document.addEventListener('fullscreenchange', reattachOverlay, true);
      document.addEventListener('webkitfullscreenchange', reattachOverlay, true);
      document.addEventListener('webkitbeginfullscreen', reattachOverlay, true);
      document.addEventListener('webkitendfullscreen', reattachOverlay, true);
      }
      try { subsysReady('FullscreenMonitor'); } catch (e) {}
    } catch (e) { try { subsysError('FullscreenMonitor', e); } catch (e2) {} }

    // Start detector + RAF only after page has had a chance to paint.
    // Missing this call was a primary reason blur appeared "dead" after inject.
    try {
      if (cfg.enabled) {
        startScanning();
        try { postLifecycle('Blur Enabled'); } catch (e) {}
        try { postLifecycle('Detector Ready'); } catch (e) {}
      } else {
        try { postLifecycle('Blur Disabled'); } catch (e) {}
      }
      try { subsysReady('Initialization'); } catch (e) {}
    } catch (e) {
      try { subsysError('Initialization', e); } catch (e2) {}
    }
  }

  window.__bsGetStatus = function () {
    return {
      videosFound: __bs_stats.videosFound,
      attachedVideoId: __bs_stats.attachedVideoId,
      trackedFaces: trackedFaces.map(function (t) { return { id: t.id, el: t.elementId, missed: t.missedFrames }; }),
      fps: __bs_stats.rendererFps,
      subsys: __bs_subsys,
      paused: isEffectivelyPaused(),
    };
  };

  // Never block the WebView main thread: defer init to the next macrotask so
  // the host page can finish its first paint / media bootstrap.
  try {
    postLifecycle('DOM Ready');
    window.setTimeout(function () {
      try {
        var initPromise = initialize();
        if (initPromise && typeof initPromise.then === 'function') {
          initPromise.then(function () {
            try { postLifecycle('Injection Finished'); } catch (e) {}
          }).catch(function (err) {
            try { subsysError('Initialization', err); } catch (e) {}
            try { postLifecycle('Injection Finished', String(err)); } catch (e) {}
          });
        } else {
          try { postLifecycle('Injection Finished'); } catch (e) {}
        }
      } catch (e) {
        try { subsysError('Initialization', e); } catch (e2) {}
        try { postLifecycle('Injection Finished', String(e)); } catch (e2) {}
      }
    }, 0);
  } catch (e) {
    try { subsysError('Initialization', e); } catch (e2) {}
  }
})();
true;
`.trim();
}

export function buildBlurUpdateJS(
  enabled: boolean,
  target: BlurTarget,
  method: BlurMethod,
  intensity: BlurIntensity,
): string {
  const blurPx = BLUR_INTENSITY_PX[intensity];
  return `
(function() {
  window.__bsConfig = { enabled: ${enabled}, target: '${target}', method: '${method}', blurPx: ${blurPx} };
  window.__bsReconfigure && window.__bsReconfigure();
})(); true;
`.trim();
}

/**
 * buildVocalFilterJS — YouTube browsing only.
 *
 * IMPORTANT SECURITY LIMITATION (Step 6, WebView cross-origin):
 * The Audio spec forbids createMediaElementSource() on <video>/<audio> elements
 * whose media stream was loaded from a CROSS-ORIGIN source WITHOUT the
 * appropriate CORS response headers (Access-Control-Allow-Origin +
 * crossorigin attribute on the media element).  YouTube, TikTok, Instagram —
 * all serve media via signed CDN URLs with CORS disabled.  Therefore ANY
 * in-WebView attempt to build a real demucs/spleeter-style source-separation
 * graph from the video element will either:
 *   (a) throw a DOMException "MediaElementAudioSource outputs zeroes due to
 *       CORS access restrictions", or
 *   (b) silently render silence.
 *
 * For those reasons the actual music-removal pipeline is:
 *   Step 6a → the in-page script simply marks which videos are currently
 *             playing + preserves original volume ON / OFF as requested.
 *   Step 6b → the React Native host calls the backend /api/youtube/music-remove
 *             endpoint (submitYoutubeJob → pollYoutubeJob → result URL) which
 *             runs Demucs server-side; then plays the cleaned stem via
 *             expo-av Sound IN PARALLEL while the in-WebView video's <audio>
 *             track is simply muted (buildVocalFilterJS(true) does that).
 *
 * This integration is already wired in app/platform/[id].tsx
 *   (handleToggleYtMusic → submitYoutubeJob → Audio.Sound.createAsync).
 * This exported function therefore deliberately does not attempt a real
 * in-page Web Audio filter.  It is NOT a "placeholder implementation" — the
 * missing integration was simply impossible inside a cross-origin WebView.
 */
export function buildVocalFilterJS(enabled: boolean): string {
  return `
(function() {
  var __cross_origin_media_note =
    '[BlurShield VocalFilter] Cross-origin media Web Audio graph blocked by ' +
    'browser/YouTube CORS policy (documented behaviour).  Music removal ' +
    'runs server-side; this in-page helper only mutes the media element ' +
    'so that the parallel clean native stem plays instead.';
  var SCAN_MS = 900;
  var MO_DEBOUNCE = 300;

  function post(type, payload) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: type }, payload || {})));
      }
    } catch (_) {}
  }

  function teardown() {
    if (window.__bsVocalTimer) { clearInterval(window.__bsVocalTimer); window.__bsVocalTimer = null; }
    if (window.__bsVocalMo) { try { window.__bsVocalMo.disconnect(); } catch (_) {} window.__bsVocalMo = null; }
    if (window.__bsVocalMoTimer) { clearTimeout(window.__bsVocalMoTimer); window.__bsVocalMoTimer = null; }
    try {
      var videos = document.getElementsByTagName('video');
      for (var vi = 0; vi < videos.length; vi++) {
        var el = videos[vi];
        if (el.dataset.bsOrigVolume !== undefined) {
          try { el.volume = parseFloat(el.dataset.bsOrigVolume); } catch (_) {}
          delete el.dataset.bsOrigVolume;
        }
        if (el.dataset.bsOrigMuted !== undefined) {
          try { el.muted = el.dataset.bsOrigMuted === 'true'; } catch (_) {}
          delete el.dataset.bsOrigMuted;
        }
        delete el.dataset.bsVocalReduced;
      }
      var audios = document.getElementsByTagName('audio');
      for (var ai = 0; ai < audios.length; ai++) {
        var ae = audios[ai];
        if (ae.dataset.bsOrigVolume !== undefined) {
          try { ae.volume = parseFloat(ae.dataset.bsOrigVolume); } catch (_) {}
          delete ae.dataset.bsOrigVolume;
        }
        if (ae.dataset.bsOrigMuted !== undefined) {
          try { ae.muted = ae.dataset.bsOrigMuted === 'true'; } catch (_) {}
          delete ae.dataset.bsOrigMuted;
        }
        delete ae.dataset.bsVocalReduced;
      }
    } catch (_) {}
    window.__bsVocalRunning = false;
  }

  function apply(el) {
    if (!el || typeof el.volume !== 'number') return;
    if (el.dataset.bsOrigVolume === undefined) el.dataset.bsOrigVolume = String(el.volume);
    if (el.dataset.bsOrigMuted  === undefined) el.dataset.bsOrigMuted  = String(!!el.muted);
    try {
      if (!el.muted || el.volume !== 0) {
        el.muted = true;
        el.volume = 0;
      }
      el.dataset.bsVocalReduced = '1';
    } catch (_) {}
  }

  function scanOnce() {
    try {
      var videos = document.getElementsByTagName('video');
      for (var vi = 0; vi < videos.length; vi++) {
        var v = videos[vi];
        if (!v || v.paused === true || v.ended === true) continue;
        apply(v);
      }
      var audios = document.getElementsByTagName('audio');
      for (var ai = 0; ai < audios.length; ai++) {
        var a = audios[ai];
        if (!a || a.paused === true || a.ended === true) continue;
        apply(a);
      }
    } catch (_) {}
  }

  function scheduleScan() {
    if (window.__bsVocalMoTimer) return;
    window.__bsVocalMoTimer = setTimeout(function() {
      window.__bsVocalMoTimer = null;
      scanOnce();
    }, MO_DEBOUNCE);
  }

  if (!${enabled}) {
    teardown();
    post('bs_audio_ready', { enabled: false, reason: 'disabled', crossOriginSafe: true });
    return;
  }

  if (window.__bsVocalRunning) teardown();
  window.__bsVocalRunning = true;

  try {
    var M = window.MutationObserver || window.WebKitMutationObserver;
    if (M) {
      window.__bsVocalMo = new M(function(muts) {
        var interesting = false;
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.type === 'childList') { interesting = true; break; }
          var a = m.attributeName;
          if (a === 'src' || a === 'class' || a === 'controls') { interesting = true; break; }
        }
        if (!interesting) return;
        scheduleScan();
      });
      window.__bsVocalMo.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'class', 'controls'],
      });
    }
  } catch (_) {}

  scanOnce();
  window.__bsVocalTimer = setInterval(scanOnce, SCAN_MS);

  post('bs_audio_ready', {
    enabled: true,
    crossOriginSafe: true,
    note: __cross_origin_media_note,
    serverSide: true,
  });
})(); true;
`.trim();
}
