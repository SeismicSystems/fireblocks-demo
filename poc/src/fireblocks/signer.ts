import { Fireblocks, PeerType, TransactionOperation } from "@fireblocks/ts-sdk";
import { type Address, keccak256, type Hex } from "viem";
import { secp256k1 } from "@noble/curves/secp256k1";
import { pollTransaction } from "@/poc/fireblocks/client";

export interface RawSignatureResult {
  r: string;
  s: string;
  v: number;
  fullSig: string;
  publicKey: string;
}

/**
 * Signs a raw message via Fireblocks MPC.
 *
 * The message must be a hex-encoded 32-byte hash (64 hex characters).
 * Fireblocks caches signatures: identical content from the same vault
 * yields an identical signature without re-approval.
 *
 * @param client - Fireblocks SDK client instance
 * @param messageHex - Hex-encoded 32-byte message hash
 * @param vaultAccountId - Fireblocks vault account ID
 * @param note - Optional transaction note
 * @returns Signature components (r, s, v) and full signature
 */
export async function signRawMessage(
  client: Fireblocks,
  messageHex: string,
  vaultAccountId: string,
  note?: string,
  assetId: string = "BTC_TEST",
): Promise<RawSignatureResult> {
  // Strip 0x prefix if present
  const content = messageHex.startsWith("0x")
    ? messageHex.slice(2)
    : messageHex;

  if (content.length !== 64) {
    throw new Error(
      `Raw message must be 32 bytes (64 hex chars), got ${content.length} chars`,
    );
  }

  const { data: tx } = await client.transactions.createTransaction({
    transactionRequest: {
      assetId,
      note: note ?? "Fireblocks signature caching POC",
      source: {
        type: PeerType.VaultAccount,
        id: vaultAccountId,
      },
      operation: TransactionOperation.Raw,
      extraParameters: {
        rawMessageData: {
          messages: [
            {
              content,
            },
          ],
        },
      },
    },
  });

  if (!tx?.id) throw new Error("Failed to create Fireblocks transaction");

  const completed = await pollTransaction(client, tx.id);

  const signed = completed.signedMessages;
  if (!signed || signed.length === 0) {
    throw new Error("No signed messages returned from Fireblocks");
  }

  const sig = signed[0].signature as any;

  return {
    r: sig.r ?? "",
    s: sig.s ?? "",
    v: sig.v ?? 0,
    fullSig: sig.fullSig ?? "",
    publicKey: signed[0].publicKey ?? "",
  };
}

/**
 * Requests the same signature twice to verify Fireblocks signature caching.
 *
 * @param client - Fireblocks SDK client instance
 * @param messageHex - Hex-encoded 32-byte message hash
 * @param vaultAccountId - Fireblocks vault account ID
 * @returns Object containing both signatures and whether they match
 */
export async function validateSignatureCaching(
  client: Fireblocks,
  messageHex: string,
  vaultAccountId: string,
): Promise<{
  first: RawSignatureResult;
  second: RawSignatureResult;
  identical: boolean;
}> {
  const first = await signRawMessage(
    client,
    messageHex,
    vaultAccountId,
    "Signature caching test — request 1",
  );

  const second = await signRawMessage(
    client,
    messageHex,
    vaultAccountId,
    "Signature caching test — request 2",
  );

  const identical = first.fullSig === second.fullSig;

  return { first, second, identical };
}

/**
 * Derives the ETH address from a Fireblocks vault by signing a dummy message
 * and recovering the address from the returned public key.
 *
 * Fireblocks returns a compressed secp256k1 public key (33 bytes).
 * We decompress it to get the uncompressed key (64 bytes, no 04 prefix),
 * then ETH address = last 20 bytes of keccak256(uncompressed key).
 */
export async function getVaultAddress(
  client: Fireblocks,
  vaultAccountId: string,
): Promise<Address> {
  // Sign a dummy message to get the public key
  const dummyHash = keccak256("0x00" as Hex);
  const result = await signRawMessage(client, dummyHash, vaultAccountId, "Get vault address");

  const pubKeyHex = result.publicKey.replace(/^0x/, "");

  // Decompress the public key using secp256k1
  // ProjectivePoint.fromHex handles both compressed (33 bytes) and uncompressed (65 bytes)
  const point = secp256k1.ProjectivePoint.fromHex(pubKeyHex);
  // Get uncompressed form (65 bytes with 04 prefix), strip the 04 prefix for keccak
  const uncompressedHex = point.toHex(false).slice(2); // remove '04' prefix

  // ETH address = last 20 bytes of keccak256(uncompressed public key without 04 prefix)
  const hash = keccak256(`0x${uncompressedHex}` as Hex);
  const address = `0x${hash.slice(-40)}` as Address;

  return address;
}
