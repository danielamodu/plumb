import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AtomicBudgetLimiter } from "../src/budget/limiter.js";
import { evaluateInvoiceSettlement } from "../src/solana/settlement-gate.js";
import type { TelegraphAskResult } from "../src/types.js";

test("plumb_verified HOLDS Solana settlement when Telegraph SSL_VERIFICATION_CERT returns certificate_valid: false", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plumb-sol-"));
  let broadcastCalled = false;
  try {
    const limiter = new AtomicBudgetLimiter({
      dailyLimitUsd: 1,
      defaultMaxAskUsd: 0.05,
      statePath: join(dir, "spend.json"),
    });
    const res = await evaluateInvoiceSettlement(
      {
        invoiceId: "INV-2026-001",
        counterpartyHost: "expired.badssl.com",
        recipientPubkey: "11111111111111111111111111111111",
        amountSol: 0.001,
        mode: "plumb_verified",
      },
      {
        budgetLimiter: limiter,
        senderPubkey: "SenderPubkeyMock",
        askFrontierLlm: async () => "APPROVE",
        broadcaster: async () => {
          broadcastCalled = true;
          return { signature: "FAKE_SIG", senderPubkey: "SenderPubkeyMock" };
        },
        telegraphClient: {
          ask: async (): Promise<TelegraphAskResult> => ({
            ok: true,
            httpStatus: 200,
            rail: "escrow",
            intent: "SSL_VERIFICATION_CERT",
            minerId: "6184",
            minerName: "primary",
            answer: { certificate_valid: false },
            costUsd: 0.01,
            authorizedUsd: 0.01,
            receiptHash: "0xdeadbeef",
            latencyMs: 120,
          }),
        },
      }
    );

    assert.equal(res.decision, "HELD_BLOCKED");
    assert.equal(broadcastCalled, false);
    assert.equal(res.solanaSignature, null);
    assert.equal(res.telegraphCostUsd, 0.01);
    assert.equal(res.telegraphReceipts[0]?.receiptHash, "0xdeadbeef");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plumb_verified AUTHORIZES and broadcasts Solana settlement when Telegraph checks pass", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plumb-sol-ok-"));
  try {
    const limiter = new AtomicBudgetLimiter({
      dailyLimitUsd: 1,
      defaultMaxAskUsd: 0.05,
      statePath: join(dir, "spend.json"),
    });
    const res = await evaluateInvoiceSettlement(
      {
        invoiceId: "INV-2026-002",
        counterpartyHost: "github.com",
        recipientPubkey: "11111111111111111111111111111111",
        amountSol: 0.001,
        mode: "plumb_verified",
      },
      {
        budgetLimiter: limiter,
        senderPubkey: "SenderPubkeyMock",
        askFrontierLlm: async () => "APPROVE",
        broadcaster: async () => ({
          signature: "5SolDevnetSigExample",
          senderPubkey: "SenderPubkeyMock",
        }),
        telegraphClient: {
          ask: async (): Promise<TelegraphAskResult> => ({
            ok: true,
            httpStatus: 200,
            rail: "escrow",
            intent: "SSL_VERIFICATION_CERT",
            minerId: "6184",
            minerName: "primary",
            answer: { certificate_valid: true },
            costUsd: 0.01,
            authorizedUsd: 0.01,
            receiptHash: "0xclean123",
            latencyMs: 110,
          }),
        },
      }
    );

    assert.equal(res.decision, "AUTHORIZED_AND_BROADCAST");
    assert.equal(res.solanaSignature, "5SolDevnetSigExample");
    assert.ok(res.solanaExplorerUrl?.includes("cluster=devnet"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
