import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createPlumbServer } from "../src/proxy/server.js";
import { AtomicBudgetLimiter } from "../src/budget/limiter.js";
import { LedgerStore } from "../src/adjudicator/store.js";
import { createDashboardRoutes } from "../src/web/dashboard.js";

function listen(server: Server): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

test("dashboard routes serve /, /ledger, /scoreboard (honest sorted), and /api/bug-report/:id", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plumb-web-"));
  const limiter = new AtomicBudgetLimiter({
    dailyLimitUsd: 5,
    defaultMaxAskUsd: 0.05,
    statePath: join(dir, "spend.json"),
  });
  const store = new LedgerStore(join(dir, "ledger.jsonl"));

  store.append({
    id: "rec-bug-1",
    timestamp: "2026-11-23T13:00:00.000Z",
    promptHash: "h1",
    promptPreview: "Is expired.badssl.com SSL valid?",
    decision: { mode: "VERIFY", intent: "SSL_VERIFICATION_CERT", reason: "live", confidence: 0.95, classifierLatencyMs: 0.4 },
    status: "DISAGREEMENT_RESOLVED",
    calls: [
      {
        minerId: "incumbent-high",
        minerName: "TopIncumbent",
        isPrimaryTrack01: false,
        httpStatus: 200,
        latencyMs: 180,
        schemaValid: true,
        injectionFlagged: false,
        costUsd: 0.01,
        receiptHash: "0xabc123",
      },
      {
        minerId: "primary-1",
        minerName: "primary",
        isPrimaryTrack01: true,
        httpStatus: 200,
        latencyMs: 120,
        schemaValid: true,
        injectionFlagged: false,
        costUsd: 0.01,
        receiptHash: "0xdef456",
      },
    ],
    totalCostUsd: 0.02,
    totalLatencyMs: 300,
    disagreementDetected: true,
    groundTruthCheck: {
      snapshot: { sourceName: "tls", capturedAtUtc: "2026-11-23T13:00:00Z", referenceValue: { certificate_valid: false }, toleranceBand: "exact" },
      matchedMinerIds: ["incumbent-high"],
      failedMinerIds: ["primary-1"],
    },
    bugReportMarkdown: "## Telegraph Miner Accuracy Discrepancy Report\nFailed: primary-1",
  });

  const server = createPlumbServer({
    upstreamBaseUrl: "http://127.0.0.1:1",
    upstreamApiKey: "unused",
    defaultModel: "llama-3.3-70b-versatile",
    telegraphClient: {
      ask: async () => ({
        ok: false,
        httpStatus: 500,
        rail: "escrow",
        intent: "UNKNOWN",
        answer: null,
        costUsd: 0,
        authorizedUsd: 0,
        latencyMs: 1,
      }),
    },
    budgetLimiter: limiter,
    onAdjudication: (r) => store.append(r),
    extraRoutes: createDashboardRoutes(store, limiter),
  });

  const srv = await listen(server);
  try {
    const home = await fetch(`${srv.url}/`);
    assert.equal(home.status, 200);
    assert.ok((await home.text()).includes("Epistemic Boundary"));

    const ledger = await fetch(`${srv.url}/ledger`);
    assert.equal(ledger.status, 200);
    assert.ok((await ledger.text()).includes("0xabc123"));

    const boardJson = (await (await fetch(`${srv.url}/api/scoreboard`)).json()) as {
      miners: Array<{ minerId: string; score: number; isPrimaryTrack01: boolean }>;
    };
    assert.equal(boardJson.miners[0].minerId, "incumbent-high");
    assert.equal(boardJson.miners[1].minerId, "primary-1");
    assert.equal(boardJson.miners[1].isPrimaryTrack01, true);

    const bug = await fetch(`${srv.url}/api/bug-report/rec-bug-1`);
    assert.equal(bug.status, 200);
    assert.ok((await bug.text()).includes("Discrepancy Report"));
  } finally {
    await srv.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
