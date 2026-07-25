const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'artifacts/blurshield-ai/lib/blurScript.ts'), 'utf8');
  const start = src.indexOf('return `');
  const end = src.indexOf('`.trim();', start);
  if (start === -1 || end === -1) throw new Error('Could not locate blur script payload');
  let script = src.slice(start + 'return `'.length, end);
  script = script.replace(/\$\{enabled\}/g, 'true');
  script = script.replace(/\$\{target\}/g, 'everyone');
  script = script.replace(/\$\{method\}/g, 'faces');
  script = script.replace(/\$\{blurPx\}/g, '32');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.setContent(`<!doctype html><html><body style="margin:0;padding:0;background:#111"><div id="stage" style="position:relative;width:800px;height:450px;background:#222;padding:40px"><video id="v" style="position:relative;width:640px;height:360px;background:#000;border:2px solid #fff;display:block"></video></div></body></html>`);

  await page.evaluate(() => {
    window.ReactNativeWebView = { postMessage: () => {} };
    window.FaceDetector = class { async detect() { return [{ boundingBox: { x: 0.28, y: 0.18, width: 0.16, height: 0.24 } }]; } };
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    window.performance = { now: () => Date.now() };
  });

  await page.evaluate(async (payload) => {
    window.__bs_payload = payload;
    eval(payload);
    const video = document.getElementById('v');
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 });
    Object.defineProperty(video, 'clientWidth', { configurable: true, value: 640 });
    Object.defineProperty(video, 'clientHeight', { configurable: true, value: 360 });
    Object.defineProperty(video, 'isConnected', { configurable: true, value: true });
    Object.defineProperty(video, 'getBoundingClientRect', { configurable: true, value: () => ({ left: 200, top: 120, width: 640, height: 360 }) });
    Object.defineProperty(video, 'offsetWidth', { configurable: true, value: 640 });
    Object.defineProperty(video, 'offsetHeight', { configurable: true, value: 360 });
    Object.defineProperty(video, 'currentSrc', { configurable: true, value: 'mock-video' });
    Object.defineProperty(video, 'src', { configurable: true, value: 'mock-video' });
    document.body.appendChild(video);
    video.setAttribute('data-bs-test', '1');
  }, script);

  await page.waitForTimeout(1200);

  const report = await page.evaluate(() => {
    const layer = document.getElementById('__bsFaceOverlayLayer');
    const video = document.getElementById('v');
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const canvas = canvases[0] || null;
    const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
    const layerRect = layer ? layer.getBoundingClientRect() : null;
    const videoRect = video ? video.getBoundingClientRect() : null;
    const layerStyle = layer ? getComputedStyle(layer) : null;
    const videoStyle = video ? getComputedStyle(video) : null;
    const canvasStyle = canvas ? getComputedStyle(canvas) : null;
    let pixelCheck = null;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const data = ctx.getImageData(0, 0, Math.max(1, w), Math.max(1, h)).data;
      const alphaValues = Array.from({ length: Math.min(16, data.length / 4) }, (_, i) => data[i * 4 + 3]);
      const nonZeroAlpha = alphaValues.some((a) => a > 0);
      pixelCheck = { width: w, height: h, nonZeroAlpha, sample: alphaValues.slice(0, 8) };
    }
    return {
      hasLayer: !!layer,
      layerTag: layer && layer.tagName,
      layerZIndex: layerStyle && layerStyle.zIndex,
      layerPosition: layerStyle && layerStyle.position,
      videoZIndex: videoStyle && videoStyle.zIndex,
      canvasCount: canvases.length,
      hasCanvas: !!canvas,
      canvasHasParent: !!(canvas && canvas.parentElement),
      canvasParentId: canvas && canvas.parentElement && canvas.parentElement.id,
      canvasStyle: canvasStyle && { left: canvasStyle.left, top: canvasStyle.top, width: canvasStyle.width, height: canvasStyle.height, opacity: canvasStyle.opacity, visibility: canvasStyle.visibility, display: canvasStyle.display },
      layerRect: layerRect && { left: layerRect.left, top: layerRect.top, width: layerRect.width, height: layerRect.height },
      videoRect: videoRect && { left: videoRect.left, top: videoRect.top, width: videoRect.width, height: videoRect.height },
      canvasRect: canvasRect && { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
      pixelCheck,
      overlayChildCount: layer ? layer.children.length : 0,
      elementAtCanvasCenter: (() => {
        try {
          const x = (canvasRect && canvasRect.left + canvasRect.width / 2) || 0;
          const y = (canvasRect && canvasRect.top + canvasRect.height / 2) || 0;
          return document.elementFromPoint(x, y)?.tagName;
        } catch (e) { return null; }
      })(),
      sameVideoInRenderer: !!(video && canvas && layer && layer.children.length > 0),
      videoId: video && video.id,
      layerChildrenTags: layer ? Array.from(layer.children).map((el) => el.tagName) : []
    };
  });

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
