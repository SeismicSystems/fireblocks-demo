import { type Hex, hexToBytes, bytesToHex, concat, toHex, toRlp } from "viem";
import { secp256k1 } from "@noble/curves/secp256k1";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { generateAesKey, AesGcmCrypto } from "seismic-viem";

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
 * Constructs the AAD (Additional Authenticated Data) for transaction decryption using RLP encoding.
 * This MUST match seismic-viem's encodeSeismicMetadataAsAAD function exactly.
 * 
 * AAD = RLP([sender, chain_id, nonce, to, value, encryption_pubkey, encryption_nonce, message_version, recentBlockHash, expiresAtBlock, signedRead])
 */
export function constructAAD(tx: any, debug: boolean = false): Uint8Array {
  // Handle both number and hex string for nonce
  const nonceValue = typeof tx.nonce === 'string' && tx.nonce.startsWith('0x') 
    ? parseInt(tx.nonce, 16) 
    : tx.nonce;
  
  // Handle both number and hex string for expiresAtBlock  
  const expiresAtBlockValue = typeof tx.expiresAtBlock === 'string' && tx.expiresAtBlock.startsWith('0x')
    ? BigInt(tx.expiresAtBlock)
    : BigInt(tx.expiresAtBlock);
  
  // Ensure encryptionPubkey has 0x prefix
  const encryptionPubkey = tx.encryptionPubkey?.startsWith('0x') 
    ? tx.encryptionPubkey 
    : `0x${tx.encryptionPubkey}`;
  
  // Ensure encryptionNonce has 0x prefix  
  const encryptionNonce = tx.encryptionNonce?.startsWith('0x')
    ? tx.encryptionNonce
    : `0x${tx.encryptionNonce}`;
  
  // Build the fields array exactly as seismic-viem does
  const fields = [
    tx.from, // sender
    toHex(tx.chainId), // chainId
    nonceValue === 0 ? "0x" : toHex(nonceValue), // nonce
    tx.to ?? "0x", // to
    BigInt(tx.value || 0) === 0n ? "0x" : toHex(BigInt(tx.value || 0)), // value
    encryptionPubkey, // encryptionPubkey
    encryptionNonce === "0x00" || encryptionNonce === "0x0" ? "0x" : encryptionNonce, // encryptionNonce
    tx.messageVersion === "0x0" || tx.messageVersion === "0x00" || tx.messageVersion === "0x" ? "0x" : tx.messageVersion, // messageVersion
    tx.recentBlockHash, // recentBlockHash
    toHex(expiresAtBlockValue), // expiresAtBlock
    tx.signedRead ? "0x01" : "0x", // signedRead
  ];
  
  if (debug) {
    console.log(`\nAAD fields (for RLP encoding):`);
    const fieldNames = ['sender', 'chainId', 'nonce', 'to', 'value', 'encryptionPubkey', 'encryptionNonce', 'messageVersion', 'recentBlockHash', 'expiresAtBlock', 'signedRead'];
    fields.forEach((field, i) => {
      console.log(`  [${i}] ${fieldNames[i]}: ${field}`);
    });
  }
  
  // RLP encode as bytes
  const aad = toRlp(fields, "bytes");
  
  if (debug) {
    console.log(`\nRLP-encoded AAD:`);
    console.log(`  Total length: ${aad.length} bytes`);
    console.log(`  Hex: ${bytesToHex(aad)}`);
  }
  
  return aad;
}

// Network TEE public key (hardcoded for Seismic testnet)
const NETWORK_TEE_PUBLIC_KEY = "028e76821eb4d77fd30223ca971c49738eb5b5b71eabe93f96b348fdce788ae5a0" as Hex;

/**
 * Derives an AES-256-GCM key from ECDH shared secret using HKDF.
 * 
 * Process:
 * 1. ECDH(client_encryptionSk, network_TEE_pubkey) → shared_secret
 * 2. HKDF-SHA256(shared_secret, salt=None, info="aes-gcm key") → 32-byte AES key
 */
