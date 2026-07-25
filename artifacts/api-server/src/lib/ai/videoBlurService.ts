import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { isPythonResolved, resolvePython } from './pythonResolver';
import { buildWorkerEnvironment } from './workerEnvironment.js';

export type BlurTarget = 'everyone' | 'males' | 'females';
export type BlurMethod = 'faces' | 'fullBody';

export type VideoBlurJobStatus = 'queued' | 'processing' | 'done' | 'error';

export interface VideoBlurJob {
  id: string;
  status: VideoBlurJobStatus;
  stage: string;
  progress: number;
  message: string;
  error?: string;
  resultPath?: string;
  createdAt: number;
  outputPath: string;
  statusFile: string;
}

interface CreateVideoBlurJobParams {
  inputPath: string;
  outputPath?: string;
  statusFile?: string;
  frameStep?: number;
  blurStrength?: number;
  facesOnly?: boolean;
  method?: BlurMethod;
  target?: BlurTarget;
}

const jobs = new Map<string, VideoBlurJob>();

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

export function getVideoBlurJob(jobId: string): VideoBlurJob | undefined {
  return jobs.get(jobId);
}

export function createVideoBlurJob(params: CreateVideoBlurJobParams): VideoBlurJob {
  const jobId = uuidv4();
  const outputPath = params.outputPath ?? path.join(os.tmpdir(), `blurshield_video_${jobId}.mp4`);
  const statusFile = params.statusFile ?? path.join(os.tmpdir(), `blurshield_video_${jobId}.json`);

  const job: VideoBlurJob = {
    id: jobId,
    status: 'queued',
    stage: 'queued',
    progress: 0,
    message: 'Video blur job queued…',
    createdAt: Date.now(),
    outputPath,
    statusFile,
  };

  jobs.set(jobId, job);

  const workerDir = resolveWorkerDirectory('video_blur_worker.py');
  const scriptPath = path.join(workerDir, 'video_blur_worker.py');

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

  const frameStep = params.frameStep ?? 2;
  const blurStrength = params.blurStrength ?? 30;
  const method = params.method ?? 'faces';
  const target = params.target ?? 'everyone';

  const proc = spawn(
    pythonBinary,
    [
      scriptPath,
      '--input',
      params.inputPath,
      '--output',
      outputPath,
      '--status-file',
      statusFile,
      '--frame-step',
      String(frameStep),
      '--blur-strength',
      String(blurStrength),
      '--method',
      method,
      '--target',
      target,
      '--confidence',
      '0.25',
      '--tracking-max-misses',
      '6',
      '--tracking-reid-iou',
      '0.25',
      ...((params.facesOnly ?? method === 'faces') ? ['--faces-only'] : []),
    ],
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
  job.message = 'Starting offline video blur worker…';

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
      // Ignore transient status parse issues during processing.
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
        job.message = parsed.message ?? 'Faces and body regions blurred successfully.';
        return;
      }
      if (parsed.error) {
        job.error = parsed.error;
      }
    } catch {
      // Fall back to a generic error below.
    }

    job.status = 'error';
    job.error = job.error ?? `Video blur worker exited with code ${code ?? 'unknown'}`;
    job.message = job.error;
  });

  proc.on('error', (error) => {
    clearInterval(pollTimer);
    job.status = 'error';
    job.error = `Failed to spawn video blur worker (${pythonBinary}): ${error.message}`;
    job.message = job.error;
  });

  return job;
}

export function getVideoBlurResultPath(jobId: string): string | undefined {
  return getVideoBlurJob(jobId)?.resultPath;
}
