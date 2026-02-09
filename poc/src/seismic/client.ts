import { http, type Chain, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createShieldedWalletClient,
  getShieldedContract,
  seismicDevnet2,
} from "seismic-viem";

import { TestSRC20Abi } from "./abi.js";

export interface SeismicConfig {
  rpcUrl: string;
  deployerPrivateKey: Hex;
  contractAddress?: Address;
}

export function loadSeismicConfig(): SeismicConfig {
  const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY as Hex;
  if (!deployerPrivateKey) throw new Error("DEPLOYER_PRIVATE_KEY is required");

  return {
    rpcUrl:
      process.env.SEISMIC_RPC_URL ?? "https://node-2.seismicdev.net/rpc",
    deployerPrivateKey,
    contractAddress: (process.env.SRC20_CONTRACT_ADDRESS || undefined) as
      | Address
      | undefined,
  };
}

export async function createSeismicClient(config: SeismicConfig) {
  const account = privateKeyToAccount(config.deployerPrivateKey);

  const chain: Chain = {
    ...seismicDevnet2,
    rpcUrls: {
      default: { http: [config.rpcUrl] },
    },
  };

  return createShieldedWalletClient({
    chain,
    account,
    transport: http(config.rpcUrl),
  });
}

export function getTokenContract(
  client: Awaited<ReturnType<typeof createSeismicClient>>,
  address: Address,
) {
  // Type assertion needed: seismic-viem's generic constraints on
  // ShieldedWalletClient are overly strict for getShieldedContract.
  // The runtime behavior is correct.
  return getShieldedContract({
    abi: TestSRC20Abi,
    address,
    client: client as any,
  });
}

/**
 * Read the caller's own balance via signed read.
 */
export async function readBalance(
  client: Awaited<ReturnType<typeof createSeismicClient>>,
  contractAddress: Address,
): Promise<bigint> {
  const result = await client.readContract({
    address: contractAddress,
    abi: TestSRC20Abi,
    functionName: "balanceOf",
  });
  return result as bigint;
}
