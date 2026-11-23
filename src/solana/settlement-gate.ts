import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { BudgetGate } from "../types.js";
import type { TelegraphAsker } from "../proxy/server.js";
import { sanitizeMinerAnswer } from "../security/sanitize.js";
import { BudgetExceededError } from "../budget/limiter.js";

export interface InvoiceSettlementRequest {
  invoiceId: string;
  counterpartyHost: string;
  counterpartyUrl?: string;
  recipientPubkey: string;
  amountSol: number;
  mode: "frontier_only" | "plumb_verified";
}

export interface InvoiceSettlementResult {
  invoiceId: string;
  mode: "frontier_only" | "plumb_verified";
  decision: "AUTHORIZED_AND_BROADCAST" | "HELD_BLOCKED";
  reason: string;
  counterpartyHost: string;
  amountSol: number;
  telegraphCostUsd: number;
  telegraphReceipts: Array<{
    intent: string;
    minerId?: string;
    minerName?: string;
    receiptHash?: string;
    signalHash?: string;
    parsedValue?: unknown;
  }>;
  llmVerdict?: string;
  solanaSignature: string | null;
  solanaExplorerUrl: string | null;
  senderPubkey: string;
  latencyMs: number;
}

export type SolanaBroadcaster = (
  recipientPubkey: string,
  amountSol: number
) => Promise<{ signature: string; senderPubkey: string }>;

export async function loadOrCreateDevnetKeypair(filePath: string): Promise<Keypair> {
  if (process.env.SOLANA_DEVNET_SECRET_KEY) {
    const arr = JSON.parse(process.env.SOLANA_DEVNET_SECRET_KEY) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  if (existsSync(filePath)) {
    const arr = JSON.parse(readFileSync(filePath, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  const kp = await Keypair.generate();
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)), {
    encoding: "utf8",
    mode: 0o600,
  });
  return kp;
}

export function createSolanaDevnetBroadcaster(
  keypair: Keypair,
  rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com"
): SolanaBroadcaster {
  const connection = new Connection(rpcUrl, "confirmed");
  return async (recipientPubkey: string, amountSol: number) => {
    const toPubkey = new PublicKey(recipientPubkey);
    const lamports = Math.max(1, Math.round(amountSol * Number(LAMPORTS_PER_SOL)));
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey,
        lamports,
      })
    );
    const signature = await sendAndConfirmTransaction(connection, tx, [keypair], {
      commitment: "confirmed",
    });
    return { signature, senderPubkey: keypair.publicKey.toBase58() };
  };
}

