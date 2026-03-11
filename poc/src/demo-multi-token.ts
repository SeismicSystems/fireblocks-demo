import {
  type Address,
  type Hex,
  type Chain,
  http,
  formatUnits,
  keccak256,
  encodePacked,
  concat,
  toHex,
  pad,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createShieldedWalletClient,
  getShieldedContract,
  seismicDevnet2,
  type ShieldedWalletClient,
} from "seismic-viem";
import {
  loadFireblocksConfig,
  createFireblocksClient,
} from "@/poc/fireblocks/client";
import { signRawMessage, getVaultAddress } from "@/poc/fireblocks/signer";
import { SRC20Abi, SRC20MulticallAbi, TestSRC20Abi } from "@/poc/seismic/abi";
import { createExpiry } from "@/poc/seismic/signature";

// ── Helpers ─────────────────────────────────────────────────

function log(msg: string) {
  console.log(`  ${msg}`);
}

function step(num: number, title: string) {
  console.log(`\n${"─".repeat(62)}`);
  console.log(`  Step ${num}: ${title}`);
  console.log(`${"─".repeat(62)}`);
}

function header(title: string) {
  console.log(`\n${"═".repeat(62)}`);
  console.log(`║  ${title.padEnd(56)} ║`);
  console.log(`${"═".repeat(62)}`);
}

// ── Fireblocks-signed balanceOfSigned signature ─────────────

async function signBalanceReadFireblocks(
  fireblocksClient: any,
  vaultAccountId: string,
  owner: Address,
  expiry: bigint,
): Promise<Hex> {
  const messageHash = keccak256(
    encodePacked(
      ["string", "address", "uint256"],
      ["SRC20_BALANCE_READ", owner, expiry],
    ),
  );
  const ethSignedHash = keccak256(
    encodePacked(
      ["string", "bytes32"],
      ["\x19Ethereum Signed Message:\n32", messageHash],
    ),
  );

  const sig = await signRawMessage(
    fireblocksClient,
    ethSignedHash,
    vaultAccountId,
    "Multi-token balanceOfSigned",
  );

  const v = sig.v < 27 ? sig.v + 27 : sig.v;
  const rHex = pad((`0x${sig.r.replace(/^0x/, "")}`) as Hex, { size: 32 });
  const sHex = pad((`0x${sig.s.replace(/^0x/, "")}`) as Hex, { size: 32 });
  return concat([rHex, sHex, toHex(v, { size: 1 })]);
}

// ── Batch readers ───────────────────────────────────────────

interface BatchResult {
  label: string;
  duration: number;
  balances: bigint[];
}

async function timed(label: string, fn: () => Promise<bigint[]>): Promise<BatchResult> {
  const start = Date.now();
  const balances = await fn();
  return { label, duration: Date.now() - start, balances };
}

