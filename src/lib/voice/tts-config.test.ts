import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  getElevenLabsTtsModel,
  getTtsConfigForProfile,
  getTtsMediaFormat,
  getTtsOutputFormat,
  getTtsVoiceSettings,
} from "@/lib/voice/tts-config";

describe("tts-config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  beforeEach(() => {
    delete process.env.ELEVENLABS_TTS_MODEL;
    delete process.env.ELEVENLABS_TTS_BROWSER_FORMAT;
    delete process.env.ELEVENLABS_TTS_TELEPHONY_FORMAT;
  });

  it("defaults preview profile to mp3_44100_128 without voice settings", () => {
    assert.equal(getTtsOutputFormat("preview"), "mp3_44100_128");
    assert.equal(getTtsMediaFormat("preview"), "mp3");
    assert.equal(getTtsVoiceSettings("preview"), undefined);
  });

  it("defaults browser_test profile to mp3 with telephony voice settings", () => {
    assert.equal(getTtsOutputFormat("browser_test"), "mp3_44100_128");
    assert.equal(getTtsMediaFormat("browser_test"), "mp3");
    const settings = getTtsVoiceSettings("browser_test");
    assert.ok(settings);
    assert.equal(typeof settings.speed, "number");
    assert.equal(
      getTtsVoiceSettings("browser_test")?.speed,
      getTtsVoiceSettings("telephony")?.speed,
    );
  });

  it("defaults telephony profile to ulaw_8000 with voice settings", () => {
    assert.equal(getTtsOutputFormat("telephony"), "ulaw_8000");
    assert.equal(getTtsMediaFormat("telephony"), "mulaw");
    const settings = getTtsVoiceSettings("telephony");
    assert.ok(settings);
    assert.equal(typeof settings.speed, "number");
    assert.equal(typeof settings.stability, "number");
  });

  it("reads ELEVENLABS_TTS_MODEL from env", () => {
    process.env.ELEVENLABS_TTS_MODEL = "eleven_turbo_v2_5";
    assert.equal(getElevenLabsTtsModel(), "eleven_turbo_v2_5");
    assert.equal(
      getTtsConfigForProfile("preview").model,
      "eleven_turbo_v2_5",
    );
  });

  it("getTtsConfigForProfile returns a complete snapshot", () => {
    const preview = getTtsConfigForProfile("preview");
    assert.equal(preview.profile, "preview");
    assert.equal(preview.outputFormat, "mp3_44100_128");
    assert.equal(preview.mediaFormat, "mp3");
    assert.equal(preview.voiceSettings, null);
    assert.equal(preview.streamingLatency, 0);

    const browserTest = getTtsConfigForProfile("browser_test");
    assert.equal(browserTest.profile, "browser_test");
    assert.equal(browserTest.outputFormat, "mp3_44100_128");
    assert.equal(browserTest.mediaFormat, "mp3");
    assert.ok(browserTest.voiceSettings);

    const telephony = getTtsConfigForProfile("telephony");
    assert.equal(telephony.profile, "telephony");
    assert.equal(telephony.outputFormat, "ulaw_8000");
    assert.equal(telephony.mediaFormat, "mulaw");
    assert.ok(telephony.voiceSettings);
  });
});
