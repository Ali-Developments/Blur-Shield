#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from audio_output_selector import select_best_audio_candidate


SCRIPT_DIR = Path(__file__).resolve().parent


def resolve_ffmpeg_path():
    env_candidates = []
    env_value = os.environ.get('FFMPEG_PATH')
    if env_value:
        env_candidates.append(env_value)
    env_candidates.extend(os.environ.get('PATH', '').split(os.pathsep))

    explicit_candidates = []
    for candidate in env_candidates:
        if not candidate:
            continue
        if candidate.endswith('.exe') and os.path.exists(candidate):
            explicit_candidates.append(candidate)
        elif os.path.isdir(candidate):
            for name in ('ffmpeg.exe', 'ffmpeg'):
                full_path = os.path.join(candidate, name)
                if os.path.exists(full_path):
                    explicit_candidates.append(full_path)

    for candidate in explicit_candidates:
        if os.path.exists(candidate):
            return candidate

    for candidate in [
        os.path.join(SCRIPT_DIR, 'bin', 'ffmpeg.exe'),
        os.path.join(SCRIPT_DIR, 'bin', 'ffmpeg'),
        os.path.join(SCRIPT_DIR, 'ffmpeg.exe'),
        os.path.join(SCRIPT_DIR, 'ffmpeg'),
        os.path.join(SCRIPT_DIR, '..', 'bin', 'ffmpeg.exe'),
        os.path.join(SCRIPT_DIR, '..', 'bin', 'ffmpeg'),
    ]:
        if os.path.exists(candidate):
            return candidate

    return None


SCRIPT_DIR = Path(__file__).resolve().parent


def write_status(path, data):
    if not path:
        return
    try:
        with open(path, 'w', encoding='utf-8') as handle:
            json.dump(data, handle)
    except Exception:
        pass


def run(cmd, check=True):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or '').strip() or f'Command failed: {cmd[0]}')
    return proc


def ensure_ffmpeg():
    ffmpeg_path = resolve_ffmpeg_path()
    if not ffmpeg_path:
        raise RuntimeError('ffmpeg is required for audio extraction and encoding.')
    try:
        run([ffmpeg_path, '-version'], check=False)
    except FileNotFoundError as exc:
        raise RuntimeError('ffmpeg is required for audio extraction and encoding.') from exc
    return ffmpeg_path


def extract_audio(input_path, work_dir, ffmpeg_path):
    wav_path = os.path.join(work_dir, 'input.wav')
    run([ffmpeg_path, '-i', input_path, '-vn', '-ar', '44100', '-ac', '2', '-acodec', 'pcm_s16le', wav_path, '-y'])
    return wav_path


def separate_audio(input_path, output_path, status_file, ffmpeg_path):
    write_status(status_file, {'stage': 'separating', 'progress': 20, 'message': 'Loading offline audio separation model…'})
    try:
        from audio_separator.separator import Separator
    except ImportError as exc:
        raise RuntimeError('audio-separator is not installed in this environment; install it to enable local separation.') from exc

    work_dir = tempfile.mkdtemp(prefix='blurshield_stems_')
    model_dir = str(SCRIPT_DIR / 'models')
    os.makedirs(model_dir, exist_ok=True)

    sep = Separator(
        output_dir=work_dir,
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

    candidates = [
        os.path.join(model_dir, 'Kim_Vocal_2.onnx'),
        os.path.join(model_dir, '1_HP-UVR.pth'),
        os.path.join(model_dir, '1_HP-UVR.onnx'),
    ]
    model_path = next((item for item in candidates if os.path.exists(item)), None)
    if model_path is None:
        raise RuntimeError(f'No supported separator model found in {model_dir}. Download a supported checkpoint such as 1_HP-UVR.pth into that path before running the separator.')

    # audio-separator resolves the file name within model_file_dir.
    sep.load_model(os.path.basename(model_path))
    write_status(status_file, {'stage': 'separating', 'progress': 60, 'message': 'Processing speech-vs-background stem separation…'})
    output_files = sep.separate(input_path)

    def resolve_candidate(path_value):
        if not path_value:
            return path_value
        if os.path.isabs(path_value) and os.path.exists(path_value):
            return path_value
        candidate = os.path.join(work_dir, path_value)
        if os.path.exists(candidate):
            return candidate
        for root, _, files in os.walk(work_dir):
            if os.path.basename(path_value) in files:
                return os.path.join(root, os.path.basename(path_value))
        return path_value

    resolved = [resolve_candidate(item) for item in output_files]
    resolved = [item for item in resolved if os.path.exists(item)]
    if not resolved:
        raise RuntimeError('Audio separation produced no usable output.')

    vocals_path = select_best_audio_candidate(resolved, work_dir)
    if not os.path.exists(vocals_path):
        raise RuntimeError(f'Audio separation produced no usable output at {vocals_path}.')

    write_status(status_file, {'stage': 'encoding', 'progress': 85, 'message': 'Encoding vocal stem for delivery…'})
    try:
        run([ffmpeg_path, '-i', vocals_path, '-codec:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', output_path, '-y'])
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--status-file', default=None)
    args = parser.parse_args()

    work_dir = tempfile.mkdtemp(prefix='blurshield_audio_')
    try:
        ffmpeg_path = ensure_ffmpeg()
        extracted = extract_audio(args.input, work_dir, ffmpeg_path)
        separate_audio(extracted, args.output, args.status_file, ffmpeg_path)
        write_status(args.status_file, {'stage': 'done', 'progress': 100, 'message': 'Speech preserved and background audio reduced.'})
        print(json.dumps({'success': True, 'message': 'Speech preserved and background audio reduced.'}))
    except Exception as exc:
        write_status(args.status_file, {'stage': 'error', 'progress': 0, 'message': str(exc)})
        print(json.dumps({'success': False, 'error': str(exc)}))
        sys.exit(1)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == '__main__':
    main()
