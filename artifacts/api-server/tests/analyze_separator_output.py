import json
import os
import shutil
import subprocess
import sys
import tempfile
import wave
import audioop
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

from audio_output_selector import select_best_audio_candidate
from audio_separator.separator import Separator


def run(cmd, check=True):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or '').strip() or f'Command failed: {cmd[0]}')
    return proc


def stats(path):
    with wave.open(path, 'rb') as wf:
        frames = wf.readframes(wf.getnframes())
        sput = wf.getsampwidth()
        rms = audioop.rms(frames, sput)
        peak = audioop.max(frames, sput)
        max_amp = float(2 ** (8 * sput - 1) - 1)
        return {
            'frames': wf.getnframes(),
            'rate': wf.getframerate(),
            'channels': wf.getnchannels(),
            'sampwidth': sput,
            'rms': float(rms / max_amp) if max_amp else 0.0,
            'peak': float(peak / max_amp) if max_amp else 0.0,
        }


def resolve_candidate(path_value, work_dir):
    if not path_value:
        return path_value
    if os.path.isabs(path_value) and os.path.exists(path_value):
        return path_value
    candidate = os.path.join(work_dir, path_value)
    if os.path.exists(candidate):
        return candidate
    basename = os.path.basename(path_value)
    for root, _, files in os.walk(work_dir):
        if basename in files:
            return os.path.join(root, basename)
    return path_value


if __name__ == '__main__':
    input_path = REPO / 'tests' / 'sample.mp3'
    work_dir = tempfile.mkdtemp(prefix='blurshield_analysis_', dir=str(REPO))
    model_dir = REPO / 'models'
    model_dir.mkdir(exist_ok=True)
    ffmpeg = shutil.which('ffmpeg') or 'ffmpeg'
    wav_path = os.path.join(work_dir, 'input.wav')
    run([ffmpeg, '-i', str(input_path), '-vn', '-ar', '44100', '-ac', '2', '-acodec', 'pcm_s16le', wav_path, '-y'])
    sep = Separator(
        output_dir=work_dir,
        model_file_dir=str(model_dir),
        output_format='WAV',
        mdx_params={
            'hop_length': 1024,
            'segment_size': 256,
            'overlap': 0.25,
            'batch_size': 1,
            'enable_denoise': True,
        },
    )
    model_candidates = ['1_HP-UVR.pth', 'Kim_Vocal_2.onnx']
    model_name = next((item for item in model_candidates if (model_dir / item).exists()), None)
    if not model_name:
        raise SystemExit(f'No supported model found in {model_dir}')
    sep.load_model(model_name)
    output_files = sep.separate(wav_path)
    resolved = [resolve_candidate(item, work_dir) for item in output_files]
    resolved = [item for item in resolved if os.path.exists(item)]
    report = {
        'input': str(input_path),
        'model': model_name,
        'output_files': output_files,
        'resolved': resolved,
        'stem_stats': [],
        'selected': None,
    }
    for path in resolved:
        report['stem_stats'].append({'path': path, 'name': os.path.basename(path), **stats(path)})
    selected = select_best_audio_candidate(output_files, work_dir)
    report['selected'] = selected
    print(json.dumps(report, indent=2))
    shutil.rmtree(work_dir, ignore_errors=True)