export async function evaluateInvoiceSettlement(
  req: InvoiceSettlementRequest,
  deps: {
    telegraphClient: TelegraphAsker;
    budgetLimiter: BudgetGate;
    broadcaster: SolanaBroadcaster;
    senderPubkey: string;
    askFrontierLlm: (prompt: string) => Promise<string>;
  }
): Promise<InvoiceSettlementResult> {
  const started = Date.now();
  const receipts: InvoiceSettlementResult["telegraphReceipts"] = [];
  let telegraphCostUsd = 0;

  if (req.mode === "frontier_only") {
    const prompt = `You are an autonomous Solana treasury agent. A vendor with domain "${req.counterpartyHost}"${
      req.counterpartyUrl ? ` (URL: ${req.counterpartyUrl})` : ""
    } submitted invoice ${req.invoiceId} for ${req.amountSol} SOL to ${req.recipientPubkey}. Should you APPROVE or HOLD this payment? Reply starting with APPROVE or HOLD and one short sentence.`;
    const llmReply = await deps.askFrontierLlm(prompt);
    const approved = /^\s*approve\b/i.test(llmReply) || (/\bapprove\b/i.test(llmReply) && !/^\s*hold\b/i.test(llmReply));

    if (!approved) {
      return {
        invoiceId: req.invoiceId,
        mode: req.mode,
        decision: "HELD_BLOCKED",
        reason: `Frontier LLM chose HOLD: ${llmReply.slice(0, 160)}`,
        counterpartyHost: req.counterpartyHost,
        amountSol: req.amountSol,
        telegraphCostUsd: 0,
        telegraphReceipts: [],
        llmVerdict: llmReply.slice(0, 240),
        solanaSignature: null,
        solanaExplorerUrl: null,
        senderPubkey: deps.senderPubkey,
        latencyMs: Date.now() - started,
      };
    }

    const { signature, senderPubkey } = await deps.broadcaster(
      req.recipientPubkey,
      req.amountSol
    );
    return {
      invoiceId: req.invoiceId,
      mode: req.mode,
      decision: "AUTHORIZED_AND_BROADCAST",
      reason: `Frontier LLM approved without live TLS/URL verification`,
      counterpartyHost: req.counterpartyHost,
      amountSol: req.amountSol,
      telegraphCostUsd: 0,
      telegraphReceipts: [],
      llmVerdict: llmReply.slice(0, 240),
      solanaSignature: signature,
      solanaExplorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      senderPubkey,
      latencyMs: Date.now() - started,
    };
  }

  // Mode: plumb_verified — deterministic pre-signing gate backed by Telegraph Sepolia escrow
  const checks: Array<{ intent: "SSL_VERIFICATION_CERT" | "URL_SCAN_VERDICT"; params: Record<string, unknown> }> = [
    { intent: "SSL_VERIFICATION_CERT", params: { host: req.counterpartyHost } },
  ];
  if (req.counterpartyUrl) {
    checks.push({ intent: "URL_SCAN_VERDICT", params: { url: req.counterpartyUrl } });
  }

  let reservationId: string | null = null;
  try {
    const res = await deps.budgetLimiter.reserve(0.01 * checks.length);
    reservationId = res.id;
  } catch (err) {
    const msg = err instanceof BudgetExceededError ? err.message : "Budget exceeded";
    return {
      invoiceId: req.invoiceId,
      mode: req.mode,
      decision: "HELD_BLOCKED",
      reason: `FAIL_CLOSED_BUDGET: ${msg}`,
      counterpartyHost: req.counterpartyHost,
      amountSol: req.amountSol,
      telegraphCostUsd: 0,
      telegraphReceipts: [],
      solanaSignature: null,
      solanaExplorerUrl: null,
      senderPubkey: deps.senderPubkey,
      latencyMs: Date.now() - started,
    };
  }

  let holdReason: string | null = null;
  for (const check of checks) {
    const askRes = await deps.telegraphClient.ask({
      intent: check.intent,
      params: check.params,
    });
    const billed = askRes.ok ? askRes.costUsd : 0;
    telegraphCostUsd = Number((telegraphCostUsd + billed).toFixed(6));

    const sanitized = askRes.ok
      ? sanitizeMinerAnswer(check.intent, askRes.answer)
      : { valid: false, injectionDetected: false, rejectionReason: askRes.errorMessage };

    receipts.push({
      intent: check.intent,
      minerId: askRes.minerId,
      minerName: askRes.minerName,
      receiptHash: askRes.receiptHash,
      signalHash: askRes.signalHash,
      parsedValue: sanitized.data ?? null,
    });

    if (!askRes.ok || !sanitized.valid || !sanitized.data) {
      holdReason = `FAIL_CLOSED_MINER (${check.intent}): ${sanitized.rejectionReason ?? askRes.errorMessage ?? "unverified"}`;
      break;
    }

    if (check.intent === "SSL_VERIFICATION_CERT" && sanitized.data.certificate_valid !== true) {
      holdReason = `Counterparty TLS certificate INVALID for ${req.counterpartyHost} (verified via Telegraph receipt ${askRes.receiptHash ?? "n/a"})`;
      break;
    }
    if (check.intent === "URL_SCAN_VERDICT" && sanitized.data.safe !== true) {
      holdReason = `Counterparty URL flagged UNSAFE for ${req.counterpartyUrl} (verified via Telegraph receipt ${askRes.receiptHash ?? "n/a"})`;
      break;
    }
  }

  if (reservationId) {
    if (telegraphCostUsd > 0) {
      await deps.budgetLimiter.settle(reservationId, telegraphCostUsd);
    } else {
      await deps.budgetLimiter.release(reservationId);
    }
  }

  if (holdReason) {
    return {
      invoiceId: req.invoiceId,
      mode: req.mode,
      decision: "HELD_BLOCKED",
      reason: holdReason,
      counterpartyHost: req.counterpartyHost,
      amountSol: req.amountSol,
      telegraphCostUsd,
      telegraphReceipts: receipts,
      solanaSignature: null,
      solanaExplorerUrl: null,
      senderPubkey: deps.senderPubkey,
      latencyMs: Date.now() - started,
    };
  }

  const { signature, senderPubkey } = await deps.broadcaster(
    req.recipientPubkey,
    req.amountSol
  );
  return {
    invoiceId: req.invoiceId,
    mode: req.mode,
    decision: "AUTHORIZED_AND_BROADCAST",
    reason: `All Telegraph pre-signing checks PASSED for ${req.counterpartyHost}; Solana Devnet settlement confirmed`,
    counterpartyHost: req.counterpartyHost,
    amountSol: req.amountSol,
    telegraphCostUsd,
    telegraphReceipts: receipts,
    solanaSignature: signature,
    solanaExplorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    senderPubkey,
    latencyMs: Date.now() - started,
  };
}
