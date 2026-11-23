# `plumb` — 120-Question Stratified 4-Arm Pareto Benchmark & Confusion Matrix

- **Dataset**: 120 stratified prompts (60 live real-world-state across all 9 Telegraph Intents + 60 static/conceptual/coding/adversarial-trap passthroughs)
- **Captured**: `2026-11-23T14:06:35.007Z`
- **Classifier Latency**: p50 = `0.007ms`, p95 = `0.442ms`

## Epistemic Boundary Confusion Matrix (Honest Metrics)
| Metric | Value |
| :--- | ---: |
| True Positives (Live → VERIFY) | **60 / 60** |
| False Positives (Static/Trap → VERIFY) | **0** |
| True Negatives (Static/Trap → PASSTHROUGH) | **60 / 60** |
| False Negatives (Live → PASSTHROUGH) | **0** |
| Precision | **100.00%** |
| Recall | **100.00%** |
| F1 Score | **100.00%** |
| Intent Exact-Match Accuracy | **60 / 60 (100.00%)** |

## 4-Arm Cost & Verification Pareto Table (120 Requests @ $0.01/ask)
| Arm | Telegraph Calls | USDC Cost | Cost vs Always-Buy | Cryptographic Receipts |
| :--- | ---: | ---: | ---: | :---: |
| 1. Base LLM (No Tools) | 0 | $0.00 | -100% (0% live freshness) | No |
| 2. LLM + Free Public API Tools | 0 | $0.00 | -100% (no decentralized quorum) | No |
| 3. Always-Buy Telegraph | 120 | $1.20 | baseline (60 wasted calls) | Yes |
| 4. **`plumb` Epistemic Gateway** | **60** | **$0.60** | **-50% ($0.60 saved)** | **Yes** |

## Misclassifications
Zero misclassifications across all 120 stratified prompts.
