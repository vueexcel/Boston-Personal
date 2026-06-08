import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENGLISH_GENERIC_GREETING } from "@/lib/tenant-portal/agent-greeting-defaults";
import {
  clearGreetingTranslationCache,
  greetingCacheKey,
  resolveLocalizedGreeting,
} from "@/lib/services/greeting-translate";

describe("greetingCacheKey", () => {
  it("is stable for same text and language", () => {
    const a = greetingCacheKey("Hello there", "es");
    const b = greetingCacheKey("Hello there", "es");
    assert.equal(a, b);
    assert.ok(a.startsWith("es:"));
  });

  it("differs when target language changes", () => {
    const es = greetingCacheKey("Hello there", "es");
    const fr = greetingCacheKey("Hello there", "fr");
    assert.notEqual(es, fr);
  });
});

describe("resolveLocalizedGreeting", () => {
  it("passes through stored text when target is English", async () => {
    const result = await resolveLocalizedGreeting({
      text: "Thank you for calling. How may I help?",
      targetLanguage: "en",
    });
    assert.equal(result, "Thank you for calling. How may I help?");
  });

  it("returns localized fallback when text is empty", async () => {
    const result = await resolveLocalizedGreeting({
      text: null,
      targetLanguage: "es",
    });
    assert.ok(result.length > 0);
    assert.notEqual(result, ENGLISH_GENERIC_GREETING);
  });

  it("uses cache on repeated non-English requests", async () => {
    clearGreetingTranslationCache();
    const text = "Thank you for calling our office.";
    const first = await resolveLocalizedGreeting({
      text,
      targetLanguage: "de",
    });
    const second = await resolveLocalizedGreeting({
      text,
      targetLanguage: "de",
    });
    assert.equal(second, first);
  });
});
