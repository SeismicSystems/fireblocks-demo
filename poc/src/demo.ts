/**
 * Fireblocks Signature Caching + Seismic SRC20 Demo
 *
 * Validates that Fireblocks returns identical signatures for identical
 * payloads, enabling deterministic key derivation without storing keys.
 *
 * Run: bun run src20:demo
 */

import type { Hex, Address } from "viem";

import {
  loadFireblocksConfig,
  createFireblocksClient,
} from "./fireblocks/client.js";
import { validateSignatureCaching } from "./fireblocks/signer.js";

import {
  createSeedMessage,
  deriveKeyFromSignature,
} from "./crypto/key-derivation.js";
import { encrypt, decrypt } from "./crypto/encryption.js";

import {
  loadSeismicConfig,
  createSeismicClient,
  readBalance,
} from "./seismic/client.js";
import {
  buildTransferCalldata,
  submitShieldedTransaction,
  waitForReceipt,
} from "./seismic/transaction.js";

// ─────────────────────────────────────────────────────────────
// Logging helpers
// ─────────────────────────────────────────────────────────────

const DIVIDER = "═".repeat(62);
const THIN = "─".repeat(62);

function header(title: string) {
  console.log(`\n╔${DIVIDER}╗`);
  console.log(`║  ${title.padEnd(60)}║`);
  console.log(`╚${DIVIDER}╝`);
}

function step(n: number, label: string) {
  console.log(`\n${THIN}`);
  console.log(`  Step ${n}: ${label}`);
  console.log(THIN);
}

function ok(msg: string) {
  console.log(`  [OK] ${msg}`);
}

function info(msg: string) {
  console.log(`  ${msg}`);
}

function fail(msg: string) {
  console.error(`  [FAIL] ${msg}`);
}

