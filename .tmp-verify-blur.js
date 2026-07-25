const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(path.join(process.cwd(), 'artifacts/blurshield-ai/lib/blurScript.ts'), 'utf8');
const start = src.indexOf('return `');
const end = src.indexOf('`.trim();', start);
let script = src.slice(start + 'return `'.length, end);
script = script.replace(/\$\{enabled\}/g, 'true')
  .replace(/\$\{target\}/g, 'everyone')
  .replace(/\$\{method\}/g, 'faces')
  .replace(/\$\{blurPx\}/g, '32');
const dom = new JSDOM('<!doctype html><html><body><video id="v"></video></body></html>', { runScripts: 'outside-only' });
const { window } = dom;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.HTMLElement = window.HTMLElement;
global.HTMLVideoElement = window.HTMLVideoElement;
global.HTMLCanvasElement = window.HTMLCanvasElement;
global.getComputedStyle = window.getComputedStyle;
global.Image = window.Image;
global.MutationObserver = window.MutationObserver;
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
window.performance = window.performance;
global.history = window.history;
window.ReactNativeWebView = { postMessage: () => {} };
window.FaceDetector = class { async detect() { return [{ boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.3 } }]; } };
const video = document.getElementById('v');
Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
Object.defineProperty(video, 'videoWidth', { value: 1280, configurable: true });
Object.defineProperty(video, 'videoHeight', { value: 720, configurable: true });
Object.defineProperty(video, 'clientWidth', { value: 640, configurable: true });
Object.defineProperty(video, 'clientHeight', { value: 360, configurable: true });
Object.defineProperty(video, 'isConnected', { value: true, configurable: true });
Object.defineProperty(video, 'getBoundingClientRect', { value: () => ({ left: 100, top: 200, width: 640, height: 360 }), configurable: true });
document.body.appendChild(video);
new Function(script)();
setTimeout(() => {
  const layer = document.getElementById('__bsFaceOverlayLayer');
  const canvases = document.querySelectorAll('canvas');
  console.log(JSON.stringify({
    layer: !!layer,
    canvasCount: canvases.length,
    canvasVisible: canvases[0] && canvases[0].style.display !== ''
  }, null, 2));
}, 150);
