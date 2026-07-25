#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from audio_output_selector import select_best_audio_candidate

SCRIPT_DIR = Path(__file__).resolve().parent
MODEL_DIR = SCRIPT_DIR / 'models'

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

_SEPARATOR = None


def build_status_payload(job_id: str, status: str, stage: str, progress: int, message: str, streaming_ready: bool = False, error: str | None = None, extra: dict[str, Any] | None = None):
    payload = {
        'type': 'status',
        'jobId': job_id,
        'status': status,
        'stage': stage,
        'progress': progress,
        'message': message,
        'streamingReady': bool(streaming_ready),
    }
    if error:
        payload['error'] = error
    if extra:
        payload.update(extra)
    return payload


def parse_request(data: dict[str, Any]) -> dict[str, Any]:
    job_id = data.get('jobId') or data.get('id') or f'job-{os.urandom(4).hex()}'
    kind = (data.get('kind') or 'youtube').lower()
    if kind not in {'youtube', 'audio', 'local'}:
        kind = 'youtube'
    request = {
        'jobId': str(job_id),
        'kind': kind,
        'youtubeUrl': data.get('youtubeUrl'),
        'inputPath': data.get('inputPath'),
        'outputPath': data.get('outputPath'),
        'statusFile': data.get('statusFile'),
    }
    return request


def write_status(path: str | None, payload: dict[str, Any]):
    if not path:
        return
    try:
        with open(path, 'w', encoding='utf-8') as handle:
            json.dump(payload, handle)
    except Exception:
        pass


def emit_status(job_id: str, status: str, stage: str, progress: int, message: str, streaming_ready: bool = False, error: str | None = None, extra: dict[str, Any] | None = None):
    payload = build_status_payload(job_id, status, stage, progress, message, streaming_ready=streaming_ready, error=error, extra=extra)
    print(json.dumps(payload), flush=True)


def run(cmd, check: bool = True):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or '').strip() or f'Command failed: {cmd[0]}')
    return proc


def resolve_ffmpeg_path():
    env_candidates = []
    env_value = os.environ.get('FFMPEG_PATH')
    if env_value:
        env_candidates.append(env_value)
    env_candidates.extend(os.environ.get('PATH', '').split(os.pathsep))

    for candidate in env_candidates:
        if not candidate:
            continue
        if candidate.endswith('.exe') and os.path.exists(candidate):
            return candidate
        if os.path.isdir(candidate):
            for name in ('ffmpeg.exe', 'ffmpeg'):
                full_path = os.path.join(candidate, name)
                if os.path.exists(full_path):
                    return full_path

    for candidate in [
        os.path.join(SCRIPT_DIR, 'bin', 'ffmpeg.exe'),
        os.path.join(SCRIPT_DIR, 'bin', 'ffmpeg'),
        os.path.join(SCRIPT_DIR, 'ffmpeg.exe'),
        os.path.join(SCRIPT_DIR, 'ffmpeg'),
    ]:
        if os.path.exists(candidate):
            return candidate
    return None


def ensure_ffmpeg():
    ffmpeg_path = resolve_ffmpeg_path()
    if not ffmpeg_path:
        raise RuntimeError('ffmpeg is required for audio extraction and encoding.')
    try:
        run([ffmpeg_path, '-version'], check=False)
    except FileNotFoundError as exc:
        raise RuntimeError('ffmpeg is required for audio extraction and encoding.') from exc
    return ffmpeg_path


def extract_audio(input_path: str, work_dir: str, ffmpeg_path: str):
    wav_path = os.path.join(work_dir, 'input.wav')
    run([ffmpeg_path, '-i', input_path, '-vn', '-ar', '44100', '-ac', '2', '-acodec', 'pcm_s16le', wav_path, '-y'])
    return wav_path


def build_ytdlp_auth_args(cookies_file: str | None = None):
    if cookies_file and os.path.exists(cookies_file):
        return ['--cookies', cookies_file]
    return []


def download_youtube_audio(youtube_url: str, work_dir: str, job_id: str, status_file: str | None):
    emit_status(job_id, 'processing', 'downloading', 8, 'Downloading audio from YouTube…')
    write_status(status_file, {'status': 'processing', 'stage': 'downloading', 'progress': 8, 'message': 'Downloading audio from YouTube…'})

    out_template = os.path.join(work_dir, 'input.%(ext)s')
    python_cmd = sys.executable or os.environ.get('PYTHON', 'python3')
    cookies_file = os.path.join(SCRIPT_DIR, 'youtube_cookies.txt')
    auth_args = build_ytdlp_auth_args(cookies_file)
    cmd = [
        python_cmd, '-m', 'yt_dlp',
        '--no-playlist',
        '--no-cache-dir',
        '-x',
        '--audio-format', 'wav',
        '--audio-quality', '0',
        '--postprocessor-args', 'ffmpeg:-ar 44100 -ac 2',
        *auth_args,
        '-o', out_template,
        youtube_url,
    ]
    run(cmd, check=False)

    wav_path = os.path.join(work_dir, 'input.wav')
    if not os.path.exists(wav_path):
        for candidate in os.listdir(work_dir):
            full_path = os.path.join(work_dir, candidate)
            if candidate.startswith('input') and candidate.endswith('.wav'):
                os.replace(full_path, wav_path)
                break
            if candidate.startswith('input') and not candidate.endswith('.wav'):
                run(['ffmpeg', '-i', full_path, '-ar', '44100', '-ac', '2', '-acodec', 'pcm_s16le', wav_path, '-y'])
                os.remove(full_path)
                break
    if not os.path.exists(wav_path):
        raise RuntimeError('yt-dlp did not produce a WAV file to continue')
    return wav_path


