import test from "node:test";
import assert from "node:assert/strict";
import { classifyEpistemicBoundary } from "../src/classifier/gate.js";

test("routes all 9 live real-world-state intents to VERIFY with exact params", () => {
  const cases: Array<{
    prompt: string;
    intent: string;
    checkParams: (p: Record<string, unknown>) => boolean;
  }> = [
    {
      prompt: "What is the current price of ETH in USD?",
      intent: "CRYPTO_PRICE_USD",
      checkParams: (p) => p.symbol === "ETH",
    },
    {
      prompt: "How much is NVDA stock trading for right now?",
      intent: "STOCK_PRICE_US_EQUITY",
      checkParams: (p) => p.ticker === "NVDA",
    },
    {
      prompt: "What is the EUR to USD exchange rate right now?",
      intent: "FX_NOW_EUR",
      checkParams: (p) => p.currency === "USD",
    },
    {
      prompt: "Check the live CAD to GBP exchange rate.",
      intent: "FX_NOW_CAD",
      checkParams: (p) => p.currency === "GBP",
    },
    {
      prompt: "Convert 250 USD to JPY right now.",
      intent: "CURRENCY_EXCHANGE_CONVERT",
      checkParams: (p) =>
        p.from_currency === "USD" && p.to_currency === "JPY" && p.amount === 250,
    },
    {
      prompt: "What is the current temperature in Lagos?",
      intent: "WEATHER_CHECK_TEMPERATURE",
      checkParams: (p) =>
        typeof p.location === "string" && p.location.toLowerCase().includes("lagos"),
    },
    {
      prompt: "Is https://secure-paypal-login.xyz/verify a phishing URL?",
      intent: "URL_SCAN_VERDICT",
      checkParams: (p) => p.url === "https://secure-paypal-login.xyz/verify",
    },
    {
      prompt: "Is the SSL certificate valid for expired.badssl.com?",
      intent: "SSL_VERIFICATION_CERT",
      checkParams: (p) => p.host === "expired.badssl.com",
    },
    {
      prompt: "Does openai.com have an MX DNS record?",
      intent: "DNS_RECORD_LOOKUP_GENERAL",
      checkParams: (p) => p.name === "openai.com" && p.record_type === "MX",
    },
  ];

  for (const c of cases) {
    const decision = classifyEpistemicBoundary(c.prompt);
    assert.equal(decision.mode, "VERIFY", `Expected VERIFY for: ${c.prompt}`);
    assert.equal(decision.intent, c.intent, `Expected ${c.intent} for: ${c.prompt}`);
    assert.ok(
      decision.params && c.checkParams(decision.params),
      `Unexpected params for ${c.prompt}: ${JSON.stringify(decision.params)}`
    );
    assert.ok(decision.classifierLatencyMs < 50);
  }
});

test("keeps static, opinion, coding, historical, and adversarial 'as of today' prompts in PASSTHROUGH", () => {
  const passthroughPrompts = [
    "What is the capital of France as of today?",
    "Is Bitcoin a good long-term store of value?",
    "Explain how SSL certificates and TLS handshakes work.",
    "Write a TypeScript function to fetch the current ETH price.",
    "What was the price of Bitcoin in December 2017?",
    "Summarize the difference between TCP and UDP.",
    "How do I configure an MX record in Cloudflare DNS?",
    "What is 144 divided by 12?",
  ];

  for (const prompt of passthroughPrompts) {
    const decision = classifyEpistemicBoundary(prompt);
    assert.equal(
      decision.mode,
      "PASSTHROUGH",
      `Expected PASSTHROUGH for: "${prompt}", got ${decision.mode} (${decision.intent})`
    );
  }
});
