"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CompanyFields = {
  companyName: string;
  hours: string;
  locations: string;
};

type ServicesFields = {
  descriptions: string;
  pricing: string;
  faqs: string;
};

type ProductFields = {
  catalog: string;
  skus: string;
  compatibility: string;
};

type AccountingFields = {
  verificationRules: string;
  paymentLinks: string;
};

type ComplianceFields = {
  privacyHandling: string;
  prohibitedPhrases: string;
};

type KnowledgeSectionId =
  | "company"
  | "service"
  | "product"
  | "accounting"
  | "safety";

type SectionPayload =
  | { id: "company"; fields: CompanyFields }
  | { id: "service"; fields: ServicesFields }
  | { id: "product"; fields: ProductFields }
  | { id: "accounting"; fields: AccountingFields }
  | { id: "safety"; fields: ComplianceFields };

type SectionMeta = {
  title: string;
  summary: string;
  version: number;
  lastSyncedAt: string;
};

const INITIAL_META: Record<KnowledgeSectionId, SectionMeta> = {
  company: {
    title: "Company Profile",
    summary: "Name, hours, and locations callers may ask about.",
    version: 4,
    lastSyncedAt: "2026-05-10T14:22:00.000Z",
  },
  service: {
    title: "Services KB",
    summary: "Descriptions, pricing, and FAQs for service offerings.",
    version: 12,
    lastSyncedAt: "2026-05-11T09:15:00.000Z",
  },
  product: {
    title: "Product KB",
    summary: "Catalog, SKUs, and compatibility notes.",
    version: 7,
    lastSyncedAt: "2026-05-09T16:40:00.000Z",
  },
  accounting: {
    title: "Accounting / Lookup Rules",
    summary: "Verification rules and payment links agents may reference.",
    version: 2,
    lastSyncedAt: "2026-05-08T11:05:00.000Z",
  },
  safety: {
    title: "Compliance / Guardrails",
    summary: "Privacy handling and phrases agents must avoid.",
    version: 3,
    lastSyncedAt: "2026-05-11T18:00:00.000Z",
  },
};

const INITIAL_FIELDS: Record<KnowledgeSectionId, SectionPayload["fields"]> = {
  company: {
    companyName: "Bostel Voice AI, Inc.",
    hours:
      "Monday–Friday 8:00 AM – 6:00 PM Eastern. Emergency routing after hours per tenant flow.",
    locations:
      "Headquarters: Boston, MA. Remote-first engineering. Data processing: US regions only unless contract specifies EU.",
  },
  service: {
    descriptions:
      "White-glove onboarding, porting assistance, and ongoing tuning for voice agents tied to your CRM and telephony stack.",
    pricing:
      "Starter: usage-based per minute. Growth: pooled minutes + seat model. Enterprise: custom MSA and committed capacity.",
    faqs:
      "Q: Can agents read invoices aloud?\nA: Only summary lines approved in Accounting rules — never full account numbers.\n\nQ: How fast is knowledge sync?\nA: Typically under two minutes after publish from this portal.",
  },
  product: {
    catalog:
      "Voice AI Receptionist, After-hours Concierge, Collections Assist (restricted modes), and Platform API add-ons.",
    skus:
      "SKU-VR-100 Receptionist bundle\nSKU-AH-200 After-hours pack\nSKU-API-900 Developer tier",
    compatibility:
      "Twilio Programmable Voice required. ElevenLabs voices supported. CRM: Salesforce, HubSpot (read-only connectors in beta).",
  },
  accounting: {
    verificationRules:
      "Confirm identity with billing ZIP + last four of phone on file. Never collect full card numbers by voice. Escalate disputes to human queue.",
    paymentLinks:
      "Customer portal pay link: https://pay.example.com/tenant (placeholder). ACH instructions sent only after identity verification passes.",
  },
  safety: {
    privacyHandling:
      "Do not retain or repeat full SSN, full card PAN, or health record identifiers. Summarize only what is necessary to complete the caller task.",
    prohibitedPhrases:
      "Do not guarantee legal outcomes, medical diagnoses, or regulatory approval. Do not disparage competitors by name. Do not promise service levels not in the active contract.",
  },
};

function formatSynced(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

function DocRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-x-6", className)}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground sm:pt-0.5">
        {label}
      </dt>
      <dd className="min-w-0 text-sm leading-relaxed text-foreground whitespace-pre-wrap border-b border-border/60 pb-4 last:border-0 last:pb-0 sm:border-0 sm:pb-0">
        {children}
      </dd>
    </div>
  );
}

type KnowledgeCardProps = {
  sectionId: KnowledgeSectionId;
  meta: SectionMeta;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDone: () => void;
  children: React.ReactNode;
};

