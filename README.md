# plumb — Cryptographic Policy Co-Signer & Epistemic Verification Gateway for Telegraph (Track 03 · Mission 07)

> **10-Second Problem**: Autonomous Solana payment agents either rely on LLMs that hallucinate live FX/prices and miss compromised counterparties, or pay Telegraph blindly on every prompt with zero spend caps, zero prompt-injection defense, and zero cryptographic enforcement.
>
> **Solution**: `plumb` is a **2-of-2 Solana Policy Co-Signer + OpenAI-compatible Telegraph verification gateway** (`https://plumb.13-60-129-92.sslip.io`). Before co-signing a cross-border EUR→USDC Solana payout, `plumb` composes live Telegraph Sepolia escrow checks (`SSL_VERIFICATION_CERT`, `URL_SCAN_VERDICT`, `DNS_RECORD_LOOKUP_GENERAL`, `FX_NOW_EUR`) plus primary-source RDAP domain age (`non-telegraph:rdap`) into an **`ALLOW` / `HOLD` / `BLOCK`** verdict, embeds the canonical SHA-256 `dossierHash` (`plumb:v1:<hash>`) into a **Solana Memo instruction**, and exposes **`/verify/{solana_sig}`** so any auditor can verify the Solana payment ↔ Telegraph Sepolia receipt link on-chain.

## Live Production URLs (Click & Verify Right Now)
- **EUR→USDC Payout Policy Co-Signer**: `https://plumb.13-60-129-92.sslip.io/payout`
- **Sample Live Blocked Payout Dossier**: `https://plumb.13-60-129-92.sslip.io/dossier/67e3c7b5-e8b0-418c-b215-66aa32df0854`
- **On-Chain Solana Memo Verifier**: `https://plumb.13-60-129-92.sslip.io/verify/<solana_sig>`
- **OpenAI Proxy Playground**: `https://plumb.13-60-129-92.sslip.io/`
- **Live Cryptographic Receipt Ledger**: `https://plumb.13-60-129-92.sslip.io/ledger`
- **Honest Unpinned Miner Scoreboard**: `https://plumb.13-60-129-92.sslip.io/scoreboard`

## Architecture
```text
Autonomous Solana Treasury Agent (or OpenAI SDK Client)
  ├─ POST /api/payout/evaluate (Cross-Border EUR -> USDC Policy Gate)
  │    ├─ Local Cap Policy (maxPaymentUsdc)
  │    ├─ Telegraph Sepolia Escrow (SSL + URL + DNS MX + FX EUR/USD, atomic USDC cap)
  │    ├─ Primary-Source RDAP Domain Age (explicitly labeled non-telegraph:rdap)
  │    ├─ Strict Zod Schema & Prompt-Injection Quarantine
  │    └─ Verdict: ALLOW / HOLD / BLOCK -> Canonical SHA-256 dossierHash
  │         ├─ HOLD / BLOCK -> plumb Policy Co-Signer REFUSES co-signature (Solana rejects tx)
  │         └─ ALLOW -> 2-of-2 Co-Signed Solana TX + SPL Memo (plumb:v1:<dossierHash>)
  │                     -> Auditable at GET /verify/{solana_sig}
  └─ POST /v1/chat/completions (OpenAI-compat sync, SSE stream, tools, dual-upstream failover)
       ├─ PASSTHROUGH (static/coding/historical/opinion) -> Upstream LLM ($0.00)
       └─ VERIFY (9 live Intents) -> Telegraph Sepolia Escrow + Cross-Miner Adjudication
```

## 2-Minute Quickstart (One-Command Local Repro)

```bash
git clone https://github.com/danielamodu/plumb.git && cd plumb && npm ci && npm run typecheck && npm test
```
Expected: **28/28 tests passing (`fail 0`)** covering Sepolia EIP-191 escrow signing, 20-way atomic budget race, 9-intent epistemic gate, prompt-injection quarantine, OpenAI proxy (sync/SSE/tools/failover), `ALLOW/HOLD/BLOCK` policy dossiers, and 2-of-2 Solana co-signer + Memo `/verify`.

### Run Locally
```bash
cp .env.example .env
# Set UPSTREAM_API_KEY (Groq) and TELEGRAPH_PRIVATE_KEY (or ~/.telegraph/wallet.json)
npm run dev
```

## Undeniable Proof Artifacts (Real Money, Real Receipts, Zero Rigging)
1. **Live End-to-End 4-Arm Benchmark (`n=20`, real Groq `openai/gpt-oss-120b` + real Sepolia escrow)**: [bench/results/LIVE_4ARM.md](bench/results/LIVE_4ARM.md) & [bench/results/live-4arm-results.json](bench/results/live-4arm-results.json)
   - Live-state accuracy: **`plumb` 7/10 (70%) vs Frontier Model 5/10 (50%)**, spending **`$0.08`** (`-60%` vs Always-Buy `$0.20`) with 8 real Sepolia receipts.
   - **Caught live incumbent bug `#226` with cryptographic receipt**: top-ranked incumbent `ChainSight` (`receipt 0x54c1004b...`) returned `safe: true` on Google's official phishing test page!
2. **Held-Out Cross-Border Payout Task-Fulfillment Benchmark (`n=14`, 36 real Sepolia receipts)**: [bench/results/TASK_FULFILLMENT.md](bench/results/TASK_FULFILLMENT.md) & [bench/results/task-fulfillment.json](bench/results/task-fulfillment.json)
   - `plumb` + Live Incumbents: **12/14** (**2/10 fraudulent payouts leaked** due to incumbent URL misses; `$0.36` across 36 real receipts).
   - `plumb` + `primary` (`#6184`): **14/14** (**0/10 fraudulent payouts leaked**).
3. **120-Question Stratified Classifier Confusion Matrix**: [bench/results/PARETO.md](bench/results/PARETO.md) — `TP=60, FP=0, TN=60, FN=0`, `F1=1.00`, p50 `0.007ms`, `-50%` USDC vs Always-Buy.
4. **Full Adversarial Security Trace**: [bench/results/adversarial-trace.json](bench/results/adversarial-trace.json) — 20-way spend race (`3` allowed / `17` blocked `402` / `$0.03` exact), 5/5 prompt injections quarantined (`502`), 4/4 malformed schemas rejected, 10/10 false-positive traps kept in `PASSTHROUGH`, 503 failover verified.

## Supported Intents & Explicit Limits
`plumb` verifies **9 live real-world-state Telegraph Intents**:
`CRYPTO_PRICE_USD`, `STOCK_PRICE_US_EQUITY`, `FX_NOW_EUR`, `FX_NOW_CAD`, `CURRENCY_EXCHANGE_CONVERT`, `WEATHER_CHECK_TEMPERATURE`, `URL_SCAN_VERDICT`, `SSL_VERIFICATION_CERT`, `DNS_RECORD_LOOKUP_GENERAL`.

**Explicit Limits & Same-Author Disclosure**:
- `plumb` verifies domain/TLS/URL/DNS infrastructure and live FX/price evidence — it does **not** claim legal KYB or beneficial-ownership identity verification.
- Primary-source RDAP domain-age checks are explicitly labeled `non-telegraph:rdap` inside every dossier.
- On-chain intelligence payments settle on Ethereum Sepolia escrow (`0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b`), while payout enforcement & Memo auditability run on Solana Devnet (2-of-2 co-signer trust model).
- **Same-Author Disclosure**: The author also operates Track 01 Miner `#6184` (`primary`). On `/scoreboard`, `primary` is transparently tagged `Same-Author Track 01 (Unpinned)` and sorted strictly by measured accuracy score descending (enforced by unit test).
