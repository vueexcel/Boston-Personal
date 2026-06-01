-- AWS PostgreSQL auth (replaces Supabase Auth + auth.users).
-- Run after platform_extensions (public.users exists).

CREATE TABLE IF NOT EXISTS public.app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_sessions_token_hash_key UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS app_sessions_user_id_idx ON public.app_sessions (user_id);
CREATE INDEX IF NOT EXISTS app_sessions_expires_at_idx ON public.app_sessions (expires_at);

COMMENT ON TABLE public.app_sessions IS 'Server-side session tokens (cookie auth); replaces Supabase Auth sessions.';

-- Repoint tenant_members from auth.users to public.users when migrating from Supabase.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'tenant_members'
      AND constraint_name = 'tenant_members_user_id_fkey'
  ) THEN
    ALTER TABLE public.tenant_members
      DROP CONSTRAINT tenant_members_user_id_fkey;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.tenant_members
  DROP CONSTRAINT IF EXISTS tenant_members_user_id_fkey;

ALTER TABLE public.tenant_members
  ADD CONSTRAINT tenant_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS on_auth_user_created_provision_tenant ON auth.users';
  END IF;
EXCEPTION
  WHEN undefined_table OR invalid_schema_name THEN NULL;
END $$;
