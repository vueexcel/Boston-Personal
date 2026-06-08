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

/** ITU-T G.711 μ-law encode (16-bit PCM sample → 8-bit μ-law). */
export function encodeMulawSample(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  let s = Math.max(-CLIP, Math.min(CLIP, sample));
  const sign = s < 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  s += BIAS;
  let exponent = 7;
  for (
    let expMask = 0x4000;
    (s & expMask) === 0 && exponent > 0;
    exponent--, expMask >>= 1
  ) {
    // shrink exponent until mantissa fits
  }
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** Encodes 16-bit little-endian PCM buffer to μ-law bytes. */
export function encodeMulawBuffer(pcm: Buffer): Buffer {
  const samples = pcm.length / 2;
  const mulaw = Buffer.allocUnsafe(samples);
  for (let i = 0; i < samples; i++) {
    mulaw[i] = encodeMulawSample(pcm.readInt16LE(i * 2));
  }
  return mulaw;
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
