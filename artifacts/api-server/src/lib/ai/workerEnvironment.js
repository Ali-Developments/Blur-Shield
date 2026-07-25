import fs from 'fs';
import path from 'path';

function discoverFfmpegPath(env = process.env) {
  const candidates = [];

  if (env.FFMPEG_PATH) {
    candidates.push(env.FFMPEG_PATH);
  }

  for (const entry of (env.PATH ?? '').split(path.delimiter)) {
    if (entry) {
      candidates.push(entry);
    }
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.endsWith('.exe') && fs.existsSync(candidate)) {
      return candidate;
    }
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      for (const name of ['ffmpeg.exe', 'ffmpeg']) {
        const fullPath = path.join(candidate, name);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }
  }

  return undefined;
}

export function buildWorkerEnvironment(baseEnv = process.env, overrides = {}) {
  const env = { ...baseEnv, ...overrides };
  const ffmpegPath = overrides.FFMPEG_PATH ?? baseEnv.FFMPEG_PATH ?? discoverFfmpegPath(baseEnv);

  if (ffmpegPath) {
    env.FFMPEG_PATH = ffmpegPath;
    const ffmpegDir = path.dirname(ffmpegPath);
    const paths = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
    if (!paths.includes(ffmpegDir)) {
      env.PATH = [ffmpegDir, ...paths].join(path.delimiter);
    }
  }

  return env;
}
