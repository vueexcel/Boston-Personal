-- Map legacy tenant plan codes to canonical PACKAGE_1 / PACKAGE_2 values.

UPDATE public.tenants
SET plan_code = 'PACKAGE_1', updated_at = now()
WHERE plan_code = 'VOICE_AI_STARTER' AND deleted_at IS NULL;

UPDATE public.tenants
SET plan_code = 'PACKAGE_2', updated_at = now()
WHERE plan_code = 'VOICE_AI_PRO' AND deleted_at IS NULL;

ALTER TABLE public.tenants
  ALTER COLUMN plan_code SET DEFAULT 'PACKAGE_1';

-- Keep Supabase auth provisioning aligned (if trigger exists).
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
    'PACKAGE_1',
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
