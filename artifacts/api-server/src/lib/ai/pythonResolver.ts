/**
 * pythonResolver.ts
 * ─────────────────
 * Detects the best available Python 3 executable across environments
 * (Linux, macOS, Windows, Replit, venv, system PATH) without hardcoding
 * any single binary name.
 *
 * Resolution order:
 *  0. BLURSHIELD_PYTHON / PYTHON env override
 *  1. .venv relative to the worker script directory  (absolute → existsSync)
 *  2. .venv walking up the monorepo tree             (absolute → existsSync)
 *  3. Common absolute system paths                   (absolute → existsSync)
 *  4. Bare names resolved via PATH                   (spawnSync probe)
 *
 * Results are cached per workerDir so the probe runs at most once per
 * unique worker location in the lifetime of the process.
 *
 * IMPORTANT: Python is ONLY spawned by the api-server backend.
 * React Native / Expo clients must never import or call this module.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from '../logger';

// ── Result types ───────────────────────────────────────────────────────────────

export interface PythonResolved {
  executable: string;
}

export interface PythonMissing {
  error: string;
  checked: string[];
}

export type PythonResult = PythonResolved | PythonMissing;

export function isPythonResolved(r: PythonResult): r is PythonResolved {
  return 'executable' in r;
}

// ── Probe helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true if `p` is an absolute filesystem path that exists and is a
 * regular file (or symlink to one). Never uses PATH resolution.
 */
