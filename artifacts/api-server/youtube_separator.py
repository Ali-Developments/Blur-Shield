#!/usr/bin/env python3
"""
BlurShield AI — YouTube Audio Separation Worker
Downloads audio-only from YouTube using yt-dlp, then runs MDX-Net
Kim_Vocal_2 (ONNX Runtime CPU) to separate music from speech/vocals.

Usage:
  python3 youtube_separator.py
    --youtube-url <url>      YouTube video URL (preferred)
    --input <path>           Local audio/video file (manual paste fallback)
    --output <path>          Output MP3 path (vocals-only)
    --status-file <path>     JSON progress file polled by the Express host

Progress is written as newline-delimited JSON to --status-file.
Final result is printed as a single JSON line to stdout.
"""
import sys, os, json, argparse, subprocess, tempfile, shutil, logging
from audio_output_selector import select_best_audio_candidate

logging.getLogger().setLevel(logging.WARNING)


def log_pipeline(event, **payload):
    print(json.dumps({'event': event, **payload}, default=str), flush=True)


def write_status(path, data):
    if not path:
        return
    try:
        with open(path, 'w') as f:
            json.dump(data, f)
    except Exception:
        pass


def run(cmd, check=True, capture=True):
    r = subprocess.run(cmd, capture_output=capture, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(
            f"{cmd[0]} failed (exit {r.returncode}): {(r.stderr or '')[-600:]}"
        )
    return r


def venv_python():
    """Return the active interpreter that launched this worker process."""
    return sys.executable or os.environ.get('PYTHON', 'python3')


def build_ytdlp_auth_args(cookies_file=None, cookies_browser=None):
    """Return the appropriate yt-dlp auth arguments for the current environment."""
    if cookies_file:
        return ['--cookies', cookies_file]
    if cookies_browser:
        return ['--cookies-from-browser', cookies_browser]
    return []


# ── helpers ───────────────────────────────────────────────────────────────────

def download_youtube_audio(youtube_url, work_dir, status_file):
    """Download audio-only track with yt-dlp. Returns path to WAV file."""
    log_pipeline('youtube_input', youtube_url=youtube_url, work_dir=work_dir)
    write_status(status_file, {
        'stage': 'downloading', 'progress': 5,
        'message': 'Downloading audio from YouTube…',
    })

    # Use `python3 -m yt_dlp` so the venv's interpreter is always used.
    # The CLI script at .venv/bin/yt-dlp uses #!/usr/bin/env python3 which
    # resolves to the system Python and cannot find the venv-installed module.
    out_template = os.path.join(work_dir, 'input.%(ext)s')
    python_cmd = venv_python()
    here = os.path.dirname(os.path.abspath(__file__))

    # Auth strategy (checked in order):
    #  1. youtube_cookies.txt  — Netscape cookies exported from a signed-in browser
    #  2. browser cookies      — if a browser is available and configured
    #  3. No auth              — may hit bot detection on cloud IPs
    cookies_file = os.path.join(here, 'youtube_cookies.txt')
    auth_args = build_ytdlp_auth_args(
        cookies_file=cookies_file,
        cookies_browser=os.environ.get('YTDLP_COOKIES_FROM_BROWSER') or None,
    )

    base_cmd = [
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

    r = run(base_cmd, check=False)
    if r.returncode != 0:
        err = (r.stderr or '') + (r.stdout or '')
        if 'bot' in err.lower() or 'sign in' in err.lower():
            raise RuntimeError(
                'YouTube download blocked (bot detection). '
                'Run `python3 setup_youtube_auth.py` in the api-server directory '
                'to authenticate once, then retry.'
            )
        raise RuntimeError(f'yt-dlp failed (exit {r.returncode}):\n{err[-600:]}')

    # yt-dlp may rename the file, find it
    wav = os.path.join(work_dir, 'input.wav')
    if not os.path.exists(wav):
        for f in os.listdir(work_dir):
            if f.startswith('input') and (f.endswith('.wav') or f.endswith('.webm')):
                full = os.path.join(work_dir, f)
                if not f.endswith('.wav'):
                    # Convert to WAV
                    run(['ffmpeg', '-i', full, '-ar', '44100', '-ac', '2',
                         '-acodec', 'pcm_s16le', wav, '-y'])
                    os.remove(full)
                else:
                    os.rename(full, wav)
                break

    if not os.path.exists(wav):
        raise RuntimeError('yt-dlp did not produce a WAV file in ' + work_dir)

    log_pipeline('downloaded_audio', path=wav)
    write_status(status_file, {
        'stage': 'downloading', 'progress': 18,
        'message': 'Audio downloaded — starting AI separation…',
    })
    return wav


def get_audio_metadata(path):
    if not os.path.exists(path):
        return None
    try:
        duration = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path],
            capture_output=True, text=True, check=False,
        )
        duration_value = duration.stdout.strip() or None
    except Exception:
        duration_value = None
    try:
        size = os.path.getsize(path)
    except Exception:
        size = None
    return {'duration_seconds': duration_value, 'filesize_bytes': size}


