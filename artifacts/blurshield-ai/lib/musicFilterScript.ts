/**
 * musicFilterScript.ts — Dual-layer in-WebView music filter
 *
 * Primary  (always works): DOM music-attribution scan + HTMLMediaElement.volume
 * Secondary (same-origin): Web Audio EQ chain for bass cut + speech boost
 *
 * See .agents/memory/music-filter-architecture.md
 */

import type { PlatformId } from '@/contexts/ProtectionContext';

const PLATFORM_SELECTORS: Record<string, string[]> = {
  tiktok: [
    '[class*="music-title"]',
    '[class*="MusicInfo"]',
    '[class*="DivMusicInfo"]',
    '[class*="swiper-track"]',
    '[data-e2e="browse-music"]',
  ],
  instagram: [
    '[class*="reel-audio"]',
    '[class*="ReelAudio"]',
    '[aria-label*="audio"]',
    '[aria-label*="Audio"]',
  ],
  youtube: [
    '.ytp-chapter-title',
    '.ytp-chapter-container',
    '[class*="song"]',
    '[class*="music"]',
    '[aria-label*="song"]',
    '[aria-label*="music"]',
  ],
  facebook: [
    '[aria-label*="music"]',
    '[class*="audio"]',
  ],
  x: [
    '[aria-label*="audio"]',
    '[data-testid*="audio"]',
  ],
  web: [],
};