function printTable(results: BatchResult[]) {
  const baseline = results[results.length - 1].duration;
  console.log("\n  ┌────────────────────────────────────┬──────────┬─────────┐");
  console.log("  │ Approach                           │ Time (s) │ Speedup │");
  console.log("  ├────────────────────────────────────┼──────────┼─────────┤");
  for (const r of results) {
    const t = (r.duration / 1000).toFixed(2).padStart(8);
    const s = (baseline / r.duration).toFixed(1).padStart(5) + "x";
    console.log(`  │ ${r.label.padEnd(34)} │ ${t} │ ${s.padStart(7)} │`);
  }
  console.log("  └────────────────────────────────────┴──────────┴─────────┘");
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  try {
    header("Fireblocks x SRC20 Multi-Token Batch Read");

    // Step 1: Initialize Fireblocks + Seismic clients
    step(1, "Initialize clients");

    const fireblocksConfig = loadFireblocksConfig();
    const fireblocksClient = await createFireblocksClient(fireblocksConfig);
    log("Fireblocks API configured");

    const deployerKey = process.env.DEPLOYER_PRIVATE_KEY as Hex;
    if (!deployerKey) throw new Error("DEPLOYER_PRIVATE_KEY is required");

    const rpcUrl = process.env.SEISMIC_RPC_URL ?? "https://gcp-1.seismictest.net/rpc";
    const chain: Chain = {
      ...seismicDevnet2,
      rpcUrls: { default: { http: [rpcUrl] } },
    };

    const deployerAccount = privateKeyToAccount(deployerKey);
    const client = (await createShieldedWalletClient({
      chain,
      account: deployerAccount,
      transport: http(),
    })) as ShieldedWalletClient;

    log(`Deployer: ${deployerAccount.address}`);
    log(`RPC: ${rpcUrl}`);

    // Step 2: Derive Fireblocks vault address
    step(2, "Derive Fireblocks vault address");

    const vaultAddress = await getVaultAddress(
      fireblocksClient,
      fireblocksConfig.vaultAccountId,
    );
    log(`Vault address: ${vaultAddress}`);

    // Step 3: Load deployment + mint to vault
    step(3, "Load deployment and mint to vault");

    let deployData: { multicall: string; tokens: string[] };
    try {
      deployData = await Bun.file("contracts/out/batch-read-deploy.json").json();
    } catch {
      throw new Error(
        "batch-read-deploy.json not found. Deploy first: bun run deploy:multi-token",
      );
    }

    const multicallAddress = deployData.multicall as Address;
    const tokens = deployData.tokens as Address[];
    log(`Multicall: ${multicallAddress}`);
    log(`Tokens: ${tokens.length}`);

    // Mint increasing amounts to vault across all tokens
    log("Minting to vault...");
    for (let i = 0; i < tokens.length; i++) {
      const amount = BigInt((i + 1)) * BigInt(1e18);
      const contract = getShieldedContract({
        abi: TestSRC20Abi,
        address: tokens[i],
        client,
      });
      const hash = await contract.write.mint([vaultAddress, amount]);
      await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
    }
    log(`Minted to vault across ${tokens.length} tokens`);

    // Step 4: Sign with Fireblocks MPC (one sig for all tokens)
    step(4, "Sign balanceOfSigned via Fireblocks MPC");

    const expiry = createExpiry(1);
    const signature = await signBalanceReadFireblocks(
      fireblocksClient,
      fireblocksConfig.vaultAccountId,
      vaultAddress,
      expiry,
    );
    log("MPC signature generated (valid 1h, reusable across all tokens)");

    // Step 5: Benchmark 4 approaches
    step(5, "Benchmark: read vault balances (4 approaches)");

    const results: BatchResult[] = [];

    log("Running interface batch (multicall)...");
    results.push(
      await timed("Interface batch (multicall)", () =>
        client.readContract({
          abi: SRC20MulticallAbi,
          address: multicallAddress,
          functionName: "batchBalancesInterface",
          args: [vaultAddress, tokens, expiry, signature],
        }) as Promise<bigint[]>,
      ),
    );

    log("Running staticcall batch (multicall)...");
    results.push(
      await timed("Staticcall batch (multicall)", () =>
        client.readContract({
          abi: SRC20MulticallAbi,
          address: multicallAddress,
          functionName: "batchBalances",
          args: [vaultAddress, tokens, expiry, signature],
        }) as Promise<bigint[]>,
      ),
    );

    log("Running RPC batch (Promise.all)...");
    results.push(
      await timed("RPC batch (Promise.all)", () =>
        Promise.all(
          tokens.map(
            (addr) =>
              client.readContract({
                abi: SRC20Abi,
                address: addr,
                functionName: "balanceOfSigned",
                args: [vaultAddress, expiry, signature],
              }) as Promise<bigint>,
          ),
        ),
      ),
    );

    log("Running individual sequential...");
    results.push(
      await timed("Individual sequential", async () => {
        const out: bigint[] = [];
        for (const addr of tokens) {
          out.push(
            (await client.readContract({
              abi: SRC20Abi,
              address: addr,
              functionName: "balanceOfSigned",
              args: [vaultAddress, expiry, signature],
            })) as bigint,
          );
        }
        return out;
      }),
    );

    printTable(results);

    // Step 6: Verify consistency
    step(6, "Verify consistency across all approaches");

    const baseline = results[0].balances;
    for (let i = 1; i < results.length; i++) {
      for (let j = 0; j < baseline.length; j++) {
        if (baseline[j] !== results[i].balances[j]) {
          throw new Error(
            `Mismatch at token ${j}: ${results[0].label}=${baseline[j]}, ${results[i].label}=${results[i].balances[j]}`,
          );
        }
      }
    }
    log("All 4 approaches returned identical balances");

    log("\nSample vault balances (first 5):");
    for (let i = 0; i < Math.min(5, baseline.length); i++) {
      log(`  Token ${i + 1}: ${formatUnits(baseline[i], 18)}`);
    }

    // Summary
    header("Multi-Token Demo Complete");
    log("[PASS] Fireblocks vault address derivation");
    log("[PASS] Mint to vault across all tokens");
    log("[PASS] Fireblocks MPC signature (1 sig, all tokens)");
    log("[PASS] Interface batch (multicall)");
    log("[PASS] Staticcall batch (multicall)");
    log("[PASS] RPC batch (Promise.all)");
    log("[PASS] Individual sequential");
    log("[PASS] Cross-approach consistency");
    log("");
    log("All checks passed.");
  } catch (error) {
    header("Multi-Token Demo Failed");
    const err = error as any;
    log(`Error: ${err?.message ?? String(error)}`);
    process.exit(1);
  }
}

main();
