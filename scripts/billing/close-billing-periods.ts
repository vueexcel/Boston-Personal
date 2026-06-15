import { closeDueBillingPeriods } from "@/lib/services/tenant-billing";

async function main(): Promise<void> {
  const closed = await closeDueBillingPeriods(new Date());
  console.log(`[billing] Closed ${closed} billing period(s).`);
}

main().catch((e) => {
  console.error("[billing] close-billing-periods failed", e);
  process.exit(1);
});
