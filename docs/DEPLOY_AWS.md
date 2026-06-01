# AWS deployment (voice)

## Architecture

- **ECS service `web`**: Next.js standalone (`Dockerfile.web`) — portal, APIs, Twilio HTTP webhooks
- **ECS service `worker`**: Media Stream WSS + BullMQ (`Dockerfile.worker`)
- **RDS PostgreSQL** (or EC2 localhost Postgres): app data + auth sessions — see [AWS_POSTGRES_MIGRATION.md](./AWS_POSTGRES_MIGRATION.md)
- **ElastiCache Redis**: voice call sessions, utterance pub/sub, BullMQ queues
- **ALB**: HTTPS + WebSocket enabled

Required env (web + worker):

```env
DATABASE_URL=postgresql://user:pass@your-rds-host:5432/bostel_voice
REDIS_URL=redis://your-elasticache:6379
```

## ALB routing

| Path | Target |
|------|--------|
| `/twilio/media-stream` | Worker service (port 3001) |
| `/*` | Web service (port 3000) |

Set in environment:

```env
VOICE_MEDIA_STREAM_PROXY_VIA_APP=0
TWILIO_MEDIA_STREAM_WSS_URL=wss://api.yourdomain.com/twilio/media-stream
TWILIO_WEBHOOK_BASE_URL=https://api.yourdomain.com
NEXT_PUBLIC_APP_URL=https://api.yourdomain.com
```

## Twilio Console

- Voice URL: `https://api.yourdomain.com/api/webhooks/twilio/voice` (POST)
- Status callback: configured on number or via provision API to `/api/webhooks/twilio/voice/status`

## Health checks

- Web target group: `GET /api/health` → 200 when Redis reachable
- Worker target group: `GET /` on port 3001 → 200

## Build and push

```bash
docker build -f Dockerfile.web -t bostonai-web .
docker build -f Dockerfile.worker -t bostonai-worker .
```

Run `npm run postbuild` is included in `Dockerfile.web` build via `npm run build`.

## Single-container alternative

Set `VOICE_MEDIA_STREAM_PROXY_VIA_APP=1` and run `npm run start:prod` (`server.prod.ts`) so WSS shares port 3000. Use one ALB target only.