function truncate(hex: string, chars = 16): string {
  if (hex.length <= chars * 2 + 4) return hex;
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

// ─────────────────────────────────────────────────────────────
// Main demo
// ─────────────────────────────────────────────────────────────

async function main() {
  header("Fireblocks Signature Caching x Seismic SRC20 Demo");

  // ── Load configuration ──────────────────────────────────
  const fbConfig = loadFireblocksConfig();
  const seismicConfig = loadSeismicConfig();

  info("Fireblocks API configured");
  info(`Seismic RPC: ${seismicConfig.rpcUrl}`);

  const contractAddress = seismicConfig.contractAddress;
  if (!contractAddress) {
    fail(
      "SRC20_CONTRACT_ADDRESS not set. Deploy first with: bun run deploy:src20",
    );
    info("Set SRC20_CONTRACT_ADDRESS in .env and re-run.");
    process.exit(1);
  }

  // ── Step 1: Connect to Seismic ──────────────────────────
  step(1, "Connect to Seismic network");

  const walletClient = await createSeismicClient(seismicConfig);
  const deployerAddress = walletClient.account!.address;
  ok(`Wallet connected: ${deployerAddress}`);
  ok(`SRC20 contract: ${contractAddress}`);

  // ── Step 2: Read initial balance ────────────────────────
  step(2, "Read initial SRC20 balance (signed read)");

  const initialBalance = await readBalance(walletClient, contractAddress);
  ok(`Balance: ${initialBalance.toString()} (encrypted on-chain)`);

  // ── Step 3: Create Fireblocks client ────────────────────
  step(3, "Initialize Fireblocks client");

  const fbClient = await createFireblocksClient(fbConfig);
  ok("Fireblocks client initialized");

  // ── Step 4: Generate deterministic seed ─────────────────
  step(4, "Generate deterministic seed message");

  const seedMessage = await createSeedMessage();
  ok(`Seed: ${seedMessage}`);
  info("(SHA-256 of domain separator)");

  // ── Step 5: Validate signature caching ──────────────────
  step(5, "Validate Fireblocks signature caching");

  info("Requesting signature #1...");
  const { first, second, identical } = await validateSignatureCaching(
    fbClient,
    seedMessage,
    fbConfig.vaultAccountId,
  );

  info(`Signature 1: ${truncate(first.fullSig)}`);
  info(`Signature 2: ${truncate(second.fullSig)}`);
  info(`Public key:  ${truncate(first.publicKey)}`);

  if (identical) {
    ok("SIGNATURES ARE IDENTICAL — caching confirmed");
  } else {
    fail("Signatures differ! Caching not working as expected.");
    info(`Full sig 1: ${first.fullSig}`);
    info(`Full sig 2: ${second.fullSig}`);
  }

  // ── Step 6: Derive encryption key ──────────────────────
  step(6, "Derive deterministic encryption key from signature");

  const derivedKey1 = await deriveKeyFromSignature(first);
  const derivedKey2 = await deriveKeyFromSignature(second);

  info(`Key from sig 1: ${truncate(derivedKey1)}`);
  info(`Key from sig 2: ${truncate(derivedKey2)}`);

  if (derivedKey1 === derivedKey2) {
    ok("DERIVED KEYS ARE IDENTICAL — deterministic key derivation works");
  } else {
    fail("Derived keys differ!");
  }

  // ── Step 7: Encrypt SRC20 transfer calldata ────────────
  step(7, "Encrypt SRC20 transfer calldata");

  const recipientAddress = (process.env.DEMO_RECIPIENT_ADDRESS ??
    "0x0000000000000000000000000000000000000002") as Address;
  const transferAmount = BigInt(
    process.env.DEMO_TRANSFER_AMOUNT ?? "1000000000000000000",
  );

  const calldata = buildTransferCalldata(recipientAddress, transferAmount);
  info(`Plaintext calldata: ${truncate(calldata)}`);
  info(`  to:     ${recipientAddress}`);
  info(`  amount: ${transferAmount.toString()}`);

  const encrypted = await encrypt(derivedKey1, calldata);
  info(`Encrypted ciphertext: ${truncate(encrypted.ciphertext)}`);
  info(`IV: ${encrypted.iv}`);
  ok("Calldata encrypted with Fireblocks-derived key");

  // ── Step 8: Decrypt calldata (verify roundtrip) ────────
  step(8, "Decrypt calldata using cached signature key");

  const decrypted = await decrypt(derivedKey2, encrypted);
  info(`Decrypted calldata: ${truncate(decrypted)}`);

  if (decrypted === calldata) {
    ok("ROUNDTRIP VERIFIED — decrypt(encrypt(calldata)) === calldata");
  } else {
    fail("Decrypted calldata does not match original!");
    info(`Original:  ${calldata}`);
    info(`Decrypted: ${decrypted}`);
  }

  // ── Step 9: Submit encrypted transfer to Seismic ───────
  step(9, "Submit encrypted SRC20 transfer to Seismic");

  info("Submitting shielded transaction...");
  const { txHash } = await submitShieldedTransaction(
    walletClient,
    contractAddress,
    recipientAddress,
    transferAmount,
  );
  ok(`Transaction submitted: ${txHash}`);

  info("Waiting for receipt...");
  const receipt = await waitForReceipt(walletClient, txHash);
  ok(`Confirmed in block ${receipt.blockNumber}`);
  info(`Status: ${receipt.status}`);

  // ── Step 10: Verify final balance ──────────────────────
  step(10, "Verify final SRC20 balance");

  const finalBalance = await readBalance(walletClient, contractAddress);
  ok(`Final balance: ${finalBalance.toString()}`);
  info(
    `Delta: ${(initialBalance - finalBalance).toString()} (should equal transfer amount)`,
  );

  // ── Summary ────────────────────────────────────────────
  header("Demo Complete — Results Summary");

  const results = [
    ["Signature caching", identical],
    ["Deterministic key derivation", derivedKey1 === derivedKey2],
    ["Encrypt/decrypt roundtrip", decrypted === calldata],
    ["Shielded transaction", receipt.status === "success"],
  ] as const;

  for (const [label, passed] of results) {
    console.log(`  ${passed ? "[PASS]" : "[FAIL]"} ${label}`);
  }

  const allPassed = results.every(([, p]) => p);
  console.log(
    `\n  ${allPassed ? "All checks passed." : "Some checks failed — see output above."}`,
  );
  console.log();
}

main().catch((err) => {
  console.error("\nDemo failed with error:");
  console.error(err);
  process.exit(1);
});
