import { type Hex, type Address } from "viem";
import { createSeismicClient, getTokenContract } from "@/poc/seismic/client";

type WalletClient = Awaited<ReturnType<typeof createSeismicClient>>;

/**
 * Submits a shielded SRC20 transfer transaction.
 * The client automatically encrypts suint256 parameters using the configured encryption key.
 */
export async function submitShieldedTransaction(
  client: WalletClient,
  contractAddress: Address,
  to: Address,
  amount: bigint,
): Promise<Hex> {
  const contract = getTokenContract(client, contractAddress) as any;
  return await contract.write.transfer([to, amount]);
}

/**
 * Waits for a transaction receipt with timeout.
 */
export async function waitForReceipt(
  client: WalletClient,
  txHash: Hex,
  timeoutMs = 60_000,
) {
  return client.waitForTransactionReceipt({
    hash: txHash,
    timeout: timeoutMs,
  });
}
