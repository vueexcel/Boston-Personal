import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeMulawBuffer,
  encodeMulawBuffer,
  encodeMulawSample,
} from "@/lib/voice/mulaw-audio";
import {
  base64ToMulaw,
  decodeMulawBytes,
  encodePcm16ToMulaw,
  mulawToBase64,
} from "@/lib/voice/mulaw-audio-browser";

describe("mulaw-audio", () => {
  it("roundtrips PCM through encode/decode (server)", () => {
    const pcm = Buffer.alloc(4);
    pcm.writeInt16LE(0, 0);
    pcm.writeInt16LE(12000, 2);
    const mulaw = encodeMulawBuffer(pcm);
    const decoded = decodeMulawBuffer(mulaw);
    assert.equal(decoded.readInt16LE(0), 0);
    assert.ok(Math.abs(decoded.readInt16LE(2) - 12000) < 200);
  });

  it("encodeMulawSample produces 8-bit values", () => {
    const encoded = encodeMulawSample(-1000);
    assert.ok(encoded >= 0 && encoded <= 255);
  });
});

describe("mulaw-audio-browser", () => {
  it("roundtrips PCM through encode/decode (browser)", () => {
    const pcm = new Int16Array([0, 8000, -4000, 16000]);
    const mulaw = encodePcm16ToMulaw(pcm);
    const decoded = decodeMulawBytes(mulaw);
    assert.equal(decoded.length, pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      assert.ok(Math.abs(decoded[i]! - pcm[i]!) < 300);
    }
  });

  it("roundtrips base64 mulaw payload", () => {
    const pcm = new Int16Array([100, -200, 3000]);
    const mulaw = encodePcm16ToMulaw(pcm);
    const b64 = mulawToBase64(mulaw);
    const restored = base64ToMulaw(b64);
    assert.equal(restored.length, mulaw.length);
    for (let i = 0; i < mulaw.length; i++) {
      assert.equal(restored[i], mulaw[i]);
    }
  });
});
