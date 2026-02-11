import { type Hex, hexToBytes, bytesToHex } from "viem";
import { decrypt } from "@/poc/crypto/key-derivation";

/**
 * Fetches a transaction by its hash from the Seismic network
 */
export async function fetchTransaction(
  client: any,
  txHash: Hex,
) {
  const tx = await client.getTransaction({ hash: txHash });
  if (!tx) {
    throw new Error(`Transaction ${txHash} not found`);
  }
  return tx;
}

/**
 * Extracts encrypted portions from Seismic transaction calldata.
 * 
 * Seismic encrypts suint256 parameters while leaving the function selector
 * and address parameters unencrypted.
 * 
 * For transfer(address,suint256):
 * - Bytes 0-3: function selector (0xb10c99b5) - unencrypted
 * - Bytes 4-35: address parameter - unencrypted
 * - Bytes 36+: encrypted suint256 amount
 * 
 * The encrypted data is encrypted using AES-256-GCM with a key derived via:
 * aes_key = HKDF(ECDH(encryptionSk, network_tee_pubkey))
 */
export function extractEncryptedCalldata(input: Hex): {
  selector: Hex;
  unencryptedParams: Hex;
  encryptedData: Hex;
} {
  const inputBytes = hexToBytes(input);
  
  if (inputBytes.length < 36) {
    throw new Error(`Calldata too short: ${inputBytes.length} bytes`);
  }
  
  // First 4 bytes: function selector
  const selector = bytesToHex(inputBytes.slice(0, 4));
  
  // Next 32 bytes: address parameter (unencrypted)
  const unencryptedParams = bytesToHex(inputBytes.slice(4, 36));
  
  // Remaining bytes: encrypted suint256 parameter
  // Format: IV (12 bytes) + ciphertext (32 bytes) + auth tag (16 bytes)
  const encryptedData = bytesToHex(inputBytes.slice(36));
  
  return {
    selector,
    unencryptedParams,
    encryptedData,
  };
}

/**
 * Decrypts the encrypted suint256 parameter from transaction calldata.
 * 
 * The encrypted data format from Seismic:
 * - First 12 bytes: IV/nonce
 * - Next 32 bytes: encrypted amount (ciphertext)
 * - Last 16 bytes: AES-GCM authentication tag (included in ciphertext)
 * 
 * The decryption key should be derived via:
 * aes_key = HKDF(ECDH(encryptionSk, network_tee_pubkey))
 */
export async function decryptCalldataParameter(
  derivedKey: Hex,
  encryptedData: Hex,
): Promise<bigint> {
  const dataBytes = hexToBytes(encryptedData);
  
  if (dataBytes.length < 12) {
    throw new Error(`Encrypted data too short: ${dataBytes.length} bytes`);
  }
  
  // Extract IV (first 12 bytes) and ciphertext (remaining bytes including auth tag)
  const iv = bytesToHex(dataBytes.slice(0, 12));
  const ciphertext = bytesToHex(dataBytes.slice(12));
  
  // Decrypt using AES-GCM
  const plaintext = await decrypt(derivedKey, { ciphertext, iv });
  
  // The plaintext is the uint256 value as hex
  return BigInt(plaintext);
}

/**
 * Reconstructs the plaintext calldata from decrypted parameters
 */
export function reconstructPlaintextCalldata(
  selector: Hex,
  address: Hex,
  amount: bigint,
): Hex {
  // Pad address to 32 bytes (remove 0x prefix if present)
  const addressParam = address.startsWith("0x") 
    ? address.slice(2).padStart(64, "0")
    : address.padStart(64, "0");
  
  // Convert amount to hex and pad to 32 bytes
  const amountParam = amount.toString(16).padStart(64, "0");
  
  return `${selector}${addressParam}${amountParam}` as Hex;
}
