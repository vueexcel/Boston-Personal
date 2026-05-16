"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Lock,
  Mic,
  Play,
  Plus,
  Square,
  Volume2,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { agentStatusSchema } from "@/lib/db/schema";
import type { AgentDetail } from "@/lib/services/agents";
import {
  AGENT_RESPONSIBILITY_IDS,
  AGENT_RESPONSIBILITY_LABELS,
  type AgentPortalConfigV1,
  type AgentResponsibilityId,
  INFO_COLLECT_SUGGESTIONS,
  KNOWLEDGE_FACT_SUGGESTIONS,
  parseAgentPortalConfig,
  serializeAgentPortalConfig,
} from "@/lib/tenant-portal/agent-config-v1";
import { useUpdateAgent } from "@/hooks/use-agents";
import {
  useCreateCustomVoiceAndApplyAgent,
  useElevenLabsVoices,
  usePreviewVoice,
} from "@/hooks/use-elevenlabs-voices";
import { AgentTestPanel } from "@/components/tenant-portal/agent-test-panel";
import { ApiClientError } from "@/lib/api/http";
import type { PortalElevenLabsVoice } from "@/lib/services/elevenlabs-voices";
import type { AgentTestDraft } from "@/lib/validation/agent-test";
import { cn } from "@/lib/utils";

const AGENT_STATUSES = agentStatusSchema.options;

type AgentStatus = (typeof AGENT_STATUSES)[number];

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

const MIC_RECORDING_MAX_SEC = 600;

function formatRecordDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function micAccessErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const lower = raw.toLowerCase();
  if (
    lower.includes("permissions policy") ||
    lower.includes("not allowed in this document")
  ) {
    return "Microphone is blocked for this page by the site Permissions-Policy header. It should be fixed in configuration — reload after deploy. If this persists, contact your administrator.";
  }
  if (e instanceof DOMException) {
    switch (e.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Microphone access was denied. Click Start recording again and choose Allow in the prompt. If no prompt appears, use the lock or tune icon next to the site URL, set Microphone to Allow, then try again.";
      case "NotFoundError":
        return "No microphone was found. Connect a microphone and try again.";
      case "NotReadableError":
        return "The microphone is in use or could not be opened. Close other apps using the mic and try again.";
      case "SecurityError":
        return "Microphone access needs a secure page (HTTPS) or localhost.";
      case "AbortError":
        return "The microphone request was cancelled. Click Start recording to try again.";
      case "OverconstrainedError":
        return "Your microphone could not satisfy the requested settings. Try again or use another browser.";
      default:
        return e.message || "Could not access the microphone.";
    }
  }
  if (e instanceof Error) return e.message;
  return "Could not access the microphone.";
}

const TAB_LIST_CLASS =
  "flex h-auto w-full flex-nowrap justify-start gap-0 overflow-x-auto rounded-none border-b border-slate-200 bg-transparent p-0";

const TAB_TRIGGER_CLASS =
  "shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-sm font-medium text-slate-600 shadow-none ring-offset-0 transition-colors hover:text-slate-900 data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-700 data-[state=active]:shadow-none";

type AgentFormSnapshot = {
  name: string;
  status: AgentStatus;
  greeting: string;
  voiceId: string;
  portalConfig: AgentPortalConfigV1;
};

function buildFormSnapshot(form: AgentFormSnapshot): string {
  return JSON.stringify({
    name: form.name.trim(),
    status: form.status,
    greeting: form.greeting.trim(),
    voiceId: form.voiceId.trim(),
    roleDescription: serializeAgentPortalConfig(form.portalConfig),
  });
}

