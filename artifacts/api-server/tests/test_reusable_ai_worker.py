import importlib.util
import sys
from pathlib import Path
import unittest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
MODULE_PATH = REPO_ROOT / 'reusable_ai_worker.py'

spec = importlib.util.spec_from_file_location('reusable_ai_worker', MODULE_PATH)
reusable_ai_worker = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = reusable_ai_worker
spec.loader.exec_module(reusable_ai_worker)


class ReusableAiWorkerTests(unittest.TestCase):
    def test_build_status_payload_includes_job_identifier_and_progress(self):
        payload = reusable_ai_worker.build_status_payload(
            job_id='job-123',
            status='processing',
            stage='separating',
            progress=25,
            message='Preparing model',
            streaming_ready=False,
        )

        self.assertEqual(payload['jobId'], 'job-123')
        self.assertEqual(payload['status'], 'processing')
        self.assertEqual(payload['progress'], 25)
        self.assertEqual(payload['streamingReady'], False)

    def test_parse_request_extracts_job_metadata(self):
        request = {
            'jobId': 'job-2',
            'kind': 'youtube',
            'youtubeUrl': 'https://example.com/video',
            'outputPath': '/tmp/out.mp3',
            'statusFile': '/tmp/status.json',
        }

        parsed = reusable_ai_worker.parse_request(request)

        self.assertEqual(parsed['jobId'], 'job-2')
        self.assertEqual(parsed['kind'], 'youtube')
        self.assertEqual(parsed['youtubeUrl'], 'https://example.com/video')


if __name__ == '__main__':
    unittest.main()
