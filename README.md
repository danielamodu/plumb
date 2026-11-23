<p align="center">
  <img src="assets/logo.png" alt="PLUMB Logo" width="210" />
</p>

<h1 align="center">PLUMB</h1>

---

<h3 align="center">A safety checkpoint between an AI agent and the money it is about to send</h3>

<p align="center">
  <img src="https://img.shields.io/badge/node-24%2B-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 24+" />
  <img src="https://img.shields.io/badge/tests-28%20passing-22c55e?style=flat-square" alt="28 passing tests" />
  <img src="https://img.shields.io/badge/telegraph-sepolia%20escrow-1d4ed8?style=flat-square" alt="Telegraph Sepolia Escrow" />
  <img src="https://img.shields.io/badge/solana-2--of--2%20co--signer-9945FF?style=flat-square" alt="Solana 2-of-2 Co-Signer" />
  <img src="https://img.shields.io/badge/status-live%20on%20EC2-f97316?style=flat-square" alt="Live on EC2" />
</p>

---

## What is PLUMB? (In Plain English)

Imagine you give an AI assistant access to your company wallet so it can pay international vendor invoices automatically.

**The problem:** AI models guess. They cannot check if a vendor's website was hijacked five minutes ago, if its security certificate is expired, or what the exact Euro-to-Dollar exchange rate is right now. When an AI guesses on a real payment, **money gets sent to scammers — and crypto payments cannot be reversed.**

**What PLUMB does:** PLUMB sits right between the AI agent and the wallet like a **second key on a bank vault**.

1. **Before any money leaves**, PLUMB pays a tiny fee (`$0.01`) on **Telegraph** (a marketplace of specialist verification bots) to run real-time checks:
   - Is the vendor's website security certificate valid right now?
   - Is the payment link a known phishing or scam site?
   - Does the vendor's domain have real email/DNS records and how old is the domain?
   - Does the Euro-to-USDC invoice amount match the live exchange rate?
2. **Every payment gets one clear verdict:**
   - **ALLOW** — Everything checked out. PLUMB adds its second signature, attaches a permanent proof stamp (`Memo`) to the Solana transaction, and the payment goes through.
   - **BLOCK** — Something failed (scam link, expired certificate, tampered exchange rate, or over the spending cap). PLUMB **refuses to sign**, so the money stays safe.
   - **HOLD** — A verification bot was offline or disagreed. PLUMB pauses the payment instead of guessing.
3. **Zero wasted money on normal questions:** If someone just asks the AI a normal question (*"What is the capital of France?"* or *"Write a Python script"*), PLUMB lets it pass straight through for **`$0.00`**.

---

## Try It Live (No Setup Needed)

Everything below is running live right now on HTTPS — click any link to inspect real results:

