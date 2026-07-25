const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

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
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.performance = window.performance;

const src = fs.readFileSync(path.join(process.cwd(), 'artifacts/blurshield-ai/lib/blurScript.ts'), 'utf8');
const start = src.indexOf('return `');
const end = src.indexOf('`.trim();', start);
if (start === -1 || end === -1) {
  throw new Error('Could not locate blur script payload');
}

let script = src.slice(start + 'return `'.length, end);
script = script.replace(/\$\{enabled\}/g, 'true');
script = script.replace(/\$\{target\}/g, 'everyone');
script = script.replace(/\$\{method\}/g, 'faces');
script = script.replace(/\$\{blurPx\}/g, '32');

try {
  const fn = new Function(script);
  fn();
  console.log('injected');
} catch (err) {
  console.error('INIT_ERR');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
