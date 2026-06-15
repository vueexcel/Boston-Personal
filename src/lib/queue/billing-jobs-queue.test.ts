import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getBillingClosePeriodsCron } from "@/lib/queue/billing-jobs-queue";

describe("getBillingClosePeriodsCron", () => {
  it("returns trimmed env value when set", () => {
    const prev = process.env.BILLING_CLOSE_PERIODS_CRON;
    process.env.BILLING_CLOSE_PERIODS_CRON = " 0 6 * * * ";
    try {
      assert.equal(getBillingClosePeriodsCron(), "0 6 * * *");
    } finally {
      if (prev === undefined) {
        delete process.env.BILLING_CLOSE_PERIODS_CRON;
      } else {
        process.env.BILLING_CLOSE_PERIODS_CRON = prev;
      }
    }
  });

  it("throws when env is missing", () => {
    const prev = process.env.BILLING_CLOSE_PERIODS_CRON;
    delete process.env.BILLING_CLOSE_PERIODS_CRON;
    try {
      assert.throws(
        () => getBillingClosePeriodsCron(),
        /BILLING_CLOSE_PERIODS_CRON is required/,
      );
    } finally {
      if (prev === undefined) {
        delete process.env.BILLING_CLOSE_PERIODS_CRON;
      } else {
        process.env.BILLING_CLOSE_PERIODS_CRON = prev;
      }
    }
  });
});
