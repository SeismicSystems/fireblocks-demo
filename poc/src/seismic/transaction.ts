import { type Hex, type Address } from "viem";
import { createSeismicClient, getTokenContract } from "@/poc/seismic/client";

type WalletClient = Awaited<ReturnType<typeof createSeismicClient>>;

/**
 * Submits a shielded SRC20 transfer transaction.
 * The client automatically encrypts calldata using the configured encryption key.
 *
 * @param client - Seismic shielded wallet client
 * @param contractAddress - SRC20 contract address
 * @param to - Recipient address
 * @param amount - Transfer amount
 * @returns Transaction hash
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
