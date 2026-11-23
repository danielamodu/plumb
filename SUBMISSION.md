# Telegraph Hackathon Season II — Track 03 Submission (`plumb` · Mission 07)

- **Project**: `plumb` — 2-of-2 Cryptographic Policy Co-Signer for Autonomous Solana Treasuries
- **Track / Mission**: Track 03 — Apps & Agents (`Mission 07: Consumer Platform`, GitHub Issue `#195`)
- **Builder**: `danielamodu` | **Repo**: `https://github.com/danielamodu/plumb`

## The 5-Act Hero Proof (Every Metric Anchored in Artifacts)
1. **Problem**: On 14 cross-border EUR→USDC payouts with 4 live unseen OpenPhish phishing URLs, Frontier LLM (`openai/gpt-oss-120b`) alone leaked **3/10 bad payouts** (`3 × $4,950 = $14,850` simulated invoice exposure; [bench/results/task-fulfillment.json](bench/results/task-fulfillment.json)).
2. **Mechanism**: `plumb` verifies counterparties & live FX via Telegraph Sepolia escrow under atomic USDC caps and prompt-injection quarantine — leaking **`0/10` bad payouts (`14/14`)** across **36 real Sepolia receipts (`$0.36`)** ([bench/results/TASK_FULFILLMENT.md](bench/results/TASK_FULFILLMENT.md)), and beating the frontier model **`7/10` vs `5/10`** on live-state accuracy at `-60%` USDC vs Always-Buy ([bench/results/LIVE_4ARM.md](bench/results/LIVE_4ARM.md)).
3. **Enforcement**: `ALLOW` / `HOLD` / `BLOCK` policy co-signer refuses to co-sign bad or unverified payouts (`missingCosignature: true`) and embeds `plumb:v1:<dossierHash>` in an on-chain Solana Memo when `ALLOW`.
4. **Live On-Chain Proof**:
   - **Solana Devnet TX (Slot `525489512`)**: `https://explorer.solana.com/tx/5UAcMn7v7mCHAdst8C9eugHQxrqckCf2juRzVeuPNtkmZCKmQMt56JzEovzzxtP9PJvzFYNwqtVw9ZAoTZF7YoRf?cluster=devnet`
   - **Live On-Chain Verifier (`verified: true`, 3 Sepolia Receipts)**: `https://plumb.13-60-129-92.sslip.io/verify/5UAcMn7v7mCHAdst8C9eugHQxrqckCf2juRzVeuPNtkmZCKmQMt56JzEovzzxtP9PJvzFYNwqtVw9ZAoTZF7YoRf`
   - **Live Allowed Dossier**: `https://plumb.13-60-129-92.sslip.io/dossier/1819019b-8701-40b4-9185-c08dcd83363d`
   - **Live Blocked Dossier (Co-Sign Refused)**: `https://plumb.13-60-129-92.sslip.io/dossier/67e3c7b5-e8b0-418c-b215-66aa32df0854`
   - **Live `#226` Incumbent Miss Auto-Bug-Report**: `https://plumb.13-60-129-92.sslip.io/api/bug-report/1d429bb3-87ee-4ae1-8498-d61790556c99`
   - **Sepolia Escrow Deposit (`15.00 USDC`, Nov 17 Diamond `0x72a7…aa08b`)**: `0x246a97f9b03c43f78d2ba239bef3794728743bfa0d25af15b90664a276469dfe`
5. **Access**: Drop-in OpenAI-compatible gateway (`POST /v1/chat/completions`, sync + SSE + `tools` + failover) live at `https://plumb.13-60-129-92.sslip.io/`.

## Reproducibility
`git clone https://github.com/danielamodu/plumb.git && cd plumb && npm ci && npm run typecheck && npm test` → **28/28 passing (`fail 0`)**.
