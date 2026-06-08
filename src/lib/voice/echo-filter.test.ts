import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendAgentEchoContext,
  isLikelyAgentEcho,
} from "@/lib/voice/echo-filter";

describe("isLikelyAgentEcho", () => {
  const agent =
    "We offer electric toothbrushes, whitening kits, dental floss packs, mouthwash, and retainers.";

  it("detects substring echo of agent speech", () => {
    assert.equal(
      isLikelyAgentEcho("whitening kits and dental floss", agent),
      true,
    );
  });

  it("allows clearly different user speech during playback", () => {
    assert.equal(
      isLikelyAgentEcho(
        "stop wait what are your office hours tomorrow",
        agent,
      ),
      false,
    );
  });

  it("rejects very short noise during playback", () => {
    assert.equal(isLikelyAgentEcho("yes", agent), true);
  });

  it("allows short but distinct barge-in phrases", () => {
    assert.equal(isLikelyAgentEcho("wait stop", agent), false);
  });
});

describe("appendAgentEchoContext", () => {
  it("appends and trims to max length", () => {
    let ctx = "hello";
    ctx = appendAgentEchoContext(ctx, "world", 12);
    assert.ok(ctx.includes("world"));
    const long = "a".repeat(500);
    const trimmed = appendAgentEchoContext(long, "end", 100);
    assert.equal(trimmed.length, 100);
  });
});