- **Test a Cross-Border Payout**: [plumb.13-60-129-92.sslip.io/payout](https://plumb.13-60-129-92.sslip.io/payout)
- **See a Real BLOCKED Payment** *(expired cert — PLUMB refused to co-sign)*: [Live Blocked Dossier](https://plumb.13-60-129-92.sslip.io/dossier/67e3c7b5-e8b0-418c-b215-66aa32df0854)
- **See a Real APPROVED Payment** *(2-of-2 co-signed on Solana)*: [Live Allowed Dossier](https://plumb.13-60-129-92.sslip.io/dossier/1819019b-8701-40b4-9185-c08dcd83363d)
- **Check the Solana Transaction on Explorer** *(Slot `525489512`)*: [Solana Explorer TX `5UAcMn…YoRf`](https://explorer.solana.com/tx/5UAcMn7v7mCHAdst8C9eugHQxrqckCf2juRzVeuPNtkmZCKmQMt56JzEovzzxtP9PJvzFYNwqtVw9ZAoTZF7YoRf?cluster=devnet)
- **Verify the On-Chain Proof Stamp** *(links Solana TX ↔ 3 paid Telegraph receipts)*: [Live On-Chain Verifier (`verified: true`)](https://plumb.13-60-129-92.sslip.io/verify/5UAcMn7v7mCHAdst8C9eugHQxrqckCf2juRzVeuPNtkmZCKmQMt56JzEovzzxtP9PJvzFYNwqtVw9ZAoTZF7YoRf)
- **Live Receipt Ledger**: [plumb.13-60-129-92.sslip.io/ledger](https://plumb.13-60-129-92.sslip.io/ledger)
- **Honest Bot Scoreboard**: [plumb.13-60-129-92.sslip.io/scoreboard](https://plumb.13-60-129-92.sslip.io/scoreboard)
- **OpenAI Proxy Playground**: [plumb.13-60-129-92.sslip.io/](https://plumb.13-60-129-92.sslip.io/)

---

## Real Results (No Fake Numbers)

We tested a top AI model (`openai/gpt-oss-120b`) **alone** vs. **protected by PLUMB** on **14 real cross-border vendor payouts**, including **4 live unseen phishing websites** pulled from OpenPhish ([full data](bench/results/TASK_FULFILLMENT.md)):

| Setup | Correct Decisions | Scam Payments Let Through | Total Verification Cost |
| :--- | :---: | :---: | :---: |
| **AI Model Alone** (`openai/gpt-oss-120b`) | 11 / 14 | **3 / 10 leaked** (`$14,850` simulated loss) | `$0.00` |
| **PLUMB + Live Telegraph Bots** | **14 / 14** | **0 / 10 leaked** | `$0.36` (36 real receipts) |
| **PLUMB + Primary Miner (`#6184`)** | **14 / 14** | **0 / 10 leaked** (decisive `BLOCK`) | deterministic |

**Other verified proofs:**
- **Live Real-Time Accuracy (`n=20`)**: PLUMB scored **7/10** on live prices, certificates, and DNS vs. **5/10** for the AI model alone, while cutting Telegraph spend by **60%** (`$0.08` vs. `$0.20` if paying on every question) — [LIVE_4ARM.md](bench/results/LIVE_4ARM.md).
- **Caught a Real Live Telegraph Bug (`#226`)**: While running live tests, a top-ranked Telegraph bot took `$0.01` (`receipt 0x54c1004b…`) and called Google's official phishing test page *"safe"*. PLUMB automatically caught the lie and generated a 1-click bug report: [Live Bug Report](https://plumb.13-60-129-92.sslip.io/api/bug-report/1d429bb3-87ee-4ae1-8498-d61790556c99).
- **Security Stress Tests**: Blocked **17/20** simultaneous spend-race attacks against a `$0.03` cap (`$0.03` exact spend), quarantined **5/5** hidden prompt-injection attacks, and survived an upstream AI outage via automatic failover — [adversarial-trace.json](bench/results/adversarial-trace.json).

---

## How It Works Under the Hood

```text
Your AI Agent (or any OpenAI-compatible app)
   │
   ▼
PLUMB Checkpoint (https://plumb.13-60-129-92.sslip.io)
   ├── Normal question? ─────────────────────► Straight to AI ($0.00)
   └── Real-world fact or Solana payment?
         ├── 1. Check hard daily & per-payment USDC caps (never overspends)
         ├── 2. Buy live checks on Telegraph Sepolia Escrow ($0.01/check)
         ├── 3. Quarantine any prompt-injection or malformed bot data
         ├── 4. Produce ALLOW / HOLD / BLOCK + SHA-256 proof hash
         │        ├── HOLD / BLOCK ──► Second signature REFUSED (money stays safe)
         │        └── ALLOW ─────────► 2-of-2 Solana Co-Sign + On-Chain Memo
         └── 5. Publish every receipt to /ledger, /scoreboard & /verify/{sig}
```

---

## 2-Minute Quickstart (Run It Yourself)

Run one command to clone, install, typecheck, and run all **28 automated tests**:

```bash
git clone https://github.com/danielamodu/plumb.git && cd plumb && npm ci && npm run typecheck && npm test
```

To run the server locally:
```bash
cp .env.example .env
# Add your UPSTREAM_API_KEY (e.g. Groq) and TELEGRAPH_PRIVATE_KEY
npm run dev
```

---

## Supported Checks & Explicit Limits

PLUMB currently verifies **9 live real-world Telegraph Intents**:
`CRYPTO_PRICE_USD`, `STOCK_PRICE_US_EQUITY`, `FX_NOW_EUR`, `FX_NOW_CAD`, `CURRENCY_EXCHANGE_CONVERT`, `WEATHER_CHECK_TEMPERATURE`, `URL_SCAN_VERDICT`, `SSL_VERIFICATION_CERT`, `DNS_RECORD_LOOKUP_GENERAL`.

**Explicit Limits & Same-Author Disclosure:**
- **What PLUMB does NOT claim**: PLUMB verifies website security, domain infrastructure, and live prices/FX — it does **not** perform legal company KYB or beneficial-ownership identity checks.
- **Non-Telegraph check disclosure**: Domain registration age checks use public RDAP (`rdap.org`) and are explicitly labeled `non-telegraph:rdap` inside every payout dossier.
- **Cross-chain setup**: Telegraph intelligence payments run on Ethereum Sepolia escrow (`0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b`), while the 2-of-2 payout co-signature and Memo verification run on Solana Devnet.
- **Same-Author Disclosure**: The author also operates Track 01 Miner `#6184` ([`primary`](https://github.com/danielamodu/primary)). On `/scoreboard`, `primary` is clearly labeled `Same-Author Track 01 (Unpinned)` and ranked strictly by measured accuracy score descending (enforced by automated unit tests).

---

### Appendix: Local Router Speed Check
- 120-prompt local gate check (measures routing overhead only, `<1ms`, not end-to-end answer accuracy): [bench/results/PARETO.md](bench/results/PARETO.md) (`npm run bench:120`).
