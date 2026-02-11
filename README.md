# Fireblocks × Seismic Integration Demo

This project demonstrates how to integrate **Fireblocks** with **Seismic** transactions. It shows deterministic key derivation from Fireblocks signatures for consistent encryption of shielded transactions.

## Architecture Overview

```
Fireblocks Vault → Raw Signature → SHA-256 → Encryption Key (encryptionSk)
                                                     ↓
                                            Seismic Client
                                                     ↓
                                    Transaction Calldata Encryption
                                    (AES-256-GCM with AAD)
                                                     ↓
                                    Shielded Transaction Submission
                                                     ↓
                                    Historical Transaction Decryption
                                    (Client-side with encryptionSk)
```

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [Seismic Foundry](https://docs.seismic.systems/getting-started/installation) for smart contract deployment
- Fireblocks API credentials (Sandbox environment)
- Access to Seismic Testnet

## Setup Instructions

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Fireblocks Configuration
FIREBLOCKS_API_KEY=your_api_key_here
FIREBLOCKS_SECRET_KEY_PATH=./fireblocks-secret.key
FIREBLOCKS_BASE_URL=https://sandbox-api.fireblocks.io/v1
FIREBLOCKS_VAULT_ACCOUNT_ID=0

# Seismic Configuration
SEISMIC_RPC_URL=https://gcp-1.seismictest.net/rpc
DEPLOYER_PRIVATE_KEY=your_private_key

# Demo Configuration
DEMO_RECIPIENT_ADDRESS=0xe01D202671F158524b2f0A763eFE34892639Acf9
# Demo transfer amount (in wei)
DEMO_TRANSFER_AMOUNT=1000000000000000000
```

### 3. Set Up Fireblocks Credentials

1. **API Key**: Get from your Fireblocks Console → Settings → API Users
2. **Secret Key**: Download the private key file and save as `fireblocks-secret.key`
3. **Vault Account ID**: Create a vault account and note its ID (usually `0` for the first one)

### 4. Deploy Smart Contract

```bash
bun run deploy:src20
```

This will:

- Deploy a test SRC20 token contract to Seismic Testnet
- Generate `contracts/out/deploy.json` with the contract address
- The demo automatically reads the contract address from this file

### 5. Run the Demo

```bash
bun run src20:demo
```

## Demo Walkthrough

The demo performs 9 steps to validate the Fireblocks × Seismic integration:

### [Step 1: Connect to Seismic Network](poc/src/demo.ts#L50-L60)

**What it does**: Connects to Seismic Testnet and verifies the deployed SRC20 contract.

**Under the hood**:

- Creates a [Seismic wallet client](poc/src/seismic/client.ts#L60-L75) using the deployer's private key
- Loads the contract address from [`contracts/out/deploy.json`](poc/src/seismic/client.ts#L25-L33)

### [Step 2: Read Initial SRC20 Balance](poc/src/demo.ts#L65-L68)

**What it does**: Reads the encrypted SRC20 balance using signed read functionality.

**Under the hood**:

- Uses [`readBalance()`](poc/src/seismic/client.ts#L85-L96) which performs an encrypted contract call
- The balance is stored encrypted on-chain and decrypted client-side

### [Step 3: Validate Fireblocks Signature Caching](poc/src/demo.ts#L70-L79)

**What it does**: Verifies that Fireblocks returns identical signatures for the same message.

**Under the hood**:

- Calls [`validateSignatureCaching()`](poc/src/fireblocks/signer.ts#L85-L108) twice with the same seed message
- Uses Fireblocks' [raw signing API](poc/src/fireblocks/signer.ts#L25-L83) for deterministic signatures
- This enables deterministic key derivation for consistent encryption

### [Step 4: Derive Deterministic Encryption Key](poc/src/demo.ts#L81-L88)

**What it does**: Derives encryption keys from Fireblocks signatures using SHA-256.

**Under the hood**:

- [`deriveKeyFromSignature()`](poc/src/crypto/key-derivation.ts#L8-L16) hashes the signature bytes
- Identical signatures → identical keys → consistent encryption across sessions

### [Step 5: Create Seismic Client with Fireblocks Encryption Key](poc/src/demo.ts#L90-L95)

**What it does**: Creates a Seismic client configured with the Fireblocks-derived encryption key.

**Under the hood**:

- Passes the derived key as [`encryptionSk`](poc/src/seismic/client.ts#L60-L75) parameter
- All subsequent `suint256` parameters will be encrypted with this deterministic key

### [Step 6: Test Encrypt/Decrypt Roundtrip](poc/src/demo.ts#L97-L105)

**What it does**: Tests local AES-GCM encryption/decryption with the derived key.

**Under the hood**:

- Builds [`transfer(address,suint256)` calldata](poc/src/seismic/calldata.ts#L7-L14) with function selector `0xb10c99b5`
- Uses Web Crypto API for [AES-GCM encryption/decryption](poc/src/crypto/key-derivation.ts#L35-L74)

### [Step 7: Submit Shielded SRC20 Transfer](poc/src/demo.ts#L107-L116)

**What it does**: Submits an encrypted transaction to Seismic.

**Under the hood**:

- [`submitShieldedTransaction()`](poc/src/seismic/transaction.ts#L9-L18) uses the Fireblocks-powered client
- Seismic automatically encrypts `suint256` parameters using the configured `encryptionSk`
- Transaction is submitted with encrypted calldata but preserves the core function call

### [Step 8: Verify Balance Change](poc/src/demo.ts#L118-L123)

**What it does**: Confirms the transaction executed correctly by checking the balance change.

**Under the hood**:

- Reads the new encrypted balance and calculates the delta
- Verifies the delta matches the transfer amount (1 ETH)

### [Step 9: Decrypt and Verify Transaction Calldata](poc/src/demo.ts#L149-L165)

**What it does**: Fetches a submitted transaction and decrypts its calldata client-side to verify the end-to-end encryption.

**Under the hood**:

1. [`fetchTransaction()`](poc/src/seismic/transaction-decryption.ts#L15-L25) retrieves the transaction by hash from the Seismic network
2. [`decryptTransactionInput()`](poc/src/seismic/transaction-decryption.ts#L110-L142) performs client-side decryption:
   - Derives the AES-256-GCM key via ECDH(encryptionSk, network_TEE_pubkey) + HKDF-SHA256
   - Constructs Additional Authenticated Data (AAD) by RLP-encoding transaction metadata
   - Decrypts the entire calldata (function selector + parameters) using AES-GCM with AAD
3. Verifies the decrypted calldata matches the original plaintext

**Key insight**: In Seismic, the **entire calldata** is encrypted (not just `suint256` parameters), and the AAD includes transaction metadata like sender, nonce, recipient, and encryption parameters. This ensures both confidentiality and authenticity of transaction data.

## Project Structure

```
poc/
├── src/
│   ├── demo.ts                     # Main demo orchestration
│   ├── crypto/
│   │   └── key-derivation.ts       # SHA-256 key derivation + AES-GCM crypto
│   ├── fireblocks/
│   │   ├── client.ts               # Fireblocks API client setup
│   │   └── signer.ts               # Raw message signing + caching validation
│   └── seismic/
│       ├── client.ts               # Seismic wallet client with encryption key
│       ├── calldata.ts             # transfer(address,suint256) calldata builder
│       ├── transaction.ts          # Shielded transaction submission
│       └── transaction-decryption.ts # Historical transaction decryption
├── tsconfig.json                   # TypeScript config with @/poc/* path aliases
└── package.json                    # Dependencies and scripts

contracts/
├── src/TestSRC20.sol              # Test SRC20 token contract
├── script/Deploy.s.sol            # Deployment script
└── out/deploy.json                # Generated contract addresses
```

## Available Scripts

```bash
# Deploy the SRC20 contract
bun run src20:deploy

# Run the integration demo
bun run src20:demo

# Run tests (if any)
bun test
```

## Expected Output

When successful, the demo will show:

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

This confirms that Fireblocks-derived keys can be used for deterministic Seismic encryption.

## Useful Links

- [Fireblocks API Documentation](https://developers.fireblocks.com/)
- [Seismic Network Documentation](https://docs.seismic.systems/)
- [Seismic Client Documentation](https://client.seismic.systems/)
- [Seismic Foundry Installation](https://docs.seismic.systems/getting-started/installation)
