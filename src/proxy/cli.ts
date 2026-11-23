import { join } from "node:path";
import { TelegraphClient } from "../telegraph/client.js";
import { AtomicBudgetLimiter } from "../budget/limiter.js";
import { LedgerStore } from "../adjudicator/store.js";
import { createDashboardRoutes } from "../web/dashboard.js";
import {
  createSolanaDevnetBroadcaster,
  evaluateInvoiceSettlement,
  loadOrCreateDevnetKeypair,
} from "../solana/settlement-gate.js";
import { createPlumbServer } from "./server.js";

const port = Number(process.env.PLUMB_PORT ?? 8787);
const host = process.env.PLUMB_HOST ?? "127.0.0.1";
const upstreamBaseUrl =
  process.env.UPSTREAM_BASE_URL ?? "https://api.groq.com/openai/v1";
const upstreamApiKey =
  process.env.UPSTREAM_API_KEY ?? process.env.GROQ_API_KEY ?? "";
const defaultModel = process.env.UPSTREAM_MODEL ?? "openai/gpt-oss-120b";

const telegraphClient = new TelegraphClient({
  nodeUrl:
    process.env.TELEGRAPH_NODE_URL ?? "https://devnode.telegraphprotocol.com",
  diamondAddress: (process.env.TELEGRAPH_DIAMOND ??
    "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b") as `0x${string}`,
  chainId: 11155111,
  rpcUrl:
    process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  privateKey: process.env.TELEGRAPH_PRIVATE_KEY as `0x${string}` | undefined,
  anjomanApiKey: process.env.ANJOMAN_API_KEY,
  maxAskUsd: Number(process.env.PLUMB_MAX_ASK_USD ?? 0.05),
  dailyLimitUsd: Number(process.env.PLUMB_DAILY_LIMIT_USD ?? 5.0),
  maxBudgetUsdc: Number(process.env.PLUMB_MAX_BUDGET_UUSDC ?? 10000),
});

const budgetLimiter = new AtomicBudgetLimiter({
  dailyLimitUsd: Number(process.env.PLUMB_DAILY_LIMIT_USD ?? 5.0),
  defaultMaxAskUsd: Number(process.env.PLUMB_MAX_ASK_USD ?? 0.05),
  statePath:
    process.env.PLUMB_SPEND_STATE_PATH ?? join(process.cwd(), "data", "spend.json"),
});

const ledgerStore = new LedgerStore(
  process.env.PLUMB_LEDGER_PATH ?? join(process.cwd(), "data", "ledger.jsonl")
);

const solanaKeypair = await loadOrCreateDevnetKeypair(
  process.env.SOLANA_KEYPAIR_PATH ??
    join(process.cwd(), "data", "solana-devnet-keypair.json")
);
const solanaBroadcaster = createSolanaDevnetBroadcaster(solanaKeypair);

async function askFrontierLlm(prompt: string): Promise<string> {
  const r = await fetch(`${upstreamBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${upstreamApiKey}`,
    },
    body: JSON.stringify({
      model: defaultModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await r.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return j.choices?.[0]?.message?.content ?? "HOLD: upstream unavailable";
}

const server = createPlumbServer({
  upstreamBaseUrl,
  upstreamApiKey,
  upstreamFallbackBaseUrl: process.env.UPSTREAM_FALLBACK_BASE_URL,
  upstreamFallbackApiKey: process.env.UPSTREAM_FALLBACK_API_KEY,
  defaultModel,
  telegraphClient,
  budgetLimiter,
  primaryMinerId: process.env.PRIMARY_MINER_ID,
  onAdjudication: (record) => ledgerStore.append(record),
  extraRoutes: createDashboardRoutes(
    ledgerStore,
    budgetLimiter,
    (req) =>
      evaluateInvoiceSettlement(req, {
        telegraphClient,
        budgetLimiter,
        broadcaster: solanaBroadcaster,
        senderPubkey: solanaKeypair.publicKey.toBase58(),
        askFrontierLlm,
      }),
    solanaKeypair.publicKey.toBase58()
  ),
});

server.listen(port, host, () => {
  console.log(
    JSON.stringify({
      event: "plumb_listening",
      url: `http://${host}:${port}`,
      payer: telegraphClient.payerAddress ?? "anjoman-or-unconfigured",
      solanaDevnetTreasury: solanaKeypair.publicKey.toBase58(),
      dailyLimitUsd: budgetLimiter.snapshot().dailyLimitUsd,
    })
  );
});
