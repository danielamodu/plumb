# plumb — 2-of-2 Cryptographic Policy Co-Signer for Autonomous Solana Treasuries

> **In One Sentence**: Autonomous Solana treasury agents leak funds when LLMs guess on live counterparties and FX rates — `plumb` enforces a **2-of-2 Solana Policy Co-Signature** backed by paid **Telegraph Sepolia escrow receipts**, embeds the canonical SHA-256 dossier hash in an on-chain **Solana Memo**, and exposes an **OpenAI-compatible gateway** underneath so any agent SDK can plug in.

## The 5-Act Arc (Every Number Linked to an Artifact)

1. **Problem — Frontier Models Leak Live Phishing Payouts**: On 14 cross-border EUR→USDC invoices including 4 live unseen OpenPhish phishing URLs (never browsed), `openai/gpt-oss-120b` alone **authorized 3 of 4 live phishing payouts** (`3/10` bad payouts leaked = `3 × $4,950 = $14,850` simulated invoice exposure; [task-fulfillment.json](bench/results/task-fulfillment.json)).
2. **Mechanism — Paid Telegraph Intelligence Under Atomic USDC Caps**: `plumb` gates live checks (`SSL_VERIFICATION_CERT`, `URL_SCAN_VERDICT`, `DNS_RECORD_LOOKUP_GENERAL`, `CURRENCY_EXCHANGE_CONVERT` / `FX_NOW_EUR`) plus primary-source RDAP domain age (`non-telegraph:rdap`) under an atomic USDC budget limiter and prompt-injection quarantine — leaking **`0/10` bad payouts (`14/14`)** across **36 real Sepolia receipts (`$0.36` total)** ([TASK_FULFILLMENT.md](bench/results/TASK_FULFILLMENT.md)).
3. **Enforcement — 2-of-2 Solana Co-Sign + SPL Memo (`ALLOW` / `HOLD` / `BLOCK`)**: On `HOLD` or `BLOCK`, `plumb` refuses its co-signature (`missingCosignature: true`) so the agent cannot settle. On `ALLOW`, `plumb` co-signs the 2-of-2 Solana transaction and writes `plumb:v1:<dossierHash>` into the SPL Memo instruction.
4. **Proof — Live Cross-Chain Verification (Solana Slot `525489512` ↔ 3 Sepolia Receipts)**:
   - **Live Solana Devnet TX**: [`5UAcMn…YoRf` (Slot `525489512`)](https://explorer.solana.com/tx/5UAcMn7v7mCHAdst8C9eugHQxrqckCf2juRzVeuPNtkmZCKmQMt56JzEovzzxtP9PJvzFYNwqtVw9ZAoTZF7YoRf?cluster=devnet)
   - **Live On-Chain Verifier (`verified: true`)**: [`/verify/5UAcMn…YoRf`](https://plumb.13-60-129-92.sslip.io/verify/5UAcMn7v7mCHAdst8C9eugHQxrqckCf2juRzVeuPNtkmZCKmQMt56JzEovzzxtP9PJvzFYNwqtVw9ZAoTZF7YoRf) — reads the Memo directly from Solana Devnet RPC, confirms the co-signer signature, verifies canonical SHA-256, and displays all 3 Telegraph Sepolia receipts (`0x8426fc4b…`, `0xeeca22f9…`, `0x6dd4d5eb…`).
   - **Live Allowed Dossier**: [`/dossier/1819019b…`](https://plumb.13-60-129-92.sslip.io/dossier/1819019b-8701-40b4-9185-c08dcd83363d) | **Live Blocked Dossier (Co-Sign Refused)**: [`/dossier/67e3c7b5…`](https://plumb.13-60-129-92.sslip.io/dossier/67e3c7b5-e8b0-418c-b215-66aa32df0854)
   - **Live Incumbent Bug `#226` Caught**: Paid Sepolia receipt `0x54c1004b…` where rank-1 incumbent returned `safe: true` on Google's phishing fixture — live auto-generated bug report at [`/api/bug-report/1d429bb3…`](https://plumb.13-60-129-92.sslip.io/api/bug-report/1d429bb3-87ee-4ae1-8498-d61790556c99).
5. **Access — OpenAI-Compatible Gateway Underneath**: Drop-in `POST /v1/chat/completions` (sync JSON, SSE `stream: true`, `tools`, dual-upstream failover) so any agent or SDK gets verified live truth with `$0.00` spent on static/coding prompts.

## Live Production Surfaces
- **EUR→USDC Payout Co-Signer**: `https://plumb.13-60-129-92.sslip.io/payout`
- **Solana Split-Screen Gate**: `https://plumb.13-60-129-92.sslip.io/solana`
- **OpenAI Proxy Playground**: `https://plumb.13-60-129-92.sslip.io/`
- **Live Sepolia Receipt Ledger**: `https://plumb.13-60-129-92.sslip.io/ledger`
- **Honest Unpinned Scoreboard**: `https://plumb.13-60-129-92.sslip.io/scoreboard`

## 2-Minute Quickstart (One-Command Local Repro)
```bash
git clone https://github.com/danielamodu/plumb.git && cd plumb && npm ci && npm run typecheck && npm test
```
Expected: **28/28 tests passing (`fail 0`)**. To run locally: `cp .env.example .env` (set `UPSTREAM_API_KEY` + `TELEGRAPH_PRIVATE_KEY`) and `npm run dev`.

## End-to-End Benchmarks & Security Evidence
- **Held-Out Cross-Border Payout Task Fulfillment (`n=14`, live OpenPhish)**: [bench/results/TASK_FULFILLMENT.md](bench/results/TASK_FULFILLMENT.md) — Frontier LLM `11/14` (`3/10` fraud leaked) vs `plumb` + Incumbents `14/14` (`0/10` leaked, 36 receipts, `$0.36`) vs `plumb` + `primary` `#6184` `14/14` (`0/10` leaked, decisive `BLOCK`).
- **Live 4-Arm End-to-End Accuracy (`n=20`, real Groq + real Sepolia escrow)**: [bench/results/LIVE_4ARM.md](bench/results/LIVE_4ARM.md) — `plumb` **`7/10`** live-state accuracy vs Frontier LLM **`5/10`** (`2280ms` avg end-to-end, `$0.08` total = `-60%` vs Always-Buy, 8 real receipts).
- **Adversarial Security Trace**: [bench/results/adversarial-trace.json](bench/results/adversarial-trace.json) — 20-way concurrent spend race vs `$0.03` cap (`3` allowed / `17` fail-closed `402` / `$0.03` exact), 5/5 prompt injections quarantined (`502`), 4/4 malformed schemas rejected, 503 failover verified.

## Supported Intents & Explicit Limits
`plumb` verifies **9 live Telegraph Intents**: `CRYPTO_PRICE_USD`, `STOCK_PRICE_US_EQUITY`, `FX_NOW_EUR`, `FX_NOW_CAD`, `CURRENCY_EXCHANGE_CONVERT`, `WEATHER_CHECK_TEMPERATURE`, `URL_SCAN_VERDICT`, `SSL_VERIFICATION_CERT`, `DNS_RECORD_LOOKUP_GENERAL`.

**Explicit Limits & Same-Author Disclosure**:
- `plumb` verifies domain/TLS/URL/DNS infrastructure and live FX/price evidence — it does **not** claim legal KYB or beneficial-ownership verification.
- RDAP domain-age checks are explicitly labeled `non-telegraph:rdap`.
- Intelligence payments settle on Ethereum Sepolia escrow (`0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b`); payout enforcement & Memo auditability run on Solana Devnet (2-of-2 co-signer trust model).
- **Same-Author Disclosure**: The author also operates Track 01 Miner `#6184` (`primary`). On `/scoreboard`, `primary` is transparently tagged `Same-Author Track 01 (Unpinned)` and sorted strictly by measured accuracy score descending (enforced by unit test).

---

### Appendix: Local Router Unit Check
- 120-prompt deterministic gate check (measures routing overhead only, `<1ms`, not end-to-end answer accuracy): [bench/results/PARETO.md](bench/results/PARETO.md) (`npm run bench:120`).
