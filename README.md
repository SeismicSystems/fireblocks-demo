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
# in wei
DEMO_TRANSFER_AMOUNT=1000000000000000000
```

### 3. Set Up Fireblocks

1. Get API Key from Fireblocks Console → Settings → API Users
2. Download and save private key as `fireblocks-secret.key`
3. Note your Vault Account ID (usually `0`)

### 4. Deploy Contracts

**Single-token demo** (TestSRC20):

```bash
bun run src20:deploy
```

**Multi-token demo** (50 SRC20 tokens + SRC20Multicall):

```bash
bun run deploy:multi-token
```

### 5. Run Demos

**Single-token demo** — Fireblocks signature caching, key derivation, shielded transfers, balance reads:

```bash
bun run src20:demo
```

**Multi-token demo** — Batch balance reads across 50 tokens via Fireblocks MPC:

```bash
bun run src20:demo-multi-token
```

---

## Demo 1: Single-Token (`src20:demo`)

Demonstrates the core Fireblocks × Seismic integration in 9 steps:

### Step 1: [Connect to Seismic Testnet](poc/src/demo.ts#L64-L75)
Connects to Seismic Testnet and verifies the deployed SRC20 contract.
- [`createSeismicClient()`](poc/src/seismic/client.ts#L49-L71)
- [`loadContractAddress()`](poc/src/seismic/client.ts#L19-L29)

### Step 2: [Read Initial Balance](poc/src/demo.ts#L78-L81)
Reads the encrypted SRC20 balance using signed read functionality.
- [`readBalance()`](poc/src/seismic/client.ts#L89-L97)

### Step 2.5: [Read Balance via balanceOfSigned (Fireblocks MPC)](poc/src/demo.ts#L83-L116)
Derives the Fireblocks vault's ETH address from its MPC public key, mints tokens to the vault, then reads the vault's balance using `balanceOfSigned` with a Fireblocks MPC signature. This demonstrates that no raw private key is needed for balance reads — the authorization is entirely on-chain via `ecrecover`.
- [`getVaultAddress()`](poc/src/fireblocks/signer.ts#L121-L148) — decompresses the vault's secp256k1 public key and derives the ETH address
- [`readBalanceSigned()`](poc/src/seismic/client.ts#L100-L155) — constructs EIP-191 message hash, signs via Fireblocks MPC, packs the 65-byte signature, and calls `balanceOfSigned`

### Step 3: [Validate Signature Caching](poc/src/demo.ts#L118-L129)
Verifies that Fireblocks returns identical signatures for the same message, enabling deterministic key derivation.
- [`validateSignatureCaching()`](poc/src/fireblocks/signer.ts#L91-L118)
- [`signRawMessage()`](poc/src/fireblocks/signer.ts#L26-L81)

### Step 4: [Derive Encryption Key](poc/src/demo.ts#L131-L139)
Derives deterministic encryption keys from Fireblocks signatures using SHA-256.
- [`deriveKeyFromSignature()`](poc/src/crypto/key-derivation.ts#L8-L17)

### Step 5: [Create Seismic Client](poc/src/demo.ts#L141-L148)
Creates a Seismic client configured with the Fireblocks-derived encryption key.
- [`createSeismicClient()`](poc/src/seismic/client.ts#L49-L71)

### Step 6: [Test Encrypt/Decrypt](poc/src/demo.ts#L150-L159)
Tests local AES-GCM encryption/decryption roundtrip with the derived key.
- [`buildTransferCalldata()`](poc/src/seismic/calldata.ts#L9-L13)
- [`encrypt()`](poc/src/crypto/key-derivation.ts#L31-L53)
- [`decrypt()`](poc/src/crypto/key-derivation.ts#L55-L68)

### Step 7: [Submit Shielded Transaction](poc/src/demo.ts#L161-L172)
Submits an encrypted SRC20 transfer transaction to Seismic.
- [`submitShieldedTransaction()`](poc/src/seismic/transaction.ts#L16-L24)
- [`waitForReceipt()`](poc/src/seismic/transaction.ts#L26-L35)

### Step 8: [Verify Balance Change](poc/src/demo.ts#L174-L181)
Confirms the transaction executed correctly by checking the balance change.

### Step 9: [Decrypt Transaction Calldata](poc/src/demo.ts#L183-L206)
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

## Demo 2: Multi-Token Batch Read (`src20:demo-multi-token`)

Demonstrates batch balance reading across 50 SRC20 tokens using a single Fireblocks MPC signature and compares 4 read strategies:

### Step 1: Initialize Clients
Connects to both Fireblocks API and Seismic Testnet.

### Step 2: Derive Vault Address
Derives the Fireblocks vault's ETH address from its compressed secp256k1 public key via `getVaultAddress()`.

### Step 3: Mint to Vault
Mints increasing amounts (1, 2, 3 ... 50 tokens) to the vault address across all 50 deployed SRC20 tokens.

### Step 4: Sign via Fireblocks MPC
Generates a single `balanceOfSigned` authorization signature via Fireblocks MPC. The signature is:
- Token-agnostic: works across all SRC20 tokens
- Time-limited: valid for 1 hour
- Verified on-chain via `ecrecover`

### Step 5: Benchmark 4 Read Approaches

| Approach | How it works | Typical speedup |
|---|---|---|
| **Interface batch** (multicall) | 1 RPC call → `SRC20Multicall` loops via `ISRC20` interface | ~53x |
| **Staticcall batch** (multicall) | 1 RPC call → `SRC20Multicall` loops via low-level `staticcall` | ~54x |
| **RPC batch** (Promise.all) | 50 parallel RPC calls | ~22x |
| **Individual sequential** | 50 sequential RPC calls (baseline) | 1x |

### Step 6: Verify Consistency
Asserts all 4 approaches return identical balance arrays.

### Contracts

- [`SRC20Multicall`](contracts/src/SRC20Multicall.sol) — Batch reader with 3 function variants:
  - `batchBalancesInterface()` — uses `ISRC20` interface (reverts on failure)
  - `batchBalances()` — uses `staticcall` (reverts with index)
  - `batchBalancesDetailed()` — uses `staticcall` with per-token `success` flag
- [`ISRC20`](contracts/src/interfaces/ISRC20.sol) — Interface for `balanceOfSigned`
- [`MockSRC20`](contracts/test/utils/mocks/MockSRC20.sol) — Test token with public `mint()`/`burn()`

---

## Key Concepts

### `balanceOfSigned` — Signature-Authorized Balance Reads

On Seismic, `eth_call` overrides `from` to zero, so `msg.sender`-based `balance()` requires a signed read. `balanceOfSigned(owner, expiry, signature)` is an alternative that verifies an EIP-191 signature on-chain:

```
messageHash = keccak256(abi.encodePacked("SRC20_BALANCE_READ", owner, expiry))
ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash))
ecrecover(ethSignedHash, v, r, s) must equal owner
```

The signature is token-agnostic (works on any SRC20) and time-limited (1 hour). Combined with `SRC20Multicall`, one signature can read balances across all tokens in a single RPC call.

### Fireblocks MPC Signing

The Fireblocks vault signs via MPC (multi-party computation) — no single party holds the full private key. For `balanceOfSigned`:

1. Derive vault ETH address from its compressed public key (via `secp256k1` point decompression)
2. Construct the EIP-191 wrapped message hash
3. Sign via `signRawMessage()` (Fireblocks raw transaction with `BTC_TEST` asset)
4. Normalize `v` from 0/1 to 27/28, zero-pad `r`/`s` to 32 bytes

---

## Project Structure

```
poc/src/
├── demo.ts                        # Single-token demo (Fireblocks + shielded transfers)
├── demo-multi-token.ts            # Multi-token batch read demo
├── crypto/
│   └── key-derivation.ts          # SHA-256 key derivation + AES-GCM
├── fireblocks/
│   ├── client.ts                  # Fireblocks API client
│   └── signer.ts                  # Raw signing, caching, vault address derivation
└── seismic/
    ├── abi.ts                     # SRC20 + SRC20Multicall ABIs
    ├── client.ts                  # Seismic wallet client + readBalanceSigned
    ├── calldata.ts                # Calldata builder
    ├── signature.ts               # Local key signing for balanceOfSigned
    ├── transaction.ts             # Transaction submission
    └── transaction-decryption.ts  # Historical tx decryption

