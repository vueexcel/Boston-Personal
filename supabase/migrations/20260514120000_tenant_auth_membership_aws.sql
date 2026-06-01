-- AWS variant: tenant_members linked to public.users (no Supabase auth.users).

CREATE TABLE IF NOT EXISTS public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'TENANT_ADMIN',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_members_tenant_user_unique UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS tenant_members_user_id_idx ON public.tenant_members (user_id);
CREATE INDEX IF NOT EXISTS tenant_members_tenant_id_idx ON public.tenant_members (tenant_id);

COMMENT ON TABLE public.tenant_members IS 'Maps application users to tenants they may access.';
