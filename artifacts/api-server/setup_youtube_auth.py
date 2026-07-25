#!/usr/bin/env python3
"""
BlurShield AI — YouTube OAuth Setup (run once)

This script authenticates yt-dlp with your YouTube account so the
music-removal server can download videos without bot-detection blocks.

Usage:
  cd artifacts/api-server
  .venv/bin/python3 setup_youtube_auth.py

It will print a URL like:
  Go to https://www.google.com/device and enter code: XXXX-XXXX

Visit that URL in any browser, sign in with your Google account, and
enter the code shown. Once you confirm, the token is cached at:
  ~/.cache/yt-dlp/youtube/oauth-tokens.json

The music-removal pipeline reads from that cache automatically — you
only need to run this script once (or again if the token expires).
"""
import sys, os, subprocess

here = os.path.dirname(os.path.abspath(__file__))
venv_python = os.path.join(here, '.venv', 'bin', 'python3')

# Use a short, free, known-good video (≈10 seconds) just to trigger OAuth.
TEST_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'  # "Me at the zoo" (first YouTube video)

print('=== BlurShield AI — YouTube authentication setup ===')
print()
print('Starting the OAuth flow. Follow the instructions that appear below.')
print('(You will be asked to visit a URL and enter a short code.)')
print()

proc = subprocess.run(
    [
        venv_python, '-m', 'yt_dlp',
        '--username', 'oauth2',
        '--password', '',
        '--skip-download',              # do not actually download anything
        '--no-playlist',
        TEST_URL,
    ],
    # Do NOT capture output — we need the interactive prompts to show in the terminal.
    capture_output=False,
)

if proc.returncode == 0:
    print()
    print('✓  Authentication successful.')
    print('   Token cached — the music-removal pipeline will use it automatically.')
else:
    print()
    print('✗  Authentication failed (exit code:', proc.returncode, ')')
    print('   If you saw an "Authorization pending" or "Access denied" message,')
    print('   make sure you completed the steps at https://www.google.com/device.')
    sys.exit(1)
