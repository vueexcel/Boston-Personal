# Local voice testing (Twilio inbound)

Reference: [Twilio Voice webhooks](https://www.twilio.com/docs/voice/tutorials/how-to-respond-to-incoming-phone-calls), [error 11200](https://www.twilio.com/docs/api/errors/11200).

## Mode A — Development (`npm run dev`)

**Processes:** Redis → `npm run dev` (3000) → `npm run worker` (3001) → HTTPS tunnel to **3000** (webhooks) + tunnel to **3001** (Media Stream WSS).

```env
VOICE_MEDIA_STREAM_PROXY_VIA_APP=0
NEXT_PUBLIC_APP_URL=https://YOUR-TUNNEL-TO-3000
TWILIO_WEBHOOK_BASE_URL=https://YOUR-TUNNEL-TO-3000
TWILIO_MEDIA_STREAM_WSS_URL=wss://YOUR-TUNNEL-TO-3001/twilio/media-stream
REDIS_URL=redis://localhost:6379
DEBUG_VOICE=1
```

**Before calling:** warm webhooks (first compile can exceed Twilio’s 15s limit). Twilio Console Voice URL must match exactly:

`https://YOUR-TUNNEL-TO-3000/api/webhooks/twilio/voice`

## Mode B — Prod-like local (`npm run build` + `npm run start:prod`)

Avoids cold-compile timeout on the first call. Uses the **standalone** build (not `next dev`).

**Single ngrok tunnel** (`VOICE_MEDIA_STREAM_PROXY_VIA_APP=1`):

```bash
npm run build
npm run start:prod   # standalone + WSS on port 3000
npm run worker
ngrok http 3000
```

**Two tunnels** (`PROXY=0`): use `npm run start:standalone` on 3000 + worker on 3001 instead of `start:prod`.

Same env as Mode A. Prefer this before deploying to AWS.

## Mode C — Docker Compose

```bash
docker compose up --build
```

Point ngrok at ports **3000** (webhooks) and **3001** (WSS). Set `REDIS_URL=redis://localhost:6379` only when hitting host processes; compose sets `redis://redis:6379` inside containers.

## Checklist

- [ ] Redis running
- [ ] Worker running (`npm run worker`)
- [ ] `TWILIO_AUTH_TOKEN` matches Twilio Console
- [ ] `TWILIO_WEBHOOK_BASE_URL` = exact public HTTPS host (no trailing slash)
- [ ] Phone number has **ACTIVE** agent assigned
- [ ] Terminal: `twiml-media-stream` (set `DEBUG_VOICE=1` to see logs)
- [ ] Worker: `ws upgrade accepted`

## Voice tuning (barge-in, endpointing, latency)

Twilio RTT does not expose silence-timeout or VAD sliders. The app implements:

- **Barge-in:** partial transcripts stop TTS via Media Stream `clear` + abort playback
- **Endpointing:** `VOICE_ENDPOINT_SILENCE_MS` (default 450ms) after stable partials
- **STT engine:** `TWILIO_TRANSCRIPTION_ENGINE=google` or `deepgram` (test both)
- **Media Stream STT fallback:** enabled by default when `OPENAI_API_KEY` is set (`VOICE_MEDIA_STT=0` to disable). Use when Twilio RTT webhooks never arrive.
- **Latency:** streaming LLM + ElevenLabs flash TTS (`ELEVENLABS_TTS_MODEL=eleven_flash_v2_5`)

Set `DEBUG_VOICE=1` to log `llmFirstTokenMs`, `ttsFirstByteMs`, `firstMediaSentMs` per turn.

## Do not use

- localtunnel that exits immediately after printing a URL
- free ngrok interstitial for production voice tests
- `npm run dev:unified` for routine testing (experimental; breaks Next HMR)
