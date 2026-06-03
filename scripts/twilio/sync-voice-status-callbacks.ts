/**
 * Sets statusCallback on all Twilio incoming phone numbers (voice status webhook).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/twilio/sync-voice-status-callbacks.ts
 */
import { getTwilioClient } from "@/lib/integrations/twilio";
import { getTwilioVoiceStatusWebhookUrl } from "@/lib/webhooks/twilio-app-url";

async function main(): Promise<void> {
  const statusCallback = getTwilioVoiceStatusWebhookUrl();
  const client = getTwilioClient();
  const numbers = await client.incomingPhoneNumbers.list({ limit: 200 });

  let updated = 0;
  for (const num of numbers) {
    if (
      num.statusCallback === statusCallback &&
      num.statusCallbackMethod === "POST"
    ) {
      continue;
    }
    await client.incomingPhoneNumbers(num.sid).update({
      statusCallback,
      statusCallbackMethod: "POST",
    });
    console.log("updated", num.phoneNumber, num.sid);
    updated += 1;
  }

  console.log(
    `Done. ${updated} of ${numbers.length} numbers updated. statusCallback=${statusCallback}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