def separate_audio(audio_wav, work_dir, status_file):
    """Run MDX-Net Kim_Vocal_2 to separate vocals. Returns path to vocals WAV."""
    write_status(status_file, {
        'stage': 'separating', 'progress': 20,
        'message': 'Loading MDX-Net Kim_Vocal_2 model…',
    })

    from audio_separator.separator import Separator  # noqa: PLC0415

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

    write_status(status_file, {
        'stage': 'separating', 'progress': 30,
        'message': 'Running MDX-Net stem separation (Kim_Vocal_2) — this takes 1–3 min on CPU…',
    })

    sep.load_model('Kim_Vocal_2.onnx')

    write_status(status_file, {
        'stage': 'separating', 'progress': 38,
        'message': 'AI model loaded — processing audio…',
    })

    output_files = sep.separate(audio_wav)
    for output_path in output_files:
        stem_name = os.path.splitext(os.path.basename(output_path))[0]
        metadata = get_audio_metadata(output_path)
        log_pipeline('separator_output', filename=os.path.basename(output_path), stem_type=stem_name, **(metadata or {}))

    write_status(status_file, {
        'stage': 'separating', 'progress': 82,
        'message': 'Separation complete — locating vocals stem…',
        'stems': output_files,
    })

    selected_path = select_best_audio_candidate(output_files, work_dir)
    log_pipeline('selected_output', path=selected_path)
    write_status(status_file, {
        'stage': 'separating', 'progress': 84,
        'message': 'Selected vocals stem for delivery…',
        'stems': output_files,
        'selected_audio': selected_path,
    })
    return selected_path, output_files


def encode_output(vocals_wav, output_path, status_file):
    """Encode vocals WAV → MP3 for compact transfer."""
    write_status(status_file, {
        'stage': 'encoding', 'progress': 90,
        'message': 'Encoding output…',
        'streamingReady': True,
    })
    run([
        'ffmpeg',
        '-i', vocals_wav,
        '-codec:a', 'libmp3lame',
        '-b:a', '192k',
        '-ar', '44100',
        output_path, '-y',
    ])
    log_pipeline('encoded_output', path=output_path, **(get_audio_metadata(output_path) or {}))


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--youtube-url', default=None,
                        help='YouTube video URL')
    parser.add_argument('--input', default=None,
                        help='Local audio/video file (fallback)')
    parser.add_argument('--output', required=True,
                        help='Output MP3 path')
    parser.add_argument('--status-file', default=None,
                        help='JSON progress file')
    args = parser.parse_args()

    if not args.youtube_url and not args.input:
        print(json.dumps({'success': False, 'error': '--youtube-url or --input required'}))
        sys.exit(1)

    status_file = args.status_file
    work_dir = tempfile.mkdtemp(prefix='blurshield_yt_')

    try:
        # ── Step 1: Obtain audio WAV ─────────────────────────────────────
        if args.youtube_url:
            audio_wav = download_youtube_audio(args.youtube_url, work_dir, status_file)
        else:
            # Local file — convert to WAV if needed
            write_status(status_file, {
                'stage': 'extracting', 'progress': 8,
                'message': 'Extracting audio from file…',
            })
            audio_wav = os.path.join(work_dir, 'input.wav')
            run([
                'ffmpeg', '-i', args.input,
                '-vn', '-ar', '44100', '-ac', '2',
                '-acodec', 'pcm_s16le', audio_wav, '-y',
            ])

        # ── Step 2: AI separation ────────────────────────────────────────
        vocals_wav, stems = separate_audio(audio_wav, work_dir, status_file)

        # ── Step 3: Encode output ────────────────────────────────────────
        encode_output(vocals_wav, args.output, status_file)

        write_status(status_file, {
            'stage': 'done', 'progress': 100,
            'message': 'Music removed — vocals only.',
            'stems': stems,
            'selected_audio': vocals_wav,
        })
        print(json.dumps({'success': True, 'output': args.output, 'stems': stems, 'selected_audio': vocals_wav}))

    except Exception as exc:
        msg = str(exc)
        write_status(status_file, {
            'stage': 'error', 'progress': 0, 'message': msg,
        })
        print(json.dumps({'success': False, 'error': msg}))
        sys.exit(1)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == '__main__':
    main()
