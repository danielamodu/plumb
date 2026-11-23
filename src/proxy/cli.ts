import { join } from "node:path";
import { TelegraphClient } from "../telegraph/client.js";
import { AtomicBudgetLimiter } from "../budget/limiter.js";
import { createPlumbServer } from "./server.js";

const port = Number(process.env.PLUMB_PORT ?? 8787);
const host = process.env.PLUMB_HOST ?? "127.0.0.1";

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

const server = createPlumbServer({
  upstreamBaseUrl:
    process.env.UPSTREAM_BASE_URL ?? "https://api.groq.com/openai/v1",
  upstreamApiKey:
    process.env.UPSTREAM_API_KEY ?? process.env.GROQ_API_KEY ?? "",
  upstreamFallbackBaseUrl: process.env.UPSTREAM_FALLBACK_BASE_URL,
  upstreamFallbackApiKey: process.env.UPSTREAM_FALLBACK_API_KEY,
  defaultModel: process.env.UPSTREAM_MODEL ?? "llama-3.3-70b-versatile",
  telegraphClient,
  budgetLimiter,
  primaryMinerId: process.env.PRIMARY_MINER_ID,
});

server.listen(port, host, () => {
  console.log(
    JSON.stringify({
      event: "plumb_listening",
      url: `http://${host}:${port}`,
      payer: telegraphClient.payerAddress ?? "anjoman-or-unconfigured",
      dailyLimitUsd: budgetLimiter.snapshot().dailyLimitUsd,
    })
  );
});
