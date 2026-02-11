import { type Hex, type Address } from "viem";

const TRANSFER_SELECTOR = "0xb10c99b5"; // Function selector for transfer(address,suint256) = 0xb10c99b5s

/**
 * Constructs calldata for the transfer(address,suint256) function.
 *
 * @param to - Recipient address
 * @param amount - Transfer amount
 * @returns ABI-encoded calldata
 */
export function buildTransferCalldata(to: Address, amount: bigint): Hex {
  const addressParam = to.slice(2).padStart(64, "0"); // 32 bytes
  const amountParam = amount.toString(16).padStart(64, "0"); // 32 bytes
  return `${TRANSFER_SELECTOR}${addressParam}${amountParam}` as Hex;
}
