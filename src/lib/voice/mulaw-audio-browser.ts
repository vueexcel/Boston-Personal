/** Browser-safe μ-law encode/decode for portal voice tests (8 kHz telephony). */

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

export function decodeMulawBytes(mulaw: Uint8Array): Int16Array {
  const pcm = new Int16Array(mulaw.length);
  for (let i = 0; i < mulaw.length; i++) {
    pcm[i] = MULAW_DECODE[mulaw[i]!]!;
  }
  return pcm;
}

export function encodePcm16ToMulaw(pcm: Int16Array): Uint8Array {
  const mulaw = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    mulaw[i] = encodeMulawSample(pcm[i]!);
  }
  return mulaw;
}

export function mulawToBase64(mulaw: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < mulaw.length; i++) {
    binary += String.fromCharCode(mulaw[i]!);
  }
  return btoa(binary);
}

export function base64ToMulaw(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/** Downsamples mono float32 audio to 8 kHz int16 (linear interpolation). */
export function downsampleTo8kHz(
  input: Float32Array,
  inputSampleRate: number,
): Int16Array {
  if (inputSampleRate === 8000) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]!));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  const ratio = inputSampleRate / 8000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = input[idx] ?? 0;
    const s1 = input[idx + 1] ?? s0;
    const sample = s0 + (s1 - s0) * frac;
    const clamped = Math.max(-1, Math.min(1, sample));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return out;
}

export function pcm16ToFloat32(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    out[i] = pcm[i]! / 0x8000;
  }
  return out;
}
