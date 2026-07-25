import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkerEnvironment } from '../src/lib/ai/workerEnvironment.js';

test('buildWorkerEnvironment preserves ffmpeg path and existing PATH', () => {
  const env = buildWorkerEnvironment({ CUSTOM: 'value' }, {
    FFMPEG_PATH: 'C:/ffmpeg/bin/ffmpeg.exe',
    PATH: 'C:/existing/bin',
  });

  assert.equal(env.FFMPEG_PATH, 'C:/ffmpeg/bin/ffmpeg.exe');
  assert.equal(env.CUSTOM, 'value');
  assert.match(env.PATH, /C:\/existing\/bin/);
});
