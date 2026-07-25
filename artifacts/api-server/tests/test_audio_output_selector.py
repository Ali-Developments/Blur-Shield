import os
import sys
import tempfile
import unittest
import wave
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from audio_output_selector import select_best_audio_candidate


class AudioOutputSelectorTests(unittest.TestCase):
    def _write_wav(self, path: str, samples, sample_rate: int = 16000) -> None:
        with wave.open(path, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(samples)

    def test_prefers_loud_vocal_like_candidate(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            silence_path = os.path.join(tmpdir, 'input_(Instrumental)_1_HP-UVR.wav')
            vocal_path = os.path.join(tmpdir, 'input_(Vocals)_1_HP-UVR.wav')
            self._write_wav(silence_path, b'\x00\x00' * 1600)
            self._write_wav(vocal_path, (b'\x00\x00' * 800) + (b'\xff\x7f' * 800))

            selected = select_best_audio_candidate([silence_path, vocal_path], tmpdir)

            self.assertEqual(selected, vocal_path)

    def test_prefers_vocals_stem_when_model_name_contains_vocal(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            instrumental_path = os.path.join(tmpdir, 'input_(Instrumental)_Kim_Vocal_2.wav')
            vocal_path = os.path.join(tmpdir, 'input_(Vocals)_Kim_Vocal_2.wav')
            self._write_wav(instrumental_path, (b'\x00\x00' * 1600))
            self._write_wav(vocal_path, (b'\x00\x00' * 800) + (b'\xff\x7f' * 800))

            selected = select_best_audio_candidate([instrumental_path, vocal_path], tmpdir)

            self.assertEqual(selected, vocal_path)

    def test_uses_single_candidate_when_only_one_file_exists(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            candidate = os.path.join(tmpdir, 'input.wav')
            self._write_wav(candidate, (b'\x00\x00' * 800) + (b'\x10\x00' * 800))

            selected = select_best_audio_candidate([candidate], tmpdir)

            self.assertEqual(selected, candidate)


if __name__ == '__main__':
    unittest.main()
