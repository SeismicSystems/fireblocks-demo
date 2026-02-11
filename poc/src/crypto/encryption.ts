import type { Hex } from "viem";
import { importAesKey } from "./key-derivation.js";

const IV_BYTES = 12;

export interface EncryptedPayload {
  ciphertext: Hex;
  iv: Hex;
}

/**
 * Encrypt arbitrary data with AES-256-GCM using a derived key.
 */
export async function encrypt(
  keyHex: Hex,
  plaintext: Uint8Array | Hex,
): Promise<EncryptedPayload> {
  const key = await importAesKey(keyHex);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data =
    typeof plaintext === "string" ? hexToBytes(plaintext) : plaintext;

  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );

  return {
    ciphertext: bytesToHex(new Uint8Array(ciphertextBuf)),
    iv: bytesToHex(iv),
  };
}

/**
 * Decrypt AES-256-GCM encrypted data using the same derived key.
 */
export async function decrypt(
  keyHex: Hex,
  payload: EncryptedPayload,
): Promise<Hex> {
  const key = await importAesKey(keyHex);
  const iv = hexToBytes(payload.iv);
  const ciphertext = hexToBytes(payload.ciphertext);

  const plaintextBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return bytesToHex(new Uint8Array(plaintextBuf));
}

/**
 * Verify that encrypting then decrypting produces the original data.
 */
export async function verifyRoundtrip(
  keyHex: Hex,
  original: Hex,
): Promise<boolean> {
  const encrypted = await encrypt(keyHex, original);
  const decrypted = await decrypt(keyHex, encrypted);
  return decrypted === original;
}

// --- Hex utilities ---

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