function UnsavedChangesBar({
  saving,
  saveDisabled,
  saveError,
  onDiscard,
  onSave,
}: {
  saving: boolean;
  saveDisabled: boolean;
  saveError: string | null;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Unsaved changes"
      className="fixed bottom-6 left-1/2 z-50 w-[min(100%-2rem,42rem)] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      <div
        className={cn(
          "flex flex-col gap-2 rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-lg shadow-slate-900/10 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-amber-400"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">
              You have unsaved changes
            </p>
            {saveError ? (
              <p className="mt-0.5 text-xs text-red-600" role="alert">
                {saveError}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-200 bg-white"
            disabled={saving}
            onClick={onDiscard}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-slate-900 text-white hover:bg-slate-800"
            disabled={saving || saveDisabled}
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function sectionCard(
  title: string,
  description: string,
  children: React.ReactNode,
) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

export type VoiceAgentBuilderProps = {
  tenantId: string;
  agent: AgentDetail;
};

export function VoiceAgentBuilder({ tenantId, agent }: VoiceAgentBuilderProps) {
  const router = useRouter();
  const updateAgentMutation = useUpdateAgent(tenantId);
  const previewVoiceMutation = usePreviewVoice(tenantId);
  const createCustomVoiceAndApplyMutation =
    useCreateCustomVoiceAndApplyAgent(tenantId);
  const {
    data: voicesData,
    isPending: elevenVoicesLoading,
    error: voicesQueryError,
  } = useElevenLabsVoices(tenantId);
  const elevenVoices = voicesData?.voices ?? [];
  const elevenVoicesError = voicesQueryError
    ? voicesQueryError instanceof ApiClientError
      ? voicesQueryError.message
      : "Failed to load voices"
    : (voicesData?.error ?? null);

  const parsedInitial = React.useMemo(
    () => parseAgentPortalConfig(agent.roleDescription),
    [agent.roleDescription],
  );

  const initialRef = React.useRef({
    name: agent.name,
    status: agent.status,
    greeting: agent.greeting ?? "",
    voiceId: agent.voiceId ?? "",
    language: agent.language ?? "en-US",
    portalConfig: parsedInitial.config,
  });

  const [agentName, setAgentName] = React.useState(initialRef.current.name);
  const [status, setStatus] = React.useState<AgentStatus>(
    agentStatusSchema.parse(initialRef.current.status),
  );
  const [greeting, setGreeting] = React.useState(initialRef.current.greeting);
  const [voiceId, setVoiceId] = React.useState(initialRef.current.voiceId);
  const [language] = React.useState(initialRef.current.language);
  const [portalConfig, setPortalConfig] = React.useState<AgentPortalConfigV1>(
    parsedInitial.config,
  );
  const [customFieldInput, setCustomFieldInput] = React.useState("");

  const [llmTemperature, setLlmTemperature] = React.useState(0.35);

  const saving = updateAgentMutation.isPending;
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const previewLoading = previewVoiceMutation.isPending;
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const previewObjectUrlRef = React.useRef<string | null>(null);

  const [addVoiceOpen, setAddVoiceOpen] = React.useState(false);
  const [newVoiceName, setNewVoiceName] = React.useState("");
  const [newVoiceFile, setNewVoiceFile] = React.useState<File | null>(null);
  const [localClipUrl, setLocalClipUrl] = React.useState<string | null>(null);
  const createVoiceSubmitting = createCustomVoiceAndApplyMutation.isPending;
  const [createVoiceError, setCreateVoiceError] = React.useState<string | null>(
    null,
  );
  const [localClipLoading, setLocalClipLoading] = React.useState(false);
  const localClipAudioRef = React.useRef<HTMLAudioElement | null>(null);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const recordChunksRef = React.useRef<Blob[]>([]);
  const recordTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const discardRecordingRef = React.useRef(false);

  const [isMicRecording, setIsMicRecording] = React.useState(false);
  const [micBusy, setMicBusy] = React.useState(false);
  const [recordElapsedSec, setRecordElapsedSec] = React.useState(0);

  React.useEffect(() => {
    const parsed = parseAgentPortalConfig(agent.roleDescription);
    initialRef.current = {
      name: agent.name,
      status: agent.status,
      greeting: agent.greeting ?? "",
      voiceId: agent.voiceId ?? "",
      language: agent.language ?? "en-US",
      portalConfig: parsed.config,
    };
    setAgentName(initialRef.current.name);
    setStatus(agentStatusSchema.parse(initialRef.current.status));
    setGreeting(initialRef.current.greeting);
    setVoiceId(initialRef.current.voiceId);
    setPortalConfig(parsed.config);
    setSaveMessage(null);
    setSaveError(null);
    setSaveBaselineKey((k) => k + 1);
  }, [agent]);

  const voiceOptionsForSelect = React.useMemo(
    () => [...elevenVoices],
    [elevenVoices],
  );

  const savedVoiceNotInAccount =
    !elevenVoicesLoading &&
    elevenVoices.length > 0 &&
    Boolean(voiceId) &&
    !elevenVoices.some((v) => v.voiceId === voiceId);

  const resolvedVoiceId = React.useMemo(() => {
    if (elevenVoices.length === 0) return voiceId;
    if (elevenVoices.some((v) => v.voiceId === voiceId)) {
      return voiceId;
    }
    return elevenVoices[0]?.voiceId ?? "";
  }, [elevenVoices, voiceId]);

  React.useEffect(() => {
    if (elevenVoicesLoading) return;
    if (resolvedVoiceId !== voiceId) {
      setVoiceId(resolvedVoiceId);
    }
  }, [elevenVoicesLoading, resolvedVoiceId, voiceId]);

  React.useEffect(() => {
    setPreviewError(null);
  }, [resolvedVoiceId]);

  React.useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
    };
  }, []);

  const playVoicePreview = React.useCallback(async () => {
    const id = resolvedVoiceId?.trim();
    if (!id) return;
    setPreviewError(null);
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    try {
      const blob = await previewVoiceMutation.mutateAsync(id);
      const url = URL.createObjectURL(blob);
      previewObjectUrlRef.current = url;
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.addEventListener("error", () => {
        setPreviewError("Could not play this audio in the browser.");
      });
      try {
        await audio.play();
      } catch (playErr) {
        if (
          playErr instanceof DOMException &&
          playErr.name === "NotAllowedError"
        ) {
          setPreviewError(
            "Playback was blocked — try tapping Play sample again.",
          );
        } else {
          setPreviewError("Could not start playback.");
        }
      }
    } catch (e) {
      setPreviewError(
        e instanceof ApiClientError
          ? e.message
          : "Network error while loading preview",
      );
    }
  }, [resolvedVoiceId, previewVoiceMutation]);

  React.useEffect(() => {
    if (!newVoiceFile) {
      setLocalClipUrl(null);
      return;
    }
    const u = URL.createObjectURL(newVoiceFile);
    setLocalClipUrl(u);
    return () => {
      URL.revokeObjectURL(u);
    };
  }, [newVoiceFile]);

  const tearDownMicSession = React.useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    setIsMicRecording(false);
    setMicBusy(false);
    setRecordElapsedSec(0);
  }, []);

  const haltMicRecordingDiscard = React.useCallback(() => {
    discardRecordingRef.current = true;
    const rec = mediaRecorderRef.current;
    if (rec && (rec.state === "recording" || rec.state === "paused")) {
      try {
        rec.stop();
      } catch {
        tearDownMicSession();
        recordChunksRef.current = [];
      }
    } else {
      tearDownMicSession();
      recordChunksRef.current = [];
    }
  }, [tearDownMicSession]);

  const onAddVoiceOpenChange = React.useCallback(
    (open: boolean) => {
      setAddVoiceOpen(open);
      if (!open) {
        haltMicRecordingDiscard();
        setNewVoiceName("");
        setNewVoiceFile(null);
        setCreateVoiceError(null);
        setLocalClipLoading(false);
        localClipAudioRef.current?.pause();
        localClipAudioRef.current = null;
      }
    },
    [haltMicRecordingDiscard],
  );

  const playLocalRecordingPreview = () => {
    if (!localClipUrl) return;
    setLocalClipLoading(true);
    setCreateVoiceError(null);
    localClipAudioRef.current?.pause();
    const audio = new Audio(localClipUrl);
    localClipAudioRef.current = audio;
    const done = () => setLocalClipLoading(false);
    audio.addEventListener("ended", done);
    audio.addEventListener("error", () => {
      setCreateVoiceError("Could not play this file in the browser.");
      done();
    });
    void audio
      .play()
      .then(done)
      .catch(() => {
        setCreateVoiceError("Playback was blocked or failed — try again.");
        done();
      });
  };

  const startMicRecording = async () => {
    setCreateVoiceError(null);
    if (typeof MediaRecorder === "undefined") {
      setCreateVoiceError("Recording is not supported in this browser.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCreateVoiceError(
        "Microphone is not available here. Use HTTPS or localhost and a current browser.",
      );
      return;
    }
    if (isMicRecording || micBusy) return;
    setMicBusy(true);
    try {
      if (mediaStreamRef.current || mediaRecorderRef.current) {
        haltMicRecordingDiscard();
      }
      discardRecordingRef.current = false;

      // Call getUserMedia immediately after the click (no await before this) so
      // the browser can show the permission prompt while the user gesture is valid.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      mediaStreamRef.current = stream;
      const mimePick = pickRecorderMimeType();
      let rec: MediaRecorder;
      try {
        rec = mimePick
          ? new MediaRecorder(stream, { mimeType: mimePick })
          : new MediaRecorder(stream);
      } catch {
        tearDownMicSession();
        recordChunksRef.current = [];
        setCreateVoiceError("Could not start audio recording in this browser.");
        return;
      }
      mediaRecorderRef.current = rec;
      recordChunksRef.current = [];

      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };

      rec.onstop = () => {
        const dropped = discardRecordingRef.current;
        discardRecordingRef.current = false;
        const mimeTypeSaved =
          rec.mimeType || pickRecorderMimeType() || "audio/webm";
        const chunks = [...recordChunksRef.current];
        recordChunksRef.current = [];
        tearDownMicSession();
        if (dropped) return;

        const blob = new Blob(chunks, { type: mimeTypeSaved });
        if (blob.size < 800) {
          setCreateVoiceError(
            "Recording was too short — speak for a few seconds, then stop.",
          );
          return;
        }
        const ext = mimeTypeSaved.includes("webm")
          ? "webm"
          : mimeTypeSaved.includes("ogg")
            ? "ogg"
            : mimeTypeSaved.includes("mp4") || mimeTypeSaved.includes("m4a")
              ? "m4a"
              : "webm";
        setNewVoiceFile(
          new File([blob], `portal-recording.${ext}`, { type: mimeTypeSaved }),
        );
      };

      rec.onerror = () => {
        setCreateVoiceError("Recording failed — try again.");
        discardRecordingRef.current = true;
        try {
          rec.stop();
        } catch {
          tearDownMicSession();
          recordChunksRef.current = [];
        }
      };

      rec.start(250);
      setIsMicRecording(true);
      setRecordElapsedSec(0);
      recordTimerRef.current = setInterval(() => {
        setRecordElapsedSec((s) => s + 1);
      }, 1000);
    } catch (e) {
      setCreateVoiceError(micAccessErrorMessage(e));
      tearDownMicSession();
      recordChunksRef.current = [];
    } finally {
      setMicBusy(false);
    }
  };

  const stopMicRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state !== "recording") return;
    setMicBusy(true);
    try {
      rec.stop();
    } catch {
      setMicBusy(false);
    }
  };

  React.useEffect(() => {
    if (!isMicRecording || recordElapsedSec < MIC_RECORDING_MAX_SEC) return;
    const rec = mediaRecorderRef.current;
    if (rec?.state === "recording") {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, [isMicRecording, recordElapsedSec]);

  const addInfoField = (label: string) => {
    const t = label.trim();
    if (!t) return;
    setPortalConfig((c) =>
      c.infoToCollect.includes(t)
        ? c
        : { ...c, infoToCollect: [...c.infoToCollect, t] },
    );
  };

  const removeInfoField = (label: string) => {
    setPortalConfig((c) => ({
      ...c,
      infoToCollect: c.infoToCollect.filter((x) => x !== label),
    }));
  };

  /** Bumped when saved baseline (initialRef) changes so isDirty recomputes after save. */
  const [saveBaselineKey, setSaveBaselineKey] = React.useState(0);

  const isDirty = React.useMemo(() => {
    void saveBaselineKey;
    const i = initialRef.current;
    const saved = buildFormSnapshot({
      name: i.name,
      status: agentStatusSchema.parse(i.status),
      greeting: i.greeting,
      voiceId: i.voiceId,
      portalConfig: i.portalConfig,
    });
    const current = buildFormSnapshot({
      name: agentName,
      status,
      greeting,
      voiceId,
      portalConfig,
    });
    return current !== saved;
  }, [agentName, status, greeting, voiceId, portalConfig, saveBaselineKey]);

  React.useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const resetLocal = () => {
    const i = initialRef.current;
    setAgentName(i.name);
    setStatus(agentStatusSchema.parse(i.status));
    setGreeting(i.greeting);
    setVoiceId(i.voiceId);
    setPortalConfig(i.portalConfig);
    setLlmTemperature(0.35);
    setSaveMessage(null);
    setSaveError(null);
  };

  const applyAgentToLocalState = React.useCallback(
    (a: {
      name: string;
      status: string;
      greeting: string | null;
      roleDescription: string | null;
      voiceId?: string | null;
    }) => {
      const parsedStatus = agentStatusSchema.parse(a.status);
      initialRef.current = {
        ...initialRef.current,
        name: a.name,
        status: parsedStatus,
        greeting: a.greeting ?? "",
        voiceId: a.voiceId ?? "",
        portalConfig: parseAgentPortalConfig(a.roleDescription).config,
      };
      setAgentName(a.name);
      setStatus(parsedStatus);
      setGreeting(a.greeting ?? "");
      setVoiceId(a.voiceId ?? "");
      setPortalConfig(parseAgentPortalConfig(a.roleDescription).config);
      setSaveBaselineKey((k) => k + 1);
    },
    [],
  );

  const submitCustomVoice = async () => {
    const trimmedName = newVoiceName.trim();
    if (!trimmedName || !newVoiceFile) {
      setCreateVoiceError("Enter a display name and choose an audio sample.");
      return;
    }
    haltMicRecordingDiscard();
    setCreateVoiceError(null);
    try {
      const roleDescription = serializeAgentPortalConfig(portalConfig);
      const { created, agent: updatedAgent } =
        await createCustomVoiceAndApplyMutation.mutateAsync({
          name: trimmedName,
          sample: newVoiceFile,
          agentId: agent.id,
          agentPatch: {
            name: agentName.trim(),
            status,
            greeting: greeting.trim() || null,
            roleDescription,
            language: language || "en-US",
          },
        });
      setVoiceId(created.voiceId);
      setSaveError(null);
      applyAgentToLocalState({
        ...updatedAgent,
        voiceId: created.voiceId,
      });
      setSaveMessage(
        created.requiresVerification
          ? "Custom voice created and applied. ElevenLabs may require identity verification in their app before this voice can be used on calls."
          : "Custom voice created and applied to this agent.",
      );
      onAddVoiceOpenChange(false);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiClientError) {
        setCreateVoiceError(e.message);
      } else {
        setCreateVoiceError("Network error — try again.");
      }
    }
  };

  const save = async () => {
    setSaveMessage(null);
    setSaveError(null);
    const roleDescription = serializeAgentPortalConfig(portalConfig);
    try {
      const updated = await updateAgentMutation.mutateAsync({
        agentId: agent.id,
        body: {
          name: agentName.trim(),
          status,
          greeting: greeting.trim() || null,
          roleDescription,
          voiceId: voiceId || null,
          voiceProviderId: voiceId ? "elevenlabs" : null,
          language: language || "en-US",
        },
      });
      setSaveMessage("Saved.");
      applyAgentToLocalState(updated);
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof ApiClientError ? e.message : "Network error");
    }
  };

  const testDraft = React.useMemo((): AgentTestDraft | null => {
    if (!isDirty) return null;
    return {
      name: agentName.trim(),
      greeting: greeting.trim() || null,
      status,
      voiceId: voiceId || null,
      voiceProviderId: voiceId ? "elevenlabs" : null,
      language: language || "en-US",
      portalConfig,
    };
  }, [
    isDirty,
    agentName,
    greeting,
    status,
    voiceId,
    language,
    portalConfig,
  ]);

  const systemPromptPreview = React.useMemo(() => {
    const resp = AGENT_RESPONSIBILITY_LABELS[portalConfig.agentResponsibility];
    const collect =
      portalConfig.infoToCollect.length > 0
        ? portalConfig.infoToCollect.map((x) => `- ${x}`).join("\n")
        : "- (none specified)";
    const parts = [
      "### BEHAVIOUR",
      "",
      "**Agent responsibility:**",
      resp,
      "",
      "**Greeting / first message:**",
      greeting.trim() || "(not set)",
      "",
      "**Information to collect:**",
      collect,
      "",
      "**Qualifying questions:**",
      portalConfig.qualifyingQuestions.trim() || "(not set)",
      "",
      "### KNOWLEDGE (draft)",
      "",
      "**Products & services:**",
      (portalConfig.knowledgeProducts ?? "").trim() || "(empty)",
      "",
      "**Business facts & FAQs:**",
      (portalConfig.knowledgeFaqs ?? "").trim() || "(empty)",
    ];
    return parts.join("\n");
  }, [portalConfig, greeting]);

  return (
    <div className={cn("space-y-4", isDirty && "pb-24")}>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" asChild className="gap-1">
          <Link href="/portal/voice-agents">
            <ArrowLeft className="h-4 w-4" />
            Back to agents
          </Link>
        </Button>
        <p className="text-sm text-slate-600">
          Editing{" "}
          <span className="font-medium text-slate-900">{agent.name}</span>
        </p>
      </div>

      <Card className="border-slate-200/90 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
          <CardTitle className="text-xl text-slate-900">
            Agent configuration
          </CardTitle>
          <CardDescription className="text-slate-600">
            Tabs match your reference layout (no separate &quot;Actions&quot;
            tab). Behavior + Knowledge fields that persist are saved with the{" "}
            <strong>floating Save changes</strong> bar into{" "}
            <span className="font-mono text-xs">greeting</span>,{" "}
            <span className="font-mono text-xs">voice_id</span>,{" "}
            <span className="font-mono text-xs">name</span>,{" "}
            <span className="font-mono text-xs">status</span>, and a versioned
            JSON blob in{" "}
            <span className="font-mono text-xs">role_description</span>. Call
            Forwarding, Advanced LLM controls, and raw prompt unlock are UI-only
            until APIs or DB columns exist.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs defaultValue="behavior" className="w-full">
            <TabsList className={TAB_LIST_CLASS}>
              <TabsTrigger value="behavior" className={TAB_TRIGGER_CLASS}>
                Behavior
              </TabsTrigger>
              <TabsTrigger value="knowledge" className={TAB_TRIGGER_CLASS}>
                Knowledge
              </TabsTrigger>
              <TabsTrigger value="forwarding" className={TAB_TRIGGER_CLASS}>
                Call Forwarding
              </TabsTrigger>
              <TabsTrigger value="voice" className={TAB_TRIGGER_CLASS}>
                Voice
              </TabsTrigger>
              <TabsTrigger value="advanced" className={TAB_TRIGGER_CLASS}>
                Advanced
              </TabsTrigger>
              <TabsTrigger value="system" className={TAB_TRIGGER_CLASS}>
                System Prompt
              </TabsTrigger>
              <TabsTrigger value="test" className={TAB_TRIGGER_CLASS}>
                Test Agent
              </TabsTrigger>
            </TabsList>

            <TabsContent value="behavior" className="mt-6 space-y-5">
              {sectionCard(
                "Agent profile",
                "Internal name and lifecycle status for this workspace.",
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="agent-name">Agent name</Label>
                      <Input
                        id="agent-name"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="agent-status">Status</Label>
                      <Select
                        value={status}
                        onValueChange={(v) =>
                          setStatus(agentStatusSchema.parse(v))
                        }
                      >
                        <SelectTrigger id="agent-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AGENT_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>,
              )}

              {sectionCard(
                "Greeting / First message",
                "What the agent says when answering. Keep it warm.",
                <>
                  <Textarea
                    id="greeting-first"
                    className="min-h-[140px] resize-y border-slate-200"
                    placeholder="Enter the first message your agent will say…"
                    value={greeting}
                    onChange={(e) => setGreeting(e.target.value)}
                  />
                </>,
              )}

              {sectionCard(
                "Agent responsibility",
                "Choose the primary job this agent performs for callers.",
                <>
                  <Select
                    value={portalConfig.agentResponsibility}
                    onValueChange={(v) =>
                      setPortalConfig((c) => ({
                        ...c,
                        agentResponsibility: v as AgentResponsibilityId,
                      }))
                    }
                  >
                    <SelectTrigger className="max-w-xl border-slate-200 bg-white">
                      <SelectValue placeholder="Select responsibility…" />
                    </SelectTrigger>
                    <SelectContent>
                      {AGENT_RESPONSIBILITY_IDS.map((id) => (
                        <SelectItem key={id} value={id}>
                          {AGENT_RESPONSIBILITY_LABELS[id]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>,
              )}

              {sectionCard(
                "Information to collect",
                "The agent will guide the conversation to collect these. Click a suggestion or add your own.",
                <>
                  <div className="flex flex-wrap gap-2">
                    {INFO_COLLECT_SUGGESTIONS.map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
                        onClick={() => addInfoField(s)}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {s}
                      </Button>
                    ))}
                  </div>
                  {portalConfig.infoToCollect.length > 0 ? (
                    <ul className="flex flex-wrap gap-2 pt-1">
                      {portalConfig.infoToCollect.map((f) => (
                        <li
                          key={f}
                          className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm text-indigo-900"
                        >
                          {f}
                          <button
                            type="button"
                            className="rounded-full p-0.5 text-indigo-700 hover:bg-indigo-100"
                            aria-label={`Remove ${f}`}
                            onClick={() => removeInfoField(f)}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Label htmlFor="custom-collect" className="sr-only">
                        Custom field
                      </Label>
                      <Input
                        id="custom-collect"
                        placeholder="Custom field name…"
                        value={customFieldInput}
                        onChange={(e) => setCustomFieldInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addInfoField(customFieldInput);
                            setCustomFieldInput("");
                          }
                        }}
                        className="border-slate-200"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-dashed border-slate-300 sm:w-auto"
                      onClick={() => {
                        addInfoField(customFieldInput);
                        setCustomFieldInput("");
                      }}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Add field
                    </Button>
                  </div>
                </>,
              )}

              {sectionCard(
                "Qualifying questions",
                "Questions the agent should ask to qualify the caller before booking or transfer.",
                <>
                  <Textarea
                    id="qualifying"
                    className="min-h-[120px] resize-y border-slate-200"
                    placeholder="One per line or free-form instructions…"
                    value={portalConfig.qualifyingQuestions}
                    onChange={(e) =>
                      setPortalConfig((c) => ({
                        ...c,
                        qualifyingQuestions: e.target.value,
                      }))
                    }
                  />
                </>,
              )}
            </TabsContent>

            <TabsContent value="knowledge" className="mt-6 space-y-5">
              {sectionCard(
                "Products & Services",
                "Details on listings, products, or services the agent should know thoroughly.",
                <>
                  <Textarea
                    className="min-h-[140px] resize-y border-slate-200"
                    placeholder="E.g. 123 Main St — 3 bed 2-bath, built 2018 …"
                    value={portalConfig.knowledgeProducts ?? ""}
                    onChange={(e) =>
                      setPortalConfig((c) => ({
                        ...c,
                        knowledgeProducts: e.target.value,
                      }))
                    }
                  />
                </>,
              )}

              {sectionCard(
                "Business Facts & FAQs",
                "Key facts the agent uses to answer common questions. Click a suggestion or write your own.",
                <>
                  <div className="flex flex-wrap gap-2">
                    {KNOWLEDGE_FACT_SUGGESTIONS.map((s) => {
                      const snippet = `${s}: `;
                      return (
                        <Button
                          key={s}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
                          onClick={() =>
                            setPortalConfig((c) => ({
                              ...c,
                              knowledgeFaqs: `${c.knowledgeFaqs ?? ""}${snippet}\n`,
                            }))
                          }
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          {s}
                        </Button>
                      );
                    })}
                  </div>
                  <Textarea
                    className="min-h-[140px] resize-y border-slate-200"
                    placeholder="Write business facts and FAQs…"
                    value={portalConfig.knowledgeFaqs ?? ""}
                    onChange={(e) =>
                      setPortalConfig((c) => ({
                        ...c,
                        knowledgeFaqs: e.target.value,
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-dashed border-slate-300"
                    onClick={() =>
                      setPortalConfig((c) => ({
                        ...c,
                        knowledgeFaqs: `${c.knowledgeFaqs ?? ""}\n`,
                      }))
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add Fact
                  </Button>
                </>,
              )}

              {sectionCard(
                "Knowledge Base",
                "Connect a knowledge base for documents (UI only until integrated).",
                <>
                  <Select
                    value={portalConfig.knowledgeBaseMode ?? "none"}
                    onValueChange={(v) =>
                      setPortalConfig((c) => ({ ...c, knowledgeBaseMode: v }))
                    }
                  >
                    <SelectTrigger className="max-w-xl border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Don&apos;t use a knowledge base
                      </SelectItem>
                      <SelectItem value="tenant_kb" disabled>
                        Tenant knowledge base (soon)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </>,
              )}
            </TabsContent>

            <TabsContent value="forwarding" className="mt-6">
              {sectionCard(
                "Call Forwarding Setup",
                "Forward calls from your personal number to your agent.",
                <>
                  <div className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50/90 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                      <p className="text-sm text-amber-950">
                        The agent needs a phone number to be attached for call
                        forwarding.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0 border border-amber-300 bg-white"
                      asChild
                    >
                      <Link href="/portal/phone-numbers">
                        Assign a phone number now
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    This section is informational only until Twilio / routing
                    APIs are connected for this tenant.
                  </p>
                </>,
              )}
            </TabsContent>

            <TabsContent value="voice" className="mt-6 space-y-5">
              {sectionCard(
                "Agent Voice",
                "Choose a preset from your ElevenLabs workspace or add a custom voice from an audio sample (instant clone). The server uses ELEVENLABS_API_KEY. See ElevenLabs voice capabilities for limits and verification rules.",
                <>
                  {elevenVoicesLoading ? (
                    <p className="text-sm text-slate-500">Loading voices…</p>
                  ) : null}
                  {elevenVoicesError ? (
                    <p className="text-sm text-amber-800" role="status">
                      {elevenVoicesError}
                    </p>
                  ) : null}
                  {savedVoiceNotInAccount ? (
                    <p className="text-sm text-amber-800" role="status">
                      Saved voice{" "}
                      <span className="font-mono text-xs">{voiceId}</span> is
                      not in your ElevenLabs account. Pick a voice from the list
                      (loaded via{" "}
                      <a
                        href="https://elevenlabs.io/docs/api-reference/introduction"
                        className="underline underline-offset-2"
                        target="_blank"
                        rel="noreferrer"
                      >
                        your workspace
                      </a>
                      ) and save changes.
                    </p>
                  ) : null}
                  {!elevenVoicesLoading &&
                  elevenVoices.length === 0 &&
                  !elevenVoicesError ? (
                    <p className="text-sm text-slate-600">
                      No voices were returned. If you have not set it yet, add
                      ELEVENLABS_API_KEY to the server environment and reload
                      this page.
                    </p>
                  ) : null}
                  <div className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
                    <div className="min-w-0 flex-1 basis-[min(100%,18rem)]">
                      <Select
                        value={resolvedVoiceId || undefined}
                        onValueChange={setVoiceId}
                        disabled={
                          elevenVoicesLoading ||
                          voiceOptionsForSelect.length === 0
                        }
                      >
                        <SelectTrigger className="w-full border-slate-200 bg-white">
                          <SelectValue placeholder="Choose a voice" />
                        </SelectTrigger>
                        <SelectContent>
                          {voiceOptionsForSelect.map((v) => (
                            <SelectItem key={v.voiceId} value={v.voiceId}>
                              {formatElevenLabsVoiceLabel(v)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex shrink-0 gap-2 sm:mb-0.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="default"
                        className="border-slate-200 bg-white"
                        disabled={
                          previewLoading ||
                          elevenVoicesLoading ||
                          !resolvedVoiceId ||
                          voiceOptionsForSelect.length === 0
                        }
                        onClick={() => void playVoicePreview()}
                      >
                        <Volume2 className="mr-2 h-4 w-4" aria-hidden />
                        {previewLoading ? "Loading…" : "Play sample"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="border-slate-200 bg-white"
                        title="Add custom voice from audio"
                        onClick={() => onAddVoiceOpenChange(true)}
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                        <span className="sr-only">Add custom voice</span>
                      </Button>
                    </div>
                  </div>
                  {previewError ? (
                    <p className="text-sm text-red-600" role="alert">
                      {previewError}
                    </p>
                  ) : null}
                </>,
              )}

              {sectionCard(
                "Language / Accent",
                "Regional language and accent preferences.",
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select disabled value="en">
                      <SelectTrigger className="max-w-xl border-slate-200 bg-slate-50">
                        <SelectValue placeholder="English" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                    <Badge variant="secondary" className="font-normal">
                      Coming Soon
                    </Badge>
                  </div>
                </>,
              )}
            </TabsContent>

            <TabsContent value="advanced" className="mt-6 space-y-5">
              <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50/90 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <p className="text-sm text-amber-950">
                  These settings affect how the AI agent behaves under the hood.
                  Changing them can impact call quality and agent performance.
                  Edit with care. (Not persisted yet.)
                </p>
              </div>
              {sectionCard(
                "LLM Model",
                "Select the language model that powers your agent's responses.",
                <>
                  <Select disabled defaultValue="stub">
                    <SelectTrigger className="max-w-xl border-slate-200 bg-slate-50">
                      <SelectValue placeholder="Groq GPT-OSS 120B" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stub">
                        Groq GPT-OSS 120B (preview)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </>,
              )}
              {sectionCard(
                "LLM Temperature",
                "Control creativity and randomness of the agent's responses.",
                <>
                  <Label className="text-sm text-slate-700">
                    LLM Temperature
                  </Label>
                  <p className="text-xs text-slate-500">
                    Controls creativity and randomness of responses (UI preview
                    only).
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={llmTemperature}
                    onChange={(e) =>
                      setLlmTemperature(Number.parseFloat(e.target.value))
                    }
                    className="mt-2 w-full max-w-xl accent-indigo-600"
                  />
                  <div className="flex flex-wrap gap-2 pt-2">
                    {(
                      ["Deterministic", "Creative", "More Creative"] as const
                    ).map((label, i) => (
                      <Button
                        key={label}
                        type="button"
                        size="sm"
                        variant={i === 0 ? "default" : "outline"}
                        className={
                          i === 0
                            ? "bg-indigo-600 hover:bg-indigo-700"
                            : "border-slate-200"
                        }
                        onClick={() =>
                          setLlmTemperature(
                            i === 0 ? 0.15 : i === 1 ? 0.45 : 0.75,
                          )
                        }
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </>,
              )}
            </TabsContent>

            <TabsContent value="system" className="mt-6 space-y-4">
              {sectionCard(
                "Raw System Prompt",
                "Auto-generated preview from your Behavior & Knowledge settings. Unlock for manual control is not available yet.",
                <>
                  <Textarea
                    readOnly
                    className="min-h-[280px] resize-y border-slate-200 bg-slate-50 font-mono text-xs leading-relaxed text-slate-800"
                    value={systemPromptPreview}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">
                      {systemPromptPreview.length} characters
                    </p>
                    <Button type="button" variant="outline" size="sm" disabled>
                      <Lock className="mr-1 h-3.5 w-3.5" />
                      Unlock Raw Edit
                    </Button>
                  </div>
                </>,
              )}
            </TabsContent>

            <TabsContent value="test" className="mt-6">
              <AgentTestPanel
                tenantId={tenantId}
                agentId={agent.id}
                isDirty={isDirty}
                draft={testDraft}
                savedGreeting={greeting.trim() || agent.greeting}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
        {saveMessage && !isDirty ? (
          <CardFooter className="border-t border-slate-100 bg-slate-50/40 py-3">
            <p className="text-sm text-emerald-700">{saveMessage}</p>
          </CardFooter>
        ) : null}
      </Card>

      {isDirty ? (
        <UnsavedChangesBar
          saving={saving}
          saveDisabled={!agentName.trim()}
          saveError={saveError}
          onDiscard={resetLocal}
          onSave={() => void save()}
        />
      ) : null}
      <Dialog open={addVoiceOpen} onOpenChange={onAddVoiceOpenChange}>
        <DialogContent className="border-slate-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add custom voice</DialogTitle>
            <DialogDescription>
              Record in the browser or upload a clear sample (for example 1–5
              minutes of speech). We send it to ElevenLabs as an{" "}
              <a
                href="https://elevenlabs.io/docs/overview/capabilities/voices"
                className="text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
                target="_blank"
                rel="noreferrer"
              >
                instant voice clone
              </a>{" "}
              in your linked account, then apply it to this agent.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="custom-voice-name">Display name</Label>
              <Input
                id="custom-voice-name"
                className="border-slate-200"
                placeholder="e.g. Front desk — Sarah"
                value={newVoiceName}
                onChange={(e) => setNewVoiceName(e.target.value)}
                disabled={createVoiceSubmitting}
              />
            </div>
            <div className="grid gap-2">
              <Label>Record in browser</Label>
              <div className="flex flex-wrap items-center gap-2">
                {!isMicRecording ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-slate-200"
                    disabled={createVoiceSubmitting || micBusy}
                    onClick={() => void startMicRecording()}
                  >
                    <Mic className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    {micBusy ? "Starting…" : "Start recording"}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={createVoiceSubmitting || micBusy}
                      onClick={stopMicRecording}
                    >
                      <Square
                        className="mr-1.5 h-3.5 w-3.5 fill-current"
                        aria-hidden
                      />
                      Stop recording
                    </Button>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800"
                      aria-live="polite"
                    >
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
                      </span>
                      {formatRecordDuration(recordElapsedSec)}
                    </span>
                    <span className="text-xs text-slate-500">
                      Max {MIC_RECORDING_MAX_SEC / 60} min
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Tap Start recording to open your browser&apos;s microphone
                prompt (if permission is not already granted). When you stop,
                the clip becomes your sample (same as uploading a file).
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="custom-voice-sample">Or upload from device</Label>
              <Input
                id="custom-voice-sample"
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.flac,.aac"
                className="cursor-pointer border-slate-200 bg-white text-sm file:mr-3 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
                disabled={createVoiceSubmitting || isMicRecording}
                onChange={(e) => {
                  haltMicRecordingDiscard();
                  const f = e.target.files?.[0];
                  setNewVoiceFile(f ?? null);
                }}
              />
              <p className="text-xs text-slate-500">
                MP3, WAV, M4A, WebM, etc. Max 20 MB. Quality improves with more
                clean speech in the clip.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-slate-200"
                disabled={
                  !localClipUrl ||
                  localClipLoading ||
                  createVoiceSubmitting ||
                  isMicRecording
                }
                onClick={playLocalRecordingPreview}
              >
                <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                {localClipLoading ? "Playing…" : "Hear clip"}
              </Button>
            </div>
            {createVoiceError ? (
              <p className="text-sm text-red-600" role="alert">
                {createVoiceError}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onAddVoiceOpenChange(false)}
              disabled={createVoiceSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={
                createVoiceSubmitting ||
                !newVoiceName.trim() ||
                !newVoiceFile ||
                isMicRecording
              }
              onClick={() => void submitCustomVoice()}
            >
              {createVoiceSubmitting ? "Creating…" : "Create & apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatElevenLabsVoiceLabel(v: PortalElevenLabsVoice): string {
  const cat = v.category?.trim();
  return cat ? `${v.name} · ${cat}` : v.name;
}
