# AWS PostgreSQL migration runbook

This project uses **pure PostgreSQL** (`DATABASE_URL`) instead of Supabase. Auth is **cookie sessions** in `public.app_sessions` with users in `public.users`.

## Architecture

| Component | Technology |
|-----------|------------|
| Database | PostgreSQL 16 (RDS or EC2 localhost) |
| App DB access | `pg` pool + compatibility shim ([`src/lib/db/postgres-shim.ts`](../src/lib/db/postgres-shim.ts)) |
| Auth | Email/password in `public.users`, sessions in `public.app_sessions` |
| Redis | ElastiCache or local Redis 7+ (unchanged) |
| Migrations | SQL files in [`supabase/migrations/`](../supabase/migrations/) via `npm run db:migrate` |

## Prerequisites

- Node.js 20+
- PostgreSQL 16 with database created (e.g. `bostel_voice`)
- Redis 7+
- `.env` with `DATABASE_URL` and `REDIS_URL`

## 1. Create database and role (EC2 example)

On `voiceai.bostel.com` (client server):

```bash
sudo -u postgres psql
```

```sql
CREATE ROLE bostel_app WITH LOGIN PASSWORD 'your-strong-password';
CREATE DATABASE bostel_voice OWNER bostel_app;
GRANT ALL PRIVILEGES ON DATABASE bostel_voice TO bostel_app;
\q
```

`.env` on server:

```env
DATABASE_URL=postgresql://bostel_app:your-strong-password@127.0.0.1:5432/bostel_voice
REDIS_URL=redis://127.0.0.1:6379
NEXT_PUBLIC_APP_URL=https://voiceai.bostel.com
TWILIO_WEBHOOK_BASE_URL=https://voiceai.bostel.com
VOICE_MEDIA_STREAM_PROXY_VIA_APP=1
```

## 2. Apply schema migrations

From the app directory on your laptop or server:

```bash
cd /opt/bostel/app   # or your clone path
cp .env.example .env   # edit DATABASE_URL
npm ci
npm run db:migrate
```

Migration order (automatic):

1. `20260512120000_voice_ai_core.sql`
2. `20260512120100_platform_extensions.sql` (includes `public.users`)
3. `20260514120000_tenant_auth_membership_aws.sql` (skips Supabase `auth.users` variant)
4. Knowledge, phone, call log migrations
5. `20260601000000_aws_auth_sessions.sql` (sessions table)

Applied files are recorded in `public.schema_migrations`.

## 3. Build and run application

```bash
npm run build
npm run start:prod    # web + WSS proxy on :3000
npm run worker        # BullMQ (separate terminal)
```

Health check:

```bash
curl -s https://voiceai.bostel.com/api/health | jq
```

Expect `"postgres": { "ok": true }` and `"redis": { "ok": true }`.

## 4. HTTPS reverse proxy

Twilio requires HTTPS. Example Caddy:

```caddy
voiceai.bostel.com {
    reverse_proxy 127.0.0.1:3000
}
```

Twilio Voice URL:

`https://voiceai.bostel.com/api/webhooks/twilio/voice`

## 5. First user (signup)

1. Open `https://voiceai.bostel.com/signup`
2. Create organization + account
3. App creates: `users` → `tenants` → `tenant_entitlements` → `tenant_members` → session cookie

No email confirmation step (Supabase Auth removed).

## 6. AWS RDS (optional upgrade from EC2 Postgres)

| Setting | Pilot | Small prod |
|---------|-------|------------|
| Engine | PostgreSQL 16 | PostgreSQL 16 |
| Instance | `db.t4g.micro` | `db.t4g.small` |
| Storage | 20 GB gp3 | 50 GB gp3 |
| Multi-AZ | No | Optional |

Update `DATABASE_URL` to RDS endpoint; set `DATABASE_SSL=1`.

Estimated RDS cost: ~$15–40/mo (region-dependent) plus EC2 for app.

## 7. Verification checklist

- [ ] `npm run db:migrate` completes without errors
- [ ] `GET /api/health` → postgres + redis ok
- [ ] Signup → login → portal loads
- [ ] Create agent, phone number, knowledge base
- [ ] Inbound test call → call log appears in Call History
- [ ] Worker running (`npm run worker`)

## 8. Rollback

1. Keep RDS/Postgres snapshot before migration
2. Revert deploy to previous git tag that used Supabase
3. Restore Supabase env vars only if rolling back code (not mixed with new auth)

## 9. Removed Supabase pieces

- `@supabase/supabase-js` server client → `createServerSupabase()` now uses PostgreSQL shim
- Supabase Auth (browser + middleware) → `/api/auth/login`, `/api/auth/signup`, cookie session
- `auth.users` trigger → signup provisions tenant in application code

## 10. Troubleshooting

| Issue | Check |
|-------|--------|
| `DATABASE_URL is not configured` | `.env` loaded; `tsx --env-file=.env` for scripts |
| Migration fails on `auth.users` | Ensure `20260514120000_tenant_auth_membership.sql` was skipped (use `_aws` file) |
| Login works but portal empty | `tenant_members` row for user; rerun signup |
| Health postgres fail | DB reachable from app host; credentials; SSL flags |
| Voice silent | Redis up; worker running; see `docs/VOICE_LOCAL.md` |

## Appendix: Supabase → AWS mapping

| Former Supabase surface | Replacement |
|-------------------------|-------------|
| `createServerSupabase()` | [`createServerSupabase()`](../src/lib/db/supabase-server.ts) → PostgreSQL shim |
| `@supabase/ssr` middleware | Cookie guard in [`middleware.ts`](../src/middleware.ts) + server validation |
| Supabase Auth signup/login | [`/api/auth/signup`](../src/app/api/auth/signup/route.ts), [`/api/auth/login`](../src/app/api/auth/login/route.ts) |
| `auth.users` + trigger | [`provision-tenant.ts`](../src/lib/auth/provision-tenant.ts) on signup |
| `supabase db push` | `npm run db:migrate` ([`scripts/db/migrate.ts`](../scripts/db/migrate.ts)) |
| Service modules (`agents`, `calls`, …) | Same files; queries via shim until fully rewritten to raw SQL |

## Related docs

- [DEPLOY_AWS.md](./DEPLOY_AWS.md) — ECS/ALB split deployment
- [VOICE_LOCAL.md](./VOICE_LOCAL.md) — local voice testing
