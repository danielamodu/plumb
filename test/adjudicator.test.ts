import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adjudicateMiners, valuesAgree } from "../src/adjudicator/adjudicator.js";
import { LedgerStore, computeScoreboard } from "../src/adjudicator/store.js";
import type { AdjudicationRecord, MinerCallTrace } from "../src/types.js";

test("valuesAgree handles boolean exactness and numeric tolerance bands", () => {
  assert.equal(
    valuesAgree("SSL_VERIFICATION_CERT", { certificate_valid: true }, { certificate_valid: true }),
    true
  );
  assert.equal(
    valuesAgree("SSL_VERIFICATION_CERT", { certificate_valid: true }, { certificate_valid: false }),
    false
  );
  assert.equal(
    valuesAgree("CRYPTO_PRICE_USD", { price_usd: 3000 }, { price_usd: 3030 }),
    true
  );
  assert.equal(
    valuesAgree("CRYPTO_PRICE_USD", { price_usd: 3000 }, { price_usd: 3500 }),
    false
  );
  assert.equal(
    valuesAgree("WEATHER_CHECK_TEMPERATURE", { temperature_c: 28 }, { temperature_c: 29.5 }),
    true
  );
});

test("adjudicateMiners detects cross-miner disagreement, resolves against primary-source ground truth, and generates bug report markdown", () => {
  const calls: MinerCallTrace[] = [
    {
      minerId: "731006",
      minerName: "IncumbentScanner",
      isPrimaryTrack01: false,
      httpStatus: 200,
      latencyMs: 410,
      schemaValid: true,
      injectionFlagged: false,
      costUsd: 0.01,
      signalHash: "0xbad1",
      receiptHash: "0xrcpt1",
      parsedValue: { certificate_valid: true },
    },
    {
      minerId: "primary-1",
      minerName: "primary",
      isPrimaryTrack01: true,
      httpStatus: 200,
      latencyMs: 145,
      schemaValid: true,
      injectionFlagged: false,
      costUsd: 0.01,
      signalHash: "0xgood2",
      receiptHash: "0xrcpt2",
      parsedValue: { certificate_valid: false },
    },
  ];

  const result = adjudicateMiners(
    "SSL_VERIFICATION_CERT",
    { host: "expired.badssl.com" },
    calls,
    {
      sourceName: "live_node_tls_handshake",
      capturedAtUtc: "2026-11-23T13:00:00Z",
      referenceValue: { certificate_valid: false },
      toleranceBand: "exact_boolean",
    }
  );

  assert.equal(result.disagreementDetected, true);
  assert.equal(result.status, "DISAGREEMENT_RESOLVED");
  assert.deepEqual(result.finalValue, { certificate_valid: false });
  assert.deepEqual(result.groundTruthCheck?.matchedMinerIds, ["primary-1"]);
  assert.deepEqual(result.groundTruthCheck?.failedMinerIds, ["731006"]);
  assert.ok(result.bugReportMarkdown?.includes("731006"));
  assert.ok(result.bugReportMarkdown?.includes("0xbad1"));
  assert.ok(result.bugReportMarkdown?.includes("expired.badssl.com"));
});

test("computeScoreboard sorts strictly by measured score descending with ZERO pinned placement for primary", () => {
  const mkRec = (id: string, minerId: string, isPrimary: boolean, matched: boolean, latencyMs: number): AdjudicationRecord => ({
    id,
    timestamp: new Date().toISOString(),
    promptHash: id,
    promptPreview: "test",
    decision: { mode: "VERIFY", intent: "SSL_VERIFICATION_CERT", reason: "test", confidence: 1, classifierLatencyMs: 1 },
    status: "VERIFIED_OK",
    calls: [
      {
        minerId,
        minerName: minerId,
        isPrimaryTrack01: isPrimary,
        httpStatus: 200,
        latencyMs,
        schemaValid: true,
        injectionFlagged: false,
        costUsd: 0.01,
      },
    ],
    totalCostUsd: 0.01,
    totalLatencyMs: latencyMs,
    disagreementDetected: false,
    groundTruthCheck: {
      snapshot: { sourceName: "tls", capturedAtUtc: new Date().toISOString(), referenceValue: { certificate_valid: false }, toleranceBand: "exact" },
      matchedMinerIds: matched ? [minerId] : [],
      failedMinerIds: matched ? [] : [minerId],
    },
  });

  // Incumbent scores 100% (2/2), primary scores 50% (1/2) -> Incumbent MUST rank #1, primary MUST rank #2
  const records: AdjudicationRecord[] = [
    mkRec("1", "incumbent-A", false, true, 200),
    mkRec("2", "incumbent-A", false, true, 220),
    mkRec("3", "primary-1", true, true, 120),
    mkRec("4", "primary-1", true, false, 130),
  ];

  const board = computeScoreboard(records);
  assert.equal(board.length, 2);
  assert.equal(board[0].minerId, "incumbent-A");
  assert.equal(board[0].score, 1.0);
  assert.equal(board[1].minerId, "primary-1");
  assert.equal(board[1].score, 0.5);
  assert.equal(board[1].isPrimaryTrack01, true);
});

test("LedgerStore persists records to JSONL and reloads cleanly", () => {
  const dir = mkdtempSync(join(tmpdir(), "plumb-ledger-"));
  const file = join(dir, "ledger.jsonl");
  try {
    const store = new LedgerStore(file);
    store.append({
      id: "rec-1",
      timestamp: new Date().toISOString(),
      promptHash: "abc",
      promptPreview: "What is ETH price?",
      decision: { mode: "VERIFY", intent: "CRYPTO_PRICE_USD", reason: "live", confidence: 0.95, classifierLatencyMs: 0.5 },
      status: "VERIFIED_OK",
      calls: [],
      totalCostUsd: 0.01,
      totalLatencyMs: 320,
      disagreementDetected: false,
    });

    const reloaded = new LedgerStore(file);
    assert.equal(reloaded.list().length, 1);
    assert.equal(reloaded.get("rec-1")?.totalCostUsd, 0.01);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
