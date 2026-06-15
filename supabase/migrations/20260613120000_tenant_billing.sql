-- Tenant billing: postpaid PAYG after package hours, invoiced on signup anniversary.

CREATE TYPE public.billing_period_status AS ENUM ('OPEN', 'CLOSED', 'INVOICED');

CREATE TABLE public.tenant_billing_accounts (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants (id) ON DELETE CASCADE,
  billing_anchor_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER tenant_billing_accounts_set_updated_at
  BEFORE UPDATE ON public.tenant_billing_accounts
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE public.tenant_billing_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  plan_code text NOT NULL,
  package_seconds_limit integer NOT NULL DEFAULT 0,
  package_seconds_used integer NOT NULL DEFAULT 0,
  postpaid_seconds_limit integer NOT NULL DEFAULT 108000,
  postpaid_seconds_used integer NOT NULL DEFAULT 0,
  status public.billing_period_status NOT NULL DEFAULT 'OPEN',
  invoice_postpaid_seconds integer,
  invoice_amount_cents integer,
  invoiced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_billing_periods_range CHECK (period_end > period_start),
  CONSTRAINT tenant_billing_periods_used_nonneg CHECK (
    package_seconds_used >= 0 AND postpaid_seconds_used >= 0
  )
);

CREATE UNIQUE INDEX tenant_billing_periods_one_open_idx
  ON public.tenant_billing_periods (tenant_id)
  WHERE status = 'OPEN';

CREATE INDEX tenant_billing_periods_tenant_range_idx
  ON public.tenant_billing_periods (tenant_id, period_start, period_end);

CREATE TRIGGER tenant_billing_periods_set_updated_at
  BEFORE UPDATE ON public.tenant_billing_periods
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE public.tenant_billing_call_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id uuid NOT NULL UNIQUE REFERENCES public.call_logs (id) ON DELETE CASCADE,
  billing_period_id uuid NOT NULL REFERENCES public.tenant_billing_periods (id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  duration_seconds integer NOT NULL,
  package_seconds integer NOT NULL DEFAULT 0,
  postpaid_seconds integer NOT NULL DEFAULT 0,
  overage_seconds integer NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tenant_billing_call_allocations_period_idx
  ON public.tenant_billing_call_allocations (billing_period_id);

CREATE TABLE public.tenant_billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  billing_period_id uuid NOT NULL UNIQUE REFERENCES public.tenant_billing_periods (id) ON DELETE RESTRICT,
  postpaid_seconds_billed integer NOT NULL,
  rate_per_hour_cents integer NOT NULL,
  amount_cents integer NOT NULL,
  line_description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill billing accounts and open periods for existing tenants.
INSERT INTO public.tenant_billing_accounts (tenant_id, billing_anchor_at, timezone)
SELECT
  t.id,
  t.created_at,
  COALESCE(NULLIF(TRIM(t.settings->>'timezone'), ''), 'America/New_York')
FROM public.tenants t
WHERE t.deleted_at IS NULL
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO public.tenant_billing_periods (
  tenant_id,
  period_start,
  period_end,
  plan_code,
  package_seconds_limit,
  postpaid_seconds_limit,
  status
)
SELECT
  t.id,
  t.created_at,
  t.created_at + interval '1 month',
  CASE
    WHEN t.plan_code IN ('PACKAGE_2', 'VOICE_AI_PRO') THEN 'PACKAGE_2'
    WHEN t.plan_code IN ('PAYG') THEN 'PAYG'
    ELSE 'PACKAGE_1'
  END,
  CASE
    WHEN t.plan_code IN ('PACKAGE_2', 'VOICE_AI_PRO') THEN
      COALESCE((SELECT (package_2_hours * 3600)::int FROM public.costing_settings WHERE id = 1), 324000)
    WHEN t.plan_code IN ('PAYG') THEN 0
    ELSE COALESCE((SELECT (package_1_hours * 3600)::int FROM public.costing_settings WHERE id = 1), 108000)
  END,
  108000,
  'OPEN'
FROM public.tenants t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_billing_periods p
    WHERE p.tenant_id = t.id AND p.status = 'OPEN'
  );
