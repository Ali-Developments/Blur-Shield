#!/usr/bin/env python3
"""Standalone model validation diagnostic for the BlurShield separator.

This script intentionally does not modify production code. It validates a
fresh local WAV input, runs the separator with the same model used by
BlurShield, preserves every generated stem and image artifact, and writes a
report file for inspection.
"""

import hashlib
import importlib.metadata as md
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import wave
import zipfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / 'models'
MODEL_FILE = MODEL_DIR / 'Kim_Vocal_2.onnx'
SOURCE_MP3 = ROOT / 'tests' / 'sample.mp3'
INPUT_WAV = ROOT / 'tests' / 'valid_input_long.wav'
OUTPUT_ROOT = ROOT / 'debug_separator_output'
REPORT_PATH = ROOT / 'MODEL_VALIDATION_REPORT.md'
ZIP_PATH = ROOT / 'debug_outputs.zip'


def run(cmd, check=True, capture=True):
    proc = subprocess.run(cmd, capture_output=capture, text=True)
    if check and proc.returncode != 0:
        stderr = (proc.stderr or proc.stdout or '').strip()
        raise RuntimeError(stderr or f'Command failed: {cmd[0]}')
    return proc


def maybe_create_long_input():
    INPUT_WAV.parent.mkdir(parents=True, exist_ok=True)

    if INPUT_WAV.exists() and INPUT_WAV.stat().st_size > 100 * 1024:
        return INPUT_WAV

    if SOURCE_MP3.exists():
        try:
            run([
                'ffmpeg', '-y', '-stream_loop', '7', '-i', str(SOURCE_MP3),
                '-t', '15', '-vn', '-ar', '44100', '-ac', '2', '-acodec', 'pcm_s16le',
                str(INPUT_WAV),
            ])
            if INPUT_WAV.exists() and INPUT_WAV.stat().st_size > 100 * 1024:
                return INPUT_WAV
        except Exception:
            pass

    sample_rate = 44100
    duration_seconds = 15.0
    amplitude = 12000
    freq_hz = 1000.0
    frames = int(sample_rate * duration_seconds)
    stereo = np.zeros(frames * 2, dtype=np.int16)
    for i in range(frames):
        value = int(amplitude * math.sin(2 * math.pi * freq_hz * i / sample_rate))
        stereo[i * 2] = value
        stereo[i * 2 + 1] = value
    with wave.open(str(INPUT_WAV), 'wb') as wav_file:
        wav_file.setnchannels(2)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(stereo.tobytes())
    return INPUT_WAV


def verify_input(path: Path):
    if not path.exists():
        raise RuntimeError(f'Input file does not exist: {path}')

    size = path.stat().st_size
    if size <= 100 * 1024:
        raise RuntimeError(f'Input file is too small: {size} bytes')

    ffprobe_proc = run([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(path)
    ], check=False)
    if ffprobe_proc.returncode != 0:
        raise RuntimeError(f'ffprobe failed: {ffprobe_proc.stderr or ffprobe_proc.stdout}')
    duration_text = (ffprobe_proc.stdout or '').strip()
    try:
        duration = float(duration_text)
    except ValueError as exc:
        raise RuntimeError(f'Could not parse duration from ffprobe: {duration_text}') from exc
    if duration <= 10.0:
        raise RuntimeError(f'Input duration is too short: {duration} seconds')

    ffprobe_stream = run([
        'ffprobe', '-v', 'error', '-show_entries', 'stream=sample_rate,channels',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(path)
    ], check=False)
    if ffprobe_stream.returncode != 0:
        raise RuntimeError(f'ffprobe stream metadata failed: {ffprobe_stream.stderr or ffprobe_stream.stdout}')
    stream_info = [line.strip() for line in ffprobe_stream.stdout.splitlines() if line.strip()]
    if len(stream_info) < 2:
        raise RuntimeError('ffprobe did not return sample rate and channel count')

    decode_proc = run([
        'ffmpeg', '-v', 'error', '-i', str(path), '-f', 'null', 'NUL'
    ], check=False)
    if decode_proc.returncode != 0:
        raise RuntimeError(f'ffmpeg could not decode input: {decode_proc.stderr or decode_proc.stdout}')

    with wave.open(str(path), 'rb') as wav_file:
        frames = wav_file.readframes(wav_file.getnframes())
        if not frames:
            raise RuntimeError('Waveform data is empty')
        sample_width = wav_file.getsampwidth()
        nchannels = wav_file.getnchannels()
        frame_rate = wav_file.getframerate()
        if sample_width <= 0 or nchannels <= 0 or frame_rate <= 0:
            raise RuntimeError('Wave file metadata is invalid')
        dtype = np.int16 if sample_width == 2 else np.int32
        audio = np.frombuffer(frames, dtype=dtype)
        if audio.size == 0:
            raise RuntimeError('Waveform data is empty')
        if nchannels > 1:
            audio = audio.reshape(-1, nchannels)
            audio = audio.mean(axis=1)
        if np.max(np.abs(audio)) <= 0:
            raise RuntimeError('Waveform contains no non-zero samples')

    return {
        'size_bytes': size,
        'duration_seconds': round(duration, 3),
        'sample_rate': int(stream_info[0]) if stream_info[0].isdigit() else None,
        'channels': int(stream_info[1]) if stream_info[1].isdigit() else None,
    }


