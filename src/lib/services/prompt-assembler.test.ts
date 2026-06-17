import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBehaviourBlockFromConfig,
  buildCollectWorkflowBlock,
  buildPhoneConversationStyleBlock,
  buildSupportedLanguagesBlock,
  DEFAULT_BEHAVIOUR_RULES,
} from "@/lib/services/prompt-assembler";
import { defaultAgentPortalConfig } from "@/lib/tenant-portal/agent-config-v1";
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
    assert.ok(block.includes("calm, professional, and conversational"));
    assert.ok(!block.includes("warm, and human"));
    assert.ok(block.includes('Thanks, Andrew." not "Great, Andrew!'));
    assert.ok(block.includes('"I\'m here."'));
    assert.ok(block.includes('never "I\'m here!"'));
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
    assert.ok(block.includes("time or callback COLLECT field"));
  });

  it("buildCollectWorkflowBlock returns empty when no fields", () => {
    assert.equal(buildCollectWorkflowBlock([]), "");
  });

  it("DEFAULT_BEHAVIOUR_RULES compares caller stated day and time", () => {
    assert.ok(DEFAULT_BEHAVIOUR_RULES.includes("STRICT HOURS & DAYS ENFORCEMENT"));
    assert.ok(DEFAULT_BEHAVIOUR_RULES.includes("they stated"));
    assert.ok(DEFAULT_BEHAVIOUR_RULES.includes("do not mention Sunday"));
  });

  it("buildBehaviourBlockFromConfig uses multilingual default language guidance", () => {
    const block = buildBehaviourBlockFromConfig(defaultAgentPortalConfig(), {
      greeting: "Hello",
      voiceId: "voice_123",
      voiceProviderId: "elevenlabs",
      language: "en",
    });
    assert.ok(block.includes("Default language:"));
    assert.ok(block.includes("respond in that language"));
    assert.ok(block.includes("answer yes and continue in that language"));
    assert.ok(!block.includes("Respond ONLY"));
    assert.ok(!block.includes("Never switch languages"));
  });

  it("buildSupportedLanguagesBlock lists capabilities without language-specific code", () => {
    const block = buildSupportedLanguagesBlock();
    assert.ok(block.includes("# Supported voice languages"));
    assert.ok(block.includes("Never claim you cannot speak a language"));
    assert.ok(block.includes("Match the caller's language"));
    assert.ok(block.includes("English"));
    assert.ok(block.includes("French"));
    assert.ok(block.includes("Hindi"));
  });
});

describe("buildVoicePersonaBlock", () => {
  it("includes name and female gender persona", () => {
    const block = buildVoicePersonaBlock(sampleSnapshot());
    assert.ok(block.includes("Angela"));
    assert.ok(block.includes("female assistant"));
  });
});
