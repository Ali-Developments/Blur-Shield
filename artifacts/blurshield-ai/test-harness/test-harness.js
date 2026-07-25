(() => {
  const btnRun = document.getElementById('run');
  const btnStop = document.getElementById('stop');
  const img = document.getElementById('sampleImage');
  let interval = null;
  let overlay = document.getElementById('__bsFaceOverlayLayer');
  let track = null;

  function createOverlayLayer() {
    overlay.style.width = img.width + 'px';
    overlay.style.height = img.height + 'px';
    overlay.style.pointerEvents = 'none';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
  }

  function makeTrack() {
    // Very simple fake detection: center-top area of the image
    const rect = img.getBoundingClientRect();
    const box = {
      x: Math.round(rect.width * 0.25),
      y: Math.round(rect.height * 0.08),
      width: Math.round(rect.width * 0.5),
      height: Math.round(rect.height * 0.5),
    };

    return {
      id: 1,
      element: img,
      sourceElement: img,
      currentBox: box,
      rect: rect,
      missedFrames: 0,
      canvas: null,
      canvasCtx: null,
    };
  }

  function updateOverlay(track) {
    if (!track.canvas) {
      const c = document.createElement('canvas');
      c.id = '__bsFaceCanvas_' + track.id;
      c.style.position = 'absolute';
      c.style.pointerEvents = 'none';
      c.style.boxSizing = 'border-box';
      c.style.borderRadius = '14%';
      overlay.appendChild(c);
      track.canvas = c;
      track.canvasCtx = c.getContext && c.getContext('2d');
    }

    const left = track.currentBox.x;
    const top = track.currentBox.y;
    const w = Math.max(2, Math.round(track.currentBox.width));
    const h = Math.max(2, Math.round(track.currentBox.height));

    track.canvas.style.left = left + 'px';
    track.canvas.style.top = top + 'px';
    track.canvas.style.width = w + 'px';
    track.canvas.style.height = h + 'px';

    if (track.canvas.width !== w || track.canvas.height !== h) {
      track.canvas.width = w;
      track.canvas.height = h;
    }

    try {
      const src = track.sourceElement;
      const srcW = src.naturalWidth || src.width;
      const srcH = src.naturalHeight || src.height;
      const scaleX = srcW / img.getBoundingClientRect().width;
      const scaleY = srcH / img.getBoundingClientRect().height;

      const sx = Math.max(0, Math.round(track.currentBox.x * scaleX));
      const sy = Math.max(0, Math.round(track.currentBox.y * scaleY));
      const sw = Math.max(1, Math.round(track.currentBox.width * scaleX));
      const sh = Math.max(1, Math.round(track.currentBox.height * scaleY));

      const ctx = track.canvasCtx;
      if (ctx) {
        ctx.clearRect(0, 0, track.canvas.width, track.canvas.height);
        try {
          ctx.imageSmoothingEnabled = true;
          ctx.filter = 'blur(16px)';
          ctx.drawImage(src, sx, sy, sw, sh, 0, 0, track.canvas.width, track.canvas.height);
          ctx.filter = 'none';
        } catch (e) {
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fillRect(0, 0, track.canvas.width, track.canvas.height);
        }
      }
    } catch (err) {
      // ignore
    }
  }

  function start() {
    createOverlayLayer();
    track = makeTrack();
    updateOverlay(track);
    interval = setInterval(() => {
      // small oscillation to simulate motion
      const t = Date.now() / 600;
      track.currentBox.x += Math.round(Math.sin(t) * 1.5);
      track.currentBox.y += Math.round(Math.cos(t / 1.5) * 1.0);
      updateOverlay(track);
    }, 120);
  }

  function stop() {
    if (interval) clearInterval(interval);
    interval = null;
    if (track && track.canvas) { track.canvas.remove(); track.canvas = null; }
  }

  btnRun.addEventListener('click', start);
  btnStop.addEventListener('click', stop);

})();
