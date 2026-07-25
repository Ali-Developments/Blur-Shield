const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, '..', 'lib', 'blurScript.ts');
const source = fs.readFileSync(sourcePath, 'utf8');

assert.ok(
  source.includes("el.muted = true;") && source.includes("el.dataset.bsOrigMuted = String(!!el.muted);"),
  'expected the vocal filter to preserve and restore muted state while silencing media',
);

assert.ok(
  !source.includes("el.tagName === 'VIDEO'") || !source.includes("el.volume = 0;\n        el.muted = false;"),
  'expected the vocal filter to avoid forcing video volume to zero',
);

console.log('vocal filter regression checks passed');