function KnowledgeCard({
  sectionId,
  meta,
  editing,
  onEdit,
  onCancel,
  onDone,
  children,
}: KnowledgeCardProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-border/90 shadow-sm transition-shadow",
        editing && "ring-2 ring-primary/20 shadow-md",
      )}
    >
      <CardHeader className="space-y-3 border-b border-border/70 bg-muted/20 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1 border-l-[3px] border-primary/40 pl-4">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
                {meta.title}
              </CardTitle>
              <Badge variant="outline" className="font-mono text-xs">
                v{meta.version}
              </Badge>
              {editing ? (
                <Badge variant="warning" className="text-xs">
                  Editing
                </Badge>
              ) : null}
            </div>
            <CardDescription className="text-sm leading-snug">
              {meta.summary}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {editing ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={onDone}>
                  Done
                </Button>
              </>
            ) : (
              <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
                Edit
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground pl-4 sm:pl-[calc(0.25rem+3px)]">
          Last synced{" "}
          <time dateTime={meta.lastSyncedAt} className="font-medium text-foreground/90">
            {formatSynced(meta.lastSyncedAt)}
          </time>
          <span className="mx-1.5 text-border">·</span>
          <span className="font-mono text-[0.7rem] text-muted-foreground/90">
            {sectionId}
          </span>
        </p>
      </CardHeader>
      <CardContent className="pt-6">
        {editing ? (
          <div className="space-y-4">{children}</div>
        ) : (
          <dl className="space-y-4">{children}</dl>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-muted/10 py-3 text-xs text-muted-foreground">
        <span>
          Section maps to Postgres enum{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.65rem]">
            kb_section_type
          </code>
          .
        </span>
      </CardFooter>
    </Card>
  );
}

export function KnowledgeBaseManager() {
  const [meta, setMeta] =
    React.useState<Record<KnowledgeSectionId, SectionMeta>>(INITIAL_META);
  const [fields, setFields] =
    React.useState<Record<KnowledgeSectionId, SectionPayload["fields"]>>(
      INITIAL_FIELDS,
    );
  const [editingId, setEditingId] = React.useState<KnowledgeSectionId | null>(
    null,
  );
  const [draft, setDraft] = React.useState<SectionPayload["fields"] | null>(
    null,
  );

  const beginEdit = (id: KnowledgeSectionId) => {
    setEditingId(id);
    setDraft(structuredClone(fields[id]) as SectionPayload["fields"]);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const finishEdit = () => {
    if (!editingId || !draft) return;
    setFields((prev) => ({ ...prev, [editingId]: structuredClone(draft) }));
    setMeta((prev) => ({
      ...prev,
      [editingId]: {
        ...prev[editingId],
        version: prev[editingId].version + 1,
        lastSyncedAt: new Date().toISOString(),
      },
    }));
    setEditingId(null);
    setDraft(null);
  };

  const isEditing = (id: KnowledgeSectionId) => editingId === id;

  const company = fields.company as CompanyFields;
  const services = fields.service as ServicesFields;
  const product = fields.product as ProductFields;
  const accounting = fields.accounting as AccountingFields;
  const safety = fields.safety as ComplianceFields;

  const dCompany = draft as CompanyFields | null;
  const dServices = draft as ServicesFields | null;
  const dProduct = draft as ProductFields | null;
  const dAccounting = draft as AccountingFields | null;
  const dSafety = draft as ComplianceFields | null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      <header className="space-y-2 border-b border-border pb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Knowledge base
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">
          Knowledge Base Manager
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Structured sections aligned with your knowledge PDF. Each block has its own
          version, last sync time, and edit workflow — agents consume published content
          only after it passes your approval pipeline.
        </p>
      </header>

      <div className="space-y-8">
        <KnowledgeCard
          sectionId="company"
          meta={meta.company}
          editing={isEditing("company")}
          onEdit={() => beginEdit("company")}
          onCancel={cancelEdit}
          onDone={finishEdit}
        >
          {isEditing("company") && dCompany ? (
            <>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="kb-company-name">Name</Label>
                <Input
                  id="kb-company-name"
                  value={dCompany.companyName}
                  onChange={(e) =>
                    setDraft({ ...dCompany, companyName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="kb-company-hours">Hours</Label>
                <Textarea
                  id="kb-company-hours"
                  className="min-h-[88px] resize-y"
                  value={dCompany.hours}
                  onChange={(e) =>
                    setDraft({ ...dCompany, hours: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="kb-company-locations">Locations</Label>
                <Textarea
                  id="kb-company-locations"
                  className="min-h-[88px] resize-y"
                  value={dCompany.locations}
                  onChange={(e) =>
                    setDraft({ ...dCompany, locations: e.target.value })
                  }
                />
              </div>
            </>
          ) : (
            <>
              <DocRow label="Name">{company.companyName}</DocRow>
              <DocRow label="Hours">{company.hours}</DocRow>
              <DocRow label="Locations">{company.locations}</DocRow>
            </>
          )}
        </KnowledgeCard>

        <KnowledgeCard
          sectionId="service"
          meta={meta.service}
          editing={isEditing("service")}
          onEdit={() => beginEdit("service")}
          onCancel={cancelEdit}
          onDone={finishEdit}
        >
          {isEditing("service") && dServices ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="kb-svc-desc">Descriptions</Label>
                <Textarea
                  id="kb-svc-desc"
                  className="min-h-[100px] resize-y"
                  value={dServices.descriptions}
                  onChange={(e) =>
                    setDraft({ ...dServices, descriptions: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kb-svc-price">Pricing</Label>
                <Textarea
                  id="kb-svc-price"
                  className="min-h-[100px] resize-y"
                  value={dServices.pricing}
                  onChange={(e) =>
                    setDraft({ ...dServices, pricing: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kb-svc-faq">FAQs</Label>
                <Textarea
                  id="kb-svc-faq"
                  className="min-h-[120px] resize-y font-mono text-sm"
                  value={dServices.faqs}
                  onChange={(e) =>
                    setDraft({ ...dServices, faqs: e.target.value })
                  }
                />
              </div>
            </>
          ) : (
            <>
              <DocRow label="Descriptions">{services.descriptions}</DocRow>
              <DocRow label="Pricing">{services.pricing}</DocRow>
              <DocRow label="FAQs">{services.faqs}</DocRow>
            </>
          )}
        </KnowledgeCard>

        <KnowledgeCard
          sectionId="product"
          meta={meta.product}
          editing={isEditing("product")}
          onEdit={() => beginEdit("product")}
          onCancel={cancelEdit}
          onDone={finishEdit}
        >
          {isEditing("product") && dProduct ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="kb-prod-catalog">Catalog</Label>
                <Textarea
                  id="kb-prod-catalog"
                  className="min-h-[100px] resize-y"
                  value={dProduct.catalog}
                  onChange={(e) =>
                    setDraft({ ...dProduct, catalog: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kb-prod-skus">SKUs</Label>
                <Textarea
                  id="kb-prod-skus"
                  className="min-h-[100px] resize-y font-mono text-sm"
                  value={dProduct.skus}
                  onChange={(e) =>
                    setDraft({ ...dProduct, skus: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kb-prod-compat">Compatibility</Label>
                <Textarea
                  id="kb-prod-compat"
                  className="min-h-[100px] resize-y"
                  value={dProduct.compatibility}
                  onChange={(e) =>
                    setDraft({ ...dProduct, compatibility: e.target.value })
                  }
                />
              </div>
            </>
          ) : (
            <>
              <DocRow label="Catalog">{product.catalog}</DocRow>
              <DocRow label="SKUs">{product.skus}</DocRow>
              <DocRow label="Compatibility">{product.compatibility}</DocRow>
            </>
          )}
        </KnowledgeCard>

        <KnowledgeCard
          sectionId="accounting"
          meta={meta.accounting}
          editing={isEditing("accounting")}
          onEdit={() => beginEdit("accounting")}
          onCancel={cancelEdit}
          onDone={finishEdit}
        >
          {isEditing("accounting") && dAccounting ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="kb-acct-verify">Verification rules</Label>
                <Textarea
                  id="kb-acct-verify"
                  className="min-h-[120px] resize-y"
                  value={dAccounting.verificationRules}
                  onChange={(e) =>
                    setDraft({
                      ...dAccounting,
                      verificationRules: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kb-acct-pay">Payment links</Label>
                <Textarea
                  id="kb-acct-pay"
                  className="min-h-[100px] resize-y font-mono text-sm"
                  value={dAccounting.paymentLinks}
                  onChange={(e) =>
                    setDraft({ ...dAccounting, paymentLinks: e.target.value })
                  }
                />
              </div>
            </>
          ) : (
            <>
              <DocRow label="Verification rules">
                {accounting.verificationRules}
              </DocRow>
              <DocRow label="Payment links">{accounting.paymentLinks}</DocRow>
            </>
          )}
        </KnowledgeCard>

        <KnowledgeCard
          sectionId="safety"
          meta={meta.safety}
          editing={isEditing("safety")}
          onEdit={() => beginEdit("safety")}
          onCancel={cancelEdit}
          onDone={finishEdit}
        >
          {isEditing("safety") && dSafety ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="kb-comp-privacy">Privacy handling</Label>
                <Textarea
                  id="kb-comp-privacy"
                  className="min-h-[120px] resize-y"
                  value={dSafety.privacyHandling}
                  onChange={(e) =>
                    setDraft({
                      ...dSafety,
                      privacyHandling: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kb-comp-not">What NOT to say</Label>
                <Textarea
                  id="kb-comp-not"
                  className="min-h-[120px] resize-y"
                  value={dSafety.prohibitedPhrases}
                  onChange={(e) =>
                    setDraft({
                      ...dSafety,
                      prohibitedPhrases: e.target.value,
                    })
                  }
                />
              </div>
            </>
          ) : (
            <>
              <DocRow label="Privacy handling">
                {safety.privacyHandling}
              </DocRow>
              <DocRow label="What NOT to say">
                {safety.prohibitedPhrases}
              </DocRow>
            </>
          )}
        </KnowledgeCard>
      </div>
    </div>
  );
}
