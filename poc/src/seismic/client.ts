import { http, type Chain, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createShieldedWalletClient,
  getShieldedContract,
  seismicDevnet2,
} from "seismic-viem";
import { readFileSync } from "fs";
import { resolve } from "path";

import { TestSRC20Abi } from "@/poc/seismic/abi";

export interface SeismicConfig {
  rpcUrl: string;
  deployerPrivateKey: Hex;
  contractAddress?: Address;
}

function loadContractAddress(): Address | undefined {
  try {
    const deployJsonPath = resolve("contracts/out/deploy.json");
    const deployData = JSON.parse(readFileSync(deployJsonPath, "utf8"));
    console.log("Deploy address:", deployData.TestSRC20);
    return deployData.TestSRC20 as Address;
  } catch (error) {
    // File doesn't exist or is invalid - return undefined
    return undefined;
  }
}

export function loadSeismicConfig(): SeismicConfig {
  const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY as Hex;
  if (!deployerPrivateKey) throw new Error("DEPLOYER_PRIVATE_KEY is required");

  return {
    rpcUrl: process.env.SEISMIC_RPC_URL ?? "https://gcp-1.seismictest.net/rpc",
    deployerPrivateKey,
    contractAddress: loadContractAddress(),
  };
}

/**
 * Creates a Seismic shielded wallet client.
 *
 * @param config - Seismic network configuration
 * @param encryptionSk - Optional encryption private key for deterministic calldata encryption
 * @returns Shielded wallet client instance
 */
export async function createSeismicClient(
  config: SeismicConfig,
  encryptionSk?: Hex,
) {
  const account = privateKeyToAccount(config.deployerPrivateKey);

  const chain: Chain = {
    ...seismicDevnet2,
    rpcUrls: {
      default: { http: [config.rpcUrl] },
    },
  };

  const clientConfig: any = {
    chain,
    account,
    transport: http(config.rpcUrl),
  };

  if (encryptionSk) {
    clientConfig.encryptionSk = encryptionSk;
  }

  return createShieldedWalletClient(clientConfig);
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

export async function readBalance(
  client: Awaited<ReturnType<typeof createSeismicClient>>,
  contractAddress: Address,
): Promise<bigint> {
  const result = await client.readContract({
    address: contractAddress,
    abi: TestSRC20Abi,
    functionName: "balance",
  });
  return result as bigint;
}
