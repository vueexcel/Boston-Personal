import { randomBytes } from "crypto";
import { getRedis } from "@/lib/cache/redis";
import type { CollectedInfoMap } from "@/lib/services/call-collected-info";
import { initialCollectedMap } from "@/lib/services/call-collected-info";
import type {
  CallAgentSnapshot,
  CallChatMessage,
} from "@/lib/services/twilio-call-agent";
import type { VoiceConversationSession } from "@/lib/voice/voice-conversation-engine";

export type TestCallSession = {
  sessionId: string;
  token: string;
  tenantId: string;
  agentId: string;
  messages: CallChatMessage[];
  turnCount: number;
  startedAt: string;
  agentSnapshot: CallAgentSnapshot;
  greetingPlayed: boolean;
  expiresAt: string;
  collectedInfo?: CollectedInfoMap;
};

const TEST_SESSION_TTL_SEC = 10 * 60;

function sessionKey(sessionId: string): string {
  return `call:test:${sessionId}`;
}

function ttlSeconds(snapshot: CallAgentSnapshot): number {
  return Math.min(snapshot.maxDurationSec + 120, TEST_SESSION_TTL_SEC);
}

export function toVoiceConversationSession(
  session: TestCallSession,
): VoiceConversationSession {
  return {
    sessionId: session.sessionId,
    tenantId: session.tenantId,
    agentId: session.agentId,
    messages: session.messages,
    turnCount: session.turnCount,
    startedAt: session.startedAt,
    agentSnapshot: session.agentSnapshot,
    greetingPlayed: session.greetingPlayed,
    collectedInfo:
      session.collectedInfo ??
      initialCollectedMap(session.agentSnapshot.infoToCollect),
  };
}

export type CreateTestCallSessionParams = {
  tenantId: string;
  agentId: string;
  agentSnapshot: CallAgentSnapshot;
};

export type CreateTestCallSessionResult = {
  session: TestCallSession;
  expiresAt: string;
};

export async function createTestCallSession(
  params: CreateTestCallSessionParams,
): Promise<CreateTestCallSessionResult> {
  const redis = getRedis();
  const sessionId = randomBytes(16).toString("hex");
  const token = randomBytes(32).toString("base64url");
  const startedAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + TEST_SESSION_TTL_SEC * 1000,
  ).toISOString();

  const session: TestCallSession = {
    sessionId,
    token,
    tenantId: params.tenantId,
    agentId: params.agentId,
    messages: [],
    turnCount: 0,
    startedAt,
    agentSnapshot: params.agentSnapshot,
    greetingPlayed: false,
    expiresAt,
    collectedInfo: initialCollectedMap(params.agentSnapshot.infoToCollect),
  };

  await redis.set(
    sessionKey(sessionId),
    JSON.stringify(session),
    "EX",
    ttlSeconds(params.agentSnapshot),
  );

  return { session, expiresAt };
}

export async function getTestCallSession(
  sessionId: string,
): Promise<TestCallSession | null> {
  const redis = getRedis();
  const raw = await redis.get(sessionKey(sessionId));
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as TestCallSession;
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await deleteTestCallSession(sessionId);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function validateTestCallSessionToken(
  sessionId: string,
  token: string,
): Promise<TestCallSession | null> {
  const session = await getTestCallSession(sessionId);
  if (!session) return null;
  if (session.token !== token) return null;
  return session;
}

export async function saveTestCallSession(
  session: TestCallSession,
): Promise<void> {
  const redis = getRedis();
  await redis.set(
    sessionKey(session.sessionId),
    JSON.stringify(session),
    "EX",
    ttlSeconds(session.agentSnapshot),
  );
}

export async function deleteTestCallSession(sessionId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(sessionKey(sessionId));
}

export async function appendTestCallMessages(
  sessionId: string,
  userText: string,
  assistantText: string,
): Promise<TestCallSession | null> {
  const session = await getTestCallSession(sessionId);
  if (!session) return null;
  session.messages.push({ role: "user", content: userText });
  session.messages.push({ role: "assistant", content: assistantText });
  session.turnCount += 1;
  await saveTestCallSession(session);
  return session;
}
