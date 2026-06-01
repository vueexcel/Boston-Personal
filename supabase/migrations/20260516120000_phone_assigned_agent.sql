-- Link inbound Twilio numbers to a voice agent for Media Streams routing.

ALTER TABLE public.phone_numbers
  ADD COLUMN assigned_agent_id uuid REFERENCES public.agents (id) ON DELETE SET NULL;

CREATE INDEX phone_numbers_tenant_agent_idx ON public.phone_numbers (tenant_id, assigned_agent_id)
  WHERE deleted_at IS NULL AND assigned_agent_id IS NOT NULL;

COMMENT ON COLUMN public.phone_numbers.assigned_agent_id IS
  'Voice agent that handles inbound calls to this E.164 number.';
