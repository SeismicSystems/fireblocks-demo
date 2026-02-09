import type { Hex } from "viem";
import type { RawSignatureResult } from "../fireblocks/signer.js";

/**
 * Derive a deterministic 256-bit encryption key from a Fireblocks signature.
 *
 * Because Fireblocks caches signatures for identical payloads, the same
 * seed message always produces the same signature, which always produces
 * the same derived key — without ever storing the key.
 *
 * Pipeline:  signature.fullSig → SHA-256 → 32-byte key
 */
export async function deriveKeyFromSignature(
  signature: RawSignatureResult,
): Promise<Hex> {
  const sigBytes = hexToBytes(signature.fullSig);
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", sigBytes as BufferSource),
  );
  return bytesToHex(hash);
}

/**
 * Create the deterministic seed message that will be sent to Fireblocks
 * for raw signing. The seed is a SHA-256 hash of the domain separator,
 * producing a stable 32-byte payload.
 */
export async function createSeedMessage(
  domain: string = "seismic-fireblocks-encryption-key-v1",
): Promise<Hex> {
  const encoder = new TextEncoder();
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(domain)),
  );
  return bytesToHex(hash);
}

/**
 * Derive an AES-GCM CryptoKey from raw key bytes for use with
 * the Web Crypto API.
 */
export async function importAesKey(
  keyHex: Hex,
): Promise<CryptoKey> {
  const keyBytes = hexToBytes(keyHex);
  return crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// --- Hex utilities (no external deps) ---

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): Hex {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}` as Hex;
}
