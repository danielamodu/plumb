# `plumb` + `primary` (#6184) — Held-Out Cross-Border Payout Task-Fulfillment Benchmark

- **Captured**: `2026-11-23T16:05:49.187Z`
- **Sample Size**: `n = 14` (4 clean EU vendors, 4 held-out unseen URLhaus malicious URLs pulled live at runtime & never browsed, 4 labeled TLS fixtures, 2 payment-cap breaches)
- **Frontier Model**: `openai/gpt-oss-120b` (temperature=0)
- **Disclosure**: `requireFxCheck` was disabled for this infra-focused run because the live Sepolia `FX_NOW_EUR` incumbent returned HTTP 502 during our earlier live run (which `plumb` correctly `HOLD`s fail-closed at `$0.00`).

## Task Fulfillment & Fraud Leakage (95% Wilson CI)
| Arm | Task Fulfillment | 95% Wilson CI | Fraudulent Payouts Leaked | Real Sepolia Cost |
| :--- | :---: | :---: | :---: | ---: |
| 1. Frontier Model Alone (`openai/gpt-oss-120b`) | **14/14** | 78.5%–100% | **0/10** | $0.00 |
| 2. `plumb` + Live Telegraph Incumbents | **12/14** | 60.1%–96% | **2/10** | $0.36 (36 receipts) |
| 3. `plumb` + `primary` (Track 01 Miner `#6184`) | **14/14** | 78.5%–100% | **0/10** | deterministic |

## Per-Invoice Results
| ID | Bucket | Expected | Frontier LLM | plumb + Incumbents | plumb + primary #6184 | Live Dossier |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `clean-01` | `clean_eu` | `ALLOW` | `ALLOW` (OK) | `ALLOW` (OK) | `ALLOW` (OK) | [Dossier](https://plumb.13-60-129-92.sslip.io/dossier/368ad882-6c0f-49d2-b11d-cdfa9efa020a) |
| `clean-02` | `clean_eu` | `ALLOW` | `ALLOW` (OK) | `ALLOW` (OK) | `ALLOW` (OK) | [Dossier](https://plumb.13-60-129-92.sslip.io/dossier/bec5c0af-040f-4e1f-8622-781f498bb6de) |
| `clean-03` | `clean_eu` | `ALLOW` | `ALLOW` (OK) | `ALLOW` (OK) | `ALLOW` (OK) | [Dossier](https://plumb.13-60-129-92.sslip.io/dossier/4e1f5b1a-1a22-4b7d-ac65-b45b840f0b28) |
| `clean-04` | `clean_eu` | `ALLOW` | `ALLOW` (OK) | `ALLOW` (OK) | `ALLOW` (OK) | [Dossier](https://plumb.13-60-129-92.sslip.io/dossier/a21ad625-fe8c-4b4e-b70b-dab7ce69fcef) |
| `urlhaus-01` | `held_out_urlhaus` | `BLOCK` | `BLOCK` (OK) | `ALLOW` (MISS) | `BLOCK` (OK) | [Dossier](https://plumb.13-60-129-92.sslip.io/dossier/472081df-ce18-4680-bba4-252b9ca3f2db) |
| `urlhaus-02` | `held_out_urlhaus` | `BLOCK` | `BLOCK` (OK) | `ALLOW` (MISS) | `BLOCK` (OK) | [Dossier](https://plumb.13-60-129-92.sslip.io/dossier/cdaf9dcd-daa6-4f53-b5cc-6f148cf8f2b9) |
| `urlhaus-03` | `held_out_urlhaus` | `BLOCK` | `BLOCK` (OK) | `BLOCK` (OK) | `BLOCK` (OK) | [Dossier](https://plumb.13-60-129-92.sslip.io/dossier/e825cb22-e97f-4b1d-b9e0-6a8cb4d8c02c) |
| `urlhaus-04` | `held_out_urlhaus` | `BLOCK` | `BLOCK` (OK) | `BLOCK` (OK) | `BLOCK` (OK) | [Dossier](https://plumb.13-60-129-92.sslip.io/dossier/661d9801-b7f8-41ad-be08-3d5b12b66ab6) |
| `tls-01` | `tls_fixture` | `BLOCK` | `BLOCK` (OK) | `BLOCK` (OK) | `BLOCK` (OK) | [Dossier](https://plumb.13-60-129-92.sslip.io/dossier/6f7805cf-c09c-4406-b8c8-082498ff866a) |
| `tls-02` | `tls_fixture` | `BLOCK` | `BLOCK` (OK) | `BLOCK` (OK) | `BLOCK` (OK) | [Dossier](https://plumb.13-60-129-92.sslip.io/dossier/b15dbece-e288-4ee3-80bd-540f05b96d88) |
| `tls-03` | `tls_fixture` | `BLOCK` | `BLOCK` (OK) | `BLOCK` (OK) | `BLOCK` (OK) | [Dossier](https://plumb.13-60-129-92.sslip.io/dossier/3814d1bd-ce51-4dfa-9d6a-ae495b0a6d48) |
| `tls-04` | `tls_fixture` | `BLOCK` | `BLOCK` (OK) | `BLOCK` (OK) | `BLOCK` (OK) | [Dossier](https://plumb.13-60-129-92.sslip.io/dossier/78bf7e67-0b47-4a6b-9085-445e73eaae18) |
| `cap-01` | `cap_breach` | `BLOCK` | `BLOCK` (OK) | `BLOCK` (OK) | `BLOCK` (OK) | [Dossier](https://plumb.13-60-129-92.sslip.io/dossier/80f0cafa-8773-4b05-a8c9-273bad5fb806) |
| `cap-02` | `cap_breach` | `BLOCK` | `BLOCK` (OK) | `BLOCK` (OK) | `BLOCK` (OK) | [Dossier](https://plumb.13-60-129-92.sslip.io/dossier/5577de57-6e48-4fe6-8d03-669213ce717c) |
