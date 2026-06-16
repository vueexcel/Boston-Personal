import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCollectedInfoBlock,
  getNextCollectField,
  updateCollectedInfoFromMessages,
} from "@/lib/services/call-collected-info";

describe("call-collected-info", () => {
  it("formats collected block for prompt injection", () => {
    const block = formatCollectedInfoBlock(["Name", "Company"], {
      Name: "Andrew",
      Company: null,
    });
    assert.ok(block.includes("COLLECTED SO FAR"));
    assert.ok(block.includes("Name: Andrew"));
    assert.ok(block.includes("Company: (not yet collected)"));
    assert.ok(block.includes("NEXT COLLECT"));
    assert.ok(block.includes("Company"));
  });

  it("getNextCollectField returns first missing field", () => {
    assert.equal(
      getNextCollectField(["Name", "Company"], {
        Name: "Andrew",
        Company: null,
      }),
      "Company",
    );
    assert.equal(getNextCollectField(["Name"], { Name: "A" }), null);
  });

  it("rejects looking for as collected name", () => {
    const messages = [
      { role: "user" as const, content: "I'm looking for nothing." },
    ];
    const updated = updateCollectedInfoFromMessages(
      messages,
      ["Caller's Name", "Company Name"],
      { "Caller's Name": null, "Company Name": null },
    );
    assert.equal(updated["Caller's Name"], null);
    assert.equal(updated["Company Name"], null);
  });

  it("updates collected fields from user messages heuristically", () => {
    const messages = [
      { role: "user" as const, content: "My name is Andrew" },
      { role: "assistant" as const, content: "Thanks Andrew." },
      { role: "user" as const, content: "Company is Top G" },
    ];
    const updated = updateCollectedInfoFromMessages(
      messages,
      ["Name", "Company"],
      { Name: null, Company: null },
    );
    assert.equal(updated.Name, "Andrew");
    assert.equal(updated.Company, "Top G");
  });

  it("extracts my name is pattern for caller name field", () => {
    const messages = [
      { role: "user" as const, content: "Yes, my name is Andrew." },
    ];
    const updated = updateCollectedInfoFromMessages(
      messages,
      ["Caller's Name"],
      { "Caller's Name": null },
    );
    assert.equal(updated["Caller's Name"], "Andrew");
  });

  it("uses latest value when caller corrects", () => {
    const messages = [
      { role: "user" as const, content: "Company is Acme" },
      { role: "user" as const, content: "Company is Top G" },
    ];
    const updated = updateCollectedInfoFromMessages(
      messages,
      ["Company"],
      { Company: "Acme" },
    );
    assert.equal(updated.Company, "Top G");
  });

  it("extracts preferred callback time from natural phrasing", () => {
    const messages = [
      {
        role: "user" as const,
        content: "My preferred time is Tuesday morning, 10:00 a.m.",
      },
    ];
    const updated = updateCollectedInfoFromMessages(
      messages,
      ["Preferred time for a callback"],
      { "Preferred time for a callback": null },
    );
    assert.ok(updated["Preferred time for a callback"]?.includes("Tuesday"));
    assert.ok(
      updated["Preferred time for a callback"]?.includes("10:00"),
    );
  });
});
