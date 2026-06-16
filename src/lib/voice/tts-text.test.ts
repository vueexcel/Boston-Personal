import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isShortReactionSentence,
  softenReactionExclamation,
  TtsSentenceMerger,
} from "@/lib/voice/tts-text";

describe("isShortReactionSentence", () => {
  it("detects brief acknowledgments", () => {
    assert.equal(isShortReactionSentence("Great, Andrew!"), true);
    assert.equal(isShortReactionSentence("Thank you, Andrew."), true);
    assert.equal(isShortReactionSentence("Sure."), true);
  });

  it("rejects normal sentences", () => {
    assert.equal(
      isShortReactionSentence(
        "Could you please provide your phone number next?",
      ),
      false,
    );
    assert.equal(
      isShortReactionSentence(
        "We offer general dentistry and cosmetic dentistry.",
      ),
      false,
    );
  });
});

describe("softenReactionExclamation", () => {
  it("downgrades trailing exclamation on short reactions", () => {
    assert.equal(softenReactionExclamation("Great, Andrew!"), "Great, Andrew.");
  });
});

describe("TtsSentenceMerger", () => {
  it("holds short reaction alone until the next sentence", () => {
    const merger = new TtsSentenceMerger();
    assert.deepEqual(merger.push("Great, Andrew!"), []);
    const merged = merger.push("Could you provide your phone number?");
    assert.equal(merged.length, 1);
    assert.ok(merged[0]!.includes("Great, Andrew!"));
    assert.ok(merged[0]!.includes("Could you provide your phone number?"));
  });

  it("emits normal long sentences on their own", () => {
    const merger = new TtsSentenceMerger();
    const sentence =
      "We offer general dentistry, cosmetic dentistry, and orthodontics.";
    const out = merger.push(sentence);
    assert.equal(out.length, 1);
    assert.equal(out[0], sentence);
  });

  it("softens exclamation when flushing a lone reaction", () => {
    const merger = new TtsSentenceMerger();
    merger.push("Great, Andrew!");
    assert.equal(merger.flush(), "Great, Andrew.");
  });
});
