/**
 * YouTube music removal API.
 *
 * POST   /api/audio/youtube-jobs          Submit a YouTube URL for processing
 * GET    /api/audio/youtube-jobs/:id       Poll job status + progress
 * GET    /api/audio/youtube-jobs/:id/result  Stream the processed MP3
 */
import { Router } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createYoutubeJob, getYoutubeJob, getYoutubeResultPath } from '../lib/ai/persistentWorkerManager';

const router = Router();
const TMP = os.tmpdir();

export type JobStatus = 'queued' | 'initializing' | 'model_ready' | 'processing' | 'encoding' | 'ready' | 'completed' | 'failed';

router.post('/youtube-jobs', (req, res) => {
  const { videoId, videoUrl } = req.body ?? {};

  if (!videoId && !videoUrl) {
    res.status(400).json({ error: 'videoId or videoUrl required' });
    return;
  }

  const youtubeUrl = videoUrl ?? (videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined);
  if (!youtubeUrl) {
    res.status(400).json({ error: 'Could not derive a YouTube URL' });
    return;
  }

  const job = createYoutubeJob({
    videoUrl: youtubeUrl,
    outputPath: path.join(TMP, `yt_vocals_${Date.now()}.mp3`),
    statusFile: path.join(TMP, `yt_status_${Date.now()}.json`),
  });

  res.json({ jobId: job.id });
});

router.get('/youtube-jobs/:id', (req, res) => {
  const job = getYoutubeJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.json({
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    streamingReady: job.streamingReady || (job.status === 'completed' && Boolean(job.resultPath)),
    error: job.error,
  });
});

router.get('/youtube-jobs/:id/result', async (req, res) => {
  const job = getYoutubeJob(req.params.id);
  const resultPath = getYoutubeResultPath(req.params.id);

  if (!job || !resultPath) {
    res.status(404).json({ error: 'Result not available yet' });
    return;
  }

  if (!fs.existsSync(resultPath)) {
    res.status(410).json({ error: 'Result file has expired or is unavailable' });
    return;
  }

  const stat = fs.statSync(resultPath);
  const total = stat.size;
  const range = req.headers.range;
  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : total - 1;
    const chunk = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunk,
      'Content-Type': 'audio/mpeg',
    });
    fs.createReadStream(resultPath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'no-store, no-transform',
    'Transfer-Encoding': 'chunked',
  });
  fs.createReadStream(resultPath).pipe(res);
});

export default router;
