import { type Hex, toHex, toRlp, type Address } from "viem";
import {
  generateAesKey,
  AesGcmCrypto,
  type ShieldedPublicClient,
} from "seismic-viem";

/**
 * Seismic transaction with encryption metadata.
 * Contains all fields needed for transaction decryption and AAD construction.
 */
export interface SeismicTransaction {
  from: Address;
  to: Address | null;
  input: Hex;
  value: bigint;
  nonce: number;
  chainId: number;
  blockNumber: bigint;
  encryptionPubkey: Hex;
  encryptionNonce: Hex;
  messageVersion: Hex;
  recentBlockHash: Hex;
  expiresAtBlock: Hex | bigint;
  signedRead: boolean;
}

/**
 * Fetches a transaction by its hash from the Seismic network.
 *
 * @param client - Seismic public or wallet client with getTransaction method
 * @param txHash - Transaction hash
 * @returns The complete transaction object including encrypted calldata and metadata
 */
export async function fetchTransaction(
  client: { getTransaction: (args: { hash: Hex }) => Promise<unknown> },
  txHash: Hex,
): Promise<SeismicTransaction> {
  const tx = await client.getTransaction({ hash: txHash });
  if (!tx) {
    throw new Error(`Transaction ${txHash} not found`);
  }
  return tx as SeismicTransaction;
}

function ensureHexPrefix(value: string | undefined): string {
  if (!value) return "0x";
  return value.startsWith("0x") ? value : `0x${value}`;
}

function normalizeNumeric(value: string | number): number {
  if (typeof value === "string" && value.startsWith("0x")) {
    return parseInt(value, 16);
  }
  return Number(value);
}

/**
 * Constructs Additional Authenticated Data (AAD) for AES-GCM decryption.
 *
 * In Seismic, transaction calldata is encrypted using AES-256-GCM with AAD.
 * The AAD consists of transaction metadata that is authenticated but not encrypted,
 * ensuring both the integrity and authenticity of the transaction.
 *
 * The AAD is constructed by RLP-encoding the following 11 fields:
 * [sender, chainId, nonce, to, value, encryptionPubkey, encryptionNonce,
 *  messageVersion, recentBlockHash, expiresAtBlock, signedRead]
 *
 * This implementation must match seismic-viem's encodeSeismicMetadataAsAAD exactly.
 *
 * @param tx - Transaction object from the Seismic network
 * @returns RLP-encoded AAD as a Uint8Array
 */
function constructAAD(tx: SeismicTransaction): Uint8Array {
  const nonceValue = normalizeNumeric(tx.nonce);
  const expiresAtBlockValue = BigInt(
    typeof tx.expiresAtBlock === "string" && tx.expiresAtBlock.startsWith("0x")
      ? tx.expiresAtBlock
      : `0x${tx.expiresAtBlock.toString(16)}`,
  );

  // Ensure critical fields have proper 0x prefixes for RLP encoding
  const encryptionPubkey = ensureHexPrefix(tx.encryptionPubkey) as Hex;
  const encryptionNonce = ensureHexPrefix(tx.encryptionNonce) as Hex;

  // Construct the 11-field array following seismic-viem's specification
  const fields: Hex[] = [
    tx.from,
    toHex(tx.chainId),
    (nonceValue === 0 ? "0x" : toHex(nonceValue)) as Hex,
    (tx.to ?? "0x") as Hex,
    (BigInt(tx.value || 0) === 0n ? "0x" : toHex(BigInt(tx.value || 0))) as Hex,
    encryptionPubkey as Hex,
    (encryptionNonce === "0x00" || encryptionNonce === "0x0"
      ? "0x"
      : encryptionNonce) as Hex,
    (tx.messageVersion === "0x0" ||
    tx.messageVersion === "0x00" ||
    tx.messageVersion === "0x"
      ? "0x"
      : tx.messageVersion) as Hex,
    tx.recentBlockHash,
    toHex(expiresAtBlockValue),
    (tx.signedRead ? "0x01" : "0x") as Hex,
  ];

  return toRlp(fields, "bytes");
}

/**
 * Decrypts transaction calldata using the client's encryption private key.
 *
 * Seismic transactions encrypt the entire calldata (function selector + parameters)
 * using AES-256-GCM with Additional Authenticated Data (AAD). This function:
 *
 * 1. Derives the AES key via ECDH(client_private_key, network_TEE_public_key) + HKDF
 * 2. Constructs the AAD from transaction metadata (RLP-encoded)
 * 3. Decrypts the ciphertext using AES-GCM with the derived key, nonce, and AAD
 *
 * The decryption process validates both the ciphertext and the authenticated metadata,
 * ensuring the transaction hasn't been tampered with.
 *
 * @param client - Seismic client with getTeePublicKey method
 * @param encryptionSk - Client's ephemeral encryption private key (secp256k1)
 * @param tx - Transaction object containing encrypted calldata and metadata
 * @returns Decrypted calldata as a hex string (function selector + parameters)
 */
export async function decryptTransactionInput(
  client: { getTeePublicKey: () => Promise<string> },
  encryptionSk: Hex,
  tx: SeismicTransaction,
): Promise<Hex> {
  // Step 1: Fetch the network's TEE public key
  const networkTeePublicKey = (await client.getTeePublicKey()) as Hex;

  // Step 2: Derive AES-256-GCM key from ECDH + HKDF
  // This uses ECDH(client_sk, network_TEE_pk) to establish a shared secret,
  // then applies HKDF-SHA256 to derive the AES key
  const aesKey = generateAesKey({
    privateKey: encryptionSk,
    networkPublicKey: networkTeePublicKey,
  });

  // Step 3: Construct AAD from transaction metadata
  // The AAD ensures the transaction metadata is authenticated during decryption
  const aad = constructAAD(tx);

  // Step 4: Decrypt using AES-256-GCM
  const crypto = new AesGcmCrypto(aesKey);
  const plaintext = await crypto.decrypt(
    tx.input as Hex,
    tx.encryptionNonce as Hex,
    aad,
  );

  return plaintext;
}

/**
 * Extracts the function selector (first 4 bytes) from calldata.
 *
 * @param calldata - Complete calldata hex string
 * @returns Function selector
 */
export function extractFunctionSelector(calldata: Hex): Hex {
  return calldata.slice(0, 10) as Hex;
}

/**
 * Extracts parameters (everything after the function selector) from calldata.
 *
 * @param calldata - Complete calldata hex string
 * @returns Parameters hex string
 */
export function extractCalldataParams(calldata: Hex): Hex {
  return `0x${calldata.slice(10)}` as Hex;
}
