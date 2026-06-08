import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getScribeClientConnectConfig } from "@/lib/voice/scribe-client-config";

describe("getScribeClientConnectConfig", () => {
  it("returns VAD commit strategy and model defaults", () => {
    const config = getScribeClientConnectConfig("en-US");
    assert.equal(config.commitStrategy, "vad");
    assert.equal(config.modelId, "scribe_v2_realtime");
    assert.equal(config.languageCode, "en");
    assert.ok(config.vadSilenceThresholdSecs >= 0.3);
    assert.ok(config.vadThreshold > 0);
    assert.ok(config.minSpeechDurationMs > 0);
    assert.ok(config.minSilenceDurationMs > 0);
  });

  it("maps Spanish locale to Scribe language code", () => {
    const config = getScribeClientConnectConfig("es");
    assert.equal(config.languageCode, "es");
  });
});
