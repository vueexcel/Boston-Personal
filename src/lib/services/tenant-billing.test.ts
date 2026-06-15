import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computePostpaidInvoiceCents,
  POSTPAID_SECONDS_LIMIT,
} from "@/lib/db/tenant-billing";
import { __test__ } from "@/lib/services/tenant-billing";

const { computeWaterfall, getPackageSecondsLimit } = __test__;

const costing = {
  package1Hours: 30,
  package2Hours: 90,
};

describe("getPackageSecondsLimit", () => {
  it("maps plan codes to seconds", () => {
    assert.equal(getPackageSecondsLimit("PACKAGE_1", costing), 30 * 3600);
    assert.equal(getPackageSecondsLimit("PACKAGE_2", costing), 90 * 3600);
    assert.equal(getPackageSecondsLimit("PAYG", costing), 0);
  });
});

describe("computeWaterfall", () => {
  it("consumes package hours before postpaid", () => {
    const split = computeWaterfall(2 * 3600, 30 * 3600, 29 * 3600, POSTPAID_SECONDS_LIMIT, 0);
    assert.equal(split.packageSeconds, 3600);
    assert.equal(split.postpaidSeconds, 3600);
    assert.equal(split.overageSeconds, 0);
  });

  it("routes to postpaid when package is exhausted", () => {
    const split = computeWaterfall(5 * 3600, 30 * 3600, 30 * 3600, POSTPAID_SECONDS_LIMIT, 0);
    assert.equal(split.packageSeconds, 0);
    assert.equal(split.postpaidSeconds, 5 * 3600);
    assert.equal(split.overageSeconds, 0);
  });

  it("records overage beyond postpaid allowance", () => {
    const split = computeWaterfall(
      5 * 3600,
      0,
      0,
      POSTPAID_SECONDS_LIMIT,
      28 * 3600,
    );
    assert.equal(split.postpaidSeconds, 2 * 3600);
    assert.equal(split.overageSeconds, 3 * 3600);
  });

  it("supports PAYG tenants with no package bucket", () => {
    const split = computeWaterfall(20 * 3600, 0, 0, POSTPAID_SECONDS_LIMIT, 0);
    assert.equal(split.packageSeconds, 0);
    assert.equal(split.postpaidSeconds, 20 * 3600);
  });
});

describe("computePostpaidInvoiceCents", () => {
  it("bills only consumed postpaid hours", () => {
    assert.equal(computePostpaidInvoiceCents(7.5 * 3600, 5), 3750);
    assert.equal(computePostpaidInvoiceCents(0, 5), 0);
  });

  it("does not bill the full 30-hour allowance", () => {
    const partial = computePostpaidInvoiceCents(10 * 3600, 5);
    const fullAllowance = computePostpaidInvoiceCents(30 * 3600, 5);
    assert.equal(partial, 5000);
    assert.equal(fullAllowance, 15000);
    assert.notEqual(partial, fullAllowance);
  });

  it("package-only usage produces zero postpaid invoice", () => {
    assert.equal(computePostpaidInvoiceCents(0, 5), 0);
  });
});