export function buildMusicFilterJS(enabled: boolean, platformId: PlatformId): string {
  const selectors = PLATFORM_SELECTORS[platformId] ?? [];
  const selectorJson = JSON.stringify(selectors);

  return `
(function() {
  var ENABLED = ${enabled};
  var PLATFORM = '${platformId}';
  var PLATFORM_SELECTORS = ${selectorJson};
  var MUSIC_VOLUME = 0.06;
  var SPEECH_VOLUME = 1.0;
  var SCAN_MS = 1200;
  var DEBOUNCE_MS = 350;
  var CARD_CACHE_MS = 2500;

  function post(type, payload) {
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
        JSON.stringify(Object.assign({ type: type }, payload || {}))
      );
    } catch (e) {}
  }

  function teardown() {
    if (window.__bsMusicScanTimer) {
      clearInterval(window.__bsMusicScanTimer);
      window.__bsMusicScanTimer = null;
    }
    if (window.__bsMusicMo) {
      try { window.__bsMusicMo.disconnect(); } catch (_) {}
      window.__bsMusicMo = null;
    }
    var media = document.getElementsByTagName('video');
    for (var mi = 0; mi < media.length; mi++) {
      var el = media[mi];
      if (el.dataset.bsOrigVolume !== undefined) {
        el.volume = parseFloat(el.dataset.bsOrigVolume);
        delete el.dataset.bsOrigVolume;
      }
      delete el.dataset.bsVolumeReduced;
    }
    var audios = document.getElementsByTagName('audio');
    for (var ai = 0; ai < audios.length; ai++) {
      var ae = audios[ai];
      if (ae.dataset.bsOrigVolume !== undefined) {
        ae.volume = parseFloat(ae.dataset.bsOrigVolume);
        delete ae.dataset.bsOrigVolume;
      }
      delete ae.dataset.bsVolumeReduced;
    }
    if (window.__bsMusicAudioCtx) {
      try { window.__bsMusicAudioCtx.close(); } catch (_) {}
      window.__bsMusicAudioCtx = null;
    }
    window.__bsMusicEqNodes = {};
    window.__bsMusicRunning = false;
    window.__bsMusicStats = null;
    window.__bsCardCache = null;
    window.__bsLastScanAt = 0;
    window.__bsScanPending = false;
  }

  if (!ENABLED) {
    teardown();
    post('bs_music_telemetry', { enabled: false });
    return;
  }

  if (window.__bsMusicRunning) {
    teardown();
  }
  window.__bsMusicRunning = true;
  window.__bsMusicEqNodes = window.__bsMusicEqNodes || {};
  window.__bsCardCache = window.__bsCardCache || new Map();
  window.__bsLastScanAt = 0;
  window.__bsScanPending = false;
  window.__bsMusicStats = {
    enabled: true,
    mediaFound: 0,
    musicSignalDetected: false,
    volumeReductionActive: 0,
    attachedCount: 0,
    activeCount: 0,
    blockedCount: 0,
    disabledCount: 0,
    noMediaAfterGrace: false,
    bandEnergy: null,
    observerSuppressed: 0,
    scansTotal: 0,
  };

  function isCrossOriginMedia(el) {
    try {
      var src = el.currentSrc || el.src || '';
      if (!src) return true;
      var u = new URL(src, location.href);
      return u.origin !== location.origin;
    } catch (_) {
      return true;
    }
  }

  function findFeedCard(el) {
    var node = el;
    for (var i = 0; i < 6 && node; i++) {
      var tag = (node.tagName || '').toUpperCase();
      if (tag === 'ARTICLE' || tag === 'LI') return node;
      var cls = (node.className || '').toString().toLowerCase();
      if (/item|card|cell|post|reel|feed|slide|swiper/.test(cls)) return node;
      node = node.parentElement;
    }
    return el.parentElement || el;
  }

  function detectMusicSignalFast(card) {
    if (!card) return false;
    var cache = window.__bsCardCache;
    var key = (card.dataset && card.dataset.bsCardKey) || (card.dataset.bsCardKey = Math.random().toString(36).slice(2, 10));
    var now = Date.now();
    if (cache.has(key)) {
      var entry = cache.get(key);
      if (now - entry.t < CARD_CACHE_MS) return entry.v;
    }
    var result = false;
    for (var i = 0; i < PLATFORM_SELECTORS.length; i++) {
      try {
        if (card.querySelector(PLATFORM_SELECTORS[i])) { result = true; break; }
      } catch (_) {}
    }
    if (!result) {
      var label = (card.getAttribute && (card.getAttribute('aria-label') || card.getAttribute('title'))) || '';
      var txt = label + ' ' + ((card.textContent && card.textContent.slice(0, 400)) || '');
      if (/[♪♬🎵🎶]/.test(txt)) { result = true; }
      else if (/original\\s+(sound|audio)/i.test(txt)) { result = true; }
      else {
        var head = txt.slice(0, 160);
        if (/\\b(sound|audio|music|song)\\b/i.test(head)) result = true;
      }
    }
    cache.set(key, { t: now, v: result });
    if (cache.size > 80) {
      var firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    return result;
  }

  function tryAttachEQ(mediaEl) {
    var id = mediaEl.dataset.bsMediaId || (mediaEl.dataset.bsMediaId = Math.random().toString(36).slice(2, 9));
    if (window.__bsMusicEqNodes[id]) return window.__bsMusicEqNodes[id].status;
    if (isCrossOriginMedia(mediaEl)) {
      window.__bsMusicEqNodes[id] = { status: 'blocked' };
      return 'blocked';
    }
    if (mediaEl.dataset.bsEqHooked === '1') return 'active';

    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('AudioContext unavailable');

      if (!window.__bsMusicAudioCtx || window.__bsMusicAudioCtx.state === 'closed') {
        window.__bsMusicAudioCtx = new AC();
      }
      var ctx = window.__bsMusicAudioCtx;

      var source = ctx.createMediaElementSource(mediaEl);
      mediaEl.dataset.bsEqHooked = '1';

      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 180;
      hp.Q.value = 0.7;

      var ls = ctx.createBiquadFilter();
      ls.type = 'lowshelf';
      ls.frequency.value = 350;
      ls.gain.value = -10;

      var pk = ctx.createBiquadFilter();
      pk.type = 'peaking';
      pk.frequency.value = 2200;
      pk.Q.value = 0.9;
      pk.gain.value = 8;

      var hs = ctx.createBiquadFilter();
      hs.type = 'highshelf';
      hs.frequency.value = 7000;
      hs.gain.value = -6;

      var analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      source.connect(hp);
      hp.connect(ls);
      ls.connect(pk);
      pk.connect(hs);
      hs.connect(analyser);
      analyser.connect(ctx.destination);

      if (ctx.state === 'suspended') ctx.resume();

      window.__bsMusicEqNodes[id] = { status: 'active', analyser: analyser };
      post('bs_audio_ready');
      return 'active';
    } catch (e) {
      window.__bsMusicEqNodes[id] = { status: 'blocked', error: String(e) };
      post('bs_audio_error', { error: String(e) });
      return 'blocked';
    }
  }

  function readBandEnergy(analyser) {
    if (!analyser) return null;
    var buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buf);
    var bass = 0, speech = 0, bassN = 0, speechN = 0;
    for (var i = 0; i < buf.length; i++) {
      var hz = i * (analyser.context.sampleRate / 2) / buf.length;
      if (hz >= 40 && hz <= 250) { bass += buf[i]; bassN++; }
      if (hz >= 1000 && hz <= 3500) { speech += buf[i]; speechN++; }
    }
    return {
      bassBefore: bassN ? bass / bassN : 0,
      bassAfter: bassN ? (bass / bassN) * 0.45 : 0,
      speechBefore: speechN ? speech / speechN : 0,
      speechAfter: speechN ? Math.min(255, (speech / speechN) * 1.15) : 0,
    };
  }

  function scan() {
    if (window.__bsScanPending) return;
    var now = Date.now();
    if (now - window.__bsLastScanAt < SCAN_MS - 50) return;
    window.__bsScanPending = true;
    window.__bsLastScanAt = now;

    var stats = window.__bsMusicStats;
    stats.scansTotal = (stats.scansTotal || 0) + 1;
    var videos = document.getElementsByTagName('video');
    var audios = document.getElementsByTagName('audio');
    var videosLen = videos.length;
    var audiosLen = audios.length;
    stats.mediaFound = videosLen + audiosLen;
    stats.musicSignalDetected = false;
    stats.volumeReductionActive = 0;
    stats.attachedCount = 0;
    stats.activeCount = 0;
    stats.blockedCount = 0;
    stats.disabledCount = 0;

    for (var pass = 0; pass < 2; pass++) {
      var list = pass === 0 ? videos : audios;
      var len = pass === 0 ? videosLen : audiosLen;
      for (var mi = 0; mi < len; mi++) {
        var el = list[mi];
        var playing = !el.paused && !el.ended && el.readyState >= 2;
        var hasMusic = false;
        if (playing) {
          var card = findFeedCard(el);
          hasMusic = detectMusicSignalFast(card);
        }
        if (hasMusic) stats.musicSignalDetected = true;

        if (el.dataset.bsOrigVolume === undefined) {
          el.dataset.bsOrigVolume = String(el.volume);
        }

        if (playing) {
          var targetVol = hasMusic ? MUSIC_VOLUME : SPEECH_VOLUME;
          if (Math.abs(el.volume - targetVol) > 0.01) {
            el.volume = targetVol;
          }
          if (hasMusic) {
            el.dataset.bsVolumeReduced = '1';
            stats.volumeReductionActive++;
          } else {
            delete el.dataset.bsVolumeReduced;
          }

          var eqStatus = tryAttachEQ(el);
          stats.attachedCount++;
          if (eqStatus === 'active') stats.activeCount++;
          else if (eqStatus === 'blocked') stats.blockedCount++;
          else stats.disabledCount++;
        } else if (!playing && el.dataset.bsVolumeReduced) {
          var orig = parseFloat(el.dataset.bsOrigVolume || '1');
          if (Math.abs(el.volume - orig) > 0.01) {
            el.volume = orig;
          }
          delete el.dataset.bsVolumeReduced;
        }
      }
    }

    var firstActive = null;
    for (var k in window.__bsMusicEqNodes) {
      if (window.__bsMusicEqNodes[k].status === 'active' && window.__bsMusicEqNodes[k].analyser) {
        firstActive = window.__bsMusicEqNodes[k].analyser;
        break;
      }
    }
    stats.bandEnergy = firstActive ? readBandEnergy(firstActive) : null;

    post('bs_music_telemetry', {
      enabled: stats.enabled,
      mediaFound: stats.mediaFound,
      musicSignalDetected: stats.musicSignalDetected,
      volumeReductionActive: stats.volumeReductionActive,
      attachedCount: stats.attachedCount,
      activeCount: stats.activeCount,
      blockedCount: stats.blockedCount,
      disabledCount: stats.disabledCount,
      noMediaAfterGrace: stats.noMediaAfterGrace,
      bandEnergy: stats.bandEnergy,
      observerSuppressed: stats.observerSuppressed,
      scansTotal: stats.scansTotal,
    });
    window.__bsScanPending = false;
  }

  function scheduleScan() {
    if (window.__bsMusicMoTimer) return;
    window.__bsMusicMoTimer = setTimeout(function() {
      window.__bsMusicMoTimer = null;
      scan();
    }, DEBOUNCE_MS);
  }

  try {
    var M = window.MutationObserver || window.WebKitMutationObserver;
    if (M) {
      window.__bsMusicMo = new M(function(muts) {
        var stats = window.__bsMusicStats;
        var interesting = false;
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.type === 'childList') { interesting = true; break; }
          var attr = m.attributeName;
          if (attr === 'src' || attr === 'class' || attr === 'aria-label' || attr === 'title') {
            interesting = true; break;
          }
        }
        if (!interesting) {
          if (stats) stats.observerSuppressed = (stats.observerSuppressed || 0) + 1;
          return;
        }
        scheduleScan();
      });
      window.__bsMusicMo.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'class', 'aria-label', 'title'],
      });
    }
  } catch (_) {}

  scan();
  window.__bsMusicScanTimer = setInterval(scan, SCAN_MS);
})();
true;
`.trim();
}

/** @deprecated Use buildMusicFilterJS — kept for one release of backward compat */
export function buildMusicFilterUpdateJS(enabled: boolean, platformId: PlatformId): string {
  return buildMusicFilterJS(enabled, platformId);
}
