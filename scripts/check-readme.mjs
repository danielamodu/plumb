import { readFileSync } from "node:fs";
import { join } from "node:path";

const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
const required = [
  "Quickstart",
  "CRYPTO_PRICE_USD",
  "STOCK_PRICE_US_EQUITY",
  "FX_NOW_EUR",
  "FX_NOW_CAD",
  "CURRENCY_EXCHANGE_CONVERT",
  "WEATHER_CHECK_TEMPERATURE",
  "URL_SCAN_VERDICT",
  "SSL_VERIFICATION_CERT",
  "DNS_RECORD_LOOKUP_GENERAL",
  "Explicit Limits",
  "Same-Author Disclosure",
  "bench/results/PARETO.md",
  "bench/results/adversarial-trace.json",
];

const missing = required.filter((k) => !readme.includes(k));
if (missing.length > 0) {
  console.error("README_CHECK_FAILED missing:", missing);
  process.exit(1);
}
console.log(JSON.stringify({ valid: true, repo: "plumb", checkedSections: required.length }));
