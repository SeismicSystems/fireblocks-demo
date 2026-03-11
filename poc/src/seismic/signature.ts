import { type Hex, type Address, keccak256, encodePacked } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Signs a balanceOfSigned authorization message using a local private key.
 *
 * The signature is token-agnostic: it authorizes reading the balance of `owner`
 * on any SRC20 token until `expiry`. The contract verifies via ecrecover.
 */
export async function signBalanceRead(
  privateKey: Hex,
  owner: Address,
  expiry: bigint,
): Promise<Hex> {
  const account = privateKeyToAccount(privateKey);

  const messageHash = keccak256(
    encodePacked(
      ["string", "address", "uint256"],
      ["SRC20_BALANCE_READ", owner, expiry],
    ),
  );

  const ethSignedHash = keccak256(
    encodePacked(
      ["string", "bytes32"],
      ["\x19Ethereum Signed Message:\n32", messageHash],
    ),
  );

  const rawSig = await account.sign({ hash: ethSignedHash });

  // viem sign returns 0x{r}{s}{v} as a single hex string (65 bytes = 132 hex + 0x)
  const r = rawSig.slice(0, 66) as Hex;
  const s = ("0x" + rawSig.slice(66, 130)) as Hex;
  const v = parseInt(rawSig.slice(130, 132), 16);

  return encodePacked(["bytes32", "bytes32", "uint8"], [r, s, v]);
}

/**
 * Creates an expiry timestamp (seconds since epoch).
 */
export function createExpiry(hoursFromNow: number = 1): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + hoursFromNow * 3600);
}