contracts/
├── src/
│   ├── SRC20.sol                  # Base SRC20 (confidential ERC20)
│   ├── TestSRC20.sol              # Admin-restricted SRC20 token
│   ├── SRC20Multicall.sol         # Batch balance reader
│   └── interfaces/ISRC20.sol     # balanceOfSigned interface
├── test/utils/mocks/
│   ├── MockSRC20.sol              # Public mint/burn SRC20
│   └── MockERC20.sol              # Standard ERC20 for comparison
├── script/
│   ├── Deploy.s.sol               # Single-token deploy
│   ├── DeployMultiToken.s.sol     # 50-token + multicall deploy
│   ├── deploy.sh                  # Single-token deploy script
│   └── deploy-batched-read.sh     # Multi-token deploy script
└── out/
    ├── deploy.json                # Single-token addresses
    └── batch-read-deploy.json     # Multi-token + multicall addresses
```

---

## Expected Output

### Single-Token Demo

```
══════════════════════════════════════════════════════════════
║  Demo Complete - Results Summary                          ║
══════════════════════════════════════════════════════════════
  [PASS] balanceOfSigned (Fireblocks MPC)
  [PASS] Signature caching
  [PASS] Deterministic key derivation
  [PASS] Encrypt/decrypt roundtrip
  [PASS] Shielded transaction
  [PASS] Transaction calldata decryption

  All core checks passed.
```

### Multi-Token Demo

```
  ┌────────────────────────────────────┬──────────┬─────────┐
  │ Approach                           │ Time (s) │ Speedup │
  ├────────────────────────────────────┼──────────┼─────────┤
  │ Interface batch (multicall)        │     1.53 │   53.4x │
  │ Staticcall batch (multicall)       │     1.51 │   53.9x │
  │ RPC batch (Promise.all)            │     3.71 │   22.0x │
  │ Individual sequential              │    81.61 │    1.0x │
  └────────────────────────────────────┴──────────┴─────────┘

══════════════════════════════════════════════════════════════
║  Multi-Token Demo Complete                                ║
══════════════════════════════════════════════════════════════
  [PASS] Fireblocks vault address derivation
  [PASS] Mint to vault across all tokens
  [PASS] Fireblocks MPC signature (1 sig, all tokens)
  [PASS] Interface batch (multicall)
  [PASS] Staticcall batch (multicall)
  [PASS] RPC batch (Promise.all)
  [PASS] Individual sequential
  [PASS] Cross-approach consistency

  All checks passed.
```

---

## Resources

- [Fireblocks API Documentation](https://developers.fireblocks.com/)
- [Seismic Documentation](https://docs.seismic.systems/)
- [Seismic Client Documentation](https://client.seismic.systems/)
- [Seismic Foundry Installation](https://docs.seismic.systems/getting-started/installation)
