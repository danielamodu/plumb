import type { PrivateKeyAccount } from "viem/accounts";
import type {
  TelegraphAskRequest,
  TelegraphAskResult,
  TelegraphEscrowConfig,
} from "../types.js";
import { httpRequest, type HttpTransport } from "./http.js";
import {
  buildEscrowPaymentHeader,
  decodePaymentResponseHeader,
  loadEscrowAccount,
  parseBilledUsd,
  type EscrowPaymentRequirement,
} from "./escrow.js";

function parseJsonSafe(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : { raw };
  } catch {
    return { raw };
  }
}

function extractEscrowRequirement(
  paymentRequiredHeader: string | null,
  body: Record<string, unknown>,
  chainId: number
): EscrowPaymentRequirement | null {
  let challenge: Record<string, unknown> = body;
  if (paymentRequiredHeader) {
    try {
      const decoded = Buffer.from(paymentRequiredHeader.trim(), "base64").toString(
        "utf8"
      );
      challenge = parseJsonSafe(decoded);
    } catch {
      // fall back to body
    }
  }
  const accepts = Array.isArray(challenge.accepts)
    ? (challenge.accepts as EscrowPaymentRequirement[])
    : [];
  const targetNetwork = `eip155:${chainId}`;
  return (
    accepts.find(
      (a) => a.scheme === "escrow" && a.network === targetNetwork
    ) ??
    accepts.find((a) => a.scheme === "escrow") ??
    null
  );
}

export class TelegraphClient {
  private readonly config: TelegraphEscrowConfig;
  private readonly transport: HttpTransport;
  private readonly account: PrivateKeyAccount | null;

  constructor(config: TelegraphEscrowConfig, transport: HttpTransport = httpRequest) {
    this.config = config;
    this.transport = transport;
    this.account = loadEscrowAccount(config.privateKey);
  }

  get payerAddress(): `0x${string}` | null {
    return this.account?.address ?? null;
  }

  async ask(req: TelegraphAskRequest): Promise<TelegraphAskResult> {
    const startMs = Date.now();
    const base = this.config.nodeUrl.replace(/\/+$/, "");
    const endpoint = req.minerId
      ? `${base}/engine/v1/ask/${encodeURIComponent(req.minerId)}`
      : `${base}/engine/v1/ask`;

    const payload: Record<string, unknown> = {
      max_budget_usdc: req.max_budget_usdc ?? this.config.maxBudgetUsdc,
    };
    if (req.intent) payload.intent = req.intent;
    if (req.params) payload.params = req.params;
    if (req.query) payload.query = req.query;

    // Optional Anjoman API key fallback when no escrow private key is configured
    if (!this.account && this.config.anjomanApiKey) {
      return this.askViaAnjoman(endpoint, payload, req, startMs);
    }

    if (!this.account) {
      return {
        ok: false,
        httpStatus: 0,
        rail: "escrow",
        intent: req.intent ?? "UNKNOWN",
        endpoint,
        answer: null,
        costUsd: 0,
        authorizedUsd: 0,
        latencyMs: Date.now() - startMs,
        errorCode: "NO_ESCROW_WALLET",
        errorMessage:
          "No Sepolia escrow private key found (set TELEGRAPH_PRIVATE_KEY or ~/.telegraph/wallet.json)",
      };
    }

    // Step 1: Discover 402 payment requirement
    const step1 = await this.transport(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      timeoutMs: 30_000,
    });
    const step1Text = await step1.text();
    const step1Body = parseJsonSafe(step1Text);

    if (step1.status === 429) {
      return {
        ok: false,
        httpStatus: 429,
        rail: "escrow",
        intent: req.intent ?? "UNKNOWN",
        endpoint,
        answer: null,
        costUsd: 0,
        authorizedUsd: 0,
        rawBody: step1Body,
        latencyMs: Date.now() - startMs,
        errorCode: "RATE_LIMITED",
        errorMessage: "Telegraph node returned HTTP 429 rate limit",
      };
    }

