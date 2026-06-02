-- Extend call log keyset listing with optional agent and date filters.

CREATE OR REPLACE FUNCTION public.list_calls_keyset(
  p_tenant_id uuid,
  p_limit integer,
  p_cursor_started_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_agent_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS SETOF public.call_logs
LANGUAGE sql
STABLE
AS $$
  SELECT c.*
  FROM public.call_logs c
  WHERE c.tenant_id = p_tenant_id
    AND c.deleted_at IS NULL
    AND (p_agent_id IS NULL OR c.agent_id = p_agent_id)
    AND (p_from IS NULL OR c.started_at >= p_from)
    AND (p_to IS NULL OR c.started_at <= p_to)
    AND (
      (p_cursor_started_at IS NULL AND p_cursor_id IS NULL)
      OR (c.started_at, c.id) < (p_cursor_started_at, p_cursor_id)
    )
  ORDER BY c.started_at DESC, c.id DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.list_calls_keyset(
  uuid,
  integer,
  timestamptz,
  uuid,
  uuid,
  timestamptz,
  timestamptz
) IS
  'Keyset-paginated call_logs for a tenant with optional agent and date range filters.';
