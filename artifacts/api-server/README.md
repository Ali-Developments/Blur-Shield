# BlurShield processing API

The Express API submits CPU-intensive work to local Python workers. Jobs run
asynchronously: submit a file, poll its job endpoint, then download the result.

## Runtime setup

The workers require Python 3.12+, FFmpeg/FFprobe on `PATH`, and the workspace
virtual-environment dependencies:

```powershell
.\.venv\Scripts\python.exe -m pip install -r artifacts\api-server\requirements-ai.txt
winget install --id Gyan.FFmpeg.Essentials --exact
```

Restart the terminal after the Winget command so its updated `PATH` is visible.

All required face models are versioned in `models/`: the Haar cascade is the
baseline detector and the Caffe SSD files improve face detection. `1_HP-UVR.pth`
is the bundled offline audio-separation checkpoint. Audio separation is local;
no media is sent to a cloud model. If the checkpoint is removed, place a
supported `*.pth` or `Kim_Vocal_2.onnx` in `models/` and the worker will select it.

## API

- `POST /api/ai/video-blur` queues a multipart `file` (or local `inputPath`) for
  face/body blurring. `frameStep`, `blurStrength`, and `facesOnly` are optional.
- `GET /api/ai/video-blur/:jobId` provides progress; `/result` streams the MP4.
- `POST /api/ai/audio-separation` queues a multipart `file` (or `inputPath`) for
  speech/vocals extraction.
- `GET /api/ai/audio-separation/:jobId` provides progress; `/result` streams the
  processed MP3.

Job state is in memory and results are deleted after one hour. A multi-instance
deployment needs a shared queue and object storage.
