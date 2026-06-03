-- Two overloads of list_calls_keyset existed (4-arg and 7-arg), causing
-- "function public.list_calls_keyset(unknown, unknown) is not unique" on RPC.

DROP FUNCTION IF EXISTS public.list_calls_keyset(
  uuid,
  integer,
  timestamptz,
  uuid
);
