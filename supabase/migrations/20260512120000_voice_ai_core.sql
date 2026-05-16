-- Bostel Voice AI — core multi-tenant schema (Agent Builder alignment).
-- UUID primary keys; strict tenant_id on all tenant-scoped tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.tenant_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

CREATE TYPE public.agent_status AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

CREATE TYPE public.knowledge_approval_status AS ENUM ('DRAFT', 'APPROVED', 'ACTIVE');

CREATE TYPE public.kb_section_type AS ENUM (
  'company',
  'service',
  'product',
  'accounting',
  'routing',
  'safety'
);

CREATE TYPE public.action_type AS ENUM ('webhook', 'api');

CREATE TYPE public.routing_target_type AS ENUM ('phone', 'voicemail', 'agent');

CREATE TYPE public.routing_condition_type AS ENUM (
  'after_hours',
  'intent_match',
  'default'
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- tenants (root of tenancy; no tenant_id column)
-- ---------------------------------------------------------------------------

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL,
  account_name text NOT NULL DEFAULT '',
  status public.tenant_status NOT NULL DEFAULT 'ACTIVE',
  plan_code text NOT NULL DEFAULT 'VOICE_AI_STARTER',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX tenants_external_id_active_key
  ON public.tenants (external_id)
  WHERE deleted_at IS NULL;

CREATE INDEX tenants_deleted_at_idx ON public.tenants (deleted_at);

CREATE TRIGGER tenants_set_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

COMMENT ON COLUMN public.tenants.settings IS 'Tenant-level JSON (timezone, feature flags, etc.).';

-- ---------------------------------------------------------------------------
-- agents (Behavior + Voice)
-- ---------------------------------------------------------------------------

CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  role_description text,
  greeting text,
  voice_provider_id text,
  voice_id text,
  language text,
  status public.agent_status NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX agents_tenant_id_idx ON public.agents (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX agents_tenant_id_name_idx ON public.agents (tenant_id, name)
  WHERE deleted_at IS NULL;

CREATE TRIGGER agents_set_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- agent_prompts (system prompt versioning; 1:many per agent)
-- ---------------------------------------------------------------------------

CREATE TABLE public.agent_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  content text NOT NULL,
  version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT agent_prompts_agent_version_unique UNIQUE (agent_id, version)
);

CREATE INDEX agent_prompts_tenant_id_idx ON public.agent_prompts (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX agent_prompts_agent_id_idx ON public.agent_prompts (agent_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER agent_prompts_set_updated_at
  BEFORE UPDATE ON public.agent_prompts
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

COMMENT ON TABLE public.agent_prompts IS 'Versioned system prompts per agent; current = max(version) per agent.';

-- ---------------------------------------------------------------------------
-- knowledge_sections
-- ---------------------------------------------------------------------------

CREATE TABLE public.knowledge_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents (id) ON DELETE SET NULL,
  type public.kb_section_type NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  approval_status public.knowledge_approval_status NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX knowledge_sections_tenant_id_idx ON public.knowledge_sections (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX knowledge_sections_tenant_type_idx ON public.knowledge_sections (tenant_id, type)
  WHERE deleted_at IS NULL;

CREATE INDEX knowledge_sections_agent_id_idx ON public.knowledge_sections (agent_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER knowledge_sections_set_updated_at
  BEFORE UPDATE ON public.knowledge_sections
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

COMMENT ON COLUMN public.knowledge_sections.agent_id IS 'NULL = tenant-wide knowledge.';

-- ---------------------------------------------------------------------------
-- agent_actions (Actions tab)
-- ---------------------------------------------------------------------------

CREATE TABLE public.agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  tool_type public.action_type NOT NULL,
  endpoint_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX agent_actions_tenant_id_idx ON public.agent_actions (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX agent_actions_agent_id_idx ON public.agent_actions (agent_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER agent_actions_set_updated_at
  BEFORE UPDATE ON public.agent_actions
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- routing_flows (Call Forwarding; agent-scoped)
-- ---------------------------------------------------------------------------

CREATE TABLE public.routing_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  condition_type public.routing_condition_type NOT NULL,
  target_type public.routing_target_type NOT NULL,
  target_destination text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX routing_flows_tenant_id_idx ON public.routing_flows (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX routing_flows_agent_id_idx ON public.routing_flows (agent_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER routing_flows_set_updated_at
  BEFORE UPDATE ON public.routing_flows
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

COMMENT ON COLUMN public.routing_flows.target_destination IS
  'Convention: E.164 for phone, agent uuid as text for agent target, voicemail resource id for voicemail.';

-- ---------------------------------------------------------------------------
-- agent_advanced_settings (1:1 with agent)
-- ---------------------------------------------------------------------------

CREATE TABLE public.agent_advanced_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  agent_id uuid NOT NULL UNIQUE REFERENCES public.agents (id) ON DELETE CASCADE,
  temperature double precision,
  model_name text,
  max_duration integer,
  safety_guardrails jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX agent_advanced_settings_tenant_id_idx ON public.agent_advanced_settings (tenant_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER agent_advanced_settings_set_updated_at
  BEFORE UPDATE ON public.agent_advanced_settings
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

COMMENT ON COLUMN public.agent_advanced_settings.max_duration IS 'Max call/session duration in seconds (product-defined).';
