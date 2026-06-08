import { appendFile, mkdir } from "fs/promises";
import path from "path";

export type VoiceLogEntry = {
  event: string;
  sessionId?: string;
  logPrefix?: string;
  sttMode?: string;
  state?: string;
  data?: Record<string, unknown>;
};

function isVoiceFileLogEnabled(): boolean {
  return process.env.VOICE_LOG === "1" || process.env.DEBUG_VOICE === "1";
}

function getVoiceLogDir(): string {
  return process.env.VOICE_LOG_DIR?.trim() || "logs/voice";
}

function sessionFileName(sessionId: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const prefix = sessionId.slice(0, 12);
  return path.join(getVoiceLogDir(), day, `${prefix}.log`);
}

async function ensureLogDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

function formatLine(entry: VoiceLogEntry): string {
  const ts = new Date().toISOString();
  const parts = [
    ts,
    entry.logPrefix ? `[${entry.logPrefix}]` : null,
    entry.sessionId ? `session=${entry.sessionId.slice(0, 12)}` : null,
    entry.sttMode ? `stt=${entry.sttMode}` : null,
    entry.state ? `state=${entry.state}` : null,
    entry.event,
  ].filter(Boolean);

  const data =
    entry.data && Object.keys(entry.data).length > 0
      ? ` ${JSON.stringify(entry.data)}`
      : "";

  return `${parts.join(" ")}${data}\n`;
}

/**
 * Append structured voice pipeline events to a per-session log file.
 * Enabled when `VOICE_LOG=1` or `DEBUG_VOICE=1` (see `VOICE_LOG_DIR`, default `logs/voice`).
 */
export class VoiceSessionLogger {
  private readonly enabled = isVoiceFileLogEnabled();
  private readonly filePath: string;

  constructor(
    private readonly sessionId: string,
    private readonly logPrefix: string,
    private readonly sttMode: string,
  ) {
    this.filePath = sessionFileName(sessionId);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getFilePath(): string {
    return this.filePath;
  }

  async log(
    event: string,
    data?: Record<string, unknown>,
    state?: string,
  ): Promise<void> {
    if (!this.enabled) return;

    const line = formatLine({
      event,
      sessionId: this.sessionId,
      logPrefix: this.logPrefix,
      sttMode: this.sttMode,
      state,
      data,
    });

    try {
      await ensureLogDir(this.filePath);
      await appendFile(this.filePath, line, "utf8");
    } catch (e) {
      console.error("[voice-session-logger] write failed", e);
    }
  }

  async logState(state: string, reason: string, extra?: Record<string, unknown>): Promise<void> {
    await this.log("state_change", { reason, ...extra }, state);
  }

  async logStt(payload: {
    text: string;
    final: boolean;
    source?: string;
  }): Promise<void> {
    await this.log("stt", {
      final: payload.final,
      textLen: payload.text.length,
      text: payload.text,
      source: payload.source,
    });
  }

  async logTurnStart(transcript: string): Promise<void> {
    await this.log("turn_start", { transcript });
  }

  async logTurnComplete(payload: {
    transcript: string;
    reply: string;
    model: string;
    aborted: boolean;
    latency: {
      totalMs: number;
      llmFirstTokenMs: number | null;
      ttsFirstByteMs: number | null;
      firstMediaSentMs: number | null;
    };
  }): Promise<void> {
    await this.log("turn_complete", payload);
  }

  async logTurnError(message: string, error: unknown): Promise<void> {
    await this.log("turn_error", {
      message,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  async logInterrupt(reason: string, speakGeneration: number): Promise<void> {
    await this.log("interrupt", { reason, speakGeneration });
  }

  async logBargeIn(payload: {
    state: string;
    final: boolean;
    textLen: number;
    text: string;
  }): Promise<void> {
    await this.log("barge_in", payload, payload.state);
  }
}
