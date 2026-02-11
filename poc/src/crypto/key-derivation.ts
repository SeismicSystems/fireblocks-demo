import { type Hex, bytesToHex, hexToBytes } from "viem";
import { RawSignatureResult } from "@/poc/fireblocks/signer";

/**
 * Derives a deterministic encryption key from a Fireblocks signature.
 * Uses SHA-256 to ensure consistent key generation from cached signatures.
 */
export async function deriveKeyFromSignature(
  signature: RawSignatureResult,
): Promise<Hex> {
  const sigBytes = hexToBytes(signature.fullSig as Hex);
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", sigBytes as BufferSource),
  );
  return bytesToHex(hash);
}

/**
 * Imports an AES key for use with Web Crypto API.
 */
export async function importAesKey(keyHex: Hex): Promise<CryptoKey> {
  const keyBytes = hexToBytes(keyHex);
  return crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypts data using AES-GCM with the provided key and IV.
 */
export async function encrypt(
  keyHex: Hex,
  plaintext: Hex,
): Promise<{ ciphertext: Hex; iv: Hex }> {
  const key = await importAesKey(keyHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = hexToBytes(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintextBytes as BufferSource,
  );

  return {
    ciphertext: bytesToHex(new Uint8Array(ciphertext)),
    iv: bytesToHex(iv),
  };
}

/**
 * Decrypts AES-GCM encrypted data.
 */
export async function decrypt(
  keyHex: Hex,
  encrypted: { ciphertext: Hex; iv: Hex },
): Promise<Hex> {
  const key = await importAesKey(keyHex);
  const ciphertextBytes = hexToBytes(encrypted.ciphertext);
  const ivBytes = hexToBytes(encrypted.iv);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes as BufferSource },
    key,
    ciphertextBytes as BufferSource,
  );

  return bytesToHex(new Uint8Array(plaintext));
}
