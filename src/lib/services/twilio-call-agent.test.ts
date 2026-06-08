import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVoiceSystemPrompt,
  type CallAgentSnapshot,
} from "@/lib/services/twilio-call-agent";

function sampleSnapshot(): CallAgentSnapshot {
  return {
    tenantId: "TEN-10025",
    agentId: "00000000-0000-0000-0000-000000000001",
    agentName: "Angela",
    systemPrompt: "# Role\nYou are a test agent.",
    greeting: "Hello!",
    voiceId: "voice_123",
    language: "en",
    maxDurationSec: 600,
    sttLanguage: "en-US",
    voiceGender: "female",
    infoToCollect: ["Name", "Company"],
  };
}

describe("twilio-call-agent", () => {
  it("buildVoiceSystemPrompt includes phone style and tenant tag", () => {
    const snapshot = sampleSnapshot();
    const prompt = buildVoiceSystemPrompt(snapshot);
    assert.ok(prompt.includes(snapshot.systemPrompt));
    assert.ok(prompt.includes("# Voice conversation rules"));
    assert.ok(prompt.includes("# Voice persona"));
    assert.ok(prompt.includes(snapshot.agentName));
    assert.ok(prompt.includes("female assistant"));
    assert.ok(prompt.includes(`[tenant=${snapshot.tenantId}]`));
  });
});
