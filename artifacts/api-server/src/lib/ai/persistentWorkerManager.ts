import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { buildWorkerEnvironment } from './workerEnvironment.js';
import { isPythonResolved, resolvePython } from './pythonResolver';

export type WorkerRuntimeState = 'queued' | 'initializing' | 'model_ready' | 'processing' | 'encoding' | 'ready' | 'completed' | 'failed';

export interface ManagedJob {
  id: string;
  kind: 'youtube' | 'audio' | 'local';
  status: WorkerRuntimeState;
  stage: string;
  progress: number;
  message: string;
  streamingReady: boolean;
  error?: string;
  resultPath?: string;
  inputPath?: string;
  outputPath?: string;
  youtubeUrl?: string;
  statusFile?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  cancelled: boolean;
  heartbeatAt?: number;
  workerId?: string;
}

interface ManagedSession {
  id: string;
  kind: ManagedJob['kind'];
  worker?: ChildProcessWithoutNullStreams;
  queue: ManagedJob[];
  currentJobId?: string;
  state: 'idle' | 'busy' | 'restarting';
  healthy: boolean;
  startAttempts: number;
  lastHeartbeatAt?: number;
  lastError?: string;
  heartbeatTimer?: NodeJS.Timeout;
  restartTimer?: NodeJS.Timeout;
  shutdownRequested: boolean;
}

interface CreateJobParams {
  kind: ManagedJob['kind'];
  inputPath?: string;
  outputPath?: string;
  youtubeUrl?: string;
  statusFile?: string;
}

class PersistentWorkerManager {
  private readonly sessions = new Map<ManagedJob['kind'], ManagedSession>();
  private readonly jobs = new Map<string, ManagedJob>();
  private readonly workerDir: string;
  private readonly pythonExecutable: string;
  private readonly workerScript: string;
  private readonly tmpDir: string;
  private readonly heartbeatIntervalMs = 6000;
  private readonly heartbeatTimeoutMs = 9000;
  private readonly jobTimeoutMs = 45 * 60 * 1000;

  constructor() {
    this.workerDir = this.resolveWorkerDirectory('reusable_ai_worker.py');
    this.workerScript = path.join(this.workerDir, 'reusable_ai_worker.py');
    this.tmpDir = os.tmpdir();
    const pythonResult = resolvePython(this.workerDir);
    if (!isPythonResolved(pythonResult)) {
      this.pythonExecutable = '';
      return;
    }
    this.pythonExecutable = pythonResult.executable;
    this.scheduleSweep();
  }

  private resolveWorkerDirectory(scriptName: string): string {
    const candidates = [
      process.cwd(),
      path.join(process.cwd(), 'artifacts', 'api-server'),
      path.resolve(process.cwd(), '..'),
      path.resolve(process.cwd(), '..', '..'),
      path.resolve(process.cwd(), '..', '..', '..'),
    ];

    return candidates.find((directory) => fs.existsSync(path.join(directory, scriptName))) ?? process.cwd();
  }

  private scheduleSweep() {
    setInterval(() => {
      this.sweepExpiredJobs();
      this.refreshWorkerHealth();
    }, 10_000);
  }

  createJob(params: CreateJobParams): ManagedJob {
    const job: ManagedJob = {
      id: uuidv4(),
      kind: params.kind,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      message: 'Queued for processing…',
      streamingReady: false,
      inputPath: params.inputPath,
      outputPath: params.outputPath,
      youtubeUrl: params.youtubeUrl,
      statusFile: params.statusFile,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cancelled: false,
    };

    this.jobs.set(job.id, job);
    const session = this.ensureSession(params.kind);
    session.queue.push(job);
    this.dispatchNext(session);
    return job;
  }

  getJob(jobId: string): ManagedJob | undefined {
    return this.jobs.get(jobId);
  }

  getResultPath(jobId: string): string | undefined {
    return this.jobs.get(jobId)?.resultPath;
  }

  shutdown() {
    for (const session of this.sessions.values()) {
      this.shutdownSession(session);
    }
  }

  private ensureSession(kind: ManagedJob['kind']): ManagedSession {
    const existing = this.sessions.get(kind);
    if (existing) return existing;

    const session: ManagedSession = {
      id: uuidv4(),
      kind,
      queue: [],
      state: 'idle',
      healthy: false,
      startAttempts: 0,
      shutdownRequested: false,
    };
    this.sessions.set(kind, session);
    this.startSession(session);
    return session;
  }

