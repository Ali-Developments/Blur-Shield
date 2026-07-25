import { Router } from "express";
import type { Request, Response } from "express";

const PLATFORM_TARGETS: Record<string, string> = {
  youtube:   "https://m.youtube.com",
  tiktok:    "https://www.tiktok.com",
  instagram: "https://www.instagram.com",
  facebook:  "https://m.facebook.com",
  x:         "https://x.com",
  web:       "https://www.google.com",
};

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 BlurShield/1.0";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1 BlurShield/1.0";

const STRIP_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "transfer-encoding",
  "content-encoding",
  "strict-transport-security",
  "permissions-policy",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
]);

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

const router = Router();

function pickUserAgent(platform: string, reqHeaders: Request["headers"]): string {
  const incoming = (reqHeaders["user-agent"] as string | undefined) ?? "";
  if (incoming && incoming.length > 20) return incoming;
  if (platform === "tiktok" || platform === "instagram") return DESKTOP_UA;
  return MOBILE_UA;
}

async function proxyRequest(req: Request, res: Response) {
  const parts = req.path.split("/").filter(Boolean);
  const platform = parts[0];
  const targetBase = PLATFORM_TARGETS[platform];
  if (!targetBase) {
    res.status(404).send("Unknown platform. Supported: " + Object.keys(PLATFORM_TARGETS).join(", "));
    return;
  }

  const afterPlatform = "/" + parts.slice(1).join("/");
  const qs = req.url.includes("?") ? "?" + req.url.split("?").slice(1).join("?") : "";
  const targetUrl = targetBase + afterPlatform + qs;
  const requestId = Math.random().toString(36).slice(2, 8);

  try {
    const forwardedHeaders: Record<string, string> = {
      "User-Agent":      pickUserAgent(platform, req.headers),
      "Accept":          (req.headers["accept"] as string) ?? "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": (req.headers["accept-language"] as string) ?? "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Referer":         targetBase + "/",
      "Sec-Fetch-Dest":  "document",
      "Sec-Fetch-Mode":  "navigate",
      "Sec-Fetch-Site":  "none",
      "Sec-Fetch-User":  "?1",
      "Upgrade-Insecure-Requests": "1",
    };

    if (req.headers["cookie"]) {
      forwardedHeaders["Cookie"] = req.headers["cookie"] as string;
    }
    if (req.headers["dnt"]) {
      forwardedHeaders["DNT"] = req.headers["dnt"] as string;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardedHeaders,
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const upstreamTarget = new URL(upstream.url);
    const upstreamHostname = upstreamTarget.hostname;

    for (const [key, value] of upstream.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (STRIP_HEADERS.has(lowerKey)) continue;
      if (HOP_BY_HOP.has(lowerKey)) continue;
      if (lowerKey === "set-cookie") {
        const cookies = upstream.headers.getSetCookie();
        for (const cookie of cookies) {
          const cleaned = cookie
            .replace(/;\s*domain=[^;]+/gi, "")
            .replace(/;\s*secure/gi, "")
            .replace(/;\s*samesite=(none|strict|lax)/gi, "; SameSite=Lax");
          res.append("Set-Cookie", cleaned);
        }
        continue;
      }
      if (lowerKey === "location") {
        try {
          const abs = new URL(value, targetBase);
          const matchingEntry = Object.entries(PLATFORM_TARGETS).find(
            ([_p, base]) => new URL(base).hostname === abs.hostname,
          );
          if (matchingEntry) {
            const [p] = matchingEntry;
            res.setHeader(key, `/api/browse/${p}${abs.pathname}${abs.search}`);
            continue;
          }
        } catch {}
      }
      res.setHeader(key, value);
    }

    const contentType = upstream.headers.get("content-type") ?? "";

    if (contentType.includes("text/html")) {
      let html: string;
      try {
        html = await upstream.text();
      } catch (e) {
        res.status(502).send(`Failed to decode response from ${targetUrl}: ${String(e)}`);
        return;
      }
      const proxyPath = `/api/browse/${platform}`;

      html = html.replace(
        /<meta[^>]+http-equiv=["']content-security-policy["'][^>]*>/gi,
        "",
      );
      html = html.replace(
        /<meta[^>]+http-equiv=["']permissions-policy["'][^>]*>/gi,
        "",
      );

      html = html.replace(
        /(<head[^>]*>)/i,
        `$1\n<base href="${targetBase}/">`,
      );

      const bridgeScript = `
<script nonce="blurshield-bridge">
(function () {
  'use strict';
  var PLATFORM_BASE = '${targetBase}';
  var PROXY_PATH    = '${proxyPath}';
  var PLATFORM_HOST = new URL(PLATFORM_BASE).hostname;
  if (!window.ReactNativeWebView) {
    window.ReactNativeWebView = {
      postMessage: function (data) {
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage(data, '*');
          }
        } catch (_) {}
      }
    };
  }
  document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el.tagName !== 'A') el = el.parentElement;
    if (!el) return;
    var href = el.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    var target = el.getAttribute('target');
    if (target && target !== '_self' && target !== '') return;
    try {
      var url = new URL(href, PLATFORM_BASE);
      if (url.hostname === PLATFORM_HOST) {
        e.preventDefault();
        window.location.href = PROXY_PATH + url.pathname + url.search + url.hash;
      }
    } catch (_) {}
  }, true);
  function wrapHistory(method) {
    var orig = history[method];
    history[method] = function (state, title, url) {
      if (url) {
        try {
          var abs = new URL(typeof url === 'string' ? url : String(url), PLATFORM_BASE);
          if (abs.hostname === PLATFORM_HOST) {
            url = PROXY_PATH + abs.pathname + abs.search;
          }
        } catch (_) {}
      }
      return orig.call(this, state, title, url);
    };
  }
  wrapHistory('pushState');
  wrapHistory('replaceState');
  window.addEventListener('popstate', function () {
    try {
      var loc = new URL(window.location.href, PLATFORM_BASE);
    } catch (_) {}
  }, true);
  window.__blurshield_ready = true;
  try { window.dispatchEvent(new CustomEvent('blurshield:bridge-ready')); } catch (_) {}
})();
</script>`;

      const headCloseIndex = html.lastIndexOf("</head>");
      if (headCloseIndex !== -1) {
        html = html.slice(0, headCloseIndex) + bridgeScript + "\n" + html.slice(headCloseIndex);
      } else {
        html = bridgeScript + html;
      }

      res.status(upstream.status);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("X-BlurShield-Proxy", "active");
      res.setHeader("X-Request-Id", requestId);
      res.send(html);
      return;
    }

    const buf = await upstream.arrayBuffer();
    res.status(upstream.status);
    res.setHeader("X-BlurShield-Proxy", "active");
    res.setHeader("X-Request-Id", requestId);
    res.send(Buffer.from(buf));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).type("text/plain").send(
      `[blurshield proxy ${requestId}] error fetching ${targetUrl}\n${msg}`,
    );
  }
}

router.use(proxyRequest);

export default router;
