# Telegraph Hackathon Season II — Track 03 Submission (`plumb` · Mission 07)

- **Project Name**: `plumb` — Cryptographic Policy Co-Signer & Epistemic Verification Gateway for Telegraph
- **Track / Mission**: Track 03 — Apps & Agents (`Mission 07: Consumer Platform`, GitHub Issue `#195`)
- **Builder**: `danielamodu`
- **Repository**: `https://github.com/danielamodu/plumb`
- **Live Production App**:
  - EUR→USDC Payout Policy Co-Signer: `https://plumb.13-60-129-92.sslip.io/payout`
  - Sample Live Blocked Dossier: `https://plumb.13-60-129-92.sslip.io/dossier/67e3c7b5-e8b0-418c-b215-66aa32df0854`
  - On-Chain Memo Verifier: `https://plumb.13-60-129-92.sslip.io/verify/<solana_sig>`
  - Live Sepolia Receipt Ledger: `https://plumb.13-60-129-92.sslip.io/ledger`
  - Honest Unpinned Scoreboard: `https://plumb.13-60-129-92.sslip.io/scoreboard`

## Verified On-Chain Proof (Ethereum Sepolia Nov 17 Diamond `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b`)
- **Payer Wallet**: `0xAc27f433BB33Cdc0ED99b722c67D3b87B8684683`
- **Escrow Deposit (`15.00 USDC`)**: `0x246a97f9b03c43f78d2ba239bef3794728743bfa0d25af15b90664a276469dfe`
- **Paid Sepolia Receipts**: 45+ live paid asks across `CRYPTO_PRICE_USD`, `URL_SCAN_VERDICT`, `SSL_VERIFICATION_CERT`, `DNS_RECORD_LOOKUP_GENERAL` (including live `#226` incumbent failure proof `0x54c1004b...` and live blocked Solana payout proof `0xb69b5780879655e5e034a23ee6c46226aac60b0bbdfa8e288301b50933c83c30`).

## Solves Commercial Solana Pain (Use Case #3 × #1)
Autonomous Solana treasury agents signing irreversible stablecoin payouts cannot trust LLM guesses and cannot be left without cryptographic enforcement. `plumb` acts as a **2-of-2 Solana Policy Co-Signer**: every cross-border EUR→USDC payout must pass live Telegraph verification + RDAP domain age + FX bps tolerance (`ALLOW` / `HOLD` / `BLOCK`) before `plumb` co-signs and embeds `plumb:v1:<dossierHash>` in a Solana Memo instruction auditable at `/verify/{solana_sig}`.

## Reproducible Proof Artifacts
- [bench/results/LIVE_4ARM.md](bench/results/LIVE_4ARM.md) — Live Groq `openai/gpt-oss-120b` vs live `plumb` (`7/10` vs `5/10` on live state, `-60%` USDC vs Always-Buy, 8 real receipts)
- [bench/results/TASK_FULFILLMENT.md](bench/results/TASK_FULFILLMENT.md) — 14 cross-border payouts across 36 real Sepolia receipts (`plumb` + `primary` `#6184`: `14/14`, `0/10` fraud leaked vs `12/14`, `2/10` leaked on live incumbents)
- [bench/results/PARETO.md](bench/results/PARETO.md) — 120-question stratified confusion matrix (`TP=60, FP=0, TN=60, FN=0`, `F1=1.00`, p50 `0.007ms`)
- [bench/results/adversarial-trace.json](bench/results/adversarial-trace.json) — 20-way spend race, 5/5 prompt-injection quarantine, 4/4 malformed schema rejection, 503 failover
- **Tests**: `npm run typecheck && npm test` → **28/28 passing (`fail 0`)**
