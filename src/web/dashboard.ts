import type { IncomingMessage, ServerResponse } from "node:http";
import type { BudgetGate } from "../types.js";
import type { LedgerStore } from "../adjudicator/store.js";
import type { InvoiceSettlementRequest, InvoiceSettlementResult } from "../solana/settlement-gate.js";

export type SolanaEvaluator = (req: InvoiceSettlementRequest) => Promise<InvoiceSettlementResult>;

function esc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function layout(title: string, active: "home" | "solana" | "ledger" | "scoreboard", bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} — plumb</title>
  <style>
    :root { --bg:#0b0f17; --card:#121826; --border:#1f2937; --fg:#e5e7eb; --muted:#9ca3af; --accent:#38bdf8; --ok:#22c55e; --warn:#f59e0b; --bad:#ef4444; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:var(--bg); color:var(--fg); line-height:1.5; }
    header { border-bottom:1px solid var(--border); padding:14px 24px; display:flex; align-items:center; justify-content:space-between; background:#0e1420; }
    .brand { font-weight:700; letter-spacing:-0.02em; font-size:18px; color:#fff; text-decoration:none; }
    .brand span { color:var(--accent); }
    nav a { color:var(--muted); text-decoration:none; margin-left:20px; font-size:14px; font-weight:500; }
    nav a.active, nav a:hover { color:#fff; }
    main { max-width:1120px; margin:28px auto; padding:0 20px 60px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:24px; }
    .card { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:16px 18px; }
    .label { font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em; }
    .val { font-size:24px; font-weight:700; margin-top:4px; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th, td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--border); vertical-align:top; }
    th { color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; }
    .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; }
    .ok { background:rgba(34,197,94,.15); color:var(--ok); }
    .warn { background:rgba(245,158,11,.15); color:var(--warn); }
    .bad { background:rgba(239,68,68,.15); color:var(--bad); }
    .info { background:rgba(56,189,248,.15); color:var(--accent); }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px; color:#cbd5e1; }
    textarea, button, select { font-family:inherit; font-size:14px; }
    textarea { width:100%; background:#0b0f17; color:#fff; border:1px solid var(--border); border-radius:8px; padding:12px; min-height:80px; }
    button { background:var(--accent); color:#041019; border:none; border-radius:8px; padding:10px 16px; font-weight:600; cursor:pointer; }
    button:hover { opacity:0.9; }
    pre { background:#080c12; border:1px solid var(--border); border-radius:8px; padding:12px; overflow:auto; font-size:12px; }
    .note { font-size:13px; color:var(--muted); margin-bottom:16px; }
  </style>
</head>
<body>
  <header>
    <a class="brand" href="/"><span>plumb</span> · Epistemic Boundary Gateway for Telegraph</a>
    <nav>
      <a href="/" class="${active === "home" ? "active" : ""}">Playground</a>
      <a href="/solana" class="${active === "solana" ? "active" : ""}">Solana Settlement Gate</a>
      <a href="/ledger" class="${active === "ledger" ? "active" : ""}">Live Ledger</a>
      <a href="/scoreboard" class="${active === "scoreboard" ? "active" : ""}">Honest Scoreboard</a>
    </nav>
  </header>
  <main>${bodyHtml}</main>
</body>
</html>`;
}

export function createDashboardRoutes(
  store: LedgerStore,
  budget: BudgetGate,
  solanaEvaluator?: SolanaEvaluator,
  solanaSenderPubkey?: string
) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): Promise<boolean> => {
    if (req.method === "POST" && url.pathname === "/api/solana/evaluate-invoice" && solanaEvaluator) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try {
        const body = JSON.parse(raw) as InvoiceSettlementRequest;
        const result = await solanaEvaluator(body);
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
      return true;
    }

    if (req.method !== "GET") return false;

    if (url.pathname === "/solana") {
      const sender = solanaSenderPubkey ?? "Devnet Treasury Agent";
      const html = layout(
        "Solana Settlement Gate",
        "solana",
        `
        <div class="card" style="margin-bottom:18px;">
          <h2 style="margin-top:0">Solana Devnet Pre-Signing Settlement Gate (Use Case #3 × #1)</h2>
          <p class="note">Compare an autonomous Solana treasury agent using a <strong>Frontier LLM alone</strong> (left) vs <strong>plumb + Telegraph Sepolia Escrow</strong> (right) on the exact same invoice before signing an irreversible Solana Devnet transfer. Treasury wallet: <code>${esc(sender)}</code></p>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
            <button type="button" onclick="loadPreset('INV-BAD-001','expired.badssl.com')">Preset 1: Expired TLS Counterparty (expired.badssl.com)</button>
            <button type="button" onclick="loadPreset('INV-CLEAN-002','github.com')" style="background:#22c55e;">Preset 2: Clean Counterparty (github.com)</button>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:12px;">
            <div><div class="label">Invoice ID</div><input id="invId" value="INV-BAD-001" style="width:100%;padding:8px;background:#0b0f17;color:#fff;border:1px solid #1f2937;border-radius:6px;" /></div>
            <div><div class="label">Counterparty Host</div><input id="host" value="expired.badssl.com" style="width:100%;padding:8px;background:#0b0f17;color:#fff;border:1px solid #1f2937;border-radius:6px;" /></div>
            <div><div class="label">Amount (Devnet SOL)</div><input id="amt" value="0.001" style="width:100%;padding:8px;background:#0b0f17;color:#fff;border:1px solid #1f2937;border-radius:6px;" /></div>
          </div>
          <button id="runSplit">Run Split-Screen Comparison</button>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="card">
            <h3 style="margin-top:0">Arm A: Frontier LLM Alone ($0 Telegraph)</h3>
            <div id="leftStatus" class="note">Idle</div>
            <pre id="leftOut" style="min-height:180px;">Click "Run Split-Screen Comparison"</pre>
          </div>
          <div class="card">
            <h3 style="margin-top:0">Arm B: plumb + Telegraph Verified Gate</h3>
            <div id="rightStatus" class="note">Idle</div>
            <pre id="rightOut" style="min-height:180px;">Click "Run Split-Screen Comparison"</pre>
          </div>
        </div>
        <script>
          function loadPreset(id, host) {
            document.getElementById('invId').value = id;
            document.getElementById('host').value = host;
          }
          document.getElementById('runSplit').onclick = async () => {
            const payload = {
              invoiceId: document.getElementById('invId').value.trim(),
              counterpartyHost: document.getElementById('host').value.trim(),
              recipientPubkey: '${esc(sender)}',
              amountSol: Number(document.getElementById('amt').value || 0.001),
            };
            document.getElementById('leftStatus').textContent = 'Running Frontier LLM...';
            document.getElementById('rightStatus').textContent = 'Verifying via Telegraph Sepolia Escrow...';
            const [l, r] = await Promise.all([
              fetch('/api/solana/evaluate-invoice', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...payload, mode: 'frontier_only' }) }).then(x => x.json()),
              fetch('/api/solana/evaluate-invoice', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...payload, mode: 'plumb_verified' }) }).then(x => x.json()),
            ]);
            document.getElementById('leftStatus').innerHTML = 'Decision: <strong>' + l.decision + '</strong>' + (l.solanaExplorerUrl ? ' · <a target="_blank" style="color:#38bdf8" href="' + l.solanaExplorerUrl + '">Solana Explorer TX</a>' : '');
            document.getElementById('leftOut').textContent = JSON.stringify(l, null, 2);
            document.getElementById('rightStatus').innerHTML = 'Decision: <strong>' + r.decision + '</strong> · Telegraph Cost: $' + (r.telegraphCostUsd || 0).toFixed(4) + (r.solanaExplorerUrl ? ' · <a target="_blank" style="color:#22c55e" href="' + r.solanaExplorerUrl + '">Solana Explorer TX</a>' : ' · NO TX BROADCAST');
            document.getElementById('rightOut').textContent = JSON.stringify(r, null, 2);
          };
        </script>`
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return true;
    }

    if (url.pathname === "/api/ledger") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ summary: store.summary(), budget: budget.snapshot(), records: store.list(100) }));
      return true;
    }

    if (url.pathname === "/api/scoreboard") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(
        JSON.stringify({
          policy: "Strictly sorted by measured score DESC (tie-break latency ASC). Zero pinned placement for Track 01 primary miner.",
          miners: store.scoreboard(),
        })
      );
      return true;
    }

    if (url.pathname.startsWith("/api/bug-report/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/bug-report/".length));
      const rec = store.get(id);
      if (!rec || !rec.bugReportMarkdown) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No bug report available for this record" }));
        return true;
      }
      res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
      res.end(rec.bugReportMarkdown);
      return true;
    }

    if (url.pathname === "/") {
      const s = store.summary();
      const b = budget.snapshot();
      const html = layout(
        "Playground",
        "home",
        `
        <div class="grid">
          <div class="card"><div class="label">Total Requests</div><div class="val">${s.totalRequests}</div></div>
          <div class="card"><div class="label">Verified via Telegraph</div><div class="val">${s.verifiedRequests}</div></div>
          <div class="card"><div class="label">USDC Spent Today</div><div class="val">$${b.dailySpentUsd.toFixed(4)} / $${b.dailyLimitUsd.toFixed(2)}</div></div>
          <div class="card"><div class="label">Saved vs Always-Buy</div><div class="val">$${s.savedVsAlwaysBuyUsd.toFixed(4)}</div></div>
          <div class="card"><div class="label">Injections Quarantined</div><div class="val">${s.injectionsQuarantined}</div></div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">Try the Epistemic Boundary Proxy (<code>POST /v1/chat/completions</code>)</h2>
          <p class="note">Static questions pass through at <strong>$0.00</strong>. Live real-world-state queries (prices, FX, weather, URL safety, SSL certs, DNS) buy verified answers on Telegraph Sepolia escrow under atomic USDC caps.</p>
          <textarea id="prompt">What is the current price of ETH in USD?</textarea>
          <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
            <button id="runBtn">Send via plumb</button>
            <span id="status" class="note" style="margin:0"></span>
          </div>
          <pre id="out" style="margin-top:14px; display:none;"></pre>
        </div>
        <script>
          document.getElementById('runBtn').onclick = async () => {
            const out = document.getElementById('out');
            const st = document.getElementById('status');
            st.textContent = 'Running...';
            out.style.display = 'block';
            try {
              const r = await fetch('/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [{ role: 'user', content: document.getElementById('prompt').value }] })
              });
              const meta = {
                httpStatus: r.status,
                decision: r.headers.get('x-plumb-decision'),
                intent: r.headers.get('x-plumb-intent'),
                costUsd: r.headers.get('x-plumb-cost-usd'),
                receiptHash: r.headers.get('x-plumb-receipt-hash'),
                plumbStatus: r.headers.get('x-plumb-status'),
              };
              const data = await r.json();
              st.textContent = meta.decision + ' · ' + meta.plumbStatus + ' · $' + meta.costUsd;
              out.textContent = JSON.stringify({ meta, response: data }, null, 2);
            } catch (e) {
              st.textContent = 'Error';
              out.textContent = String(e);
            }
          };
        </script>`
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return true;
    }

    if (url.pathname === "/ledger") {
      const records = store.list(50);
      const rows = records
        .map((r) => {
          const pillCls =
            r.status === "VERIFIED_OK" || r.status === "PASSTHROUGH_OK"
              ? "ok"
              : r.status === "DISAGREEMENT_RESOLVED"
                ? "warn"
                : "bad";
          const rcpt = r.calls[0]?.receiptHash ?? "—";
          const bugLink = r.bugReportMarkdown
            ? `<a href="/api/bug-report/${encodeURIComponent(r.id)}" style="color:#38bdf8">Bug Report MD</a>`
            : "—";
          return `<tr>
            <td><code>${esc(r.timestamp.slice(11, 19))}Z</code></td>
            <td>${esc(r.promptPreview)}</td>
            <td><span class="pill info">${esc(r.decision.mode)}</span> ${r.decision.intent ? `<code>${esc(r.decision.intent)}</code>` : ""}</td>
            <td><span class="pill ${pillCls}">${esc(r.status)}</span></td>
            <td>$${r.totalCostUsd.toFixed(4)}</td>
            <td><code>${esc(rcpt.slice(0, 14))}</code></td>
            <td>${bugLink}</td>
          </tr>`;
        })
        .join("");

      const html = layout(
        "Live Ledger",
        "ledger",
        `
        <div class="card">
          <h2 style="margin-top:0">Live Cryptographic Verification Ledger</h2>
          <p class="note">Every gated Telegraph Sepolia escrow call records its exact cost, latency, schema/injection verdict, and <code>X-PAYMENT-RESPONSE</code> receipt hash.</p>
          <table>
            <thead><tr><th>Time</th><th>Prompt</th><th>Gate</th><th>Status</th><th>Cost</th><th>Receipt</th><th>Action</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="7" class="note">No ledger entries yet. Send a request to <code>/v1/chat/completions</code>.</td></tr>'}</tbody>
          </table>
        </div>`
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return true;
    }

    if (url.pathname === "/scoreboard") {
      const miners = store.scoreboard();
      const rows = miners
        .map(
          (m, idx) => `<tr>
            <td>#${idx + 1}</td>
            <td><strong>${esc(m.minerName)}</strong> <code>(${esc(m.minerId)})</code> ${
              m.isPrimaryTrack01
                ? '<span class="pill warn">Same-Author Track 01 (Unpinned)</span>'
                : ""
            }</td>
            <td><strong>${(m.score * 100).toFixed(1)}%</strong></td>
            <td>${m.groundTruthMatches}/${m.groundTruthTotal || m.calls}</td>
            <td>${m.avgLatencyMs}ms</td>
            <td>${m.injectionFlags}</td>
            <td>$${m.totalEarnedUsd.toFixed(4)}</td>
          </tr>`
        )
        .join("");

      const html = layout(
        "Honest Scoreboard",
        "scoreboard",
        `
        <div class="card">
          <h2 style="margin-top:0">Honest Miner Scoreboard</h2>
          <p class="note">Sorted strictly by measured accuracy score descending (tie-break: latency ascending). Our Track 01 miner (<code>primary</code>) is transparently disclosed and receives <strong>zero</strong> pinned placement or scoring boost.</p>
          <table>
            <thead><tr><th>Rank</th><th>Miner</th><th>Score</th><th>Verified</th><th>Avg Latency</th><th>Injections</th><th>Paid USDC</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="7" class="note">No miner observations recorded yet.</td></tr>'}</tbody>
          </table>
        </div>`
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return true;
    }

    return false;
  };
}
