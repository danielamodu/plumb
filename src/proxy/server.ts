import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type {
  AdjudicationRecord,
  BudgetGate,
  MinerCallTrace,
  TelegraphAskRequest,
  TelegraphAskResult,
} from "../types.js";
import { BudgetExceededError } from "../budget/limiter.js";
import { classifyEpistemicBoundary } from "../classifier/gate.js";
import { formatVerifiedContext, sanitizeMinerAnswer } from "../security/sanitize.js";
import { adjudicateMiners } from "../adjudicator/adjudicator.js";

export interface TelegraphAsker {
  ask(req: TelegraphAskRequest): Promise<TelegraphAskResult>;
}

export interface PlumbServerOptions {
  upstreamBaseUrl: string;
  upstreamApiKey: string;
  upstreamFallbackBaseUrl?: string;
  upstreamFallbackApiKey?: string;
  defaultModel: string;
  telegraphClient: TelegraphAsker;
  budgetLimiter: BudgetGate;
  estimatedAskUsd?: number;
  primaryMinerId?: string;
  onAdjudication?: (record: AdjudicationRecord) => void;
  extraRoutes?: (
    req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ) => Promise<boolean> | boolean;
}

interface ChatMessage {
  role: string;
  content: string | Array<{ type?: string; text?: string }> | null;
}

function readBody(req: IncomingMessage, maxBytes = 2 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function extractLastUserPrompt(messages: ChatMessage[] | undefined): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .filter((p) => p && typeof p.text === "string")
        .map((p) => p.text)
        .join("\n");
    }
  }
  return "";
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