def load_separator():
    try:
        import audio_separator  # noqa: F401
        from audio_separator.separator import Separator  # type: ignore
    except ImportError as exc:
        raise RuntimeError(f'Unable to import audio_separator: {exc}') from exc
    return Separator


def read_wav_metrics(path: Path):
    with wave.open(str(path), 'rb') as wav_file:
        frames = wav_file.readframes(wav_file.getnframes())
        sample_width = wav_file.getsampwidth()
        frame_rate = wav_file.getframerate()
        channels = wav_file.getnchannels()
        nframes = wav_file.getnframes()
        duration = nframes / float(frame_rate) if frame_rate else 0.0
        max_amp = float(2 ** (8 * sample_width - 1) - 1)
        dtype = np.int16 if sample_width == 2 else np.int32
        audio = np.frombuffer(frames, dtype=dtype).astype(np.float32)
        if channels > 1:
            audio = audio.reshape(-1, channels).mean(axis=1)
        if audio.size == 0:
            return {
                'duration_seconds': round(duration, 3),
                'rms': 0.0,
                'peak': 0.0,
                'sample_rate': frame_rate,
                'channels': channels,
            }
        rms = float(np.sqrt(np.mean(audio * audio))) / max_amp if max_amp else 0.0
        peak = float(np.max(np.abs(audio))) / max_amp if max_amp else 0.0
        return {
            'duration_seconds': round(duration, 3),
            'rms': round(rms, 6),
            'peak': round(peak, 6),
            'sample_rate': frame_rate,
            'channels': channels,
        }


def analyze_stem(path: Path):
    metrics = read_wav_metrics(path)
    with wave.open(str(path), 'rb') as wav_file:
        frames = wav_file.readframes(wav_file.getnframes())
        sample_width = wav_file.getsampwidth()
        dtype = np.int16 if sample_width == 2 else np.int32
        audio = np.frombuffer(frames, dtype=dtype).astype(np.float32)
        channels = wav_file.getnchannels()
        if channels > 1:
            audio = audio.reshape(-1, channels).mean(axis=1)
        if audio.size < 1024:
            return {**metrics, 'contains_speech': False, 'contains_music': False, 'near_silent': True, 'silence_percentage': 100.0}
        sample_rate = wav_file.getframerate()
        spectrum = np.fft.rfft(audio)
        freqs = np.fft.rfftfreq(audio.size, d=1.0 / sample_rate)
        magnitudes = np.abs(spectrum)
        total_mag = float(magnitudes.sum())
        low_band = float(magnitudes[(freqs >= 80) & (freqs < 2000)].sum())
        mid_band = float(magnitudes[(freqs >= 2000) & (freqs < 6000)].sum())
        high_band = float(magnitudes[(freqs >= 6000)].sum())
        spectral_centroid = float((freqs * magnitudes).sum() / (total_mag + 1e-9))
        silence_mask = np.abs(audio) < 0.001
        silence_pct = 100.0 * float(silence_mask.mean())
        rms = float(np.sqrt(np.mean(audio * audio)))
        near_silent = (rms < 0.0005) or (metrics['peak'] < 0.001)
        speech_score = high_band / (total_mag + 1e-9)
        music_score = low_band / (total_mag + 1e-9)
        contains_speech = (speech_score > 0.12 and spectral_centroid > 1500) or (rms > 0.002 and high_band > 0.0)
        contains_music = (music_score > 0.25 and spectral_centroid < 2500) or (rms > 0.001 and mid_band > 0.0)
        if near_silent:
            contains_speech = False
            contains_music = False
        return {
            **metrics,
            'contains_speech': bool(contains_speech),
            'contains_music': bool(contains_music),
            'near_silent': bool(near_silent),
            'silence_percentage': round(silence_pct, 2),
            'spectral_centroid_hz': round(spectral_centroid, 2),
            'speech_score': round(speech_score, 4),
            'music_score': round(music_score, 4),
        }


def make_images(path: Path, stem_dir: Path):
    waveform_path = stem_dir / f'{path.stem}_waveform.png'
    spectrogram_path = stem_dir / f'{path.stem}_spectrogram.png'
    run([
        'ffmpeg', '-y', '-i', str(path), '-lavfi', 'showwavespic=s=1280x240:colors=white',
        '-frames:v', '1', str(waveform_path)
    ])
    run([
        'ffmpeg', '-y', '-i', str(path), '-lavfi', 'showspectrumpic=s=1280x240:mode=combined',
        '-frames:v', '1', str(spectrogram_path)
    ])
    return waveform_path, spectrogram_path


