import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { isPythonResolved, resolvePython } from './pythonResolver';
import { buildWorkerEnvironment } from './workerEnvironment.js';

export type AudioSeparationJobStatus = 'queued' | 'processing' | 'done' | 'error';

export interface AudioSeparationJob {
  id: string;
  status: AudioSeparationJobStatus;
  stage: string;
  progress: number;
  message: string;
  error?: string;
  resultPath?: string;
  createdAt: number;
  outputPath: string;
  statusFile: string;
}

interface CreateAudioSeparationJobParams {
  inputPath: string;
  outputPath?: string;
  statusFile?: string;
}

const jobs = new Map<string, AudioSeparationJob>();

function cleanupExpiredJobs() {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      if (job.resultPath) fs.rmSync(job.resultPath, { force: true });
      if (job.statusFile) fs.rmSync(job.statusFile, { force: true });
      jobs.delete(id);
    }
  }
}

setInterval(cleanupExpiredJobs, 10 * 60_000);

function resolveWorkerDirectory(scriptName: string): string {
  const candidates = [
    process.cwd(),
    path.join(process.cwd(), 'artifacts', 'api-server'),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '..', '..'),
  ];
  return candidates.find((directory) => fs.existsSync(path.join(directory, scriptName))) ?? process.cwd();
}

export function getAudioSeparationJob(jobId: string): AudioSeparationJob | undefined {
  return jobs.get(jobId);
}

export function createAudioSeparationJob(params: CreateAudioSeparationJobParams): AudioSeparationJob {
  const jobId = uuidv4();
  const outputPath = params.outputPath ?? path.join(os.tmpdir(), `blurshield_audio_${jobId}.mp3`);
  const statusFile = params.statusFile ?? path.join(os.tmpdir(), `blurshield_audio_${jobId}.json`);

  const job: AudioSeparationJob = {
    id: jobId,
    status: 'queued',
    stage: 'queued',
    progress: 0,
    message: 'Audio separation job queued…',
    createdAt: Date.now(),
    outputPath,
    statusFile,
  };

  jobs.set(jobId, job);

  const workerDir = resolveWorkerDirectory('audio_separator_worker.py');
  const scriptPath = path.join(workerDir, 'audio_separator_worker.py');

  // ── Resolve Python executable ────────────────────────────────────────────
  // resolvePython probes absolute paths with fs.existsSync and bare names via
  // spawnSync so PATH-resident executables are found correctly.  Result is
  // cached after the first call so subsequent jobs are instant.
  const pythonResult = resolvePython(workerDir);

  if (!isPythonResolved(pythonResult)) {
    job.status = 'error';
    job.error = pythonResult.error;
    job.message = pythonResult.error;
    return job;
  }

  const pythonBinary = pythonResult.executable;

  const proc = spawn(
    pythonBinary,
    [scriptPath, '--input', params.inputPath, '--output', outputPath, '--status-file', statusFile],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildWorkerEnvironment(process.env, {
        FFMPEG_PATH: process.env.FFMPEG_PATH ?? 'C:\\Users\\foren\\AppData\\Local\\Temp\\ffmpeg\\ffmpeg-master-latest-win64-gpl\\bin\\ffmpeg.exe',
      }),
    },
  );

  job.status = 'processing';
  job.stage = 'starting';
  job.progress = 5;
  job.message = 'Starting local audio separation worker…';

  let stdoutBuffer = '';
  proc.stdout.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString();
  });

  proc.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) {
      job.message = text.slice(-400);
    }
  });

  const pollStatus = () => {
    try {
      if (!fs.existsSync(statusFile)) return;
      const status = JSON.parse(fs.readFileSync(statusFile, 'utf8')) as Record<string, unknown>;
      job.stage = String(status.stage ?? job.stage);
      job.progress = Number(status.progress ?? job.progress);
      job.message = String(status.message ?? job.message);
    } catch {
      // Ignore transient status parsing errors.
    }
  };

  const pollTimer = setInterval(pollStatus, 1500);

  proc.on('close', (code) => {
    clearInterval(pollTimer);
    if (fs.existsSync(statusFile)) {
      try {
        const status = JSON.parse(fs.readFileSync(statusFile, 'utf8')) as Record<string, unknown>;
        job.stage = String(status.stage ?? job.stage);
        job.progress = Number(status.progress ?? job.progress);
        job.message = String(status.message ?? job.message);
      } catch {
        // Already handled.
      }
    }

    try {
      const parsed = JSON.parse(stdoutBuffer.trim().split('\n').pop() ?? '{}');
      if (parsed.success && fs.existsSync(outputPath)) {
        job.status = 'done';
        job.progress = 100;
        job.resultPath = outputPath;
        job.message = parsed.message ?? 'Speech preserved and background audio reduced.';
        return;
      }
      if (parsed.error) {
        job.error = parsed.error;
      }
    } catch {
      // Fall back to generic error below.
    }

    job.status = 'error';
    job.error = job.error ?? `Audio separation worker exited with code ${code ?? 'unknown'}`;
    job.message = job.error;
  });

  proc.on('error', (error) => {
    clearInterval(pollTimer);
    job.status = 'error';
    job.error = `Failed to spawn audio separation worker (${pythonBinary}): ${error.message}`;
    job.message = job.error;
  });

  return job;
}

export function getAudioSeparationResultPath(jobId: string): string | undefined {
  return getAudioSeparationJob(jobId)?.resultPath;
}
