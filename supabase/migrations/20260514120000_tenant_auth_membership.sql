-- Links Supabase Auth (auth.users) to app tenants; provisions tenant + entitlements on signup.

-- ---------------------------------------------------------------------------
-- tenant_members (auth user ↔ tenant; MVP: one tenant per signup)
-- ---------------------------------------------------------------------------

CREATE TABLE public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'TENANT_ADMIN',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_members_tenant_user_unique UNIQUE (tenant_id, user_id)
);

CREATE INDEX tenant_members_user_id_idx ON public.tenant_members (user_id);
CREATE INDEX tenant_members_tenant_id_idx ON public.tenant_members (tenant_id);

COMMENT ON TABLE public.tenant_members IS 'Maps Supabase auth users to tenants they may access.';

-- ---------------------------------------------------------------------------
-- RLS (JWT reads; service role bypasses for server-side checks after session verify)
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_members_select_own
  ON public.tenant_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Provision tenant when a new auth user is created (metadata: account_name)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id uuid;
  ext_id text;
  acct text;
BEGIN
  acct := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'account_name'), ''),
    split_part(NEW.email, '@', 1),
    'Account'
  );

  ext_id := 'TEN-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.tenants (
    external_id,
    account_name,
    status,
    plan_code,
    settings
  )
  VALUES (
    ext_id,
    acct,
    'ACTIVE',
    'VOICE_AI_STARTER',
    '{}'::jsonb
  )
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.tenant_entitlements (
    tenant_id,
    max_agents,
    max_phone_numbers,
    allowed_features,
    overage_policy
  )
  VALUES (
    new_tenant_id,
    10,
    5,
    '{}'::jsonb,
    'BLOCK'
  );

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (new_tenant_id, NEW.id, 'TENANT_ADMIN');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_provision_tenant ON auth.users;

CREATE TRIGGER on_auth_user_created_provision_tenant
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_auth_user();
