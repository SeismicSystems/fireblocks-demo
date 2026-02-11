import { type Address, bytesToHex } from "viem";
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
    log(`Using encryptionSk: ${derivedKey1}`);
    
    // Test: What AES key would be generated from this encryptionSk?
    const { generateAesKey, sharedSecretPoint, sharedKeyFromPoint, deriveAesKey } = await import("seismic-viem");
    const NETWORK_TEE_PK = "028e76821eb4d77fd30223ca971c49738eb5b5b71eabe93f96b348fdce788ae5a0";
    
    // Trace each step of key derivation
    const sharedSecretBytes = sharedSecretPoint({
      privateKey: derivedKey1,
      networkPublicKey: NETWORK_TEE_PK,
    });
    log(`Shared secret point: ${bytesToHex(sharedSecretBytes)}`);
    
    const sharedKey = sharedKeyFromPoint(sharedSecretBytes);
    log(`Shared key (compressed): ${sharedKey}`);
    
    const testAesKey = deriveAesKey(sharedKey);
    log(`Test AES key: ${testAesKey}`);
    
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
    log(`Encrypted input: ${transaction.input}`);
    log(`Encryption nonce: ${transaction.encryptionNonce}`);
    log(`Encryption pubkey: ${transaction.encryptionPubkey}`);
    
    // Debug: Verify the encryption key
    log(`\nDerived encryption key (derivedKey1): ${derivedKey1}`);

    // 2. Decrypt the entire transaction input using ECDH + HKDF + AES-GCM with AAD
    // The encryption uses: AES-GCM(HKDF(ECDH(encryptionSk, tx.encryptionPubkey)), nonce, input, AAD)
    // where AAD = encode(sender, chain_id, tx_nonce, to, value, encryption_pubkey, encryption_nonce, message_version)
    log(`\n=== Starting decryption ===`);
    const decryptedCalldata = await decryptTransactionInput(
      derivedKey1,
      transaction,
      true, // Enable debug mode
    );

    log(`Decrypted calldata: ${decryptedCalldata}`);

    // 3. Extract and verify the function selector and parameters
    const selector = extractFunctionSelector(decryptedCalldata);
    const params = extractCalldataParams(decryptedCalldata);
    
    log(`Function selector: ${selector}`);
    log(`Parameters: ${params}`);

    // 4. Compare with original plaintext calldata
    const originalCalldata = buildTransferCalldata(DEMO_RECIPIENT, DEMO_AMOUNT);
    
    log(`Original calldata:  ${originalCalldata}`);
    log(`Decrypted calldata: ${decryptedCalldata}`);

    if (decryptedCalldata.toLowerCase() === originalCalldata.toLowerCase()) {
      log("✓ Calldata decryption successful - perfect match!");
    } else {
      throw new Error("Calldata decryption failed - mismatch!");
    }

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
