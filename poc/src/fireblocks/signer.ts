import { Fireblocks, PeerType, TransactionOperation } from "@fireblocks/ts-sdk";
import { pollTransaction } from "./client.js";

export interface RawSignatureResult {
  r: string;
  s: string;
  v: number;
  fullSig: string;
  publicKey: string;
}

/**
 * Sign a raw message via Fireblocks MPC.
 *
 * The message must be a hex-encoded 32-byte hash (64 hex characters).
 * Fireblocks caches signatures: identical content from the same vault
 * yields an identical signature without re-approval.
 */
export async function signRawMessage(
  client: Fireblocks,
  messageHex: string,
  vaultAccountId: string,
  note?: string,
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
      assetId: "BTC_TEST",
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
 * Request the same signature twice and verify caching works.
 * Returns both signatures for comparison.
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
