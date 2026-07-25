Test harness for BlurShield injected script

Instructions:

1. Open the file `artifacts/blurshield-ai/test-harness/index.html` in a modern desktop browser (Chrome/Edge/Firefox).
   - It's easiest to start a local static server from the project root, e.g. with Python:

```bash
# from workspace root
python -m http.server 8000
# then open http://localhost:8000/artifacts/blurshield-ai/test-harness/index.html
```

2. Click "Start Blur". A canvas overlay is created over the sample image using the same rendering technique used by the injected script.
3. Observe the blurred face area. Use the console to see any errors.

Notes:
- This harness uses a static sample image located at `photos/WhatsApp Image 2026-07-20 at 8.12.39 PM.jpeg`.
- For video testing and fullscreen scenarios, please run the app on device as desktop browser behavior differs from mobile WebView/native players.
