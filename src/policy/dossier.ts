import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { BudgetGate, SupportedIntent } from "../types.js";
import type { TelegraphAsker } from "../proxy/server.js";
import { sanitizeMinerAnswer } from "../security/sanitize.js";
import { BudgetExceededError } from "../budget/limiter.js";

export type PolicyVerdict = "ALLOW" | "HOLD" | "BLOCK";

export interface PayoutPolicy {
  policyId: string;
  maxPaymentUsdc: number;
  fxToleranceBps: number; // e.g., 150 = +/- 1.50%
  minDomainAgeDays: number;
  requireTlsValid: boolean;
  requireUrlSafe: boolean;
  requireDnsMx: boolean;
  requireFxCheck: boolean;
  failClosedOnMinerError: boolean;
}

export const DEFAULT_PAYOUT_POLICY: PayoutPolicy = {
  policyId: "solana-eur-usdc-treasury-v1",
  maxPaymentUsdc: 25_000,
  fxToleranceBps: 150,
  minDomainAgeDays: 30,
  requireTlsValid: true,
  requireUrlSafe: true,
  requireDnsMx: true,
  requireFxCheck: true,
  failClosedOnMinerError: true,
};

export interface PayoutInvoice {
  invoiceId: string;
  vendorName: string;
  counterpartyHost: string;
  paymentPortalUrl: string;
  recipientPubkey: string;
  invoiceAmountEur: number;
  requestedUsdcAmount: number;
}

export interface DossierCheck {
  checkName: string;
  provenance: "telegraph:escrow" | "non-telegraph:rdap" | "policy:local";
  intent?: SupportedIntent;
  status: "PASS" | "FAIL" | "UNAVAILABLE";
  summary: string;
  minerId?: string;
  minerName?: string;
  receiptHash?: string;
  signalHash?: string;
  costUsd: number;
  latencyMs: number;
  parsedValue?: unknown;
}

export interface FxAuditSummary {
  invoiceAmountEur: number;
  requestedUsdcAmount: number;
  telegraphEurUsdRate: number;
  expectedUsdcAmount: number;
  deviationBps: number;
  toleranceBps: number;
  withinTolerance: boolean;
}

export interface PayoutDossier {
  version: "1";
  id: string;
  createdAtUtc: string;
  policy: PayoutPolicy;
  invoice: PayoutInvoice;
  verdict: PolicyVerdict;
  triggeredRules: string[];
  reason: string;
  checks: DossierCheck[];
  fxAudit?: FxAuditSummary;
  totalTelegraphCostUsd: number;
  totalLatencyMs: number;
  dossierHash: string;
  solanaSignature?: string;
  solanaExplorerUrl?: string;
}

export interface RdapResult {
  ageDays: number | null;
  registeredAtIso?: string;
  sourceUrl?: string;
  error?: string;
}

function canonicalValue(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(canonicalValue);
  const obj = v as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    if (obj[k] !== undefined) sorted[k] = canonicalValue(obj[k]);
  }
  return sorted;
}

