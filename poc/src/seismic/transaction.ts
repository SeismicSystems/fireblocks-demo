import { type Hex, type Address, encodeFunctionData } from "viem";

import { TestSRC20Abi } from "./abi.js";
import { type createSeismicClient, getTokenContract } from "./client.js";

type WalletClient = Awaited<ReturnType<typeof createSeismicClient>>;

/**
 * Build the plaintext calldata for an SRC20 transfer,
 * before Seismic encryption is applied.
 */
export function buildTransferCalldata(to: Address, amount: bigint): Hex {
  return encodeFunctionData({
    abi: TestSRC20Abi,
    functionName: "transfer",
    args: [to, amount],
  });
}

/**
 * Submit a shielded transaction to the Seismic network.
 * The client handles encryption of calldata automatically.
 */
export async function submitShieldedTransaction(
  client: WalletClient,
  contractAddress: Address,
  to: Address,
  amount: bigint,
): Promise<{ txHash: Hex; calldata: Hex }> {
  const calldata = buildTransferCalldata(to, amount);
  const contract = getTokenContract(client, contractAddress) as any;
  const txHash: Hex = await contract.write.transfer([to, amount]);

  return { txHash, calldata };
}

/**
 * Wait for a transaction receipt with timeout.
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
