import { Fireblocks, type TransactionResponse } from "@fireblocks/ts-sdk";

export interface FireblocksConfig {
  apiKey: string;
  secretKeyPath: string;
  basePath: string;
  vaultAccountId: string;
}

export function loadFireblocksConfig(): FireblocksConfig {
  const apiKey = process.env.FIREBLOCKS_API_KEY;
  const secretKeyPath = process.env.FIREBLOCKS_SECRET_KEY_PATH;
  const basePath =
    process.env.FIREBLOCKS_BASE_URL ?? "https://sandbox-api.fireblocks.io";
  const vaultAccountId = process.env.FIREBLOCKS_VAULT_ACCOUNT_ID ?? "0";

  if (!apiKey) throw new Error("FIREBLOCKS_API_KEY is required");
  if (!secretKeyPath)
    throw new Error("FIREBLOCKS_SECRET_KEY_PATH is required");

  return { apiKey, secretKeyPath, basePath, vaultAccountId };
}

export async function createFireblocksClient(
  config: FireblocksConfig,
): Promise<Fireblocks> {
  const secretKey = await Bun.file(config.secretKeyPath).text();

  return new Fireblocks({
    apiKey: config.apiKey,
    secretKey,
    basePath: config.basePath,
  });
}

const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "REJECTED",
  "BLOCKED",
  "CANCELLED",
]);

export async function pollTransaction(
  client: Fireblocks,
  txId: string,
  pollIntervalMs = 3000,
  maxAttempts = 120,
): Promise<TransactionResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: tx } = await client.transactions.getTransaction({ txId });
    if (!tx) throw new Error(`Transaction ${txId} not found`);

    const status = tx.status as string;

    if (status === "COMPLETED") return tx;
    if (TERMINAL_STATUSES.has(status)) {
      throw new Error(
        `Transaction ${txId} ended with status: ${status} — ${tx.subStatus ?? "no details"}`,
      );
    }

    await Bun.sleep(pollIntervalMs);
  }

  throw new Error(`Transaction ${txId} polling timed out after ${maxAttempts} attempts`);
}
