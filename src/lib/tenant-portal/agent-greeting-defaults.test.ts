import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allFlashLanguagesHaveFallbacks,
  ENGLISH_GENERIC_GREETING,
  getLocalizedFallbackPhrase,
  LOCALIZED_FALLBACK_GREETINGS,
} from "@/lib/tenant-portal/agent-greeting-defaults";

describe("agent-greeting-defaults", () => {
  it("covers all Flash v2.5 languages with non-empty fallbacks", () => {
    assert.equal(allFlashLanguagesHaveFallbacks(), true);
  });

  it("returns English generic for en", () => {
    assert.equal(getLocalizedFallbackPhrase("en"), ENGLISH_GENERIC_GREETING);
    assert.equal(getLocalizedFallbackPhrase("en-US"), ENGLISH_GENERIC_GREETING);
  });

  it("returns Spanish fallback for es", () => {
    const phrase = getLocalizedFallbackPhrase("es");
    assert.ok(phrase.length > 0);
    assert.notEqual(phrase, ENGLISH_GENERIC_GREETING);
    assert.equal(phrase, LOCALIZED_FALLBACK_GREETINGS.es);
  });

  it("returns French fallback for fr", () => {
    assert.equal(
      getLocalizedFallbackPhrase("fr"),
      LOCALIZED_FALLBACK_GREETINGS.fr,
    );
  });
});