def load_separator(work_dir: str):
    global _SEPARATOR
    if _SEPARATOR is not None:
        try:
            _SEPARATOR.output_dir = work_dir
        except Exception:
            pass
        return _SEPARATOR

    try:
        from audio_separator.separator import Separator  # noqa: PLC0415
    except ImportError as exc:
        raise RuntimeError('audio-separator is not installed in this environment; install it to enable local separation.') from exc

    model_candidates = [
        os.path.join(MODEL_DIR, 'Kim_Vocal_2.onnx'),
        os.path.join(MODEL_DIR, '1_HP-UVR.pth'),
        os.path.join(MODEL_DIR, '1_HP-UVR.onnx'),
    ]
    model_path = next((item for item in model_candidates if os.path.exists(item)), None)
    if model_path is None:
        raise RuntimeError(f'No supported separator model found in {MODEL_DIR}')

    sep = Separator(
        output_dir=work_dir,
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
    sep.load_model(os.path.basename(model_path))
    _SEPARATOR = sep
    return sep


def separate_audio(audio_wav: str, work_dir: str, job_id: str, status_file: str | None):
    emit_status(job_id, 'initializing', 'separating', 24, 'Loading AI separation model…')
    write_status(status_file, {'status': 'initializing', 'stage': 'separating', 'progress': 24, 'message': 'Loading AI separation model…'})
    sep = load_separator(work_dir)
    emit_status(job_id, 'model_ready', 'model_ready', 40, 'Model ready for inference…')
    write_status(status_file, {'status': 'model_ready', 'stage': 'model_ready', 'progress': 40, 'message': 'Model ready for inference…'})

    emit_status(job_id, 'processing', 'separating', 55, 'Processing audio for speech-vs-background separation…')
    write_status(status_file, {'status': 'processing', 'stage': 'separating', 'progress': 55, 'message': 'Processing audio for speech-vs-background separation…'})
    output_files = sep.separate(audio_wav)

    resolved = []
    for path_value in output_files:
        if not path_value:
            continue
        if os.path.isabs(path_value) and os.path.exists(path_value):
            resolved.append(path_value)
            continue
        candidate = os.path.join(work_dir, path_value)
        if os.path.exists(candidate):
            resolved.append(candidate)
            continue
        for root, _, files in os.walk(work_dir):
            if os.path.basename(path_value) in files:
                resolved.append(os.path.join(root, os.path.basename(path_value)))
                break
    resolved = [item for item in resolved if os.path.exists(item)]
    if not resolved:
        raise RuntimeError('Audio separation produced no usable output.')

    selected_path = select_best_audio_candidate(resolved, work_dir)
    if not os.path.exists(selected_path):
        raise RuntimeError(f'Audio separation produced no usable output at {selected_path}.')
    return selected_path, resolved


def encode_output(vocals_wav: str, output_path: str, job_id: str, status_file: str | None, ffmpeg_path: str):
    emit_status(job_id, 'encoding', 'encoding', 84, 'Encoding clean audio output…', streaming_ready=False)
    write_status(status_file, {'status': 'encoding', 'stage': 'encoding', 'progress': 84, 'message': 'Encoding clean audio output…', 'streamingReady': False})
    run([ffmpeg_path, '-i', vocals_wav, '-codec:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', output_path, '-y'])
    emit_status(job_id, 'ready', 'ready', 96, 'Output ready for playback…', streaming_ready=True)
    write_status(status_file, {'status': 'ready', 'stage': 'ready', 'progress': 96, 'message': 'Output ready for playback…', 'streamingReady': True})


def process_job(request: dict[str, Any]):
    job_id = request['jobId']
    status_file = request.get('statusFile')
    work_dir = tempfile.mkdtemp(prefix='blurshield_worker_')
    try:
        ffmpeg_path = ensure_ffmpeg()
        if request['kind'] == 'youtube':
            if not request.get('youtubeUrl'):
                raise RuntimeError('YouTube URL is required for YouTube jobs.')
            audio_wav = download_youtube_audio(request['youtubeUrl'], work_dir, job_id, status_file)
        else:
            input_path = request.get('inputPath')
            if not input_path or not os.path.exists(input_path):
                raise RuntimeError('Input audio or video path is required.')
            audio_wav = extract_audio(input_path, work_dir, ffmpeg_path)

        selected_path, _ = separate_audio(audio_wav, work_dir, job_id, status_file)
        output_path = request.get('outputPath')
        if not output_path:
            raise RuntimeError('Output path is required.')
        encode_output(selected_path, output_path, job_id, status_file, ffmpeg_path)
        write_status(status_file, {'status': 'completed', 'stage': 'completed', 'progress': 100, 'message': 'Music removed — vocals only.', 'streamingReady': True})
        emit_status(job_id, 'completed', 'completed', 100, 'Music removed — vocals only.', streaming_ready=True)
        print(json.dumps({'type': 'result', 'jobId': job_id, 'status': 'completed', 'success': True, 'outputPath': output_path, 'streamingReady': True}), flush=True)
    except Exception as exc:
        message = str(exc)
        write_status(status_file, {'status': 'failed', 'stage': 'failed', 'progress': 0, 'message': message, 'error': message, 'streamingReady': False})
        emit_status(job_id, 'failed', 'failed', 0, message, streaming_ready=False, error=message)
        print(json.dumps({'type': 'error', 'jobId': job_id, 'status': 'failed', 'success': False, 'error': message}), flush=True)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main():
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if payload.get('command') == 'shutdown':
            break
        if payload.get('command') == 'ping':
            print(json.dumps({'type': 'pong'}), flush=True)
            continue
        if payload.get('job'):
            process_job(parse_request(payload['job']))
        else:
            process_job(parse_request(payload))


if __name__ == '__main__':
    main()
