-- Platform-wide pricing / costing configuration (singleton row id = 1).

CREATE TABLE public.costing_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  hourly_rate numeric(10, 2) NOT NULL DEFAULT 5.00,
  package_1_name text NOT NULL DEFAULT '30 Hours Package',
  package_1_hours numeric(10, 2) NOT NULL DEFAULT 30,
  package_1_price numeric(10, 2) NOT NULL DEFAULT 150.00,
  package_2_name text NOT NULL DEFAULT '90 Hours Package',
  package_2_hours numeric(10, 2) NOT NULL DEFAULT 90,
  package_2_price numeric(10, 2) NOT NULL DEFAULT 450.00,
  payg_rate numeric(10, 2) NOT NULL DEFAULT 5.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER costing_settings_set_updated_at
  BEFORE UPDATE ON public.costing_settings
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

INSERT INTO public.costing_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
