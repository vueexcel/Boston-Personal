import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isShortReactionSentence,
  prepareTextForTts,
  softenExclamationsForTts,
  softenReactionExclamation,
  shouldSoftenExclamationsForProfile,
  TtsSentenceMerger,
} from "@/lib/voice/tts-text";

describe("isShortReactionSentence", () => {
  it("detects brief acknowledgments", () => {
    assert.equal(isShortReactionSentence("Great, Andrew!"), true);
    assert.equal(isShortReactionSentence("Thank you, Andrew."), true);
    assert.equal(isShortReactionSentence("Sure."), true);
    assert.equal(isShortReactionSentence("I'm here!"), true);
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

describe("softenExclamationsForTts", () => {
  it("softens presence and acknowledgment phrases", () => {
    assert.equal(softenExclamationsForTts("I'm here!"), "I'm here.");
    assert.equal(
      softenExclamationsForTts("I'm here! How can I assist you?"),
      "I'm here. How can I assist you?",
    );
    assert.equal(softenExclamationsForTts("Great, Andrew!"), "Great, Andrew.");
    assert.equal(softenExclamationsForTts("Yes!"), "Yes.");
  });

  it("leaves questions and calm sentences unchanged", () => {
    assert.equal(
      softenExclamationsForTts("Could you share your name?"),
      "Could you share your name?",
    );
    assert.equal(
      softenExclamationsForTts("I apologize if it seemed that way."),
      "I apologize if it seemed that way.",
    );
  });

  it("converts interrobang to question mark", () => {
    assert.equal(softenExclamationsForTts("Really?!"), "Really?");
  });

  it("does not soften long non-ack sentences", () => {
    const long =
      "This is a very long sentence that has more than eight words in it!";
    assert.equal(softenExclamationsForTts(long), long);
  });

  it("is idempotent when already softened", () => {
    assert.equal(softenExclamationsForTts("I'm here."), "I'm here.");
  });
});

describe("softenReactionExclamation", () => {
  it("downgrades trailing exclamation on short reactions", () => {
    assert.equal(softenReactionExclamation("Great, Andrew!"), "Great, Andrew.");
  });
});

describe("prepareTextForTts", () => {
  it("softens exclamations only when opted in", () => {
    assert.equal(prepareTextForTts("I'm here!"), "I'm here!");
    assert.equal(
      prepareTextForTts("I'm here!", { softenExclamations: true }),
      "I'm here.",
    );
  });
});

describe("shouldSoftenExclamationsForProfile", () => {
  it("enables for telephony and browser_test, not preview", () => {
    assert.equal(shouldSoftenExclamationsForProfile("telephony"), true);
    assert.equal(shouldSoftenExclamationsForProfile("browser_test"), true);
    assert.equal(shouldSoftenExclamationsForProfile("preview"), false);
  });
});

describe("TtsSentenceMerger", () => {
  it("holds short reaction alone until the next sentence", () => {
    const merger = new TtsSentenceMerger();
    assert.deepEqual(merger.push("Great, Andrew!"), []);
    const merged = merger.push("Could you provide your phone number?");
    assert.equal(merged.length, 1);
    assert.ok(merged[0]!.includes("Great, Andrew."));
    assert.ok(merged[0]!.includes("Could you provide your phone number?"));
  });

  it("holds presence phrase until the next sentence", () => {
    const merger = new TtsSentenceMerger();
    assert.deepEqual(merger.push("I'm here!"), []);
    const merged = merger.push("How can I assist you?");
    assert.equal(merged.length, 1);
    assert.equal(merged[0], "I'm here. How can I assist you?");
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

  it("softens exclamation when flushing lone presence phrase", () => {
    const merger = new TtsSentenceMerger();
    merger.push("I'm here!");
    assert.equal(merger.flush(), "I'm here.");
  });

  it("softens exclamation when emitting a short non-reaction sentence immediately", () => {
    const merger = new TtsSentenceMerger();
    const out = merger.push("Stop!");
    assert.deepEqual(out, ["Stop."]);
  });
});
