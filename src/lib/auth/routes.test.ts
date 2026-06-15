import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSafeRedirectPath } from "@/lib/auth/routes";

describe("parseSafeRedirectPath", () => {
  const adminPrefixes = ["/admin"] as const;
  const portalPrefixes = ["/portal"] as const;

  it("allows paths under allowed prefixes", () => {
    assert.equal(
      parseSafeRedirectPath("/admin/tenants", adminPrefixes),
      "/admin/tenants",
    );
    assert.equal(
      parseSafeRedirectPath("/portal/voice-agents", portalPrefixes),
      "/portal/voice-agents",
    );
    assert.equal(
      parseSafeRedirectPath("/admin/tenants?foo=1", adminPrefixes),
      "/admin/tenants?foo=1",
    );
  });

  it("rejects open redirects and foreign paths", () => {
    assert.equal(parseSafeRedirectPath("//evil.com", adminPrefixes), null);
    assert.equal(
      parseSafeRedirectPath("https://evil.com", adminPrefixes),
      null,
    );
    assert.equal(
      parseSafeRedirectPath("/admin/tenants", portalPrefixes),
      null,
    );
    assert.equal(parseSafeRedirectPath("/portal", adminPrefixes), null);
    assert.equal(parseSafeRedirectPath(null, adminPrefixes), null);
  });
});
