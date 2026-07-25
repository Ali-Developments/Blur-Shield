#!/usr/bin/env python3
"""
BlurShield AI — Audio Separation Worker
Runs MDX-Net Kim_Vocal_2 (via audio-separator / ONNX Runtime) to remove
background music from a video/audio file while preserving speech.

Usage:
  python3 separator.py --input <path> --output <path> --status-file <path>

Progress updates are written as JSON to --status-file every few seconds so
the Express host process can serve them to polling clients.
"""
import sys
import os
import json
import argparse
import subprocess
import tempfile
import shutil
import logging
from audio_output_selector import select_best_audio_candidate

# Silence audio-separator's verbose INFO logs so only our own progress JSON
# goes to stdout (Express reads stdout for the final result line).
logging.getLogger().setLevel(logging.WARNING)

def write_status(path, data):
    if path:
        try:
            with open(path, 'w') as f:
                json.dump(data, f)
        except Exception:
            pass

def run_ffmpeg(*args, check=True):
    result = subprocess.run(
        ['ffmpeg', *args],
        capture_output=True, text=True
    )
    if check and result.returncode != 0:
        raise RuntimeError(f'ffmpeg error: {result.stderr[-600:]}')
    return result

def has_video_stream(path):
    r = subprocess.run(
        ['ffprobe', '-v', 'quiet', '-select_streams', 'v:0',
         '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', path],
        capture_output=True, text=True
    )
    return 'video' in r.stdout

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input',       required=True)
    parser.add_argument('--output',      required=True)
    parser.add_argument('--status-file', default=None)
    args = parser.parse_args()

    status_file  = args.status_file
    input_path   = args.input
    output_path  = args.output
    work_dir     = tempfile.mkdtemp(prefix='blurshield_sep_')

    try:
        # ── STEP 1: Extract audio ────────────────────────────────────────
        write_status(status_file, {
            'stage': 'extracting', 'progress': 8,
            'message': 'Extracting audio track from video…'
        })
        audio_wav = os.path.join(work_dir, 'input.wav')
        run_ffmpeg(
            '-i', input_path,
            '-vn',                    # drop video
            '-ar', '44100',           # 44.1 kHz (required by most MDX models)
            '-ac', '2',               # stereo
            '-acodec', 'pcm_s16le',   # 16-bit PCM
            audio_wav, '-y'
        )

        # ── STEP 2: AI separation (Kim_Vocal_2 MDX-Net, ONNX CPU) ────────
        write_status(status_file, {
            'stage': 'separating', 'progress': 20,
            'message': 'Loading MDX-Net Kim_Vocal_2 model…'
        })

        from audio_separator.separator import Separator   # noqa: PLC0415

        # Model dir is /tmp/audio-separator-models by default.
        # Kim_Vocal_2.onnx is ~60 MB and is downloaded once on first run.
        sep = Separator(
            output_dir=work_dir,
            model_file_dir='/tmp/audio-separator-models',
            output_format='WAV',
            mdx_params={
                'hop_length': 1024,
                'segment_size': 256,
                'overlap': 0.25,
                'batch_size': 1,
                'enable_denoise': True,
            },
        )

        # load_model() downloads the model on first use (~60 MB) and caches it.
        # The model filename (with extension) must be passed to load_model(),
        # NOT to separate(). Confirmed from models-scores.json in the package.
        sep.load_model('Kim_Vocal_2.onnx')

        write_status(status_file, {
            'stage': 'separating', 'progress': 35,
            'message': 'Running AI stem separation (MDX-Net Kim_Vocal_2) — please wait…'
        })

        output_files = sep.separate(audio_wav)

        write_status(status_file, {
            'stage': 'separating', 'progress': 80,
            'message': 'Separation complete — identifying vocals stem…'
        })

        vocals_wav = select_best_audio_candidate(output_files, work_dir)

        # ── STEP 3: Merge vocals back with original video stream ──────────
        write_status(status_file, {
            'stage': 'merging', 'progress': 88,
            'message': 'Muxing vocals audio with original video…'
        })

        if has_video_stream(input_path):
            # Copy video stream, replace audio with separated vocals
            result = run_ffmpeg(
                '-i', input_path,   # source: video stream
                '-i', vocals_wav,   # source: vocals audio
                '-map', '0:v:0',    # take video from original
                '-map', '1:a:0',    # take audio from separator
                '-c:v', 'copy',     # no video re-encode (fast + lossless)
                '-c:a', 'aac',
                '-b:a', '192k',
                '-shortest',
                output_path, '-y',
                check=False,
            )
            if result.returncode != 0:
                # Video mux failed — return audio-only as fallback
                shutil.copy(vocals_wav, output_path)
        else:
            # Audio-only input — just deliver the vocals WAV
            shutil.copy(vocals_wav, output_path)

        write_status(status_file, {
            'stage': 'done', 'progress': 100,
            'message': 'Processing complete.'
        })
        print(json.dumps({'success': True, 'output': output_path}))

    except Exception as exc:
        msg = str(exc)
        write_status(status_file, {
            'stage': 'error', 'progress': 0, 'message': msg
        })
        print(json.dumps({'success': False, 'error': msg}), file=sys.stderr)
        sys.exit(1)

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == '__main__':
    main()
