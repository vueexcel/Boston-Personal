import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isGoodbyeIntent } from "@/lib/voice/goodbye-intent";

describe("goodbye-intent", () => {
  it("detects short goodbye phrases", () => {
    assert.equal(isGoodbyeIntent("bye"), true);
    assert.equal(isGoodbyeIntent("goodbye"), true);
  });

  it("does not treat snowball with embedded bye as goodbye", () => {
    const snowball =
      "What is the toothbrush? Hell no. No, I don't want to be connected with anyone else. Is it pink?";
    assert.equal(isGoodbyeIntent(snowball), false);
  });

  it("detects goodbye in final clause of long utterance", () => {
    const text =
      "Whatever products you have. No. Bye.";
    assert.equal(isGoodbyeIntent(text), true);
  });
});
