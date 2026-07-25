#!/usr/bin/env python3
"""Standalone prototype runner for audio-separator model evaluation.

This script is intentionally isolated from production worker code.
It extracts a local audio/video file to WAV, runs one selected
audio-separator model, and writes the selected vocals stem to disk.

Examples:
  python prototype_audio_separation.py --input tests/sample.mp3 --output output/vocals.mp3 --model 1_HP-UVR.pth
  python prototype_audio_separation.py --input tests/sample.mp3 --output output/vocals.wav --model Kim_Vocal_2.onnx --output-format wav
"""

import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from audio_output_selector import select_best_audio_candidate

logging.getLogger().setLevel(logging.WARNING)


def write_status(path: str | None, data: dict) -> None:
    if not path:
        return
    try:
        with open(path, 'w', encoding='utf-8') as handle:
            json.dump(data, handle, indent=2)
    except Exception:
        pass


def run(cmd: list[str], check: bool = True, capture: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(cmd, capture_output=capture, text=True)
    if check and result.returncode != 0:
        stderr = (result.stderr or '').strip()
        stdout = (result.stdout or '').strip()
        raise RuntimeError(
            f"Command failed: {cmd[0]} {' '.join(cmd[1:])}\n" \
            f"stdout: {stdout[:800]!r}\nstderr: {stderr[:800]!r}"
        )
    return result


def resolve_executable(name: str) -> str:
    path = shutil.which(name)
    if path:
        return path
    raise RuntimeError(f'Executable not found on PATH: {name}')


def extract_audio(input_path: str, work_dir: str, sample_rate: int, channels: int, status_file: str | None) -> str:
    write_status(status_file, {
        'stage': 'extracting',
        'progress': 8,
        'message': 'Extracting audio track from input file...',
    })
    ffmpeg = resolve_executable('ffmpeg')
    audio_wav = os.path.join(work_dir, 'input.wav')
    run([
        ffmpeg,
        '-i', input_path,
        '-vn',
        '-ar', str(sample_rate),
        '-ac', str(channels),
        '-acodec', 'pcm_s16le',
        audio_wav,
        '-y',
    ])
    return audio_wav


def separate_audio(audio_wav: str, model_name: str, model_dir: str, status_file: str | None) -> tuple[str, dict]:
    write_status(status_file, {
        'stage': 'loading_model',
        'progress': 18,
        'message': f'Loading model {model_name}...',
    })
    try:
        from audio_separator.separator import Separator
    except ImportError as exc:
        raise RuntimeError('audio-separator is required for prototype evaluation. Install it in the current environment.') from exc

    os.makedirs(model_dir, exist_ok=True)
    output_dir = tempfile.mkdtemp(prefix='prototype_sep_')
    separator = Separator(
        output_dir=output_dir,
        model_file_dir=model_dir,
        output_format='WAV',
        mdx_params={
            'hop_length': 1024,
            'segment_size': 256,
            'overlap': 0.25,
            'batch_size': 1,
            'enable_denoise': True,
        },
    )

    write_status(status_file, {
        'stage': 'separating',
        'progress': 28,
        'message': 'Running audio-separator model...',
    })

    load_start = time.perf_counter()
    separator.load_model(model_name)
    load_end = time.perf_counter()
    run_start = time.perf_counter()
    output_files = separator.separate(audio_wav)
    run_end = time.perf_counter()

    write_status(status_file, {
        'stage': 'postprocessing',
        'progress': 75,
        'message': 'Selecting vocals stem from separator output...',
        'stems': output_files,
    })

    selected_path = select_best_audio_candidate(output_files, output_dir)
    if not selected_path or not os.path.exists(selected_path):
        raise RuntimeError('Prototype separation produced no usable vocals stem.')

    metrics = {
        'model_name': model_name,
        'output_dir': output_dir,
        'selected_stem': selected_path,
        'load_model_time_seconds': round(load_end - load_start, 3),
        'separate_time_seconds': round(run_end - run_start, 3),
        'output_files': output_files,
    }
    return selected_path, metrics


def encode_output(input_wav: str, output_path: str, output_format: str, sample_rate: int, status_file: str | None) -> None:
    write_status(status_file, {
        'stage': 'encoding',
        'progress': 88,
        'message': f'Encoding output to {output_format.upper()}...',
    })

    if output_format == 'wav':
        shutil.copyfile(input_wav, output_path)
        return

    ffmpeg = resolve_executable('ffmpeg')
    run([
        ffmpeg,
        '-i', input_wav,
        '-codec:a', 'libmp3lame',
        '-b:a', '192k',
        '-ar', str(sample_rate),
        output_path,
        '-y',
    ])


def main() -> int:
    parser = argparse.ArgumentParser(description='Standalone audio-separator prototype runner.')
    parser.add_argument('--input', required=True, help='Path to input audio or video file.')
    parser.add_argument('--output', required=True, help='Path for output file.')
    parser.add_argument('--model', default='Kim_Vocal_2.onnx', help='audio-separator model filename to load.')
    parser.add_argument('--model-dir', default='models', help='Directory to search for or download models.')
    parser.add_argument('--output-format', default='mp3', choices=['mp3', 'wav'], help='Output audio format.')
    parser.add_argument('--sample-rate', type=int, default=44100, help='Target sample rate for model input and output.')
    parser.add_argument('--channels', type=int, default=2, help='Target audio channel count.')
    parser.add_argument('--status-file', default=None, help='Optional JSON file path for progress status updates.')
    parser.add_argument('--report', default=None, help='Optional JSON file path to write runtime metrics.')
    args = parser.parse_args()

    status_file = args.status_file
    work_dir = tempfile.mkdtemp(prefix='prototype_audio_')
    output_path = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    try:
        audio_wav = extract_audio(args.input, work_dir, args.sample_rate, args.channels, status_file)
        selected_path, metrics = separate_audio(audio_wav, args.model, args.model_dir, status_file)
        encode_output(selected_path, output_path, args.output_format, args.sample_rate, status_file)

        metrics.update({
            'final_output': output_path,
            'selected_stem_basename': os.path.basename(selected_path),
            'input_path': os.path.abspath(args.input),
            'output_format': args.output_format,
        })
        if args.report:
            with open(args.report, 'w', encoding='utf-8') as handle:
                json.dump(metrics, handle, indent=2)

        write_status(status_file, {
            'stage': 'done',
            'progress': 100,
            'message': 'Prototype separation complete.',
            'output': output_path,
            'model_name': args.model,
        })
        print(json.dumps({'success': True, 'metrics': metrics}, default=str))
        return 0
    except Exception as exc:
        message = str(exc)
        write_status(status_file, {
            'stage': 'error',
            'progress': 0,
            'message': message,
        })
        print(json.dumps({'success': False, 'error': message}), file=sys.stderr)
        return 1
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == '__main__':
    raise SystemExit(main())
