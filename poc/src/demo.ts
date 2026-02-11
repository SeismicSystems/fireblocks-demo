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
  extractEncryptedCalldata,
  decryptCalldataParameter,
  reconstructPlaintextCalldata,
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
    log("Seismic client created with Fireblocks-derived encryption key");

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

    // Step 9: Decrypt transaction calldata
    step(9, "Decrypt transaction calldata");

    // 1. Fetch the submitted transaction by hash
    log(`Fetching transaction: ${txHash}`);
    const transaction = await fetchTransaction(fbPoweredClient, txHash);
    log(`Transaction found in block ${transaction.blockNumber}`);
    log(`\nFull transaction object:`);
    console.log(JSON.stringify(transaction, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    , 2));
    log(`\nRaw transaction input: ${transaction.input}`);
    log(`Input length: ${transaction.input.length} chars (${(transaction.input.length - 2) / 2} bytes)`);

    // 2. Extract encrypted portions from calldata
    const { selector, unencryptedParams, encryptedData } =
      extractEncryptedCalldata(transaction.input);

    log(`Function selector: ${selector}`);
    log(`Unencrypted params (address): ${unencryptedParams}`);
    log(
      `Encrypted data length: ${encryptedData.length} chars (${(encryptedData.length - 2) / 2} bytes)`,
    );

    // 3. Decrypt the suint256 parameter using the derived AES key
    // The key was derived via: aes_key = HKDF(ECDH(encryptionSk, network_tee_pubkey))
    const decryptedAmount = await decryptCalldataParameter(
      derivedKey1,
      encryptedData,
    );

    log(`Decrypted amount: ${decryptedAmount.toString()}`);

    // 4. Verify decrypted amount matches expected
    if (decryptedAmount !== DEMO_AMOUNT) {
      throw new Error(
        `Amount mismatch: expected ${DEMO_AMOUNT}, got ${decryptedAmount}`,
      );
    }
    
    log("✓ Calldata decryption successful!");
    log(`Expected amount: ${DEMO_AMOUNT.toString()}`);
    log(`Decrypted matches: ${decryptedAmount === DEMO_AMOUNT}`);

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
