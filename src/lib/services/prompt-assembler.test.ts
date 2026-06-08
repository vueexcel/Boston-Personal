import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCollectWorkflowBlock,
  buildPhoneConversationStyleBlock,
} from "@/lib/services/prompt-assembler";
import {
  buildVoicePersonaBlock,
  type CallAgentSnapshot,
} from "@/lib/services/twilio-call-agent";

function sampleSnapshot(): CallAgentSnapshot {
  return {
    tenantId: "TEN-10025",
    agentId: "00000000-0000-0000-0000-000000000001",
    agentName: "Angela",
    systemPrompt: "# Role\nTest",
    greeting: "Hello",
    voiceId: "voice_123",
    voiceGender: "female",
    language: "en",
    maxDurationSec: 600,
    sttLanguage: "en-US",
    infoToCollect: ["Caller's Name", "Company Name"],
  };
}

describe("prompt-assembler voice blocks", () => {
  it("buildPhoneConversationStyleBlock includes key sections", () => {
    const block = buildPhoneConversationStyleBlock();
    assert.ok(block.includes("# Voice conversation rules"));
    assert.ok(block.includes("# Interruption handling"));
    assert.ok(block.includes("# Repetition prevention"));
    assert.ok(block.includes("# Speech recognition uncertainty"));
  });

  it("buildCollectWorkflowBlock lists fields in order", () => {
    const block = buildCollectWorkflowBlock([
      "Caller's Name",
      "Budget",
    ]);
    assert.ok(block.includes("COLLECT workflow"));
    assert.ok(block.includes("Caller's Name"));
    assert.ok(block.includes("Budget"));
    assert.ok(block.includes("ONE COLLECT question per turn"));
  });

  it("buildCollectWorkflowBlock returns empty when no fields", () => {
    assert.equal(buildCollectWorkflowBlock([]), "");
  });
});

describe("buildVoicePersonaBlock", () => {
  it("includes name and female gender persona", () => {
    const block = buildVoicePersonaBlock(sampleSnapshot());
    assert.ok(block.includes("Angela"));
    assert.ok(block.includes("female assistant"));
  });
});
