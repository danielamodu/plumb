import type { IncomingMessage, ServerResponse } from "node:http";
import type { Keypair } from "@solana/web3.js";
import type { BudgetGate } from "../types.js";
import type { TelegraphAsker } from "../proxy/server.js";
import {
  DEFAULT_PAYOUT_POLICY,
  evaluatePayoutDossier,
  verifyDossierHash,
  type DossierStore,
  type PayoutDossier,
  type PayoutInvoice,
  type PayoutPolicy,
} from "../policy/dossier.js";
import { cosignPayoutDossier, verifySolanaPayout } from "../solana/cosigner.js";

function esc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pageShell(title: string, active: "payout" | "dossier" | "verify", bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} — plumb Policy Co-Signer</title>
  <style>
    :root { --bg:#090d14; --card:#111827; --border:#1f2937; --fg:#f3f4f6; --muted:#9ca3af; --accent:#38bdf8; --ok:#22c55e; --warn:#f59e0b; --bad:#ef4444; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--fg); line-height:1.5; }
    header { border-bottom:1px solid var(--border); padding:14px 24px; display:flex; align-items:center; justify-content:space-between; background:#0d1320; }
    .brand { font-weight:700; font-size:18px; color:#fff; text-decoration:none; }
    .brand span { color:var(--accent); }
    nav a { color:var(--muted); text-decoration:none; margin-left:18px; font-size:14px; font-weight:500; }
    nav a.active, nav a:hover { color:#fff; }
    main { max-width:1100px; margin:28px auto; padding:0 20px 60px; }
    .card { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:18px 20px; margin-bottom:16px; }
    .banner { padding:16px 20px; border-radius:10px; margin-bottom:18px; border:1px solid; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
    .banner.ALLOW { background:rgba(34,197,94,.12); border-color:rgba(34,197,94,.45); }
    .banner.HOLD { background:rgba(245,158,11,.12); border-color:rgba(245,158,11,.45); }
    .banner.BLOCK { background:rgba(239,68,68,.12); border-color:rgba(239,68,68,.45); }
    .verdict { font-size:26px; font-weight:800; letter-spacing:0.03em; }
    .ALLOW .verdict { color:var(--ok); }
    .HOLD .verdict { color:var(--warn); }
    .BLOCK .verdict { color:var(--bad); }
    .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; }
    .PASS { background:rgba(34,197,94,.16); color:var(--ok); }
    .FAIL { background:rgba(239,68,68,.16); color:var(--bad); }
    .UNAVAILABLE { background:rgba(245,158,11,.16); color:var(--warn); }
    .tag { background:rgba(56,189,248,.14); color:var(--accent); }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th, td { text-align:left; padding:10px 10px; border-bottom:1px solid var(--border); vertical-align:top; }
    th { color:var(--muted); font-size:11px; text-transform:uppercase; }
    code { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12px; color:#cbd5e1; word-break:break-all; }
    .note { font-size:13px; color:var(--muted); }
    .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }
    input, button { font-family:inherit; font-size:14px; }
    input { width:100%; padding:8px 10px; background:#090d14; color:#fff; border:1px solid var(--border); border-radius:6px; }
    button { background:var(--accent); color:#041019; border:none; border-radius:8px; padding:10px 16px; font-weight:700; cursor:pointer; }
    button:hover { opacity:0.9; }
    pre { background:#070a10; border:1px solid var(--border); border-radius:8px; padding:12px; overflow:auto; font-size:12px; }
  </style>
</head>
<body>
  <header>
    <a class="brand" href="/payout"><span>plumb</span> · Solana Policy Co-Signer</a>
    <nav>
      <a href="/payout" class="${active === "payout" ? "active" : ""}">EUR→USDC Payout</a>
      <a href="/" class="">Proxy Playground</a>
      <a href="/ledger" class="">Live Ledger</a>
      <a href="/scoreboard" class="">Honest Scoreboard</a>
    </nav>
  </header>
  <main>${bodyHtml}</main>
</body>
</html>`;
}

function renderDossierHtml(d: PayoutDossier): string {
  const hashValid = verifyDossierHash(d);
  const rows = d.checks
    .map(
      (c) => `<tr>
        <td><strong>${esc(c.checkName)}</strong><br/><span class="pill tag">${esc(c.provenance)}</span></td>
        <td><span class="pill ${esc(c.status)}">${esc(c.status)}</span></td>
        <td>${esc(c.summary)}</td>
        <td>${c.minerName ? `${esc(c.minerName)} <code>(#${esc(c.minerId)})</code>` : "—"}</td>
        <td><code>${c.receiptHash ? esc(c.receiptHash.slice(0, 18) + "…") : "—"}</code></td>
        <td>$${c.costUsd.toFixed(4)} · ${c.latencyMs}ms</td>
      </tr>`
    )
    .join("");

  const solanaBlock = d.solanaSignature
    ? `<p><strong>2-of-2 Co-Signed Solana TX:</strong> <a style="color:#22c55e" target="_blank" href="${esc(d.solanaExplorerUrl)}"><code>${esc(d.solanaSignature)}</code></a> · <a style="color:#38bdf8" href="/verify/${encodeURIComponent(d.solanaSignature)}">Verify On-Chain Memo →</a></p>`
    : `<p><strong>Solana Co-Signature:</strong> <span class="pill FAIL">REFUSED / MISSING CO-SIGNATURE</span> — Agent cannot settle without plumb's 2-of-2 co-signature.</p>`;

  return pageShell(
    `Dossier ${d.invoice.invoiceId}`,
    "dossier",
    `
    <div class="banner ${esc(d.verdict)}">
      <div>
        <div class="note">PAYOUT POLICY VERDICT (${esc(d.policy.policyId)})</div>
        <div class="verdict">${esc(d.verdict)}</div>
        <div class="note">${esc(d.reason)}</div>
      </div>
      <div style="text-align:right">
        <div class="note">Canonical SHA-256 Dossier Hash (${hashValid ? "VERIFIED" : "TAMPERED"})</div>
        <code>plumb:v1:${esc(d.dossierHash)}</code>
      </div>
    </div>

    <div class="card grid2">
      <div>
        <div class="note">Invoice & Vendor</div>
        <strong>${esc(d.invoice.invoiceId)} — ${esc(d.invoice.vendorName)}</strong><br/>
        Host: <code>${esc(d.invoice.counterpartyHost)}</code><br/>
        Portal: <code>${esc(d.invoice.paymentPortalUrl)}</code>
      </div>
      <div>
        <div class="note">Cross-Border Settlement Amount</div>
        <strong>€${d.invoice.invoiceAmountEur} EUR → $${d.invoice.requestedUsdcAmount} USDC</strong><br/>
        ${
          d.fxAudit
            ? `Telegraph EUR/USD: <code>${d.fxAudit.telegraphEurUsdRate}</code> (expected $${d.fxAudit.expectedUsdcAmount}, deviation <strong>${d.fxAudit.deviationBps} bps</strong> vs ±${d.fxAudit.toleranceBps} bps limit)`
            : "FX check not completed"
        }
      </div>
      <div>
        <div class="note">Telegraph Intelligence Cost</div>
        <strong>$${d.totalTelegraphCostUsd.toFixed(4)} USDC</strong> across ${d.checks.filter((c) => c.provenance === "telegraph:escrow").length} Telegraph checks (${d.totalLatencyMs}ms total)
      </div>
    </div>

    <div class="card">
      ${solanaBlock}
    </div>

    <div class="card">
      <h3 style="margin-top:0">Verification Evidence & Telegraph Sepolia Receipts</h3>
      <table>
        <thead><tr><th>Check & Provenance</th><th>Result</th><th>Finding</th><th>Miner</th><th>Sepolia Receipt</th><th>Cost / Latency</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
  );
}

export function createDossierRoutes(deps: {
  store: DossierStore;
  telegraphClient: TelegraphAsker;
  budgetLimiter: BudgetGate;
  agentKeypair: Keypair;
  cosignerKeypair: Keypair;
}) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): Promise<boolean> => {
    // POST /api/payout/evaluate — runs full ALLOW/HOLD/BLOCK dossier + 2-of-2 Solana co-sign if ALLOW
    if (req.method === "POST" && url.pathname === "/api/payout/evaluate") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try {
        const body = JSON.parse(raw) as {
          invoice: PayoutInvoice;
          policy?: Partial<PayoutPolicy>;
          broadcastOnDevnet?: boolean;
          devnetAmountSol?: number;
        };
        const policy: PayoutPolicy = { ...DEFAULT_PAYOUT_POLICY, ...(body.policy ?? {}) };
        const dossier = await evaluatePayoutDossier(body.invoice, policy, {
          telegraphClient: deps.telegraphClient,
          budgetLimiter: deps.budgetLimiter,
        });
        deps.store.save(dossier);

        let cosign = null;
        if (body.broadcastOnDevnet !== false) {
          try {
            cosign = await cosignPayoutDossier(dossier, {
              agentKeypair: deps.agentKeypair,
              cosignerKeypair: deps.cosignerKeypair,
              amountSol: body.devnetAmountSol ?? 0.001,
            });
            if (cosign.solanaSignature) {
              deps.store.attachSolanaSignature(dossier.id, cosign.solanaSignature);
            }
          } catch (err) {
            cosign = {
              dossierId: dossier.id,
              dossierHash: dossier.dossierHash,
              verdict: dossier.verdict,
              signedByAgent: true,
              signedByCosigner: dossier.verdict === "ALLOW",
              missingCosignature: dossier.verdict !== "ALLOW",
              broadcast: false,
              memoText: dossier.verdict === "ALLOW" ? `plumb:v1:${dossier.dossierHash}` : null,
              solanaSignature: null,
              solanaExplorerUrl: null,
              agentPubkey: deps.agentKeypair.publicKey.toBase58(),
              cosignerPubkey: deps.cosignerKeypair.publicKey.toBase58(),
              reason: `Devnet broadcast skipped/failed (fund Devnet SOL to enable live tx): ${err instanceof Error ? err.message : String(err)}`,
            };
          }
        }

        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(
          JSON.stringify({
            dossier: deps.store.getById(dossier.id) ?? dossier,
            dossierUrl: `/dossier/${dossier.id}`,
            cosign,
          })
        );
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
      return true;
    }

    if (req.method !== "GET") return false;

    // GET /api/dossier/:id
    if (url.pathname.startsWith("/api/dossier/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/dossier/".length));
      const d = deps.store.getById(id) ?? deps.store.getByHash(id);
      if (!d) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Dossier not found" }));
        return true;
      }
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ hashVerified: verifyDossierHash(d), dossier: d }));
      return true;
    }

    // GET /dossier/:id (1-page Payout Dossier UI)
    if (url.pathname.startsWith("/dossier/")) {
      const id = decodeURIComponent(url.pathname.slice("/dossier/".length));
      const d = deps.store.getById(id) ?? deps.store.getByHash(id);
      if (!d) {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(pageShell("Not Found", "dossier", `<div class="card"><h2>Dossier not found</h2></div>`));
        return true;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderDossierHtml(d));
      return true;
    }

    // GET /api/verify/:sig and GET /verify/:sig
    if (url.pathname.startsWith("/api/verify/") || url.pathname.startsWith("/verify/")) {
      const isApi = url.pathname.startsWith("/api/verify/");
      const sig = decodeURIComponent(
        url.pathname.slice(isApi ? "/api/verify/".length : "/verify/".length)
      );
      const verification = await verifySolanaPayout(sig, deps.store, {
        expectedCosignerPubkey: deps.cosignerKeypair.publicKey.toBase58(),
      });
      if (isApi) {
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify(verification));
        return true;
      }
      const html = pageShell(
        `Verify ${sig.slice(0, 12)}`,
        "verify",
        `
        <div class="banner ${verification.verified ? "ALLOW" : "BLOCK"}">
          <div>
            <div class="note">ON-CHAIN SOLANA MEMO ↔ TELEGRAPH SEPOLIA VERIFICATION</div>
            <div class="verdict">${verification.verified ? "VERIFIED ON-CHAIN" : "VERIFICATION FAILED"}</div>
          </div>
          <div><code>${esc(sig)}</code></div>
        </div>
        <div class="card"><pre>${esc(JSON.stringify(verification, null, 2))}</pre></div>`
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return true;
    }

    // GET /payout — Cross-Border EUR->USDC Payout Launcher + Recent Dossiers
    if (url.pathname === "/payout") {
      const recent = deps.store
        .list(20)
        .map(
          (d) => `<tr>
            <td><a style="color:#38bdf8" href="/dossier/${encodeURIComponent(d.id)}"><strong>${esc(d.invoice.invoiceId)}</strong></a></td>
            <td>${esc(d.invoice.vendorName)} (<code>${esc(d.invoice.counterpartyHost)}</code>)</td>
            <td>€${d.invoice.invoiceAmountEur} → $${d.invoice.requestedUsdcAmount}</td>
            <td><span class="pill ${d.verdict === "ALLOW" ? "PASS" : d.verdict === "HOLD" ? "UNAVAILABLE" : "FAIL"}">${esc(d.verdict)}</span></td>
            <td>$${d.totalTelegraphCostUsd.toFixed(4)}</td>
            <td><code>${esc(d.dossierHash.slice(0, 14))}…</code></td>
          </tr>`
        )
        .join("");

      const html = pageShell(
        "EUR→USDC Payout Co-Signer",
        "payout",
        `
        <div class="card">
          <h2 style="margin-top:0">Cross-Border EUR → USDC Solana Payout Co-Signer</h2>
          <p class="note">Agent Wallet: <code>${esc(deps.agentKeypair.publicKey.toBase58())}</code> · <strong>plumb Policy Co-Signer:</strong> <code>${esc(deps.cosignerKeypair.publicKey.toBase58())}</code></p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
            <button type="button" onclick="preset('INV-EU-CLEAN','Nordic Cloud GmbH','github.com','https://github.com/billing',1000,1100)" style="background:#22c55e;">1. Clean EU Vendor (ALLOW)</button>
            <button type="button" onclick="preset('INV-EU-TLS-BAD','Spoofed Invoice Ltd','expired.badssl.com','https://expired.badssl.com/',1000,1100)" style="background:#ef4444;color:#fff;">2. Expired TLS Vendor (BLOCK)</button>
            <button type="button" onclick="preset('INV-EU-FX-TAMPER','Rate-Injected Vendor','github.com','https://github.com/billing',1000,1350)" style="background:#f59e0b;">3. Manipulated FX Rate +2200 bps (BLOCK)</button>
          </div>
          <div class="grid2" style="margin-bottom:12px;">
            <div><div class="note">Invoice ID</div><input id="invId" value="INV-EU-TLS-BAD" /></div>
            <div><div class="note">Vendor Name</div><input id="vendor" value="Spoofed Invoice Ltd" /></div>
            <div><div class="note">Counterparty Host</div><input id="host" value="expired.badssl.com" /></div>
            <div><div class="note">Payment Portal URL</div><input id="portal" value="https://expired.badssl.com/" /></div>
            <div><div class="note">Invoice Amount (EUR)</div><input id="eur" value="1000" /></div>
            <div><div class="note">Requested Payout (USDC)</div><input id="usdc" value="1100" /></div>
          </div>
          <button id="evalBtn">Evaluate Policy & Request 2-of-2 Co-Signature</button>
          <span id="evalStatus" class="note" style="margin-left:12px;"></span>
          <pre id="evalOut" style="display:none; margin-top:14px;"></pre>
        </div>
        <div class="card">
          <h3 style="margin-top:0">Recent Auditable Payout Dossiers</h3>
          <table>
            <thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Verdict</th><th>Telegraph Cost</th><th>Dossier Hash</th></tr></thead>
            <tbody>${recent || '<tr><td colspan="6" class="note">No payout dossiers yet. Run a preset above.</td></tr>'}</tbody>
          </table>
        </div>
        <script>
          function preset(id, vendor, host, portal, eur, usdc) {
            document.getElementById('invId').value = id;
            document.getElementById('vendor').value = vendor;
            document.getElementById('host').value = host;
            document.getElementById('portal').value = portal;
            document.getElementById('eur').value = eur;
            document.getElementById('usdc').value = usdc;
          }
          document.getElementById('evalBtn').onclick = async () => {
            const st = document.getElementById('evalStatus');
            const out = document.getElementById('evalOut');
            st.textContent = 'Running Telegraph SSL/URL/DNS/FX + RDAP checks...';
            out.style.display = 'block';
            const r = await fetch('/api/payout/evaluate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                invoice: {
                  invoiceId: document.getElementById('invId').value.trim(),
                  vendorName: document.getElementById('vendor').value.trim(),
                  counterpartyHost: document.getElementById('host').value.trim(),
                  paymentPortalUrl: document.getElementById('portal').value.trim(),
                  recipientPubkey: '${esc(deps.agentKeypair.publicKey.toBase58())}',
                  invoiceAmountEur: Number(document.getElementById('eur').value),
                  requestedUsdcAmount: Number(document.getElementById('usdc').value)
                }
              })
            }).then(x => x.json());
            st.innerHTML = 'Verdict: <strong>' + (r.dossier?.verdict || 'ERR') + '</strong> · <a style="color:#38bdf8" href="' + r.dossierUrl + '">Open Full Dossier Page →</a>';
            out.textContent = JSON.stringify(r, null, 2);
          };
        </script>`
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return true;
    }

    return false;
  };
}
