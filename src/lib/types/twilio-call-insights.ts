/**
 * Normalized Twilio Call resource fields for portal display.
 * @see https://www.twilio.com/docs/voice/tutorials/how-to-retrieve-call-logs/node
 */
export type TwilioCallInsights = {
  sid: string;
  status: string | null;
  direction: string | null;
  durationSeconds: number | null;
  startTime: string | null;
  endTime: string | null;
  dateCreated: string | null;
  from: string | null;
  to: string | null;
  fromFormatted: string | null;
  toFormatted: string | null;
  answeredBy: string | null;
  callerName: string | null;
  forwardedFrom: string | null;
  price: string | null;
  priceUnit: string | null;
  queueTimeMs: number | null;
  parentCallSid: string | null;
  phoneNumberSid: string | null;
};
