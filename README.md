# Fireblocks × Seismic Integration Demo

This project demonstrates how to integrate Fireblocks with Seismic transactions, using deterministic key derivation from Fireblocks signatures for consistent encryption of shielded transactions.

## Architecture

```
Fireblocks Vault
      ↓
Raw Signature → SHA-256 → Encryption Key
                              ↓
                    Seismic Client (encryptionSk)
                              ↓
                    AES-256-GCM Encryption with AAD
                              ↓
                    Shielded Transaction
                              ↓
                    Client-side Decryption
```

---

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [Seismic Foundry](https://docs.seismic.systems/getting-started/installation)
- Fireblocks API credentials (Sandbox environment)
- Access to Seismic Testnet

---

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment

Create a `.env` file:

```env
# Fireblocks
FIREBLOCKS_API_KEY=your_api_key_here
FIREBLOCKS_SECRET_KEY_PATH=./fireblocks-secret.key
FIREBLOCKS_BASE_URL=https://sandbox-api.fireblocks.io/v1
FIREBLOCKS_VAULT_ACCOUNT_ID=0

# Seismic
SEISMIC_RPC_URL=https://gcp-1.seismictest.net/rpc
DEPLOYER_PRIVATE_KEY=your_private_key

# Demo
DEMO_RECIPIENT_ADDRESS=0xe01D202671F158524b2f0A763eFE34892639Acf9
DEMO_TRANSFER_AMOUNT=1000000000000000000
```

### 3. Set Up Fireblocks

1. Get API Key from Fireblocks Console → Settings → API Users
2. Download and save private key as `fireblocks-secret.key`
3. Note your Vault Account ID (usually `0`)

### 4. Deploy Contract

```bash
bun run deploy:src20
```

Deploys a test SRC20 token and saves the address to `contracts/out/deploy.json`.

### 5. Run Demo

```bash
bun run src20:demo
```

---

## Demo Walkthrough

The demo performs 9 steps:

### Step 1: [Connect to Seismic Testnet](poc/src/demo.ts#L64-L75)
Connects to Seismic Testnet and verifies the deployed SRC20 contract.
- [`createSeismicClient()`](poc/src/seismic/client.ts#L49-L71)
- [`loadContractAddress()`](poc/src/seismic/client.ts#L19-L29)

### Step 2: [Read Initial Balance](poc/src/demo.ts#L77-L80)
Reads the encrypted SRC20 balance using signed read functionality.
- [`readBalance()`](poc/src/seismic/client.ts#L88-L96)

### Step 3: [Validate Signature Caching](poc/src/demo.ts#L82-L93)
Verifies that Fireblocks returns identical signatures for the same message, enabling deterministic key derivation.
- [`validateSignatureCaching()`](poc/src/fireblocks/signer.ts#L81-L107)
- [`signRawMessage()`](poc/src/fireblocks/signer.ts#L19-L75)

### Step 4: [Derive Encryption Key](poc/src/demo.ts#L95-L103)
Derives deterministic encryption keys from Fireblocks signatures using SHA-256.
- [`deriveKeyFromSignature()`](poc/src/crypto/key-derivation.ts#L8-L17)

### Step 5: [Create Seismic Client](poc/src/demo.ts#L105-L110)
Creates a Seismic client configured with the Fireblocks-derived encryption key.
- [`createSeismicClient()`](poc/src/seismic/client.ts#L49-L71)

### Step 6: [Test Encrypt/Decrypt](poc/src/demo.ts#L112-L121)
Tests local AES-GCM encryption/decryption roundtrip with the derived key.
- [`buildTransferCalldata()`](poc/src/seismic/calldata.ts#L9-L13)
- [`encrypt()`](poc/src/crypto/key-derivation.ts#L31-L53)
- [`decrypt()`](poc/src/crypto/key-derivation.ts#L55-L68)

### Step 7: [Submit Shielded Transaction](poc/src/demo.ts#L123-L134)
Submits an encrypted SRC20 transfer transaction to Seismic.
- [`submitShieldedTransaction()`](poc/src/seismic/transaction.ts#L16-L24)
- [`waitForReceipt()`](poc/src/seismic/transaction.ts#L26-L35)

### Step 8: [Verify Balance Change](poc/src/demo.ts#L136-L143)
Confirms the transaction executed correctly by checking the balance change.

### Step 9: [Decrypt Transaction Calldata](poc/src/demo.ts#L145-L168)
Fetches the submitted transaction and decrypts its calldata client-side:
- [`fetchTransaction()`](poc/src/seismic/transaction-decryption.ts#L28-L36) - Retrieves transaction from network
- [`decryptTransactionInput()`](poc/src/seismic/transaction-decryption.ts#L112-L148) - Performs decryption:
  - Fetches network TEE public key dynamically via `client.getTeePublicKey()`
  - Derives AES key via `ECDH(encryptionSk, network_TEE_pubkey) + HKDF-SHA256`
  - [`constructAAD()`](poc/src/seismic/transaction-decryption.ts#L59-L108) - RLP-encodes transaction metadata
  - Decrypts entire calldata using AES-256-GCM with AAD
  - Verifies decrypted calldata matches original

**Note:** In Seismic, the entire calldata is encrypted (not just `suint256` parameters). The AAD includes transaction metadata to ensure both confidentiality and authenticity.

---

## Project Structure

```
poc/src/
├── demo.ts                        # Main demo orchestration
├── crypto/
│   └── key-derivation.ts          # SHA-256 key derivation + AES-GCM
├── fireblocks/
│   ├── client.ts                  # Fireblocks API client
│   └── signer.ts                  # Raw signing + caching validation
└── seismic/
    ├── client.ts                  # Seismic wallet client
    ├── calldata.ts                # Calldata builder
    ├── transaction.ts             # Transaction submission
    └── transaction-decryption.ts  # Historical tx decryption

contracts/
├── src/TestSRC20.sol             # Test SRC20 token
├── script/Deploy.s.sol           # Deployment script
└── out/deploy.json               # Contract addresses
```

---

## Expected Output

```
══════════════════════════════════════════════════════════════
║  Demo Complete - Results Summary                          ║
══════════════════════════════════════════════════════════════
  [PASS] Signature caching
  [PASS] Deterministic key derivation
  [PASS] Encrypt/decrypt roundtrip
  [PASS] Shielded transaction
  [PASS] Transaction calldata decryption

All core checks passed.
```

---

## Resources

- [Fireblocks API Documentation](https://developers.fireblocks.com/)
- [Seismic Documentation](https://docs.seismic.systems/)
- [Seismic Client Documentation](https://client.seismic.systems/)
- [Seismic Foundry Installation](https://docs.seismic.systems/getting-started/installation)
