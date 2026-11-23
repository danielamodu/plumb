import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";
import {
  buildCosignedMemoTransaction,
  cosignPayoutDossier,
  extractMemoDossierHash,
  MEMO_PROGRAM_ID,
  verifySolanaPayout,
} from "../src/solana/cosigner.js";
import {
  computeDossierHash,
  DEFAULT_PAYOUT_POLICY,
  DossierStore,
  type PayoutDossier,
} from "../src/policy/dossier.js";

function makeSampleDossier(verdict: "ALLOW" | "HOLD" | "BLOCK"): PayoutDossier {
  const core = {
    version: "1" as const,
    id: "dos-test-1",
    createdAtUtc: "2026-11-23T16:00:00.000Z",
    policy: DEFAULT_PAYOUT_POLICY,
    invoice: {
      invoiceId: "INV-EU-2026-999",
      vendorName: "Nordic Cloud GmbH",
      counterpartyHost: "github.com",
      paymentPortalUrl: "https://github.com/billing",
      recipientPubkey: "8wC9tU2wJ6Y8xez9bFMHuFu33VQQK3WZ5MpyQxikYu2g",
      invoiceAmountEur: 1000,
      requestedUsdcAmount: 1100,
    },
    verdict,
    triggeredRules: verdict === "ALLOW" ? [] : ["TLS_INVALID"],
    reason: verdict === "ALLOW" ? "All checks passed" : "Blocked",
    checks: [
      {
        checkName: "counterparty_tls_cert",
        provenance: "telegraph:escrow" as const,
        intent: "SSL_VERIFICATION_CERT" as const,
        status: verdict === "ALLOW" ? ("PASS" as const) : ("FAIL" as const),
        summary: "TLS check",
        minerId: "6184",
        receiptHash: "0xsepolia_receipt_abc",
        signalHash: "0xsepolia_sig_def",
        costUsd: 0.01,
        latencyMs: 120,
      },
    ],
    totalTelegraphCostUsd: 0.01,
    totalLatencyMs: 150,
  };
  return { ...core, dossierHash: computeDossierHash(core) };
}

test("cosignPayoutDossier REFUSES to co-sign when verdict is HOLD or BLOCK (missing co-signature)", async () => {
  const agent = await Keypair.generate();
  const cosigner = await Keypair.generate();
  const blocked = makeSampleDossier("BLOCK");
  const held = makeSampleDossier("HOLD");

  for (const d of [blocked, held]) {
    const res = await cosignPayoutDossier(d, {
      agentKeypair: agent,
      cosignerKeypair: cosigner,
      amountSol: 0.001,
      broadcastTx: async () => {
        throw new Error("MUST NOT BROADCAST when not ALLOW");
      },
    });
    assert.equal(res.broadcast, false);
    assert.equal(res.signedByCosigner, false);
    assert.equal(res.missingCosignature, true);
    assert.equal(res.solanaSignature, null);
  }
});

test("buildCosignedMemoTransaction requires BOTH agent and plumb co-signer signatures and embeds plumb:v1:<dossierHash> Memo", async () => {
  const agent = await Keypair.generate();
  const cosigner = await Keypair.generate();
  const recipient = await Keypair.generate();
  const allowed = makeSampleDossier("ALLOW");

  const { transaction, memoText } = buildCosignedMemoTransaction({
    agentPubkey: agent.publicKey,
    cosignerPubkey: cosigner.publicKey,
    recipientPubkey: recipient.publicKey,
    lamports: 1_000_000,
    dossierHash: allowed.dossierHash,
    recentBlockhash: "11111111111111111111111111111111",
  });

  assert.equal(memoText, `plumb:v1:${allowed.dossierHash}`);
  assert.equal(transaction.instructions.length, 2);
  const memoIx = transaction.instructions[1];
  assert.equal(memoIx.programId.toBase58(), MEMO_PROGRAM_ID.toBase58());
  assert.equal(Buffer.from(memoIx.data).toString("utf8"), memoText);
  // Both cosigner and agent are required signers on the Memo instruction
  const signerKeys = memoIx.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58());
  assert.ok(signerKeys.includes(cosigner.publicKey.toBase58()));
  assert.ok(signerKeys.includes(agent.publicKey.toBase58()));
});

test("verifySolanaPayout extracts Memo hash from on-chain logs, matches DossierStore, and verifies canonical SHA-256", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plumb-u2-verify-"));
  try {
    const store = new DossierStore(join(dir, "dossiers.jsonl"));
    const allowed = makeSampleDossier("ALLOW");
    store.save(allowed);
    store.attachSolanaSignature(allowed.id, "5MockSolanaTxSigXYZ");

    const extracted = extractMemoDossierHash([
      "Program MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr invoke [1]",
      `Program log: Memo (len 73): "plumb:v1:${allowed.dossierHash}"`,
      "Program MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr success",
    ]);
    assert.equal(extracted, allowed.dossierHash);

    const verification = await verifySolanaPayout("5MockSolanaTxSigXYZ", store, {
      expectedCosignerPubkey: "CosignerPubkey111",
      fetchOnChainTx: async () => ({
        slot: 345678901,
        blockTime: 1795450000,
        logMessages: [
          `Program log: Memo (len 73): "plumb:v1:${allowed.dossierHash}"`,
        ],
        signerPubkeys: ["AgentPubkey111", "CosignerPubkey111"],
      }),
    });

    assert.equal(verification.verified, true);
    assert.equal(verification.onChainMemoHash, allowed.dossierHash);
    assert.equal(verification.canonicalHashValid, true);
    assert.equal(verification.cosignerSignaturePresent, true);
    assert.equal(verification.telegraphReceiptHashes[0], "0xsepolia_receipt_abc");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
