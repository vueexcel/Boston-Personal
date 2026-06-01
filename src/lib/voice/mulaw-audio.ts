/** ITU-T G.711 μ-law decode table (8-bit → 16-bit PCM). */
const MULAW_DECODE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  MULAW_DECODE[i] = sign ? -sample : sample;
}

/** Decodes μ-law bytes to 16-bit little-endian PCM. */
export function decodeMulawBuffer(mulaw: Buffer): Buffer {
  const pcm = Buffer.allocUnsafe(mulaw.length * 2);
  for (let i = 0; i < mulaw.length; i++) {
    pcm.writeInt16LE(MULAW_DECODE[mulaw[i]!]!, i * 2);
  }
  return pcm;
}

/** Decodes base64 μ-law payload from Twilio Media Streams to 16-bit PCM. */
export function decodeMulawBase64(base64: string): Buffer {
  return decodeMulawBuffer(Buffer.from(base64, "base64"));
}

/** Wraps 16-bit mono PCM as a WAV file (8 kHz telephony). */
export function pcm16ToWav(pcm: Buffer, sampleRate = 8000): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = pcm.length;
  const fileSize = 36 + dataSize;
  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}
