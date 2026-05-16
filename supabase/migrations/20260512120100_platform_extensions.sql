-- Platform extensions: users, entitlements, telephony, calls, webhooks, audit.
-- Depends on public.tenants from voice_ai_core migration.

CREATE TYPE public.user_role AS ENUM (
  'PLATFORM_ADMIN',
  'TENANT_ADMIN',
  'TENANT_MANAGER',
  'READ_ONLY',
  'SUPPORT'
);

CREATE TYPE public.overage_policy AS ENUM ('BLOCK', 'ALLOW_WITH_ALERT');

CREATE TYPE public.phone_status AS ENUM ('ACTIVE', 'INACTIVE', 'RELEASED');

CREATE TYPE public.call_log_status AS ENUM (
  'INITIATED',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'MISSED'
);

CREATE TYPE public.webhook_processed_status AS ENUM (
  'PENDING',
  'PROCESSED',
  'FAILED',
  'RETRYING'
);

-- ---------------------------------------------------------------------------
-- tenant_entitlements (1:1 with tenant)
-- ---------------------------------------------------------------------------

CREATE TABLE public.tenant_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants (id) ON DELETE CASCADE,
  max_agents integer NOT NULL DEFAULT 0,
  max_phone_numbers integer NOT NULL DEFAULT 0,
  allowed_features jsonb NOT NULL DEFAULT '{}'::jsonb,
  overage_policy public.overage_policy NOT NULL DEFAULT 'BLOCK',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX tenant_entitlements_tenant_id_idx ON public.tenant_entitlements (tenant_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER tenant_entitlements_set_updated_at
  BEFORE UPDATE ON public.tenant_entitlements
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  role public.user_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX users_email_active_key ON public.users (lower(email))
  WHERE deleted_at IS NULL;

CREATE INDEX users_tenant_id_idx ON public.users (tenant_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- phone_numbers
-- ---------------------------------------------------------------------------

CREATE TABLE public.phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  e164_number text NOT NULL,
  twilio_sid text,
  assigned_flow_id uuid,
  status public.phone_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT phone_numbers_e164_format CHECK (e164_number ~ '^\+[1-9][0-9]{1,14}$')
);

CREATE UNIQUE INDEX phone_numbers_e164_active_key ON public.phone_numbers (e164_number)
  WHERE deleted_at IS NULL;

CREATE INDEX phone_numbers_tenant_id_idx ON public.phone_numbers (tenant_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER phone_numbers_set_updated_at
  BEFORE UPDATE ON public.phone_numbers
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

COMMENT ON COLUMN public.phone_numbers.assigned_flow_id IS 'Optional link to a routing flow UUID when using tenant-level flows.';

-- ---------------------------------------------------------------------------
-- call_logs
-- ---------------------------------------------------------------------------

CREATE TABLE public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  provider_call_id text NOT NULL,
  caller_number text NOT NULL,
  dialed_number text NOT NULL,
  agent_id uuid REFERENCES public.agents (id) ON DELETE SET NULL,
  status public.call_log_status NOT NULL DEFAULT 'INITIATED',
  duration integer,
  disposition text,
  summary text,
  transcript_url text,
  recording_url text,
  call_minutes double precision,
  metadata jsonb,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT call_logs_dialed_e164 CHECK (dialed_number ~ '^\+[1-9][0-9]{1,14}$'),
  CONSTRAINT call_logs_provider_unique UNIQUE (provider_call_id)
);

CREATE INDEX call_logs_tenant_started_idx ON public.call_logs (tenant_id, started_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX call_logs_tenant_id_idx ON public.call_logs (tenant_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER call_logs_set_updated_at
  BEFORE UPDATE ON public.call_logs
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- webhook_events
-- ---------------------------------------------------------------------------

CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL,
  provider_event_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_status public.webhook_processed_status NOT NULL DEFAULT 'PENDING',
  retry_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  deleted_at timestamptz
);

CREATE UNIQUE INDEX webhook_events_provider_event_id_key ON public.webhook_events (provider_event_id)
  WHERE provider_event_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX webhook_events_tenant_id_idx ON public.webhook_events (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX webhook_events_status_created_idx ON public.webhook_events (processed_status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER webhook_events_set_updated_at
  BEFORE UPDATE ON public.webhook_events
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  audited_entity_type text NOT NULL,
  audited_entity_id text NOT NULL,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX audit_logs_entity_idx ON public.audit_logs (
  audited_entity_type,
  audited_entity_id,
  created_at DESC
)
  WHERE deleted_at IS NULL;

CREATE INDEX audit_logs_user_idx ON public.audit_logs (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX audit_logs_tenant_id_idx ON public.audit_logs (tenant_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER audit_logs_set_updated_at
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Keyset pagination for call logs (ORDER BY started_at DESC, id DESC)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_calls_keyset(
  p_tenant_id uuid,
  p_limit integer,
  p_cursor_started_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS SETOF public.call_logs
LANGUAGE sql
STABLE
AS $$
  SELECT c.*
  FROM public.call_logs c
  WHERE c.tenant_id = p_tenant_id
    AND c.deleted_at IS NULL
    AND (
      (p_cursor_started_at IS NULL AND p_cursor_id IS NULL)
      OR (c.started_at, c.id) < (p_cursor_started_at, p_cursor_id)
    )
  ORDER BY c.started_at DESC, c.id DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.list_calls_keyset IS
  'Returns the next page of call_logs for a tenant; pass cursor from the last row of the previous page (started_at, id).';
