# plumb — Epistemic Boundary Verification Gateway for Telegraph (Track 03 · Mission 07)

> **10-Second Problem**: LLM apps either hallucinate stale real-world facts (prices, FX, SSL certs, phishing URLs) or waste USDC paying Telegraph miners on every static/coding question — with zero spend caps or prompt-injection defense.
>
> **Solution**: `plumb` is a drop-in **OpenAI-compatible verification proxy** (`POST /v1/chat/completions`) that routes static queries straight to your LLM at **`$0.00`**, gates live real-world-state queries to Telegraph's paid Ethereum Sepolia escrow market under **atomic USDC budget caps**, **quarantines untrusted miner prompt injections**, adjudicates disagreements against primary-source ground truth, and publishes a live `/ledger` and honest score-sorted `/scoreboard`.

## Architecture
```text
Client (OpenAI SDK / curl / Playground)
  └─ POST /v1/chat/completions (sync JSON, SSE stream: true, tools/tool_calls)
       ├─ Epistemic Boundary Gate (<1ms deterministic classifier, 9 live Intents)
       │    ├─ PASSTHROUGH (static / coding / historical / opinion) ──► Upstream LLM ($0.00)
       │    └─ VERIFY (live state)
       │         ├─ Atomic USDC Budget Limiter (mutex + atomic spend.json, fail-closed 402)
       │         ├─ Telegraph Sepolia Escrow Client (EIP-191 110s X-PAYMENT, receipt verify)
       │         ├─ Strict Zod Schema & Prompt-Injection Quarantine (fail-closed 502)
       │         └─ Verified Fact Injection ──► Upstream LLM (with dual-upstream failover)
       └─ Live Dashboard: / (Playground), /ledger (Receipts), /scoreboard (Honest Unpinned)
```

## 2-Minute Quickstart

```bash
git clone https://github.com/danielamodu/plumb.git
cd plumb
npm ci
npm run typecheck
npm test
```

### Run the Gateway Locally
```bash
cp .env.example .env
# Set UPSTREAM_API_KEY (e.g. Groq) and TELEGRAPH_PRIVATE_KEY (or ~/.telegraph/wallet.json)
npm run dev
```
Open `http://127.0.0.1:8787/` for the Playground, `/ledger` for cryptographic receipts, and `/scoreboard` for the honest unpinned miner rankings.

### Use with Any OpenAI Client
```bash
# Static prompt -> PASSTHROUGH ($0.00)
curl -i http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is the capital of France as of today?"}]}'

# Live real-world state -> VERIFY ($0.01 Sepolia escrow + X-Plumb-Receipt-Hash)
curl -i http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is the current price of ETH in USD?"}]}'
```

## Proof Artifacts
- **120-Question Stratified 4-Arm Pareto Benchmark & Confusion Matrix**: [bench/results/PARETO.md](bench/results/PARETO.md) & [bench/results/pareto-120.json](bench/results/pareto-120.json)
  - Confusion Matrix: **TP=60, FP=0, TN=60, FN=0** (`Precision 100%`, `Recall 100%`, `F1 1.00`, `Intent Exact Match 60/60`, p50 `0.007ms`)
  - 4-Arm Economics: **-50.0% USDC spend** vs Always-Buy Telegraph (`$0.60` vs `$1.20` per 120 mixed requests) with 100% cryptographic receipts on all live-state queries.
- **Full Adversarial Security Trace**: [bench/results/adversarial-trace.json](bench/results/adversarial-trace.json)
  - 20-way concurrent spend race vs `$0.03` cap → **3 allowed, 17 fail-closed (`402 FAIL_CLOSED_BUDGET`), `$0.03` exact spend**
  - 5/5 prompt-injection payloads quarantined (`502 FAIL_CLOSED_MINER`)
  - 4/4 malformed miner schemas rejected
  - 10/10 adversarial `"as of today"` / historical / opinion traps kept in `PASSTHROUGH` (`$0.00`)
  - Dual-upstream `503` failover verified (`200 OK`)
- **Live Sepolia Escrow Receipts** (verified on Nov 17 Diamond `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b`):
  - Escrow Deposit (`15.00 USDC`): `0x246a97f9b03c43f78d2ba239bef3794728743bfa0d25af15b90664a276469dfe`
  - `CRYPTO_PRICE_USD` (`TxLens`, `$0.01`): `receipt_hash=0xd72f9f3791bd6ce3708b3954b48289597ff740da7927de91ddfa8acce51a96f1`
  - `URL_SCAN_VERDICT` (`ChainSight`, `$0.01`): `receipt_hash=0x44430b2890f6e1076626ba652f73ffbbcde68e34e3a16374f842094bffeb3a10`

## Supported Intents & Explicit Limits
`plumb` currently verifies **9 live real-world-state Telegraph Intents**:
1. `CRYPTO_PRICE_USD`
2. `STOCK_PRICE_US_EQUITY`
3. `FX_NOW_EUR`
4. `FX_NOW_CAD`
5. `CURRENCY_EXCHANGE_CONVERT`
6. `WEATHER_CHECK_TEMPERATURE`
7. `URL_SCAN_VERDICT`
8. `SSL_VERIFICATION_CERT`
9. `DNS_RECORD_LOOKUP_GENERAL`

**Explicit Limits & Conflict-of-Interest Disclosure**:
- Live verification is scoped strictly to the 9 intents above; open-ended breaking news, sports scores, or multi-hop research queries pass through to the upstream LLM at `$0.00`.
- When a `VERIFY` query fails budget or miner/injection validation, `plumb` **fails closed** (`402` or `502`) rather than silently letting the LLM hallucinate.
- **Same-Author Disclosure**: The author also operates Track 01 Miner `#6184` (`primary`). On `/scoreboard`, `primary` is explicitly labeled `Same-Author Track 01 (Unpinned)` and sorted strictly by measured accuracy score descending (enforced by unit test in `test/adjudicator.test.ts` and `test/dashboard.test.ts`).
