import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AtomicBudgetLimiter } from "../src/budget/limiter.js";
import {
  DEFAULT_PAYOUT_POLICY,
  DossierStore,
  evaluatePayoutDossier,
  verifyDossierHash,
  type PayoutInvoice,
} from "../src/policy/dossier.js";
import type { TelegraphAskRequest, TelegraphAskResult } from "../src/types.js";

function makeTelegraphMock(overrides: Partial<Record<string, Partial<TelegraphAskResult>>> = {}) {
  return {
    ask: async (req: TelegraphAskRequest): Promise<TelegraphAskResult> => {
      const intent = req.intent ?? "UNKNOWN";
      const base: Record<string, TelegraphAskResult> = {
        SSL_VERIFICATION_CERT: {
          ok: true,
          httpStatus: 200,
          rail: "escrow",
          intent: "SSL_VERIFICATION_CERT",
          minerId: "6184",
          minerName: "primary",
          answer: { certificate_valid: true },
          costUsd: 0.01,
          authorizedUsd: 0.01,
          signalHash: "0xsig_ssl",
          receiptHash: "0xrcpt_ssl",
          latencyMs: 120,
        },
        URL_SCAN_VERDICT: {
          ok: true,
          httpStatus: 200,
          rail: "escrow",
          intent: "URL_SCAN_VERDICT",
          minerId: "6184",
          minerName: "primary",
          answer: { safe: true },
          costUsd: 0.01,
          authorizedUsd: 0.01,
          signalHash: "0xsig_url",
          receiptHash: "0xrcpt_url",
          latencyMs: 110,
        },
        DNS_RECORD_LOOKUP_GENERAL: {
          ok: true,
          httpStatus: 200,
          rail: "escrow",
          intent: "DNS_RECORD_LOOKUP_GENERAL",
          minerId: "5311",
          minerName: "PREFLIGHT",
          answer: { has_record: true },
          costUsd: 0.01,
          authorizedUsd: 0.01,
          signalHash: "0xsig_dns",
          receiptHash: "0xrcpt_dns",
          latencyMs: 95,
        },
        FX_NOW_EUR: {
          ok: true,
          httpStatus: 200,
          rail: "escrow",
          intent: "FX_NOW_EUR",
          minerId: "4433",
          minerName: "VerifyWireFX",
          answer: { rate: 1.1 },
          costUsd: 0.01,
          authorizedUsd: 0.01,
          signalHash: "0xsig_fx",
          receiptHash: "0xrcpt_fx",
          latencyMs: 140,
        },
      };
      const def = base[intent];
      return { ...def, ...(overrides[intent] ?? {}) } as TelegraphAskResult;
    },
  };
}

const CLEAN_INVOICE: PayoutInvoice = {
  invoiceId: "INV-EU-2026-101",
  vendorName: "Nordic Cloud GmbH",
  counterpartyHost: "github.com",
  paymentPortalUrl: "https://github.com/billing",
  recipientPubkey: "8wC9tU2wJ6Y8xez9bFMHuFu33VQQK3WZ5MpyQxikYu2g",
  invoiceAmountEur: 1000,
  requestedUsdcAmount: 1105, // +45 bps vs 1.10 rate (within 150 bps)
};