async function forwardToUpstream(
  options: PlumbServerOptions,
  body: Record<string, unknown>
): Promise<Response> {
  const targets: Array<{ baseUrl: string; apiKey: string }> = [
    { baseUrl: options.upstreamBaseUrl, apiKey: options.upstreamApiKey },
  ];
  if (options.upstreamFallbackBaseUrl) {
    targets.push({
      baseUrl: options.upstreamFallbackBaseUrl,
      apiKey: options.upstreamFallbackApiKey ?? options.upstreamApiKey,
    });
  }

  let lastErr: unknown;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const url = `${t.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      if ((resp.status === 429 || resp.status >= 500) && i + 1 < targets.length) {
        continue;
      }
      return resp;
    } catch (err) {
      lastErr = err;
      if (i + 1 < targets.length) continue;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All upstream LLMs failed");
}

export function createPlumbServer(options: PlumbServerOptions): Server {
  const estimatedAskUsd = options.estimatedAskUsd ?? 0.01;

  return createServer(async (req, res) => {
    const startMs = Date.now();
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Plumb-Mode, X-Plumb-Max-Budget",
      });
      res.end();
      return;
    }

    if (options.extraRoutes) {
      const handled = await options.extraRoutes(req, res, url);
      if (handled) return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        status: "ok",
        service: "plumb",
        budget: options.budgetLimiter.snapshot(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/models") {
      sendJson(res, 200, {
        object: "list",
        data: [
          {
            id: options.defaultModel,
            object: "model",
            owned_by: "plumb-gateway",
          },
        ],
      });
      return;
    }

    if (req.method !== "POST" || url.pathname !== "/v1/chat/completions") {
      sendJson(res, 404, {
        error: { message: `Route not found: ${req.method} ${url.pathname}`, type: "not_found" },
      });
      return;
    }

    let reqBody: Record<string, unknown>;
    try {
      const raw = await readBody(req);
      reqBody = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      sendJson(res, 400, {
        error: { message: "Invalid JSON body", type: "invalid_request_error" },
      });
      return;
    }

    const messages = (Array.isArray(reqBody.messages) ? reqBody.messages : []) as ChatMessage[];
    const prompt = extractLastUserPrompt(messages);
    const promptHash = createHash("sha256").update(prompt).digest("hex").slice(0, 16);
    const modeHeader = String(req.headers["x-plumb-mode"] ?? "auto").toLowerCase();
    const maxBudgetHeader = req.headers["x-plumb-max-budget"];
    const requestCapUsd =
      typeof maxBudgetHeader === "string" && maxBudgetHeader.trim() !== ""
        ? Number(maxBudgetHeader)
        : undefined;

    let decision = classifyEpistemicBoundary(prompt);
    if (modeHeader === "passthrough") {
      decision = {
        mode: "PASSTHROUGH",
        reason: "forced_passthrough_header",
        confidence: 1,
        classifierLatencyMs: 0,
      };
    }

    const calls: MinerCallTrace[] = [];
    let totalCostUsd = 0;
    let receiptHash: string | undefined;
    let status: AdjudicationRecord["status"] = "PASSTHROUGH_OK";
    let finalValue: unknown;
    let disagreementDetected = false;
    let bugReportMarkdown: string | undefined;
    let upstreamMessages = [...messages];
    const adjudicateHeader = String(req.headers["x-plumb-adjudicate"] ?? "").toLowerCase() === "true";
    const compareMinersHeader = String(req.headers["x-plumb-compare-miners"] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (decision.mode === "VERIFY" && decision.intent) {
      const targetMiners: Array<string | undefined> =
        compareMinersHeader.length >= 2
          ? compareMinersHeader.slice(0, 2)
          : adjudicateHeader
            ? [undefined, undefined]
            : [undefined];
      const requiredReserveUsd = estimatedAskUsd * targetMiners.length;

      let reservationId: string | null = null;
      try {
        const reservation = await options.budgetLimiter.reserve(
          requiredReserveUsd,
          Number.isFinite(requestCapUsd) ? requestCapUsd : undefined
        );
        reservationId = reservation.id;
      } catch (err) {
        status = "FAIL_CLOSED_BUDGET";
        const msg =
          err instanceof BudgetExceededError
            ? err.message
            : "Budget limit exceeded";
        const record: AdjudicationRecord = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          promptHash,
          promptPreview: prompt.slice(0, 120),
          decision,
          status,
          calls,
          totalCostUsd: 0,
          totalLatencyMs: Date.now() - startMs,
          disagreementDetected: false,
        };
        options.onAdjudication?.(record);
        sendJson(
          res,
          402,
          {
            error: {
              message: `plumb fail-closed: ${msg}`,
              type: "budget_exceeded",
              code: "FAIL_CLOSED_BUDGET",
            },
          },
          {
            "X-Plumb-Decision": "VERIFY",
            "X-Plumb-Intent": decision.intent,
            "X-Plumb-Cost-Usd": "0.000000",
            "X-Plumb-Status": status,
          }
        );
        return;
      }

      const askResults = await Promise.all(
        targetMiners.map((minerId) =>
          options.telegraphClient.ask({
            intent: decision.intent,
            params: decision.params,
            ...(minerId ? { minerId } : {}),
          })
        )
      );

      let totalBilledUsd = 0;
      let anyInjection = false;
      let lastRejectReason: string | undefined;

      for (const askRes of askResults) {
        const sanitized = askRes.ok
          ? sanitizeMinerAnswer(decision.intent, askRes.answer)
          : { valid: false, injectionDetected: false, rejectionReason: askRes.errorMessage };
        const billedUsd = askRes.ok ? askRes.costUsd : 0;
        totalBilledUsd += billedUsd;
        if (sanitized.injectionDetected) anyInjection = true;
        if (!sanitized.valid) lastRejectReason = sanitized.rejectionReason;
        if (!receiptHash && askRes.receiptHash) receiptHash = askRes.receiptHash;

        calls.push({
          minerId: askRes.minerId ?? "unknown",
          minerName: askRes.minerName,
          rank: askRes.minerRank,
          isPrimaryTrack01:
            Boolean(options.primaryMinerId) &&
            askRes.minerId === options.primaryMinerId,
          httpStatus: askRes.httpStatus,
          latencyMs: askRes.latencyMs,
          schemaValid: sanitized.valid,
          injectionFlagged: sanitized.injectionDetected,
          costUsd: billedUsd,
          signalHash: askRes.signalHash,
          receiptHash: askRes.receiptHash,
          parsedValue: sanitized.data,
          error: sanitized.valid ? undefined : sanitized.rejectionReason,
        });
      }

      if (reservationId) {
        if (totalBilledUsd > 0) {
          await options.budgetLimiter.settle(reservationId, totalBilledUsd);
        } else {
          await options.budgetLimiter.release(reservationId);
        }
      }
      totalCostUsd = Number(totalBilledUsd.toFixed(6));

      const adj = adjudicateMiners(decision.intent, decision.params, calls);
      disagreementDetected = adj.disagreementDetected;
      bugReportMarkdown = adj.bugReportMarkdown;

      if (adj.status === "FAIL_CLOSED_MINER" || !adj.finalValue) {
        status = "FAIL_CLOSED_MINER";
        const record: AdjudicationRecord = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          promptHash,
          promptPreview: prompt.slice(0, 120),
          decision,
          status,
          calls,
          totalCostUsd,
          totalLatencyMs: Date.now() - startMs,
          disagreementDetected,
        };
        options.onAdjudication?.(record);
        sendJson(
          res,
          502,
          {
            error: {
              message: `plumb fail-closed: ${lastRejectReason ?? "Telegraph verification failed"}`,
              type: "verification_failed",
              code: "FAIL_CLOSED_MINER",
              injection_quarantined: anyInjection,
            },
          },
          {
            "X-Plumb-Decision": "VERIFY",
            "X-Plumb-Intent": decision.intent,
            "X-Plumb-Cost-Usd": totalCostUsd.toFixed(6),
            "X-Plumb-Status": status,
          }
        );
        return;
      }

      status = adj.status;
      finalValue = adj.finalValue;
      const winningCall = calls.find((c) => c.schemaValid && !c.injectionFlagged);
      const verifiedFact = formatVerifiedContext(
        decision.intent,
        finalValue as Record<string, unknown>,
        winningCall?.minerName ?? winningCall?.minerId,
        winningCall?.receiptHash
      );
      upstreamMessages = [
        {
          role: "system",
          content:
            `You are answering via the plumb epistemic verification gateway. Use the following Telegraph-verified live fact as authoritative ground truth for your answer and cite its exact value without inventing numbers:\n${verifiedFact}`,
        },
        ...messages,
      ];
    }

    const outboundBody: Record<string, unknown> = {
      ...reqBody,
      model: reqBody.model ?? options.defaultModel,
      messages: upstreamMessages,
    };

    try {
      const upstreamResp = await forwardToUpstream(options, outboundBody);
      const plumbHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": "*",
        "X-Plumb-Decision": decision.mode,
        "X-Plumb-Intent": decision.intent ?? "NONE",
        "X-Plumb-Cost-Usd": totalCostUsd.toFixed(6),
        "X-Plumb-Status": status,
        "X-Plumb-Disagreement": String(disagreementDetected),
      };
      if (receiptHash) plumbHeaders["X-Plumb-Receipt-Hash"] = receiptHash;

      const record: AdjudicationRecord = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        promptHash,
        promptPreview: prompt.slice(0, 120),
        decision,
        status,
        calls,
        finalValue,
        totalCostUsd,
        totalLatencyMs: Date.now() - startMs,
        disagreementDetected,
        bugReportMarkdown,
      };
      options.onAdjudication?.(record);

      const contentType =
        upstreamResp.headers.get("content-type") ?? "application/json";
      res.writeHead(upstreamResp.status, {
        ...plumbHeaders,
        "Content-Type": contentType,
      });

      if (reqBody.stream === true && upstreamResp.body) {
        const reader = upstreamResp.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      } else {
        const text = await upstreamResp.text();
        res.end(text);
      }
    } catch (err) {
      sendJson(res, 502, {
        error: {
          message: err instanceof Error ? err.message : "Upstream LLM failed",
          type: "upstream_error",
        },
      });
    }
  });
}