    // Some direct endpoints or free queries might return 200 without 402
    if (step1.ok) {
      return this.buildSuccessResult("escrow", endpoint, req, step1, step1Body, 0, startMs);
    }

    if (step1.status !== 402) {
      return {
        ok: false,
        httpStatus: step1.status,
        rail: "escrow",
        intent: req.intent ?? "UNKNOWN",
        endpoint,
        answer: null,
        costUsd: 0,
        authorizedUsd: 0,
        rawBody: step1Body,
        latencyMs: Date.now() - startMs,
        errorCode: `HTTP_${step1.status}`,
        errorMessage: String(step1Body.error ?? step1Body.message ?? `Unexpected HTTP ${step1.status}`),
      };
    }

    const requirement = extractEscrowRequirement(
      step1.headers.get("payment-required"),
      step1Body,
      this.config.chainId
    );
    if (!requirement) {
      return {
        ok: false,
        httpStatus: 402,
        rail: "escrow",
        intent: req.intent ?? "UNKNOWN",
        endpoint,
        answer: null,
        costUsd: 0,
        authorizedUsd: 0,
        rawBody: step1Body,
        latencyMs: Date.now() - startMs,
        errorCode: "NO_ESCROW_REQUIREMENT",
        errorMessage: "402 response did not include an escrow payment option",
      };
    }

    const authorizedUsd = Number(requirement.amount) / 1_000_000;
    if (!Number.isFinite(authorizedUsd) || authorizedUsd > this.config.maxAskUsd) {
      return {
        ok: false,
        httpStatus: 402,
        rail: "escrow",
        intent: req.intent ?? "UNKNOWN",
        endpoint,
        answer: null,
        costUsd: 0,
        authorizedUsd: Number.isFinite(authorizedUsd) ? authorizedUsd : 0,
        rawBody: step1Body,
        latencyMs: Date.now() - startMs,
        errorCode: "EXCEEDS_MAX_ASK_USD",
        errorMessage: `Escrow quote $${authorizedUsd.toFixed(4)} exceeds maxAskUsd $${this.config.maxAskUsd.toFixed(4)}`,
      };
    }

