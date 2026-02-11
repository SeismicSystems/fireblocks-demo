import { type Address } from "viem";
import {
  loadFireblocksConfig,
  createFireblocksClient,
} from "@/poc/fireblocks/client";
import { validateSignatureCaching } from "@/poc/fireblocks/signer";
import {
  deriveKeyFromSignature,
  encrypt,
  decrypt,
} from "@/poc/crypto/key-derivation";
import {
  loadSeismicConfig,
  createSeismicClient,
  readBalance,
} from "@/poc/seismic/client";
import { buildTransferCalldata } from "@/poc/seismic/calldata";
import {
  submitShieldedTransaction,
  waitForReceipt,
} from "@/poc/seismic/transaction";
import {
  fetchTransaction,
  decryptTransactionInput,
  extractFunctionSelector,
  extractCalldataParams,
} from "@/poc/seismic/transaction-decryption";

// Demo configuration
const DEMO_RECIPIENT = "0xe01D202671F158524b2f0A763eFE34892639Acf9" as Address;
const DEMO_AMOUNT = BigInt("1000000000000000000"); // 1 ETH
const SEED_MESSAGE =
  "0x3fd80aa0d85f365be3fd122913edfd054420a4caf6789bc6f6de29da15db7805";

function log(message: string) {
  console.log(`  ${message}`);
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

async function main() {
  try {
    header("Fireblocks Signature Caching x Seismic SRC20 Demo");

    // Initialize clients
    const fireblocksConfig = loadFireblocksConfig();
    const fireblocksClient = await createFireblocksClient(fireblocksConfig);
    const seismicConfig = loadSeismicConfig();

    log("Fireblocks API configured");
    log(`Seismic RPC: ${seismicConfig.rpcUrl}`);

    // Step 1: Connect to Seismic and verify contract
    step(1, "Connect to Seismic network");
    const walletClient = await createSeismicClient(seismicConfig);
    const contractAddress = seismicConfig.contractAddress;

    if (!contractAddress) {
      throw new Error(
        "TestSRC20 contract not found. Deploy first with: bun run deploy:src20",
      );
    }

    log(`Wallet connected: ${walletClient.account!.address}`);
    log(`SRC20 contract: ${contractAddress}`);

    // Step 2: Read initial balance
    step(2, "Read initial SRC20 balance");
    const initialBalance = await readBalance(walletClient, contractAddress);
    log(`Balance: ${initialBalance.toString()}`);

    // Step 3: Validate Fireblocks signature caching
    step(3, "Validate Fireblocks signature caching");
    const { first, second, identical } = await validateSignatureCaching(
      fireblocksClient,
      SEED_MESSAGE,
      fireblocksConfig.vaultAccountId,
    );

    if (!identical) {
      throw new Error("Signature caching failed - signatures differ");
    }
    log("Signatures are identical - caching confirmed");

    // Step 4: Derive deterministic encryption keys
    step(4, "Derive deterministic encryption key");
    const derivedKey1 = await deriveKeyFromSignature(first);
    const derivedKey2 = await deriveKeyFromSignature(second);

    if (derivedKey1 !== derivedKey2) {
      throw new Error("Key derivation failed - keys differ");
    }
    log("Derived keys are identical - deterministic key derivation works");

    // Step 5: Create Fireblocks-powered Seismic client
    step(5, "Create Seismic client with Fireblocks encryption key");
    const fbPoweredClient = await createSeismicClient(
      seismicConfig,
      derivedKey1,
    );
    log("Client created with Fireblocks-derived encryption key");

    // Step 6: Test encrypt/decrypt roundtrip
    step(6, "Test encrypt/decrypt roundtrip");
    const calldata = buildTransferCalldata(DEMO_RECIPIENT, DEMO_AMOUNT);
    const encrypted = await encrypt(derivedKey1, calldata);
    const decrypted = await decrypt(derivedKey2, encrypted);

    if (decrypted.toLowerCase() !== calldata.toLowerCase()) {
      throw new Error("Roundtrip verification failed");
    }
    log("Roundtrip verified - encrypt/decrypt works correctly");

    // Step 7: Submit shielded transaction
    step(7, "Submit shielded SRC20 transfer");
    const txHash = await submitShieldedTransaction(
      fbPoweredClient,
      contractAddress,
      DEMO_RECIPIENT,
      DEMO_AMOUNT,
    );
    log(`Transaction submitted: ${txHash}`);

    const receipt = await waitForReceipt(fbPoweredClient, txHash);
    log(`Confirmed in block ${receipt.blockNumber}`);

    // Step 8: Verify balance change
    step(8, "Verify balance change");
    const finalBalance = await readBalance(fbPoweredClient, contractAddress);
    const delta = initialBalance - finalBalance;
    log(`Final balance: ${finalBalance.toString()}`);
    log(`Delta: ${delta.toString()} (expected: ${DEMO_AMOUNT.toString()})`);

    // Step 9: Decrypt and verify transaction calldata
    step(9, "Decrypt and verify transaction calldata");

    // Fetch the submitted transaction from the network
    const transaction = await fetchTransaction(fbPoweredClient, txHash);
    log(`Transaction found in block ${transaction.blockNumber}`);

    // Decrypt the transaction calldata using the Fireblocks-derived encryption key.
    // This demonstrates that historical transactions can be decrypted client-side
    // by anyone with access to the encryption private key.
    const decryptedCalldata = await decryptTransactionInput(
      derivedKey1,
      transaction,
    );

    // Verify the decrypted calldata matches the original
    const originalCalldata = buildTransferCalldata(DEMO_RECIPIENT, DEMO_AMOUNT);

    if (decryptedCalldata.toLowerCase() !== originalCalldata.toLowerCase()) {
      throw new Error(
        "Calldata decryption verification failed - mismatch detected",
      );
    }

    log("Calldata decryption successful - verified match with original");

    // Summary
    header("Demo Complete - Results Summary");
    log("[PASS] Signature caching");
    log("[PASS] Deterministic key derivation");
    log("[PASS] Encrypt/decrypt roundtrip");
    log("[PASS] Shielded transaction");
    log("[PASS] Transaction calldata decryption");
    log("");
    log("All core checks passed.");
  } catch (error) {
    header("Demo Failed");
    log(`Error: ${error}`);
    process.exit(1);
  }
}

main();
