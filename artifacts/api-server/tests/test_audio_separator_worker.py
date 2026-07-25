import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPO_ROOT / 'audio_separator_worker.py'

spec = importlib.util.spec_from_file_location('audio_separator_worker', MODULE_PATH)
audio_separator_worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audio_separator_worker)


class AudioSeparatorWorkerTests(unittest.TestCase):
    def test_resolve_ffmpeg_path_prefers_explicit_environment_variable(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            fake_bin = Path(tmpdir) / 'ffmpeg.exe'
            fake_bin.write_bytes(b'fake')
            old_value = os.environ.get('FFMPEG_PATH')
            os.environ['FFMPEG_PATH'] = str(fake_bin)
            try:
                resolved = audio_separator_worker.resolve_ffmpeg_path()
            finally:
                if old_value is None:
                    os.environ.pop('FFMPEG_PATH', None)
                else:
                    os.environ['FFMPEG_PATH'] = old_value

        self.assertEqual(resolved, str(fake_bin))

    def test_resolve_ffmpeg_path_returns_none_when_missing(self):
        old_value = os.environ.get('FFMPEG_PATH')
        os.environ.pop('FFMPEG_PATH', None)
        try:
            resolved = audio_separator_worker.resolve_ffmpeg_path()
        finally:
            if old_value is None:
                os.environ.pop('FFMPEG_PATH', None)
            else:
                os.environ['FFMPEG_PATH'] = old_value

        self.assertIsNone(resolved)


if __name__ == '__main__':
    unittest.main()