    // Step 2: Sign fresh EIP-191 escrow header and submit (re-sign on transient retry)
    const maxPaidAttempts = 2;
    for (let attempt = 1; attempt <= maxPaidAttempts; attempt++) {
      const { headerBase64 } = await buildEscrowPaymentHeader(
        this.account,
        requirement
      );
      const step2 = await this.transport(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": headerBase64,
        },
        body: payload,
        timeoutMs: 45_000,
        retries: 1,
      });
      const step2Text = await step2.text();
      const step2Body = parseJsonSafe(step2Text);

      if (step2.ok) {
        return this.buildSuccessResult(
          "escrow",
          endpoint,
          req,
          step2,
          step2Body,
          authorizedUsd,
          startMs
        );
      }

      if (step2.status === 429) {
        return {
          ok: false,
          httpStatus: 429,
          rail: "escrow",
          intent: req.intent ?? "UNKNOWN",
          endpoint,
          answer: null,
          costUsd: 0,
          authorizedUsd,
          rawBody: step2Body,
          latencyMs: Date.now() - startMs,
          errorCode: "RATE_LIMITED",
          errorMessage: "Telegraph node returned HTTP 429 rate limit",
        };
      }

      // Retry once with a fresh signature if Cloudflare edge or expired nonce transient occurs
      if (
        [402, 502, 522, 524, 525].includes(step2.status) &&
        attempt < maxPaidAttempts
      ) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }

      // Escrow does not bill failed asks (verified on Sepolia in D1.2)
      return {
        ok: false,
        httpStatus: step2.status,
        rail: "escrow",
        intent: req.intent ?? "UNKNOWN",
        endpoint,
        answer: null,
        costUsd: 0,
        authorizedUsd,
        rawBody: step2Body,
        latencyMs: Date.now() - startMs,
        errorCode: `HTTP_${step2.status}`,
        errorMessage: String(
          step2Body.error ?? step2Body.message ?? `Miner/node returned HTTP ${step2.status}`
        ),
      };
    }

    return {
      ok: false,
      httpStatus: 500,
      rail: "escrow",
      intent: req.intent ?? "UNKNOWN",
      endpoint,
      answer: null,
      costUsd: 0,
      authorizedUsd,
      latencyMs: Date.now() - startMs,
      errorCode: "RETRY_EXHAUSTED",
      errorMessage: "Escrow ask retries exhausted",
    };
  }

  private async askViaAnjoman(
    endpoint: string,
    payload: Record<string, unknown>,
    req: TelegraphAskRequest,
    startMs: number
  ): Promise<TelegraphAskResult> {
    const res = await this.transport(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.config.anjomanApiKey!,
      },
      body: payload,
      timeoutMs: 45_000,
    });
    const text = await res.text();
    const body = parseJsonSafe(text);
    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        rail: "anjoman",
        intent: req.intent ?? "UNKNOWN",
        endpoint,
        answer: null,
        costUsd: 0,
        authorizedUsd: 0,
        rawBody: body,
        latencyMs: Date.now() - startMs,
        errorCode: res.status === 429 ? "RATE_LIMITED" : `HTTP_${res.status}`,
        errorMessage: String(body.error ?? body.message ?? `HTTP ${res.status}`),
      };
    }
    return this.buildSuccessResult("anjoman", endpoint, req, res, body, 0.01, startMs);
  }

  private buildSuccessResult(
    rail: "escrow" | "anjoman",
    endpoint: string,
    req: TelegraphAskRequest,
    res: { status: number; headers: { get(n: string): string | null } },
    body: Record<string, unknown>,
    authorizedUsd: number,
    startMs: number
  ): TelegraphAskResult {
    const receipt = decodePaymentResponseHeader(
      res.headers.get("x-payment-response") ?? res.headers.get("payment-response")
    );
    const costUsd = parseBilledUsd(body, receipt, authorizedUsd);
    const minerObj = (body.miner && typeof body.miner === "object"
      ? (body.miner as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    const minerId =
      req.minerId ??
      (receipt?.miner ? String(receipt.miner) : undefined) ??
      (body.miner_id !== undefined ? String(body.miner_id) : undefined) ??
      (minerObj.id !== undefined ? String(minerObj.id) : undefined);

    const minerName =
      typeof body.miner_name === "string"
        ? body.miner_name
        : typeof minerObj.name === "string"
          ? minerObj.name
          : undefined;

    const minerRank =
      typeof body.served_rank === "number"
        ? body.served_rank
        : typeof minerObj.rank === "number"
          ? minerObj.rank
          : undefined;

    const signalHash =
      typeof body.signal_hash === "string" ? body.signal_hash : undefined;
    const receiptHash =
      receipt?.receipt_hash ??
      (typeof body.receipt_hash === "string" ? body.receipt_hash : undefined);

    const answer =
      body.result !== undefined
        ? body.result
        : body.data !== undefined
          ? body.data
          : body.answer !== undefined
            ? body.answer
            : body.response !== undefined
              ? body.response
              : body;

    return {
      ok: true,
      httpStatus: res.status,
      rail,
      intent:
        req.intent ??
        receipt?.intent ??
        (typeof body.intent === "string" ? body.intent : "UNKNOWN"),
      minerId,
      minerName,
      minerRank,
      endpoint,
      answer,
      costUsd,
      authorizedUsd,
      signalHash,
      receiptHash,
      rawReceipt: receipt ?? undefined,
      rawBody: body,
      latencyMs: Date.now() - startMs,
    };
  }
}
