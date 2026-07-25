import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createAudioSeparationJob, getAudioSeparationJob, getAudioSeparationResultPath } from '../lib/ai/audioSeparationService';
import { createVideoBlurJob, getVideoBlurJob, getVideoBlurResultPath } from '../lib/ai/videoBlurService';

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blurshield-upload-'));
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.bin';
      cb(null, `upload${ext}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.post('/video-blur', upload.single('file'), (req, res) => {
  const {
    inputPath,
    outputPath,
    frameStep,
    blurStrength,
    facesOnly,
    method,
    target,
  } = req.body ?? {};
  const sourcePath = req.file?.path ?? inputPath;

  if (!sourcePath) {
    res.status(400).json({ error: 'A video file upload (field: file) or inputPath is required.' });
    return;
  }

  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    res.status(400).json({ error: 'The supplied input path does not exist.' });
    return;
  }

  const methodValue = method === 'fullBody' ? 'fullBody' : 'faces';
  const targetValue = target === 'males' ? 'males' : target === 'females' ? 'females' : 'everyone';
  const frameStepValue = Number(frameStep);
  const blurStrengthValue = Number(blurStrength);

  const job = createVideoBlurJob({
    inputPath: sourcePath,
    outputPath,
    frameStep: Number.isFinite(frameStepValue) ? frameStepValue : undefined,
    blurStrength: Number.isFinite(blurStrengthValue) ? blurStrengthValue : undefined,
    facesOnly: facesOnly === true || facesOnly === 'true' || methodValue === 'faces',
    method: methodValue,
    target: targetValue,
  });

  res.json({ jobId: job.id, status: job.status, inputPath: sourcePath });
});

router.get('/video-blur/:jobId', (req, res) => {
  const job = getVideoBlurJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

router.get('/video-blur/:jobId/result', (req, res) => {
  const job = getVideoBlurJob(req.params.jobId);
  const resultPath = getVideoBlurResultPath(req.params.jobId);
  if (!job || !resultPath || !fs.existsSync(resultPath)) {
    res.status(404).json({ error: 'Result not available yet' });
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
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(resultPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(resultPath).pipe(res);
  }
});

router.post('/audio-separation', upload.single('file'), (req, res) => {
  const { inputPath, outputPath } = req.body ?? {};
  const sourcePath = req.file?.path ?? inputPath;

  if (!sourcePath) {
    res.status(400).json({ error: 'An audio/video file upload (field: file) or inputPath is required.' });
    return;
  }

  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    res.status(400).json({ error: 'The supplied input path does not exist.' });
    return;
  }

  const job = createAudioSeparationJob({ inputPath: sourcePath, outputPath });
  res.json({ jobId: job.id, status: job.status, inputPath: sourcePath });
});

router.get('/audio-separation/:jobId', (req, res) => {
  const job = getAudioSeparationJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

router.get('/audio-separation/:jobId/result', (req, res) => {
  const job = getAudioSeparationJob(req.params.jobId);
  const resultPath = getAudioSeparationResultPath(req.params.jobId);
  if (!job || !resultPath || !fs.existsSync(resultPath)) {
    res.status(404).json({ error: 'Result not available yet' });
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
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(resultPath).pipe(res);
  }
});

export default router;