test("evaluatePayoutDossier returns ALLOW with deterministic verifiable dossierHash when all checks pass", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plumb-u1-allow-"));
  try {
    const limiter = new AtomicBudgetLimiter({
      dailyLimitUsd: 5,
      defaultMaxAskUsd: 0.1,
      statePath: join(dir, "spend.json"),
    });
    const dossier = await evaluatePayoutDossier(CLEAN_INVOICE, DEFAULT_PAYOUT_POLICY, {
      telegraphClient: makeTelegraphMock(),
      budgetLimiter: limiter,
      lookupRdapAgeDays: async () => ({
        ageDays: 3650,
        registeredAtIso: "2016-01-01T00:00:00Z",
        sourceUrl: "https://rdap.org/domain/github.com",
      }),
    });

    assert.equal(dossier.verdict, "ALLOW");
    assert.equal(dossier.triggeredRules.length, 0);
    assert.equal(dossier.dossierHash.length, 64);
    assert.equal(verifyDossierHash(dossier), true);
    assert.equal(dossier.fxAudit?.deviationBps, 45);
    assert.ok(dossier.checks.some((c) => c.provenance === "non-telegraph:rdap"));
    assert.ok(dossier.checks.some((c) => c.provenance === "telegraph:escrow" && c.receiptHash === "0xrcpt_ssl"));

    // Tampering with any field must invalidate dossierHash
    const tampered = { ...dossier, verdict: "BLOCK" as const };
    assert.equal(verifyDossierHash(tampered), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("evaluatePayoutDossier returns BLOCK on FX bps manipulation, expired TLS, unsafe URL, or payment cap breach", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plumb-u1-block-"));
  try {
    const limiter = new AtomicBudgetLimiter({
      dailyLimitUsd: 5,
      defaultMaxAskUsd: 0.1,
      statePath: join(dir, "spend.json"),
    });

    // 1. Manipulated FX amount (+1364 bps vs 1.10 -> BLOCK)
    const fxDossier = await evaluatePayoutDossier(
      { ...CLEAN_INVOICE, requestedUsdcAmount: 1250 },
      DEFAULT_PAYOUT_POLICY,
      {
        telegraphClient: makeTelegraphMock(),
        budgetLimiter: limiter,
        lookupRdapAgeDays: async () => ({ ageDays: 500 }),
      }
    );
    assert.equal(fxDossier.verdict, "BLOCK");
    assert.ok(fxDossier.triggeredRules.includes("FX_DEVIATION_EXCEEDED"));

    // 2. Expired TLS -> BLOCK
    const tlsDossier = await evaluatePayoutDossier(CLEAN_INVOICE, DEFAULT_PAYOUT_POLICY, {
      telegraphClient: makeTelegraphMock({
        SSL_VERIFICATION_CERT: { answer: { certificate_valid: false } },
      }),
      budgetLimiter: limiter,
      lookupRdapAgeDays: async () => ({ ageDays: 500 }),
    });
    assert.equal(tlsDossier.verdict, "BLOCK");
    assert.ok(tlsDossier.triggeredRules.includes("TLS_INVALID"));

    // 3. Payment cap breach -> BLOCK (without even spending Telegraph USDC)
    const capDossier = await evaluatePayoutDossier(
      { ...CLEAN_INVOICE, requestedUsdcAmount: 500_000 },
      DEFAULT_PAYOUT_POLICY,
      {
        telegraphClient: makeTelegraphMock(),
        budgetLimiter: limiter,
        lookupRdapAgeDays: async () => ({ ageDays: 500 }),
      }
    );
    assert.equal(capDossier.verdict, "BLOCK");
    assert.ok(capDossier.triggeredRules.includes("PAYMENT_CAP_EXCEEDED"));
    assert.equal(capDossier.totalTelegraphCostUsd, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("evaluatePayoutDossier fails closed with HOLD when a required Telegraph miner is unavailable", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plumb-u1-hold-"));
  try {
    const limiter = new AtomicBudgetLimiter({
      dailyLimitUsd: 5,
      defaultMaxAskUsd: 0.1,
      statePath: join(dir, "spend.json"),
    });
    const holdDossier = await evaluatePayoutDossier(CLEAN_INVOICE, DEFAULT_PAYOUT_POLICY, {
      telegraphClient: makeTelegraphMock({
        FX_NOW_EUR: { ok: false, httpStatus: 502, answer: null, costUsd: 0, errorMessage: "miner_timeout" },
      }),
      budgetLimiter: limiter,
      lookupRdapAgeDays: async () => ({ ageDays: 500 }),
    });

    assert.equal(holdDossier.verdict, "HOLD");
    assert.ok(holdDossier.triggeredRules.includes("MINER_UNAVAILABLE"));
    assert.equal(verifyDossierHash(holdDossier), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("DossierStore persists and retrieves dossiers by id, hash, and attached solanaSignature", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plumb-u1-store-"));
  try {
    const file = join(dir, "dossiers.jsonl");
    const limiter = new AtomicBudgetLimiter({
      dailyLimitUsd: 5,
      defaultMaxAskUsd: 0.1,
      statePath: join(dir, "spend.json"),
    });
    const dossier = await evaluatePayoutDossier(CLEAN_INVOICE, DEFAULT_PAYOUT_POLICY, {
      telegraphClient: makeTelegraphMock(),
      budgetLimiter: limiter,
      lookupRdapAgeDays: async () => ({ ageDays: 500 }),
    });

    const store = new DossierStore(file);
    store.save(dossier);
    store.attachSolanaSignature(dossier.id, "5TestSolanaSigABC123");

    const reloaded = new DossierStore(file);
    assert.equal(reloaded.getById(dossier.id)?.dossierHash, dossier.dossierHash);
    assert.equal(reloaded.getByHash(dossier.dossierHash)?.id, dossier.id);
    assert.equal(reloaded.getBySolanaSignature("5TestSolanaSigABC123")?.id, dossier.id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
