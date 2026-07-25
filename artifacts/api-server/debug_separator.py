#!/usr/bin/env python3
"""Standalone separator diagnostic script.

This script does not select a stem, does not encode to MP3, and does not
remove the generated output files. It is intended only to confirm whether the
separator model itself is producing usable vocal stems for a fixed local WAV.
"""

import audioop
import os
import shutil
import sys
import tempfile
import wave
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MODEL_DIR = SCRIPT_DIR / 'models'
INPUT_WAV = SCRIPT_DIR / 'tests' / 'sample.wav'


def resolve_model_path() -> str | None:
    candidates = [
        MODEL_DIR / 'Kim_Vocal_2.onnx',
        MODEL_DIR / '1_HP-UVR.pth',
        MODEL_DIR / '1_HP-UVR.onnx',
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return None


def resolve_output_path(output_dir: Path, output_name: str) -> Path:
    if os.path.isabs(output_name) and os.path.exists(output_name):
        return Path(output_name)
    candidate = output_dir / output_name
    if candidate.exists():
        return candidate
    for root, _, files in os.walk(output_dir):
        if output_name in files:
            return Path(root) / output_name
    return output_dir / output_name


def inspect_wav(path: Path) -> dict:
    with wave.open(str(path), 'rb') as wav_file:
        frames = wav_file.readframes(wav_file.getnframes())
        sample_width = wav_file.getsampwidth()
        frame_rate = wav_file.getframerate()
        channels = wav_file.getnchannels()
        frame_count = wav_file.getnframes()
        duration = frame_count / float(frame_rate) if frame_rate else 0.0
        max_amp = float(2 ** (8 * sample_width - 1) - 1)
        rms_value = audioop.rms(frames, sample_width) if max_amp else 0.0
        peak_value = audioop.max(frames, sample_width) if max_amp else 0.0
        rms_norm = rms_value / max_amp if max_amp else 0.0
        peak_norm = peak_value / max_amp if max_amp else 0.0

    return {
        'path': str(path),
        'size_bytes': path.stat().st_size,
        'duration_seconds': round(duration, 6),
        'frame_rate': frame_rate,
        'channels': channels,
        'sample_width': sample_width,
        'rms': round(rms_norm, 8),
        'peak': round(peak_norm, 8),
    }


def main() -> int:
    if not INPUT_WAV.exists():
        print(f'Input WAV not found: {INPUT_WAV}')
        return 1

    try:
        from audio_separator.separator import Separator  # type: ignore
    except ImportError as exc:
        print(f'Unable to import audio_separator: {exc}')
        return 1

    model_path = resolve_model_path()
    if not model_path:
        print(f'No supported separator model found in {MODEL_DIR}')
        return 1

    output_root = SCRIPT_DIR / 'debug_separator_output'
    output_root.mkdir(parents=True, exist_ok=True)
    output_dir = Path(tempfile.mkdtemp(prefix='run_', dir=str(output_root)))

    print(f'Using input WAV: {INPUT_WAV}')
    print(f'Using model: {Path(model_path).name}')
    print(f'Writing generated stems to: {output_dir}')

    sep = Separator(
        output_dir=str(output_dir),
        model_file_dir=str(MODEL_DIR),
        output_format='WAV',
        mdx_params={
            'hop_length': 1024,
            'segment_size': 256,
            'overlap': 0.25,
            'batch_size': 1,
            'enable_denoise': True,
        },
    )
    sep.load_model(Path(model_path).name)
    output_files = sep.separate(str(INPUT_WAV))

    print('output_files =', output_files)
    for item in output_files:
        resolved_path = resolve_output_path(output_dir, item)
        print('---')
        print('generated_filename =', Path(resolved_path).name)
        print('absolute_path =', str(resolved_path.resolve()))
        if resolved_path.exists():
            metrics = inspect_wav(resolved_path)
            print('file_size =', metrics['size_bytes'])
            print('duration =', metrics['duration_seconds'])
            print('rms =', metrics['rms'])
            print('peak =', metrics['peak'])
        else:
            print('file_size = <missing>')
            print('duration = <missing>')
            print('rms = <missing>')
            print('peak = <missing>')

    print('---')
    print('saved_output_dir =', output_dir)
    print('note = No stem was selected and no MP3 was encoded.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