  private startSession(session: ManagedSession) {
    if (!this.pythonExecutable) {
      this.failSessionQueue(session, 'Music removal backend is unavailable. Python worker could not be resolved.');
      return;
    }
    if (!fs.existsSync(this.workerScript)) {
      this.failSessionQueue(session, `Worker script not found: ${this.workerScript}`);
      return;
    }

    this.clearRestartTimer(session);
    session.state = 'restarting';
    session.startAttempts += 1;
    session.healthy = false;
    const proc = spawn(this.pythonExecutable, [this.workerScript], {
      cwd: this.workerDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: buildWorkerEnvironment(process.env),
    });

    session.worker = proc;
    session.lastHeartbeatAt = Date.now();
    session.shutdownRequested = false;
    session.state = 'idle';
    session.healthy = true;

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.handleWorkerLine(session, line.trim());
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (!text) return;
      if (session.currentJobId) {
        const job = this.jobs.get(session.currentJobId);
        if (job) {
          job.message = text.slice(-400);
          job.updatedAt = Date.now();
        }
      }
    });

    proc.on('error', (error) => {
      const message = error.message || 'Worker process failed to start.';
      if (session.currentJobId) {
        const job = this.jobs.get(session.currentJobId);
        if (job && job.status !== 'completed' && job.status !== 'failed') {
          job.status = 'failed';
          job.stage = 'failed';
          job.error = message;
          job.message = message;
          job.updatedAt = Date.now();
        }
      }
      session.lastError = message;
      session.healthy = false;
      this.restartSession(session);
    });

    proc.on('close', (code) => {
      session.healthy = false;
      session.worker = undefined;
      if (!session.shutdownRequested && session.currentJobId) {
        const job = this.jobs.get(session.currentJobId);
        if (job && job.status !== 'completed' && job.status !== 'failed') {
          job.status = 'failed';
          job.stage = 'failed';
          job.error = `Worker exited unexpectedly (code ${code ?? 'unknown'}).`;
          job.message = job.error;
          job.updatedAt = Date.now();
        }
      }
      if (!session.shutdownRequested) {
        this.restartSession(session);
      }
    });

    this.dispatchNext(session);
    this.startHeartbeatLoop(session);
  }

  private startHeartbeatLoop(session: ManagedSession) {
    this.clearHeartbeatTimer(session);
    session.heartbeatTimer = setInterval(() => {
      if (!session.worker || !session.healthy) return;
      session.lastHeartbeatAt = Date.now();
      if (!this.sendToWorker(session, { command: 'ping' })) {
        session.healthy = false;
        this.restartSession(session);
      }
    }, this.heartbeatIntervalMs);
  }

  private clearHeartbeatTimer(session: ManagedSession) {
    if (session.heartbeatTimer) {
      clearInterval(session.heartbeatTimer);
      session.heartbeatTimer = undefined;
    }
  }

  private clearRestartTimer(session: ManagedSession) {
    if (session.restartTimer) {
      clearTimeout(session.restartTimer);
      session.restartTimer = undefined;
    }
  }

  private restartSession(session: ManagedSession) {
    this.clearHeartbeatTimer(session);
    this.clearRestartTimer(session);
    if (session.shutdownRequested) return;
    session.state = 'restarting';
    session.restartTimer = setTimeout(() => {
      session.restartTimer = undefined;
      this.startSession(session);
    }, 1500);
  }

  private sendToWorker(session: ManagedSession, payload: Record<string, unknown>): boolean {
    const worker = session.worker;
    if (!worker || !worker.stdin.writable) return false;
    worker.stdin.write(`${JSON.stringify(payload)}\n`);
    return true;
  }

  private dispatchNext(session: ManagedSession) {
    if (session.state === 'restarting' || session.currentJobId || session.queue.length === 0) return;
    if (!session.worker || !session.healthy) {
      this.startSession(session);
      return;
    }

    const nextJob = session.queue.shift();
    if (!nextJob) return;

    nextJob.status = 'initializing';
    nextJob.stage = 'initializing';
    nextJob.progress = 5;
    nextJob.message = 'Worker initializing…';
    nextJob.updatedAt = Date.now();
    nextJob.startedAt = nextJob.startedAt ?? Date.now();
    session.currentJobId = nextJob.id;
    session.state = 'busy';
    session.healthy = true;

    const payload = {
      job: {
        jobId: nextJob.id,
        kind: nextJob.kind,
        inputPath: nextJob.inputPath,
        outputPath: nextJob.outputPath,
        youtubeUrl: nextJob.youtubeUrl,
        statusFile: nextJob.statusFile,
      },
    };

    this.sendToWorker(session, payload);
  }

  private handleWorkerLine(session: ManagedSession, line: string) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const jobId = typeof parsed.jobId === 'string' ? parsed.jobId : undefined;
      const job = jobId ? this.jobs.get(jobId) : undefined;

      if (parsed.type === 'pong') {
        session.lastHeartbeatAt = Date.now();
        return;
      }

      if (parsed.type === 'status' && job) {
        const stateValue = typeof parsed.state === 'string' ? parsed.state : typeof parsed.status === 'string' ? parsed.status : undefined;
        const normalizedStatus = this.normalizeState(stateValue);
        job.status = normalizedStatus;
        job.stage = typeof parsed.stage === 'string' ? parsed.stage : normalizedStatus;
        job.progress = typeof parsed.progress === 'number' ? parsed.progress : job.progress;
        job.message = typeof parsed.message === 'string' ? parsed.message : job.message;
        job.streamingReady = parsed.streamingReady === true;
        if (typeof parsed.error === 'string') {
          job.error = parsed.error;
        }
        job.updatedAt = Date.now();
        if (normalizedStatus === 'model_ready' || normalizedStatus === 'ready') {
          session.healthy = true;
        }
        return;
      }

      if (parsed.type === 'result' && job) {
        job.status = 'completed';
        job.stage = 'completed';
        job.progress = 100;
        job.message = typeof parsed.message === 'string' ? parsed.message : 'Music removed successfully.';
        job.streamingReady = parsed.streamingReady === true;
        if (typeof parsed.outputPath === 'string') {
          job.resultPath = parsed.outputPath;
        }
        job.completedAt = Date.now();
        job.updatedAt = Date.now();
        session.currentJobId = undefined;
        session.state = 'idle';
        session.healthy = true;
        this.dispatchNext(session);
        return;
      }

      if (parsed.type === 'error' && job) {
        job.status = 'failed';
        job.stage = 'failed';
        job.progress = 0;
        job.error = typeof parsed.error === 'string' ? parsed.error : 'Processing failed.';
        job.message = job.error;
        job.updatedAt = Date.now();
        session.currentJobId = undefined;
        session.state = 'idle';
        this.dispatchNext(session);
      }
    } catch {
      // Ignore malformed worker stdout.
    }
  }

  private normalizeState(state: string | undefined): WorkerRuntimeState {
    switch (state) {
      case 'queued':
      case 'initializing':
      case 'model_ready':
      case 'processing':
      case 'encoding':
      case 'ready':
      case 'completed':
      case 'failed':
        return state;
      case 'done':
        return 'completed';
      case 'error':
        return 'failed';
      case 'processing':
        return 'processing';
      default:
        return 'processing';
    }
  }

  private sweepExpiredJobs() {
    const now = Date.now();
    for (const [jobId, job] of this.jobs) {
      if (job.status === 'completed' || job.status === 'failed') {
        const age = now - job.createdAt;
        if (age > 60 * 60 * 1000) {
          this.jobs.delete(jobId);
        }
        continue;
      }
      if (now - job.createdAt > this.jobTimeoutMs) {
        job.status = 'failed';
        job.stage = 'failed';
        job.error = 'Job timed out.';
        job.message = 'Job timed out.';
        job.updatedAt = now;
      }
    }
  }

  private refreshWorkerHealth() {
    for (const session of this.sessions.values()) {
      if (!session.worker) continue;
      const now = Date.now();
      if (session.lastHeartbeatAt && now - session.lastHeartbeatAt > this.heartbeatTimeoutMs) {
        session.healthy = false;
        this.restartSession(session);
      }
    }
  }

  private failSessionQueue(session: ManagedSession, errorMessage: string) {
    for (const job of session.queue.splice(0)) {
      job.status = 'failed';
      job.stage = 'failed';
      job.error = errorMessage;
      job.message = errorMessage;
      job.updatedAt = Date.now();
    }
    session.state = 'idle';
    session.currentJobId = undefined;
  }

  private shutdownSession(session: ManagedSession) {
    this.clearHeartbeatTimer(session);
    this.clearRestartTimer(session);
    session.shutdownRequested = true;
    if (session.worker) {
      this.sendToWorker(session, { command: 'shutdown' });
      session.worker.kill('SIGTERM');
      session.worker = undefined;
    }
    session.state = 'idle';
    session.healthy = false;
  }
}

const manager = new PersistentWorkerManager();

export interface CreateYoutubeJobParams {
  videoUrl?: string;
  outputPath?: string;
  statusFile?: string;
}

export function createYoutubeJob(params: CreateYoutubeJobParams): ManagedJob {
  return manager.createJob({
    kind: 'youtube',
    youtubeUrl: params.videoUrl,
    outputPath: params.outputPath,
    statusFile: params.statusFile,
  });
}

export function getYoutubeJob(jobId: string): ManagedJob | undefined {
  return manager.getJob(jobId);
}

export function getYoutubeResultPath(jobId: string): string | undefined {
  return manager.getResultPath(jobId);
}

export function shutdownPersistentWorkerManager() {
  manager.shutdown();
}