def build_report(run_dir: Path, input_meta: dict, stem_summaries: list[dict], model_meta: dict):
    lines = []
    lines.append('# Model Validation Report')
    lines.append('')
    lines.append('## Input validation')
    lines.append(f'- Input WAV: {INPUT_WAV}')
    lines.append(f'- File exists: yes')
    lines.append(f'- Duration (seconds): {input_meta["duration_seconds"]}')
    lines.append(f'- File size (bytes): {input_meta["size_bytes"]}')
    lines.append(f'- Sample rate: {input_meta["sample_rate"]}')
    lines.append(f'- Channels: {input_meta["channels"]}')
    lines.append('')
    lines.append('## Separator runtime')
    lines.append(f'- Python version: {model_meta["python_version"]}')
    lines.append(f'- audio-separator version: {model_meta["audio_separator_version"]}')
    lines.append(f'- onnxruntime version: {model_meta["onnxruntime_version"]}')
    lines.append(f'- Model filename: {model_meta["model_filename"]}')
    lines.append(f'- Model SHA256: {model_meta["model_sha256"]}')
    lines.append(f'- Model size (bytes): {model_meta["model_size_bytes"]}')
    lines.append('')
    lines.append('## Generated stems')
    if not stem_summaries:
        lines.append('- No stems were generated.')
    else:
        for item in stem_summaries:
            lines.append(f"- {item['filename']}: speech={item['contains_speech']}, music={item['contains_music']}, near_silent={item['near_silent']}, silence_pct={item['silence_percentage']}, duration={item['duration_seconds']}s, rms={item['rms']}, peak={item['peak']}, sr={item['sample_rate']}, ch={item['channels']}, path={item['absolute_path']}")
    lines.append('')
    lines.append('## Output artifacts')
    lines.append(f'- Output directory: {run_dir}')
    lines.append(f'- Report: {REPORT_PATH}')
    lines.append(f'- ZIP archive: {ZIP_PATH}')
    REPORT_PATH.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def create_zip(run_dir: Path):
    files = [path for path in run_dir.rglob('*') if path.is_file()]
    with zipfile.ZipFile(ZIP_PATH, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(files):
            zf.write(path, arcname=path.relative_to(ROOT))


def main():
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    run_dir = Path(tempfile.mkdtemp(prefix='separator_validation_', dir=str(OUTPUT_ROOT)))
    print(f'Input WAV: {INPUT_WAV}')
    try:
        created_input = maybe_create_long_input()
        try:
            input_meta = verify_input(created_input)
        except Exception:
            maybe_create_long_input()
            created_input = INPUT_WAV
            input_meta = verify_input(created_input)
        print(f'Input validation passed: {json.dumps(input_meta, sort_keys=True)}')

        Separator = load_separator()
        sep = Separator(
            output_dir=str(run_dir),
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
        sep.load_model(MODEL_FILE.name)
        output_files = sep.separate(str(created_input))
        print('output_files =', output_files)

        stem_summaries = []
        for item in output_files:
            resolved = Path(item)
            if not resolved.exists():
                candidate = run_dir / os.path.basename(item)
                if candidate.exists():
                    resolved = candidate
                else:
                    # Try deep search for the emitted output
                    matches = list(run_dir.rglob(os.path.basename(item)))
                    if matches:
                        resolved = matches[0]
                    else:
                        continue
            metrics = read_wav_metrics(resolved)
            analysis = analyze_stem(resolved)
            waveform_path, spectrogram_path = make_images(resolved, run_dir)
            stem_summaries.append({
                'filename': resolved.name,
                'absolute_path': str(resolved.resolve()),
                'size_bytes': resolved.stat().st_size if resolved.exists() else 0,
                'duration_seconds': analysis['duration_seconds'],
                'rms': analysis['rms'],
                'peak': analysis['peak'],
                'sample_rate': analysis['sample_rate'],
                'channels': analysis['channels'],
                'contains_speech': analysis['contains_speech'],
                'contains_music': analysis['contains_music'],
                'near_silent': analysis['near_silent'],
                'silence_percentage': analysis['silence_percentage'],
                'waveform_image': str(waveform_path),
                'spectrogram_image': str(spectrogram_path),
            })
            print(json.dumps(stem_summaries[-1], sort_keys=True))

        model_meta = {
            'python_version': sys.version.split()[0],
            'audio_separator_version': md.version('audio-separator'),
            'onnxruntime_version': __import__('onnxruntime').__version__,
            'model_filename': MODEL_FILE.name,
            'model_sha256': hashlib.sha256(MODEL_FILE.read_bytes()).hexdigest(),
            'model_size_bytes': MODEL_FILE.stat().st_size,
        }
        build_report(run_dir, input_meta, stem_summaries, model_meta)
        create_zip(run_dir)
        print(f'Report written to {REPORT_PATH}')
        print(f'ZIP archive written to {ZIP_PATH}')
        print(f'Run directory preserved at {run_dir}')
    except Exception as exc:
        print(f'VALIDATION_FAILED: {exc}')
        raise


if __name__ == '__main__':
    main()
