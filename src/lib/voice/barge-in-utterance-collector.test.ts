import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BargeInUtteranceCollector } from "@/lib/voice/barge-in-utterance-collector";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("BargeInUtteranceCollector", () => {
  it("coalesces rapid finals into one merged utterance", async () => {
    const merged: string[] = [];
    const collector = new BargeInUtteranceCollector(30, (text) => {
      merged.push(text);
    });

    collector.activate();
    collector.ingest("Can you tell me timings", false);
    collector.ingest("and charges?", true);

    await new Promise((resolve) => setTimeout(resolve, 250));
    await flushMicrotasks();

    assert.equal(merged.length, 1);
    assert.ok(merged[0].includes("timings"));
    assert.ok(merged[0].includes("charges"));
  });

  it("seeds prior buffer on activate", () => {
    const collector = new BargeInUtteranceCollector(700, () => {});
    collector.activate("Hello there");
    assert.equal(collector.peek(), "Hello there");
  });

  it("does not emit filler-only merged text", async () => {
    const merged: string[] = [];
    const collector = new BargeInUtteranceCollector(30, (text) => {
      merged.push(text);
    });

    collector.activate();
    collector.ingest("okay", true);

    await new Promise((resolve) => setTimeout(resolve, 250));
    await flushMicrotasks();

    assert.equal(merged.length, 0);
    assert.equal(collector.flushNow(), null);
  });
});
