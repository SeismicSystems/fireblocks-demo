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

### Step 1: Connect to Seismic Network
Connects to Seismic Testnet and verifies the deployed SRC20 contract.

### Step 2: Read Initial Balance
Reads the encrypted SRC20 balance using signed read functionality.

### Step 3: Validate Signature Caching
Verifies that Fireblocks returns identical signatures for the same message, enabling deterministic key derivation.

### Step 4: Derive Encryption Key
Derives deterministic encryption keys from Fireblocks signatures using SHA-256.

### Step 5: Create Seismic Client
Creates a Seismic client configured with the Fireblocks-derived encryption key.

### Step 6: Test Encrypt/Decrypt
Tests local AES-GCM encryption/decryption roundtrip with the derived key.

### Step 7: Submit Shielded Transaction
Submits an encrypted SRC20 transfer transaction to Seismic.

### Step 8: Verify Balance Change
Confirms the transaction executed correctly by checking the balance change.

### Step 9: Decrypt Transaction Calldata
Fetches the submitted transaction and decrypts its calldata client-side:
- Fetches network TEE public key dynamically
- Derives AES key via `ECDH(encryptionSk, network_TEE_pubkey) + HKDF-SHA256`
- Constructs AAD by RLP-encoding transaction metadata (sender, chainId, nonce, to, value, encryptionPubkey, encryptionNonce, messageVersion, recentBlockHash, expiresAtBlock, signedRead)
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
- [Seismic Network Documentation](https://docs.seismic.systems/)
- [Seismic Client Documentation](https://client.seismic.systems/)
- [Seismic Foundry Installation](https://docs.seismic.systems/getting-started/installation)
