# `plumb` — Live End-to-End 4-Arm Benchmark (Real Groq + Real Telegraph Sepolia Escrow)

- **Live Gateway**: `https://plumb.13-60-129-92.sslip.io`
- **Frontier Model Baseline**: `openai/gpt-oss-120b` (temperature=0)
- **Sample Size**: `n = 20` (10 live real-world-state across 5 intents + 10 static/adversarial passthroughs)
- **Captured**: `2026-11-23T14:32:06.324Z`

## Measured Live Results (Zero Synthetic Numbers)
| Arm | Live-State Accuracy | Overall Accuracy | Real Telegraph Cost | Real Receipts | Avg Latency |
| :--- | :---: | :---: | ---: | ---: | ---: |
| 1. Frontier Model Alone (`openai/gpt-oss-120b`) | **5/10** | 15/20 | $0.00 | 0 | 498ms |
| 2. Free Public APIs (No Security Quorum) | 6/10 covered | — | $0.00 | 0 | — |
| 3. Always-Buy Telegraph (No Gate) | — | — | $0.20 (10 wasted) | 20 | — |
| 4. **Live `plumb` Gateway** | **7/10** | **17/20** | **$0.0800** | **8** | 2280ms |

## Per-Query Receipt & Ground-Truth Audit
| ID | Intent | Ground Truth | Arm 1 (LLM) | Arm 4 (plumb) | Status | Cost | Sepolia Receipt |
| :--- | :--- | :--- | :---: | :---: | :--- | ---: | :--- |
| `live-01-btc` | `CRYPTO_PRICE_USD` | `63789.115` | FAIL | PASS | `VERIFIED_OK` | $0.01 | `0x794b94e57516…` |
| `live-02-sol` | `CRYPTO_PRICE_USD` | `77.205` | FAIL | PASS | `VERIFIED_OK` | $0.01 | `0x919b36a55395…` |
| `live-03-eurusd` | `FX_NOW_EUR` | `1.099` | FAIL | FAIL | `FAIL_CLOSED_MINER` | $0.00 | `—` |
| `live-04-eurgbp` | `FX_NOW_EUR` | `0.83735` | FAIL | FAIL | `FAIL_CLOSED_MINER` | $0.00 | `—` |
| `live-05-ssl-expired` | `SSL_VERIFICATION_CERT` | `false` | PASS | PASS | `VERIFIED_OK` | $0.01 | `0x189b63e29f6c…` |
| `live-06-ssl-github` | `SSL_VERIFICATION_CERT` | `true` | PASS | PASS | `VERIFIED_OK` | $0.01 | `0xa8a4256588a7…` |
| `live-07-url-phish` | `URL_SCAN_VERDICT` | `false` | PASS | FAIL | `VERIFIED_OK` | $0.01 | `0x54c1004b5058…` |
| `live-08-url-google` | `URL_SCAN_VERDICT` | `true` | PASS | PASS | `VERIFIED_OK` | $0.01 | `0x0167686e4560…` |
| `live-09-dns-mx` | `DNS_RECORD_LOOKUP_GENERAL` | `true` | PASS | PASS | `VERIFIED_OK` | $0.01 | `0xf4f3d046d1fc…` |
| `live-10-dns-nx` | `DNS_RECORD_LOOKUP_GENERAL` | `false` | FAIL | PASS | `VERIFIED_OK` | $0.01 | `0xf2ccde7227e9…` |
| `static-01-paris` | `NONE` | `"paris"` | PASS | PASS | `PASSTHROUGH_OK` | $0.00 | `—` |
| `static-02-math` | `NONE` | `12` | PASS | PASS | `PASSTHROUGH_OK` | $0.00 | `—` |
| `static-03-http402` | `NONE` | `402` | PASS | PASS | `PASSTHROUGH_OK` | $0.00 | `—` |
| `static-04-sha256` | `NONE` | `256` | PASS | PASS | `PASSTHROUGH_OK` | $0.00 | `—` |
| `static-05-hist-btc` | `NONE` | `"20,000"` | PASS | PASS | `PASSTHROUGH_OK` | $0.00 | `—` |
| `static-06-code` | `NONE` | `"function"` | PASS | PASS | `PASSTHROUGH_OK` | $0.00 | `—` |
| `static-07-tls-explain` | `NONE` | `"identity"` | PASS | PASS | `PASSTHROUGH_OK` | $0.00 | `—` |
| `static-08-opinion` | `NONE` | `"opinion"` | PASS | PASS | `PASSTHROUGH_OK` | $0.00 | `—` |
| `static-09-tcpudp` | `NONE` | `"tcp"` | PASS | PASS | `PASSTHROUGH_OK` | $0.00 | `—` |
| `static-10-tokyo` | `NONE` | `"tokyo"` | PASS | PASS | `PASSTHROUGH_OK` | $0.00 | `—` |
