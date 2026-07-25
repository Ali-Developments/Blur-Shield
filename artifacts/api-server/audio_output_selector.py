import audioop
import os
import re
import struct
import wave
from typing import Iterable, List, Optional, Sequence, Tuple


def _resolve_candidate(path_value: str, work_dir: str) -> str:
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


def _estimate_energy(path: str) -> Tuple[float, float]:
    if not os.path.exists(path):
        return 0.0, 0.0

    try:
        with wave.open(path, 'rb') as wav:
            frames = wav.readframes(wav.getnframes())
            sampwidth = wav.getsampwidth()
            if sampwidth <= 0:
                return 0.0, 0.0
            rms = audioop.rms(frames, sampwidth)
            peak = audioop.max(frames, sampwidth)
            max_amp = float(2 ** (8 * sampwidth - 1) - 1)
            if max_amp <= 0:
                return 0.0, 0.0
            rms_norm = rms / max_amp
            peak_norm = peak / max_amp
            return float(rms_norm), float(peak_norm)
    except Exception:
        return 0.0, 0.0


def _extract_stem_label(name: str) -> str:
    lowered = name.lower()

    parenthesized = re.findall(r'\(([^)]+)\)', lowered)
    for segment in parenthesized:
        tokens = [token for token in re.split(r'[^a-z0-9]+', segment) if token]
        for token in tokens:
            if token in {'vocal', 'vocals', 'voice', 'speech', 'sing', 'singing', 'instrumental', 'accompaniment', 'drums', 'drum', 'bass', 'other'}:
                return token

    tokens = [token for token in re.split(r'[^a-z0-9]+', lowered) if token]
    for token in tokens:
        if token in {'vocal', 'vocals', 'voice', 'speech', 'sing', 'singing', 'instrumental', 'accompaniment', 'drums', 'drum', 'bass', 'other'}:
            return token

    return ''


def _name_priority(name: str) -> int:
    label = _extract_stem_label(name)
    if label in {'vocal', 'vocals', 'voice', 'speech', 'sing', 'singing'}:
        return 3
    if label in {'instrumental', 'accompaniment', 'drums', 'drum', 'bass', 'other'}:
        return -3
    return 0


def select_best_audio_candidate(output_files: Sequence[str], work_dir: str) -> str:
    if not output_files:
        raise RuntimeError('Audio separation produced no output files.')

    resolved = [_resolve_candidate(item, work_dir) for item in output_files]
    resolved = [item for item in resolved if os.path.exists(item)]
    if not resolved:
        raise RuntimeError('Audio separation produced no usable output files.')

    scored: List[Tuple[float, str]] = []
    for path in resolved:
        name = os.path.basename(path).lower()
        priority = _name_priority(name)
        rms, peak = _estimate_energy(path)
        score = (priority * 1000.0) + (rms * 100.0) + (peak * 10.0)
        scored.append((score, path))

    best_score, best_path = max(scored, key=lambda item: item[0])
    rms, peak = _estimate_energy(best_path)
    if rms < 1e-6 and peak < 1e-4:
        raise RuntimeError('Audio separation produced a near-silent output. The vocal stem could not be recovered.')

    return best_path
