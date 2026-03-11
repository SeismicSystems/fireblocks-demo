import { http, type Chain, type Address, type Hex, type Transport, keccak256, encodePacked, concat, toHex, pad } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createShieldedWalletClient,
  getShieldedContract,
  seismicDevnet2,
  type GetSeismicClientsParameters,
  type ShieldedWalletClient,
  type ShieldedContract,
} from "seismic-viem";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { Fireblocks } from "@fireblocks/ts-sdk";

import { TestSRC20Abi } from "@/poc/seismic/abi";
import { signRawMessage } from "@/poc/fireblocks/signer";

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
): Promise<ShieldedWalletClient<Transport, Chain>> {
  const account = privateKeyToAccount(config.deployerPrivateKey);

  const chain: Chain = {
    ...seismicDevnet2,
    rpcUrls: {
      default: { http: [config.rpcUrl] },
    },
  };

  const clientConfig: GetSeismicClientsParameters<Transport, Chain, typeof account> = {
    chain,
    account,
    transport: http(config.rpcUrl),
    encryptionSk,
  };

  const client = await createShieldedWalletClient(clientConfig);
  return client as ShieldedWalletClient<Transport, Chain>;
}

export function getTokenContract(
  client: ShieldedWalletClient<Transport, Chain>,
  address: Address,
): ShieldedContract<Transport, Address, typeof TestSRC20Abi, Chain> {
  return getShieldedContract({
    abi: TestSRC20Abi,
    address,
    client,
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

/**
 * Reads a balance using the SRC20 balanceOfSigned function with a Fireblocks MPC signature.
 *
 * The signature authorizes the balance read on-chain via ecrecover — no raw private key needed.
 * The authorization is token-agnostic and reusable for 1 hour.
 */
export async function readBalanceSigned(
  fireblocksClient: Fireblocks,
  vaultAccountId: string,
  walletClient: ShieldedWalletClient<Transport, Chain>,
  contractAddress: Address,
  ownerAddress: Address,
): Promise<bigint> {
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // Construct the message hash exactly as the contract does
  const messageHash = keccak256(
    encodePacked(
      ["string", "address", "uint256"],
      ["SRC20_BALANCE_READ", ownerAddress, expiry],
    ),
  );

  // Wrap with EIP-191 personal sign prefix (contract does ecrecover on this)
  const ethSignedHash = keccak256(
    encodePacked(
      ["string", "bytes32"],
      ["\x19Ethereum Signed Message:\n32", messageHash],
    ),
  );

  // Sign via Fireblocks MPC
  const sig = await signRawMessage(
    fireblocksClient,
    ethSignedHash,
    vaultAccountId,
    "SRC20 balanceOfSigned authorization",
  );

  // Pack r + s + v into a 65-byte signature
  // Fireblocks returns v as 0/1; ecrecover expects 27/28
  const v = sig.v < 27 ? sig.v + 27 : sig.v;
  const rHex = pad((`0x${sig.r.replace(/^0x/, "")}`) as Hex, { size: 32 });
  const sHex = pad((`0x${sig.s.replace(/^0x/, "")}`) as Hex, { size: 32 });
  const signature = concat([rHex, sHex, toHex(v, { size: 1 })]);

  // Plain eth_call — no signed read or encryption needed
  const result = await walletClient.readContract({
    address: contractAddress,
    abi: TestSRC20Abi,
    functionName: "balanceOfSigned",
    args: [ownerAddress, expiry, signature],
  });

  return result as bigint;
}
