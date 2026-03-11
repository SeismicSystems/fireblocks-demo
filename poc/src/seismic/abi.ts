import type { Abi } from "viem";

/**
 * ABI for TestSRC20 — a simplified SRC20 with admin mint/burn.
 * Note: suint256 types are Seismic's encrypted uint256.
 */
export const TestSRC20Abi = [
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8", internalType: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "admin",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balance",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
      { name: "amount", type: "suint256", internalType: "suint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "suint256", internalType: "suint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferFrom",
    inputs: [
      { name: "from", type: "address", internalType: "address" },
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "suint256", internalType: "suint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "suint256", internalType: "suint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "burn",
    inputs: [
      { name: "from", type: "address", internalType: "address" },
      { name: "amount", type: "suint256", internalType: "suint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getTotalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOfSigned",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "expiry", type: "uint256", internalType: "uint256" },
      { name: "signature", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    inputs: [],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nonces",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "permit",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "spender", type: "address", internalType: "address" },
      { name: "value", type: "suint256", internalType: "suint256" },
      { name: "deadline", type: "uint256", internalType: "uint256" },
      { name: "v", type: "uint8", internalType: "uint8" },
      { name: "r", type: "bytes32", internalType: "bytes32" },
      { name: "s", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true, internalType: "address" },
      { name: "to", type: "address", indexed: true, internalType: "address" },
      { name: "encryptKeyHash", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "encryptedAmount", type: "bytes", indexed: false, internalType: "bytes" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      { name: "owner", type: "address", indexed: true, internalType: "address" },
      { name: "spender", type: "address", indexed: true, internalType: "address" },
      { name: "encryptKeyHash", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "encryptedAmount", type: "bytes", indexed: false, internalType: "bytes" },
    ],
    anonymous: false,
  },
] as const satisfies Abi;

/**
 * Full SRC20 ABI — used for multi-user sender/listener flows.
 * Same as TestSRC20Abi but without the admin-specific functions.
 */
export const SRC20Abi = TestSRC20Abi;

/**
 * ABI for the SRC20Multicall batch reader contract.
 */
export const SRC20MulticallAbi = [
  {
    type: "function",
    name: "batchBalancesInterface",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "tokens", type: "address[]", internalType: "address[]" },
      { name: "expiry", type: "uint256", internalType: "uint256" },
      { name: "signature", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "balances", type: "uint256[]", internalType: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "batchBalances",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "tokens", type: "address[]", internalType: "address[]" },
      { name: "expiry", type: "uint256", internalType: "uint256" },
      { name: "signature", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "balances", type: "uint256[]", internalType: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "batchBalancesDetailed",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "tokens", type: "address[]", internalType: "address[]" },
      { name: "expiry", type: "uint256", internalType: "uint256" },
      { name: "signature", type: "bytes", internalType: "bytes" },
    ],
    outputs: [
      {
        name: "results",
        type: "tuple[]",
        internalType: "struct SRC20Multicall.BalanceResult[]",
        components: [
          { name: "token", type: "address", internalType: "address" },
          { name: "balance", type: "uint256", internalType: "uint256" },
          { name: "success", type: "bool", internalType: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const satisfies Abi;
