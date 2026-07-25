import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from youtube_separator import build_ytdlp_auth_args


class YoutubeSeparatorAuthArgsTests(unittest.TestCase):
    def test_prefers_cookie_file_when_available(self):
        cookies_file = '/tmp/youtube_cookies.txt'
        self.assertEqual(
            build_ytdlp_auth_args(cookies_file=cookies_file),
            ['--cookies', cookies_file],
        )

    def test_uses_browser_cookies_when_configured(self):
        self.assertEqual(
            build_ytdlp_auth_args(cookies_browser='chrome'),
            ['--cookies-from-browser', 'chrome'],
        )

    def test_falls_back_to_no_auth_args_when_no_credentials_are_available(self):
        self.assertEqual(build_ytdlp_auth_args(), [])


if __name__ == '__main__':
    unittest.main()