export async function deriveAesKeyFromECDH(
  encryptionSk: Hex,
): Promise<Uint8Array> {
  // Perform ECDH with network's TEE public key
  const privateKeyBytes = hexToBytes(encryptionSk);
  const networkPublicKeyBytes = hexToBytes(NETWORK_TEE_PUBLIC_KEY);
  
  const sharedSecret = secp256k1.getSharedSecret(privateKeyBytes, networkPublicKeyBytes, true);
  
  // Use only the x-coordinate (skip first byte which is 0x02/0x03 prefix)
  const sharedSecretX = sharedSecret.slice(1);
  
  // Derive AES key using HKDF with SHA-256
  // HKDF(secret, salt, info, length)
  const info = new TextEncoder().encode("aes-gcm key");
  const aesKey = hkdf(sha256, sharedSecretX, undefined, info, 32);
  
  return aesKey;
}

/**
 * Decrypts the entire transaction input using ECDH + HKDF + AES-GCM with AAD.
 * 
 * Process:
 * 1. Derive AES key from ECDH(client_encryptionSk, network_TEE_pubkey) + HKDF
 * 2. Construct AAD from transaction metadata
 * 3. Decrypt tx.input using AES-256-GCM with key, nonce, and AAD
 * 
 * Returns the decrypted calldata (function selector + parameters).
 */
export async function decryptTransactionInput(
  encryptionSk: Hex,
  tx: any,
  debug: boolean = false,
): Promise<Hex> {
  if (debug) {
    console.log(`\n=== AES Key Generation Debug ===`);
    console.log(`Input encryptionSk: ${encryptionSk}`);
    console.log(`Network TEE pubkey: ${NETWORK_TEE_PUBLIC_KEY}`);
  }
  
  // Import crypto primitives to manually trace ECDH
  const { sharedSecretPoint, sharedKeyFromPoint, deriveAesKey: deriveAesKeyFn } = await import("seismic-viem");
  
  // Manually compute each step
  const sharedSecretBytes = sharedSecretPoint({
    privateKey: encryptionSk,
    networkPublicKey: NETWORK_TEE_PUBLIC_KEY,
  });
  if (debug) {
    console.log(`Shared secret point (64 bytes): ${bytesToHex(sharedSecretBytes)}`);
  }
  
  const sharedKey = sharedKeyFromPoint(sharedSecretBytes);
  if (debug) {
    console.log(`Shared key (after compression hash): ${sharedKey}`);
  }
  
  const aesKey = deriveAesKeyFn(sharedKey);
  if (debug) {
    console.log(`AES key (after HKDF): ${aesKey}`);
  }
  
  // 2. Construct AAD from transaction metadata
  const aad = constructAAD(tx, debug);
  
  // 3. Create AesGcmCrypto instance with the derived key
  const crypto = new AesGcmCrypto(aesKey);
  
  if (debug) console.log(`\nAttempting decryption with:`);
  if (debug) console.log(`  Ciphertext: ${tx.input}`);
  if (debug) console.log(`  Nonce: ${tx.encryptionNonce}`);
  if (debug) console.log(`  AAD length: ${aad.length} bytes`);
  
  // 4. Decrypt using seismic-viem's AesGcmCrypto which properly handles AAD
  const plaintext = await crypto.decrypt(
    tx.input as Hex,
    tx.encryptionNonce as Hex,
    aad
  );
  
  return plaintext;
}

/**
 * Extracts the function selector from decrypted calldata
 */
export function extractFunctionSelector(calldata: Hex): Hex {
  return calldata.slice(0, 10) as Hex; // 0x + 8 hex chars = 4 bytes
}

/**
 * Extracts parameters from decrypted calldata
 */
export function extractCalldataParams(calldata: Hex): Hex {
  return `0x${calldata.slice(10)}` as Hex;
}