function existsOnDisk(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Returns true if the bare command name `name` resolves via the system PATH.
 * Uses spawnSync so we never create a dangling child process — the probe is
 * fire-and-forget with a 3-second timeout.
 *
 * A result of `ENOENT` means the binary is genuinely absent.
 * Any other outcome (exit 0, exit 1, etc.) means the binary was found.
 */
function existsOnPath(name: string): boolean {
  try {
    const result = spawnSync(name, ['--version'], {
      timeout: 3000,
      stdio: 'pipe',
      windowsHide: true,
    });
    // result.error is set only when the OS could not spawn the process.
    // ENOENT → binary not found on PATH.
    // ETIMEDOUT / other → binary exists but something went wrong running it.
    if (result.error) {
      return (result.error as NodeJS.ErrnoException).code !== 'ENOENT';
    }
    // status === null means the process was killed (timeout), but it was found.
    return true;
  } catch {
    return false;
  }
}

/** True if the binary starts and reports a Python version (rejects broken venv shims). */
function canRunPython(pythonPath: string): boolean {
  try {
    const result = spawnSync(pythonPath, ['--version'], {
      timeout: 5000,
      stdio: 'pipe',
      windowsHide: true,
    });
    if (result.error) return false;
    const out = `${result.stdout?.toString() ?? ''}${result.stderr?.toString() ?? ''}`;
    return result.status === 0 && /python/i.test(out);
  } catch {
    return false;
  }
}

function hasAiPackages(pythonPath: string): boolean {
  try {
    const result = spawnSync(
      pythonPath,
      ['-c', 'import typing_extensions, audio_separator, yt_dlp'],
      {
        timeout: 8000,
        stdio: 'pipe',
        windowsHide: true,
      },
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

function findVirtualEnvCandidates(baseDir: string): string[] {
  const candidates: string[] = [];
  try {
    const entries = fs.readdirSync(baseDir);
    for (const entry of entries) {
      if (!entry.startsWith('.venv')) continue;
      const envDir = path.join(baseDir, entry);
      candidates.push(path.join(envDir, 'bin', 'python3'));
      candidates.push(path.join(envDir, 'bin', 'python'));
      candidates.push(path.join(envDir, 'Scripts', 'python.exe'));
    }
  } catch {
    // ignore directories we cannot read
  }
  return candidates;
}

// ── Candidate list ─────────────────────────────────────────────────────────────

interface Candidate {
  path: string;
  kind: 'absolute' | 'bare';
}

function walkParentDirs(startDir: string, levels: number): string[] {
  const dirs: string[] = [startDir];
  let cur = startDir;
  for (let i = 0; i < levels; i++) {
    const parent = path.resolve(cur, '..');
    if (parent === cur) break;
    dirs.push(parent);
    cur = parent;
  }
  return dirs;
}

function buildCandidates(workerDir: string): Candidate[] {
  const searchRoots = walkParentDirs(workerDir, 5);
  const envCandidates: string[] = [];

  for (const root of searchRoots) {
    envCandidates.push(path.join(root, '.venv', 'bin', 'python3'));
    envCandidates.push(path.join(root, '.venv', 'bin', 'python'));
    envCandidates.push(path.join(root, '.venv', 'Scripts', 'python.exe'));
    envCandidates.push(...findVirtualEnvCandidates(root));
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    for (const version of ['Python310', 'Python311', 'Python312', 'Python313']) {
      envCandidates.push(path.join(localAppData, 'Programs', 'Python', version, 'python.exe'));
      envCandidates.push(path.join(localAppData, 'Programs', 'Python', version, 'python3.exe'));
    }
  }

  // Prefer short-path, manually provisioned Python environments when present.
  envCandidates.push('C:\\aienv\\Scripts\\python.exe');
  envCandidates.push('C:\\aienv\\Scripts\\python3.exe');

  const uniqueEnvCandidates = Array.from(new Set(envCandidates));

  return [
    ...uniqueEnvCandidates.map((p) => ({ path: p, kind: 'absolute' as const })),

    // ── Common absolute system paths ───────────────────────
    { path: '/usr/bin/python3',         kind: 'absolute' },
    { path: '/usr/local/bin/python3',   kind: 'absolute' },
    { path: '/usr/bin/python',          kind: 'absolute' },
    { path: '/usr/local/bin/python',    kind: 'absolute' },
    { path: 'C:\\Python314\\python.exe', kind: 'absolute' },
    { path: 'C:\\Python312\\python.exe', kind: 'absolute' },
    { path: 'C:\\Python311\\python.exe', kind: 'absolute' },
    { path: 'C:\\Python310\\python.exe', kind: 'absolute' },

    // ── PATH-resolved bare names (spawnSync probe) ─────────
    // Checked last — probing via PATH is slightly slower than a stat call.
    { path: 'python3', kind: 'bare' },
    { path: 'python',  kind: 'bare' },
    { path: 'py',      kind: 'bare' },
  ];
}

// ── Cache ──────────────────────────────────────────────────────────────────────

// Keyed by workerDir so each unique worker location probes its own venv.
const cache = new Map<string, PythonResult>();

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Resolve the best available Python executable for the given worker directory.
 *
 * Result is cached after the first successful probe — subsequent calls for the
 * same `workerDir` are instant.
 *
 * @param workerDir  Absolute path to the directory that contains the Python
 *                   worker scripts. Used to locate adjacent venv directories.
 */
export function resolvePython(workerDir: string): PythonResult {
  const cached = cache.get(workerDir);
  if (cached !== undefined) return cached;

  const checked: string[] = [];
  const runnableWithoutPackages: string[] = [];

  const envOverride =
    process.env.BLURSHIELD_PYTHON?.trim() ||
    process.env.PYTHON?.trim() ||
    '';

  const candidates: Candidate[] = [];
  if (envOverride) {
    candidates.push({
      path: envOverride,
      kind: path.isAbsolute(envOverride) ? 'absolute' : 'bare',
    });
  }
  candidates.push(...buildCandidates(workerDir));

  for (const { path: p, kind } of candidates) {
    checked.push(p);
    const found = kind === 'absolute' ? existsOnDisk(p) : existsOnPath(p);
    if (!found) continue;

    // Reject broken portable venv shims that point at another machine.
    if (!canRunPython(p)) {
      logger.info(
        { python: p, workerDir, kind },
        '[python-resolver] Python path exists but --version failed — skipping broken shim',
      );
      continue;
    }

    if (!hasAiPackages(p)) {
      runnableWithoutPackages.push(p);
      logger.info(
        { python: p, workerDir, kind },
        '[python-resolver] Python runnable but missing AI packages (audio_separator/yt_dlp) — keeping as fallback candidate',
      );
      continue;
    }

    logger.info(
      { python: p, workerDir, kind },
      '[python-resolver] Found Python executable — using this for AI worker processes',
    );
    const result: PythonResolved = { executable: p };
    cache.set(workerDir, result);
    return result;
  }

  // Prefer a runnable interpreter over "not found" so the worker can return a
  // clear ImportError instead of a misleading resolver miss.
  if (runnableWithoutPackages.length > 0) {
    const fallback = runnableWithoutPackages[0];
    logger.warn(
      { python: fallback, workerDir },
      '[python-resolver] Using Python without verified AI packages — worker may fail with ImportError',
    );
    const result: PythonResolved = { executable: fallback };
    cache.set(workerDir, result);
    return result;
  }

  const error =
    'Music removal backend could not find a working Python 3 interpreter. ' +
    `Checked ${checked.length} candidates. ` +
    'Install Python 3 with audio_separator + yt_dlp, create a .venv next to the api-server, ' +
    'or set BLURSHIELD_PYTHON to a working interpreter. The app will continue without music removal.';

  logger.error(
    { checked, workerDir },
    `[python-resolver] ${error}`,
  );

  const result: PythonMissing = { error, checked };
  cache.set(workerDir, result);
  return result;
}

/**
 * Clear the resolver cache (useful for testing).
 */
export function clearPythonResolverCache(): void {
  cache.clear();
}
