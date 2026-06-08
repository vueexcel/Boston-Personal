import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isFillerOnlyUtterance,
  shouldSkipAsUserTurn,
} from "@/lib/voice/utterance-quality";

describe("utterance-quality", () => {
  it("detects filler-only utterances", () => {
    assert.equal(isFillerOnlyUtterance("okay"), true);
    assert.equal(isFillerOnlyUtterance("Okay."), true);
    assert.equal(isFillerOnlyUtterance("yeah"), true);
    assert.equal(isFillerOnlyUtterance(""), true);
    assert.equal(
      isFillerOnlyUtterance("Can you tell me the timings?"),
      false,
    );
  });

  it("skips filler only when a longer pending utterance exists", () => {
    const question = "Can you tell me timings and charges?";
    assert.equal(shouldSkipAsUserTurn("Okay.", question), true);
    assert.equal(shouldSkipAsUserTurn("Okay.", null), false);
    assert.equal(shouldSkipAsUserTurn(question, "Okay."), false);
  });
});
