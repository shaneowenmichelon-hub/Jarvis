/* ElevenLabs TTS proxy. Streams audio from ElevenLabs back to the
   browser so the API key never reaches the client. Returns 503 if
   not configured — the frontend falls back to browser SpeechSynthesis. */

import { Readable } from 'node:stream';

// Daniel — British male news-presenter delivery. More conversational than
// George (who's an audiobook narrator) and lands closer to the
// measured-but-warm JARVIS feel from Iron Man.
const DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9';

// eleven_multilingual_v2 has the most natural prosody — slight latency
// tradeoff vs turbo but ~3x more human-sounding. Worth it for a voice
// you actually want to listen to.
const DEFAULT_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';

export function isEnabled() {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function streamTTS(text, res) {
  if (!isEnabled()) {
    res.status(503).json({ error: 'TTS not configured. Set ELEVENLABS_API_KEY.' });
    return;
  }
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text required' });
    return;
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE}/stream?optimize_streaming_latency=2`;
  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: DEFAULT_MODEL,
      // Lower stability = more natural prosody variation (sounds less robotic).
      // Higher style = more expressive emotion in delivery.
      // High similarity_boost preserves the voice's character even with more variation.
      voice_settings: {
        stability: 0.32,
        similarity_boost: 0.85,
        style: 0.55,
        use_speaker_boost: true,
      },
    }),
  });

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => '');
    console.error('[tts] ElevenLabs', upstream.status, body.slice(0, 300));
    res.status(upstream.status).json({ error: `ElevenLabs ${upstream.status}` });
    return;
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-cache');
  Readable.fromWeb(upstream.body).pipe(res);
}
