import { getRedis } from "@/lib/cache/redis";
import type {
  CollectedInfoMap,
  ExtraInformationItem,
} from "@/lib/services/call-collected-info";
import type { CallConversationState } from "@/lib/services/call-conversation-state";
import type { CallAgentSnapshot, CallChatMessage } from "@/lib/services/twilio-call-agent";

export type TwilioCallSession = {
  callSid: string;
  tenantId: string;
  agentId: string;
  callLogId: string;
  callerNumber: string;
  dialedNumber: string;
  messages: CallChatMessage[];
  turnCount: number;
  startedAt: string;
  agentSnapshot: CallAgentSnapshot;
  greetingPlayed: boolean;
  collectedInfo?: CollectedInfoMap;
  extraInformation?: ExtraInformationItem[];
  conversationState?: CallConversationState;
};

function sessionKey(callSid: string): string {
  return `call:twilio:${callSid}`;
}

function ttlSeconds(snapshot: CallAgentSnapshot): number {
  return snapshot.maxDurationSec + 120;
}

export async function createCallSession(
  session: TwilioCallSession,
): Promise<void> {
  const redis = getRedis();
  const key = sessionKey(session.callSid);
  await redis.set(
    key,
    JSON.stringify(session),
    "EX",
    ttlSeconds(session.agentSnapshot),
  );
}

export async function getCallSession(
  callSid: string,
): Promise<TwilioCallSession | null> {
  const redis = getRedis();
  const raw = await redis.get(sessionKey(callSid));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TwilioCallSession;
  } catch {
    return null;
  }
}

export async function saveCallSession(
  session: TwilioCallSession,
): Promise<void> {
  const redis = getRedis();
  await redis.set(
    sessionKey(session.callSid),
    JSON.stringify(session),
    "EX",
    ttlSeconds(session.agentSnapshot),
  );
}

export async function deleteCallSession(callSid: string): Promise<void> {
  const redis = getRedis();
  await redis.del(sessionKey(callSid));
}

export async function appendCallMessages(
  callSid: string,
  userText: string,
  assistantText: string,
): Promise<TwilioCallSession | null> {
  const session = await getCallSession(callSid);
  if (!session) return null;
  session.messages.push({ role: "user", content: userText });
  session.messages.push({ role: "assistant", content: assistantText });
  session.turnCount += 1;
  await saveCallSession(session);
  return session;
}