export function computeDossierHash(
  dossierWithoutSig: Omit<PayoutDossier, "dossierHash" | "solanaSignature" | "solanaExplorerUrl">
): string {
  const canonical = JSON.stringify(canonicalValue(dossierWithoutSig));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function verifyDossierHash(dossier: PayoutDossier): boolean {
  const { dossierHash, solanaSignature: _s, solanaExplorerUrl: _u, ...core } = dossier;
  return computeDossierHash(core) === dossierHash;
}

function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

export async function lookupRdapDomainAge(host: string): Promise<RdapResult> {
  const domain = registrableDomain(host);
  const sourceUrl = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
  try {
    const r = await fetch(sourceUrl, {
      headers: { Accept: "application/rdap+json, application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) {
      return { ageDays: null, sourceUrl, error: `RDAP HTTP ${r.status}` };
    }
    const data = (await r.json()) as {
      events?: Array<{ eventAction?: string; eventDate?: string }>;
    };
    const regEvent = (data.events ?? []).find(
      (e) => e.eventAction === "registration" && typeof e.eventDate === "string"
    );
    if (!regEvent?.eventDate) {
      return { ageDays: null, sourceUrl, error: "No registration event in RDAP" };
    }
    const regMs = Date.parse(regEvent.eventDate);
    if (!Number.isFinite(regMs)) {
      return { ageDays: null, sourceUrl, error: "Unparseable RDAP registration date" };
    }
    const ageDays = Math.max(0, Math.floor((Date.now() - regMs) / 86_400_000));
    return { ageDays, registeredAtIso: regEvent.eventDate, sourceUrl };
  } catch (err) {
    return {
      ageDays: null,
      sourceUrl,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function evaluatePayoutDossier(
  invoice: PayoutInvoice,
  policy: PayoutPolicy,
  deps: {
    telegraphClient: TelegraphAsker;
    budgetLimiter: BudgetGate;
    lookupRdapAgeDays?: (host: string) => Promise<RdapResult>;
  }
): Promise<PayoutDossier> {
  const startedMs = Date.now();
  const id = randomUUID();
  const createdAtUtc = new Date().toISOString();
  const checks: DossierCheck[] = [];
  const blockRules: string[] = [];
  const holdRules: string[] = [];
  let fxAudit: FxAuditSummary | undefined;
  let totalTelegraphCostUsd = 0;

  // 1. Local payment cap policy check (zero Telegraph spend if already over cap)
  if (invoice.requestedUsdcAmount > policy.maxPaymentUsdc) {
    blockRules.push("PAYMENT_CAP_EXCEEDED");
    checks.push({
      checkName: "payment_cap_policy",
      provenance: "policy:local",
      status: "FAIL",
      summary: `Requested $${invoice.requestedUsdcAmount} USDC exceeds policy cap $${policy.maxPaymentUsdc} USDC`,
      costUsd: 0,
      latencyMs: 0,
      parsedValue: {
        requestedUsdcAmount: invoice.requestedUsdcAmount,
        maxPaymentUsdc: policy.maxPaymentUsdc,
      },
    });
    const core = {
      version: "1" as const,
      id,
      createdAtUtc,
      policy,
      invoice,
      verdict: "BLOCK" as const,
      triggeredRules: blockRules,
      reason: `BLOCKED by policy: requested $${invoice.requestedUsdcAmount} exceeds maxPaymentUsdc $${policy.maxPaymentUsdc}`,
      checks,
      totalTelegraphCostUsd: 0,
      totalLatencyMs: Date.now() - startedMs,
    };
    return { ...core, dossierHash: computeDossierHash(core) };
  }

  checks.push({
    checkName: "payment_cap_policy",
    provenance: "policy:local",
    status: "PASS",
    summary: `Requested $${invoice.requestedUsdcAmount} USDC within $${policy.maxPaymentUsdc} cap`,
    costUsd: 0,
    latencyMs: 0,
  });

  // 2. Determine required Telegraph checks & reserve atomic budget
  const telegraphTasks: Array<{
    checkName: string;
    intent: SupportedIntent;
    params: Record<string, unknown>;
  }> = [];
  if (policy.requireTlsValid) {
    telegraphTasks.push({
      checkName: "counterparty_tls_cert",
      intent: "SSL_VERIFICATION_CERT",
      params: { host: invoice.counterpartyHost },
    });
  }
  if (policy.requireUrlSafe) {
    telegraphTasks.push({
      checkName: "payment_portal_url_scan",
      intent: "URL_SCAN_VERDICT",
      params: { url: invoice.paymentPortalUrl },
    });
  }
  if (policy.requireDnsMx) {
    telegraphTasks.push({
      checkName: "counterparty_dns_mx",
      intent: "DNS_RECORD_LOOKUP_GENERAL",
      params: { name: invoice.counterpartyHost, record_type: "MX" },
    });
  }
  if (policy.requireFxCheck) {
    telegraphTasks.push({
      checkName: "eur_usd_fx_sanity",
      intent: "FX_NOW_EUR",
      params: { currency: "USD" },
    });
  }

  let reservationId: string | null = null;
  try {
    const res = await deps.budgetLimiter.reserve(0.01 * telegraphTasks.length);
    reservationId = res.id;
  } catch (err) {
    holdRules.push("TELEGRAPH_BUDGET_EXCEEDED");
    const msg = err instanceof BudgetExceededError ? err.message : "Budget exceeded";
    checks.push({
      checkName: "telegraph_budget_gate",
      provenance: "policy:local",
      status: "UNAVAILABLE",
      summary: msg,
      costUsd: 0,
      latencyMs: 0,
    });
    const core = {
      version: "1" as const,
      id,
      createdAtUtc,
      policy,
      invoice,
      verdict: "HOLD" as const,
      triggeredRules: holdRules,
      reason: `HOLD (fail-closed): ${msg}`,
      checks,
      totalTelegraphCostUsd: 0,
      totalLatencyMs: Date.now() - startedMs,
    };
    return { ...core, dossierHash: computeDossierHash(core) };
  }

  // 3. Execute Telegraph checks + non-Telegraph RDAP primary-source lookup in parallel
  const rdapFn = deps.lookupRdapAgeDays ?? lookupRdapDomainAge;
  const rdapT0 = Date.now();
  const [telegraphResults, rdap] = await Promise.all([
    Promise.all(
      telegraphTasks.map(async (t) => ({
        task: t,
        res: await deps.telegraphClient.ask({ intent: t.intent, params: t.params }),
      }))
    ),
    rdapFn(invoice.counterpartyHost),
  ]);
  const rdapLatency = Date.now() - rdapT0;

  for (const { task, res } of telegraphResults) {
    const billed = res.ok ? res.costUsd : 0;
    totalTelegraphCostUsd = Number((totalTelegraphCostUsd + billed).toFixed(6));
    const sanitized = res.ok
      ? sanitizeMinerAnswer(task.intent, res.answer)
      : { valid: false, injectionDetected: false, rejectionReason: res.errorMessage };

    if (sanitized.injectionDetected) {
      blockRules.push("PROMPT_INJECTION_QUARANTINED");
      checks.push({
        checkName: task.checkName,
        provenance: "telegraph:escrow",
        intent: task.intent,
        status: "FAIL",
        summary: `Prompt injection quarantined: ${sanitized.rejectionReason}`,
        minerId: res.minerId,
        minerName: res.minerName,
        receiptHash: res.receiptHash,
        signalHash: res.signalHash,
        costUsd: billed,
        latencyMs: res.latencyMs,
      });
      continue;
    }

    if (!res.ok || !sanitized.valid || !sanitized.data) {
      holdRules.push("MINER_UNAVAILABLE");
      checks.push({
        checkName: task.checkName,
        provenance: "telegraph:escrow",
        intent: task.intent,
        status: "UNAVAILABLE",
        summary: sanitized.rejectionReason ?? res.errorMessage ?? `HTTP ${res.httpStatus}`,
        minerId: res.minerId,
        minerName: res.minerName,
        receiptHash: res.receiptHash,
        signalHash: res.signalHash,
        costUsd: billed,
        latencyMs: res.latencyMs,
      });
      continue;
    }

    if (task.intent === "SSL_VERIFICATION_CERT") {
      const valid = sanitized.data.certificate_valid === true;
      if (!valid) blockRules.push("TLS_INVALID");
      checks.push({
        checkName: task.checkName,
        provenance: "telegraph:escrow",
        intent: task.intent,
        status: valid ? "PASS" : "FAIL",
        summary: valid
          ? `Live TLS certificate valid for ${invoice.counterpartyHost}`
          : `Live TLS certificate INVALID for ${invoice.counterpartyHost}`,
        minerId: res.minerId,
        minerName: res.minerName,
        receiptHash: res.receiptHash,
        signalHash: res.signalHash,
        costUsd: billed,
        latencyMs: res.latencyMs,
        parsedValue: sanitized.data,
      });
    } else if (task.intent === "URL_SCAN_VERDICT") {
      const safe = sanitized.data.safe === true;
      if (!safe) blockRules.push("URL_UNSAFE");
      checks.push({
        checkName: task.checkName,
        provenance: "telegraph:escrow",
        intent: task.intent,
        status: safe ? "PASS" : "FAIL",
        summary: safe
          ? `Payment portal URL verified safe`
          : `Payment portal URL flagged UNSAFE / phishing`,
        minerId: res.minerId,
        minerName: res.minerName,
        receiptHash: res.receiptHash,
        signalHash: res.signalHash,
        costUsd: billed,
        latencyMs: res.latencyMs,
        parsedValue: sanitized.data,
      });
    } else if (task.intent === "DNS_RECORD_LOOKUP_GENERAL") {
      const hasRec = sanitized.data.has_record === true;
      if (!hasRec) holdRules.push("DNS_MX_MISSING");
      checks.push({
        checkName: task.checkName,
        provenance: "telegraph:escrow",
        intent: task.intent,
        status: hasRec ? "PASS" : "FAIL",
        summary: hasRec
          ? `Counterparty domain has valid MX record`
          : `Counterparty domain missing MX record`,
        minerId: res.minerId,
        minerName: res.minerName,
        receiptHash: res.receiptHash,
        signalHash: res.signalHash,
        costUsd: billed,
        latencyMs: res.latencyMs,
        parsedValue: sanitized.data,
      });
    } else if (task.intent === "FX_NOW_EUR") {
      const rate = Number(sanitized.data.rate);
      const expectedUsdc = Number((invoice.invoiceAmountEur * rate).toFixed(4));
      const deviationBps =
        expectedUsdc > 0
          ? Math.round((Math.abs(invoice.requestedUsdcAmount - expectedUsdc) / expectedUsdc) * 10_000)
          : 10_000;
      const withinTolerance = deviationBps <= policy.fxToleranceBps;
      fxAudit = {
        invoiceAmountEur: invoice.invoiceAmountEur,
        requestedUsdcAmount: invoice.requestedUsdcAmount,
        telegraphEurUsdRate: rate,
        expectedUsdcAmount: expectedUsdc,
        deviationBps,
        toleranceBps: policy.fxToleranceBps,
        withinTolerance,
      };
      if (!withinTolerance) blockRules.push("FX_DEVIATION_EXCEEDED");
      checks.push({
        checkName: task.checkName,
        provenance: "telegraph:escrow",
        intent: task.intent,
        status: withinTolerance ? "PASS" : "FAIL",
        summary: withinTolerance
          ? `EUR->USDC amount within ${deviationBps} bps (limit ${policy.fxToleranceBps} bps, rate=${rate})`
          : `EUR->USDC amount deviates by ${deviationBps} bps (limit ${policy.fxToleranceBps} bps, expected $${expectedUsdc})`,
        minerId: res.minerId,
        minerName: res.minerName,
        receiptHash: res.receiptHash,
        signalHash: res.signalHash,
        costUsd: billed,
        latencyMs: res.latencyMs,
        parsedValue: fxAudit,
      });
    }
  }

  // 4. Primary-source RDAP domain age check (explicitly labeled non-telegraph:rdap)
  if (rdap.ageDays !== null) {
    const oldEnough = rdap.ageDays >= policy.minDomainAgeDays;
    if (!oldEnough) blockRules.push("DOMAIN_TOO_NEW");
    checks.push({
      checkName: "rdap_domain_age",
      provenance: "non-telegraph:rdap",
      status: oldEnough ? "PASS" : "FAIL",
      summary: oldEnough
        ? `Domain age ${rdap.ageDays} days (>= ${policy.minDomainAgeDays}d policy minimum)`
        : `Domain newly registered (${rdap.ageDays}d < ${policy.minDomainAgeDays}d policy minimum)`,
      costUsd: 0,
      latencyMs: rdapLatency,
      parsedValue: rdap,
    });
  } else {
    checks.push({
      checkName: "rdap_domain_age",
      provenance: "non-telegraph:rdap",
      status: "UNAVAILABLE",
      summary: `RDAP unavailable (${rdap.error ?? "unknown"}) — recorded as advisory non-Telegraph check`,
      costUsd: 0,
      latencyMs: rdapLatency,
      parsedValue: rdap,
    });
  }

  if (reservationId) {
    if (totalTelegraphCostUsd > 0) {
      await deps.budgetLimiter.settle(reservationId, totalTelegraphCostUsd);
    } else {
      await deps.budgetLimiter.release(reservationId);
    }
  }

  const triggeredRules = Array.from(new Set([...blockRules, ...holdRules]));
  let verdict: PolicyVerdict = "ALLOW";
  let reason = `All ${checks.filter((c) => c.status === "PASS").length} checks PASSED under policy ${policy.policyId}; eligible for 2-of-2 Solana co-signature`;

  if (blockRules.length > 0) {
    verdict = "BLOCK";
    reason = `BLOCKED by policy (${blockRules.join(", ")}): co-signature permanently refused`;
  } else if (holdRules.length > 0 && policy.failClosedOnMinerError) {
    verdict = "HOLD";
    reason = `HELD fail-closed (${holdRules.join(", ")}): co-signature withheld until verified`;
  }

  const core = {
    version: "1" as const,
    id,
    createdAtUtc,
    policy,
    invoice,
    verdict,
    triggeredRules,
    reason,
    checks,
    ...(fxAudit ? { fxAudit } : {}),
    totalTelegraphCostUsd,
    totalLatencyMs: Date.now() - startedMs,
  };

  return {
    ...core,
    dossierHash: computeDossierHash(core),
  };
}

export class DossierStore {
  private readonly filePath: string;
  private readonly dossiers: PayoutDossier[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const lines = readFileSync(this.filePath, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0);
      for (const line of lines) {
        try {
          this.dossiers.push(JSON.parse(line) as PayoutDossier);
        } catch {
          // ignore malformed line
        }
      }
    } catch {
      // ignore startup read error
    }
  }

  private rewriteAll(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      this.filePath,
      this.dossiers.map((d) => JSON.stringify(d)).join("\n") + (this.dossiers.length ? "\n" : ""),
      "utf8"
    );
  }

  save(dossier: PayoutDossier): void {
    this.dossiers.push(dossier);
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(this.filePath, `${JSON.stringify(dossier)}\n`, "utf8");
  }

  attachSolanaSignature(dossierId: string, signature: string): PayoutDossier | null {
    const found = this.dossiers.find((d) => d.id === dossierId);
    if (!found) return null;
    found.solanaSignature = signature;
    found.solanaExplorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
    this.rewriteAll();
    return found;
  }

  list(limit = 50): PayoutDossier[] {
    return this.dossiers.slice(-limit).reverse();
  }

  getById(id: string): PayoutDossier | undefined {
    return this.dossiers.find((d) => d.id === id);
  }

  getByHash(hash: string): PayoutDossier | undefined {
    return this.dossiers.find((d) => d.dossierHash === hash);
  }

  getBySolanaSignature(sig: string): PayoutDossier | undefined {
    return this.dossiers.find((d) => d.solanaSignature === sig);
  }
}
