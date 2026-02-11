import { type Hex, type Address, http } from "viem";
import { generateAesKey, createShieldedPublicClient } from "seismic-viem";
import { createSeismicClient } from "@/poc/seismic/client";

type WalletClient = Awaited<ReturnType<typeof createSeismicClient>>;

export interface DecryptionResult {
  encryptedCalldata: Hex;
  decryptedCalldata?: Hex;
  success: boolean;
}

/**
 * Decrypts historical Seismic transaction calldata using Fireblocks-derived keys.
 * Extracts the encryption nonce from transaction metadata and uses the AES precompile
 * at address 0x66 to decrypt the original function call.
 */
export async function decryptHistoricalTransaction(
  client: WalletClient,
  txHash: Hex,
  encryptionSk: Hex,
  deployerPrivateKey: Hex,
  originalPlaintextCalldata: Hex,
): Promise<DecryptionResult> {
  try {
    // Get transaction and extract encryption nonce
    const tx = await client.getTransaction({ hash: txHash });
    const seismicTxInput = tx.input;
    const encryptionNonce = (tx as any).encryptionNonce;

    if (!encryptionNonce) {
      throw new Error("No encryption nonce found in transaction");
    }

    // Create decryption client with same Fireblocks-derived key
    const decryptionClient = await createSeismicClient(
      {
        rpcUrl: client.chain!.rpcUrls.default.http[0],
        deployerPrivateKey,
      },
      encryptionSk,
    );

    // Get TEE public key and derive AES key
    const publicClient = createShieldedPublicClient({
      chain: client.chain!,
      transport: http(client.chain!.rpcUrls.default.http[0]),
    });

    const teePublicKey = await publicClient.getTeePublicKey();
    const actualAesKey = generateAesKey({
      privateKey: encryptionSk,
      networkPublicKey: teePublicKey,
    });

    // Call AES precompile directly
    const decryptedCalldata = await callAesPrecompile(
      client.chain!.rpcUrls.default.http[0],
      actualAesKey,
      encryptionNonce,
      seismicTxInput,
    );

    // Verify core function call matches (first 68 bytes)
    const coreCalldata = decryptedCalldata.slice(0, 138); // 0x + 136 hex chars
    const success =
      coreCalldata.toLowerCase() === originalPlaintextCalldata.toLowerCase();

    return {
      encryptedCalldata: seismicTxInput,
      decryptedCalldata: decryptedCalldata as Hex,
      success,
    };
  } catch (error) {
    return {
      encryptedCalldata: "0x" as Hex,
      success: false,
    };
  }
}

/**
 * Calls the AES decryption precompile at address 0x66.
 * Format: AES Key (32 bytes) + Nonce (12 bytes) + Ciphertext
 */
async function callAesPrecompile(
  rpcUrl: string,
  aesKey: Hex,
  nonce: Hex,
  ciphertext: Hex,
): Promise<string> {
  const callData = `${aesKey.slice(2)}${nonce.slice(2)}${ciphertext.slice(2)}`;

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [
        {
          data: `0x${callData}`,
          gas: "0x30000",
          to: "0x0000000000000000000000000000000000000066",
        },
        "latest",
      ],
      id: 1,
    }),
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(`AES precompile call failed: ${result.error.message}`);
  }

  return result.result;
}
