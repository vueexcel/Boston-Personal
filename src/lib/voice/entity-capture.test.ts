import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseSpelledLetters,
  shouldSkipEntityCaptureForIntent,
} from "@/lib/voice/entity-capture";

describe("parseSpelledLetters", () => {
  it("returns null for normal sentences with I and a", () => {
    assert.equal(
      parseSpelledLetters("I wanna book a consultation"),
      null,
    );
    assert.equal(parseSpelledLetters("I want a slot"), null);
  });

  it("parses dashed spelling", () => {
    assert.equal(parseSpelledLetters("S-U-P-E-R-A"), "SUPERA");
  });

  it("parses space-separated letters when 3 or more", () => {
    assert.equal(parseSpelledLetters("S U P E R A"), "SUPERA");
  });

  it("rejects two-letter I a pattern", () => {
    assert.equal(parseSpelledLetters("I a"), null);
  });
});

describe("shouldSkipEntityCaptureForIntent", () => {
  it("skips booking and service intents", () => {
    assert.equal(
      shouldSkipEntityCaptureForIntent("I wanna book a consultation"),
      true,
    );
    assert.equal(
      shouldSkipEntityCaptureForIntent("tell me about the product"),
      true,
    );
    assert.equal(shouldSkipEntityCaptureForIntent("Andrew"), false);
  });
});
