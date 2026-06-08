import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coalescePendingTranscript,
  shouldTriggerBargeIn,
  shouldTriggerClientBargeIn,
} from "@/lib/voice/endpointing";
import type { VoiceTuningConfig } from "@/lib/voice/voice-tuning";

function defaultTuning(): VoiceTuningConfig {
  return {
    partialStabilityMin: 0.85,
    bargeInMinChars: 12,
    bargeInOnlyFinal: true,
    endpointSilenceMs: 1000,
    endpointMinChars: 2,
    postEndpointDelayMs: 300,
    ttsFrameDelayMs: 23,
    ttsSpeed: 0.9,
  };
}

describe("endpointing", () => {
  it("coalescePendingTranscript joins disjoint fragments", () => {
    const merged = coalescePendingTranscript(
      "Can you tell me timings",
      "and charges?",
    );
    assert.equal(merged, "Can you tell me timings and charges?");
  });

  it("shouldTriggerBargeIn allows substantive partials on PSTN", () => {
    const config = defaultTuning();
    assert.equal(
      shouldTriggerBargeIn(
        { text: "Can you tell me about products?", final: false },
        config,
      ),
      true,
    );
    assert.equal(
      shouldTriggerBargeIn({ text: "okay", final: false }, config),
      false,
    );
    assert.equal(
      shouldTriggerBargeIn(
        { text: "What are your hours today?", final: true },
        config,
      ),
      true,
    );
  });

  it("shouldTriggerClientBargeIn honors explicit client barge-in flag", () => {
    const config = defaultTuning();
    assert.equal(
      shouldTriggerClientBargeIn(
        { text: "Hello there", final: false, bargeIn: true },
        config,
      ),
      true,
    );
  });
});
