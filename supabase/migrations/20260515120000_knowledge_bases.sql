-- Tenant-scoped knowledge bases and documents (portal Knowledge Base Manager).

CREATE TYPE public.kb_document_source AS ENUM ('text', 'file', 'website');

CREATE TABLE public.knowledge_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX knowledge_bases_tenant_id_idx ON public.knowledge_bases (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX knowledge_bases_tenant_updated_idx ON public.knowledge_bases (tenant_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER knowledge_bases_set_updated_at
  BEFORE UPDATE ON public.knowledge_bases
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE public.knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  knowledge_base_id uuid NOT NULL REFERENCES public.knowledge_bases (id) ON DELETE CASCADE,
  content text NOT NULL,
  source_type public.kb_document_source NOT NULL DEFAULT 'text',
  source_meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX knowledge_documents_kb_id_idx ON public.knowledge_documents (knowledge_base_id)
  WHERE deleted_at IS NULL;

CREATE INDEX knowledge_documents_tenant_id_idx ON public.knowledge_documents (tenant_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER knowledge_documents_set_updated_at
  BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

COMMENT ON TABLE public.knowledge_bases IS 'Named knowledge bases attachable to voice agents.';
COMMENT ON TABLE public.knowledge_documents IS 'Text/file/website documents within a knowledge base.';
