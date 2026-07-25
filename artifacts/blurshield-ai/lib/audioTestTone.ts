// Generates a short synthetic WAV (mixed 100Hz "bass/music" tone + 2000Hz
// "speech-band" tone), embedded directly as a data: URI. Because it's a
// same-document data URI with no network fetch involved, it is never
// CORS-tainted — so it gives a deterministic, offline way to prove the
// Smart Music Filter's Web Audio DSP chain genuinely attenuates the bass
// band while preserving the speech band, independent of any third-party
// platform's CORS policy (which is the one thing this filter cannot control).
function encodeBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    const triple = (b1 << 16) | ((b2 ?? 0) << 8) | (b3 ?? 0);
    result += chars[(triple >> 18) & 0x3f];
    result += chars[(triple >> 12) & 0x3f];
    result += b2 === undefined ? '=' : chars[(triple >> 6) & 0x3f];
    result += b3 === undefined ? '=' : chars[triple & 0x3f];
  }
  return result;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

export function generateDualToneWavBase64(durationSec = 2, sampleRate = 8000): string {
  const numSamples = Math.floor(durationSec * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // "Music"-like bass tone (strong low frequency, mimics a bassline).
    const bass = Math.sin(2 * Math.PI * 100 * t) * 0.5;
    // "Speech"-like mid-band tone (sits in the vocal presence range).
    const speech = Math.sin(2 * Math.PI * 2000 * t) * 0.35;
    const sample = Math.max(-1, Math.min(1, bass + speech));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }

  return encodeBase64(new Uint8Array(buffer));
}

export function buildAudioTestPageHtml(): string {
  const wavBase64 = generateDualToneWavBase64();
  return `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="background:#0b0f19;color:#e5e9f5;font-family:-apple-system,sans-serif;padding:24px;text-align:center;">
  <h2 style="margin-bottom:8px;">BlurShield Audio Filter Self-Test</h2>
  <p style="color:#9aa4bf;font-size:13px;line-height:1.5;">
    Synthetic loop: a 100Hz "bass/music" tone mixed with a 2000Hz "speech-band" tone.
    This file is a same-document data: URI, so it can never be CORS-blocked —
    it isolates whether the DSP chain itself works, apart from any platform's CORS policy.
  </p>
  <audio id="blurshield-test-audio" autoplay loop controls
    style="width:100%;margin-top:16px;"
    src="data:audio/wav;base64,${wavBase64}"></audio>
</body>
</html>`;
}
