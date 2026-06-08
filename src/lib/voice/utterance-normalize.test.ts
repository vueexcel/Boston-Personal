import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isActiveTurnDuplicate,
  isDuplicateUserTranscript,
  normalizeCallerTranscript,
} from "@/lib/voice/utterance-normalize";

describe("utterance-normalize", () => {
  it("returns null for exact duplicate of prior user line", () => {
    const prior = ["Can you tell me about the products?"];
    assert.equal(
      normalizeCallerTranscript("Can you tell me about the products?", prior),
      null,
    );
  });

  it("extracts new tail from snowballed partial", () => {
    const prior = ["Can you tell me about the products?"];
    const result = normalizeCallerTranscript(
      "Can you tell me about the products? What is your name?",
      prior,
    );
    assert.equal(result, "What is your name?");
  });

  it("detects active turn duplicate", () => {
    assert.equal(
      isActiveTurnDuplicate(
        "Can you tell me about the products?",
        "Can you tell me about the products?",
      ),
      true,
    );
  });

  it("detects duplicate user transcript", () => {
    assert.equal(
      isDuplicateUserTranscript("Hello there", ["Hello there"]),
      true,
    );
  });
});
