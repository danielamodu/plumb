import type { SupportedIntent } from "../src/types.js";

export interface BenchmarkQuestion {
  id: string;
  prompt: string;
  expectedMode: "VERIFY" | "PASSTHROUGH";
  expectedIntent?: SupportedIntent;
  category: string;
}

export const DATASET_120: BenchmarkQuestion[] = [
  // === 60 LIVE REAL-WORLD-STATE QUESTIONS (VERIFY) ===
  // 10 CRYPTO_PRICE_USD
  { id: "live-crypto-01", prompt: "What is the current price of BTC in USD?", expectedMode: "VERIFY", expectedIntent: "CRYPTO_PRICE_USD", category: "crypto_price" },
  { id: "live-crypto-02", prompt: "What is ETH trading at right now in USD?", expectedMode: "VERIFY", expectedIntent: "CRYPTO_PRICE_USD", category: "crypto_price" },
  { id: "live-crypto-03", prompt: "Check the live price of Solana.", expectedMode: "VERIFY", expectedIntent: "CRYPTO_PRICE_USD", category: "crypto_price" },
  { id: "live-crypto-04", prompt: "How much is AVAX worth right now?", expectedMode: "VERIFY", expectedIntent: "CRYPTO_PRICE_USD", category: "crypto_price" },
  { id: "live-crypto-05", prompt: "Give me the current spot price of Chainlink.", expectedMode: "VERIFY", expectedIntent: "CRYPTO_PRICE_USD", category: "crypto_price" },
  { id: "live-crypto-06", prompt: "What is the live UNI token price?", expectedMode: "VERIFY", expectedIntent: "CRYPTO_PRICE_USD", category: "crypto_price" },
  { id: "live-crypto-07", prompt: "How much does Dogecoin cost right now?", expectedMode: "VERIFY", expectedIntent: "CRYPTO_PRICE_USD", category: "crypto_price" },
  { id: "live-crypto-08", prompt: "What is the current XRP quote in USD?", expectedMode: "VERIFY", expectedIntent: "CRYPTO_PRICE_USD", category: "crypto_price" },
  { id: "live-crypto-09", prompt: "Check the current price of AAVE.", expectedMode: "VERIFY", expectedIntent: "CRYPTO_PRICE_USD", category: "crypto_price" },
  { id: "live-crypto-10", prompt: "What is SUI trading for right now?", expectedMode: "VERIFY", expectedIntent: "CRYPTO_PRICE_USD", category: "crypto_price" },

  // 8 STOCK_PRICE_US_EQUITY
  { id: "live-stock-01", prompt: "What is the current price of NVDA stock?", expectedMode: "VERIFY", expectedIntent: "STOCK_PRICE_US_EQUITY", category: "us_equity" },
  { id: "live-stock-02", prompt: "How much is AAPL trading for right now?", expectedMode: "VERIFY", expectedIntent: "STOCK_PRICE_US_EQUITY", category: "us_equity" },
  { id: "live-stock-03", prompt: "Check the live share price of MSFT.", expectedMode: "VERIFY", expectedIntent: "STOCK_PRICE_US_EQUITY", category: "us_equity" },
  { id: "live-stock-04", prompt: "What is TSLA stock worth right now?", expectedMode: "VERIFY", expectedIntent: "STOCK_PRICE_US_EQUITY", category: "us_equity" },
  { id: "live-stock-05", prompt: "Get the current quote for $AMZN.", expectedMode: "VERIFY", expectedIntent: "STOCK_PRICE_US_EQUITY", category: "us_equity" },
  { id: "live-stock-06", prompt: "What is META share price right now?", expectedMode: "VERIFY", expectedIntent: "STOCK_PRICE_US_EQUITY", category: "us_equity" },
  { id: "live-stock-07", prompt: "Check the current stock price of Coinbase.", expectedMode: "VERIFY", expectedIntent: "STOCK_PRICE_US_EQUITY", category: "us_equity" },
  { id: "live-stock-08", prompt: "How much is $SPY trading at right now?", expectedMode: "VERIFY", expectedIntent: "STOCK_PRICE_US_EQUITY", category: "us_equity" },

  // 6 FX_NOW_EUR
  { id: "live-fxeur-01", prompt: "What is the live EUR to USD exchange rate?", expectedMode: "VERIFY", expectedIntent: "FX_NOW_EUR", category: "fx_eur" },
  { id: "live-fxeur-02", prompt: "Check the current EUR/GBP forex rate.", expectedMode: "VERIFY", expectedIntent: "FX_NOW_EUR", category: "fx_eur" },
  { id: "live-fxeur-03", prompt: "What is EUR to JPY trading at right now?", expectedMode: "VERIFY", expectedIntent: "FX_NOW_EUR", category: "fx_eur" },
  { id: "live-fxeur-04", prompt: "Current EUR to CHF exchange rate please.", expectedMode: "VERIFY", expectedIntent: "FX_NOW_EUR", category: "fx_eur" },
  { id: "live-fxeur-05", prompt: "What is the EUR to CAD rate now?", expectedMode: "VERIFY", expectedIntent: "FX_NOW_EUR", category: "fx_eur" },
  { id: "live-fxeur-06", prompt: "Live EUR/AUD exchange rate right now.", expectedMode: "VERIFY", expectedIntent: "FX_NOW_EUR", category: "fx_eur" },

  // 6 FX_NOW_CAD
  { id: "live-fxcad-01", prompt: "What is the live CAD to USD exchange rate?", expectedMode: "VERIFY", expectedIntent: "FX_NOW_CAD", category: "fx_cad" },
  { id: "live-fxcad-02", prompt: "Check the current CAD/GBP forex rate.", expectedMode: "VERIFY", expectedIntent: "FX_NOW_CAD", category: "fx_cad" },
  { id: "live-fxcad-03", prompt: "What is CAD to EUR trading at right now?", expectedMode: "VERIFY", expectedIntent: "FX_NOW_CAD", category: "fx_cad" },
  { id: "live-fxcad-04", prompt: "Current CAD to JPY exchange rate.", expectedMode: "VERIFY", expectedIntent: "FX_NOW_CAD", category: "fx_cad" },
  { id: "live-fxcad-05", prompt: "Live CAD/AUD exchange rate now.", expectedMode: "VERIFY", expectedIntent: "FX_NOW_CAD", category: "fx_cad" },
  { id: "live-fxcad-06", prompt: "What is the CAD to CHF rate right now?", expectedMode: "VERIFY", expectedIntent: "FX_NOW_CAD", category: "fx_cad" },

  // 6 CURRENCY_EXCHANGE_CONVERT
  { id: "live-conv-01", prompt: "Convert 250 USD to JPY right now.", expectedMode: "VERIFY", expectedIntent: "CURRENCY_EXCHANGE_CONVERT", category: "fx_convert" },
  { id: "live-conv-02", prompt: "Convert 1000 EUR to GBP.", expectedMode: "VERIFY", expectedIntent: "CURRENCY_EXCHANGE_CONVERT", category: "fx_convert" },
  { id: "live-conv-03", prompt: "Exchange 500 GBP into USD.", expectedMode: "VERIFY", expectedIntent: "CURRENCY_EXCHANGE_CONVERT", category: "fx_convert" },
  { id: "live-conv-04", prompt: "Convert 75 CAD to EUR.", expectedMode: "VERIFY", expectedIntent: "CURRENCY_EXCHANGE_CONVERT", category: "fx_convert" },
  { id: "live-conv-05", prompt: "Convert 5000 USD to NGN.", expectedMode: "VERIFY", expectedIntent: "CURRENCY_EXCHANGE_CONVERT", category: "fx_convert" },
  { id: "live-conv-06", prompt: "Exchange 120 CHF to USD.", expectedMode: "VERIFY", expectedIntent: "CURRENCY_EXCHANGE_CONVERT", category: "fx_convert" },

  // 6 WEATHER_CHECK_TEMPERATURE
  { id: "live-wx-01", prompt: "What is the current temperature in Lagos?", expectedMode: "VERIFY", expectedIntent: "WEATHER_CHECK_TEMPERATURE", category: "weather" },
  { id: "live-wx-02", prompt: "How hot is it in London right now?", expectedMode: "VERIFY", expectedIntent: "WEATHER_CHECK_TEMPERATURE", category: "weather" },
  { id: "live-wx-03", prompt: "Check the temperature in Tokyo currently.", expectedMode: "VERIFY", expectedIntent: "WEATHER_CHECK_TEMPERATURE", category: "weather" },
  { id: "live-wx-04", prompt: "What is the weather temperature in New York?", expectedMode: "VERIFY", expectedIntent: "WEATHER_CHECK_TEMPERATURE", category: "weather" },
  { id: "live-wx-05", prompt: "How cold is it in Stockholm today?", expectedMode: "VERIFY", expectedIntent: "WEATHER_CHECK_TEMPERATURE", category: "weather" },
  { id: "live-wx-06", prompt: "What is the current temperature in Nairobi?", expectedMode: "VERIFY", expectedIntent: "WEATHER_CHECK_TEMPERATURE", category: "weather" },

  // 6 URL_SCAN_VERDICT
  { id: "live-url-01", prompt: "Is https://www.google.com/ safe to visit?", expectedMode: "VERIFY", expectedIntent: "URL_SCAN_VERDICT", category: "url_scan" },
  { id: "live-url-02", prompt: "Is https://testsafebrowsing.appspot.com/s/phishing.html a phishing URL?", expectedMode: "VERIFY", expectedIntent: "URL_SCAN_VERDICT", category: "url_scan" },
  { id: "live-url-03", prompt: "Scan https://xn--pple-43d.com/login for malware or phishing.", expectedMode: "VERIFY", expectedIntent: "URL_SCAN_VERDICT", category: "url_scan" },
  { id: "live-url-04", prompt: "Is https://paypa1-secure-login.xyz/verify malicious?", expectedMode: "VERIFY", expectedIntent: "URL_SCAN_VERDICT", category: "url_scan" },
  { id: "live-url-05", prompt: "Check if https://github.com/danielamodu/plumb is safe.", expectedMode: "VERIFY", expectedIntent: "URL_SCAN_VERDICT", category: "url_scan" },
  { id: "live-url-06", prompt: "Is https://paypal.com@evil-login.xyz/account a scam link?", expectedMode: "VERIFY", expectedIntent: "URL_SCAN_VERDICT", category: "url_scan" },

  // 6 SSL_VERIFICATION_CERT
  { id: "live-ssl-01", prompt: "Is the SSL certificate valid for google.com?", expectedMode: "VERIFY", expectedIntent: "SSL_VERIFICATION_CERT", category: "ssl_cert" },
  { id: "live-ssl-02", prompt: "Check if expired.badssl.com has a valid SSL certificate.", expectedMode: "VERIFY", expectedIntent: "SSL_VERIFICATION_CERT", category: "ssl_cert" },
  { id: "live-ssl-03", prompt: "Verify the TLS certificate on self-signed.badssl.com.", expectedMode: "VERIFY", expectedIntent: "SSL_VERIFICATION_CERT", category: "ssl_cert" },
  { id: "live-ssl-04", prompt: "Is the HTTPS certificate for wrong.host.badssl.com valid?", expectedMode: "VERIFY", expectedIntent: "SSL_VERIFICATION_CERT", category: "ssl_cert" },
  { id: "live-ssl-05", prompt: "Check the SSL cert for github.com.", expectedMode: "VERIFY", expectedIntent: "SSL_VERIFICATION_CERT", category: "ssl_cert" },
  { id: "live-ssl-06", prompt: "Is the TLS cert valid on 13-60-129-92.sslip.io?", expectedMode: "VERIFY", expectedIntent: "SSL_VERIFICATION_CERT", category: "ssl_cert" },

  // 6 DNS_RECORD_LOOKUP_GENERAL
  { id: "live-dns-01", prompt: "Does openai.com have an MX DNS record?", expectedMode: "VERIFY", expectedIntent: "DNS_RECORD_LOOKUP_GENERAL", category: "dns_lookup" },
  { id: "live-dns-02", prompt: "Check if github.com has an A DNS record.", expectedMode: "VERIFY", expectedIntent: "DNS_RECORD_LOOKUP_GENERAL", category: "dns_lookup" },
  { id: "live-dns-03", prompt: "Does cloudflare.com have a TXT DNS record?", expectedMode: "VERIFY", expectedIntent: "DNS_RECORD_LOOKUP_GENERAL", category: "dns_lookup" },
  { id: "live-dns-04", prompt: "Lookup AAAA DNS record for google.com.", expectedMode: "VERIFY", expectedIntent: "DNS_RECORD_LOOKUP_GENERAL", category: "dns_lookup" },
  { id: "live-dns-05", prompt: "Does ethereum.org have an NS DNS record?", expectedMode: "VERIFY", expectedIntent: "DNS_RECORD_LOOKUP_GENERAL", category: "dns_lookup" },
  { id: "live-dns-06", prompt: "Check if stripe.com has a CAA DNS record.", expectedMode: "VERIFY", expectedIntent: "DNS_RECORD_LOOKUP_GENERAL", category: "dns_lookup" },

  // === 60 NON-LIVE / STATIC / ADVERSARIAL PASSTHROUGH QUESTIONS (PASSTHROUGH) ===
  // 15 Static Facts & Math
  { id: "pass-static-01", prompt: "What is the capital of France?", expectedMode: "PASSTHROUGH", category: "static_fact" },
  { id: "pass-static-02", prompt: "What is the boiling point of water at sea level?", expectedMode: "PASSTHROUGH", category: "static_fact" },
  { id: "pass-static-03", prompt: "Who wrote The Mythical Man-Month?", expectedMode: "PASSTHROUGH", category: "static_fact" },
  { id: "pass-static-04", prompt: "What is 144 divided by 12?", expectedMode: "PASSTHROUGH", category: "static_fact" },
  { id: "pass-static-05", prompt: "What is the speed of light in vacuum?", expectedMode: "PASSTHROUGH", category: "static_fact" },
  { id: "pass-static-06", prompt: "What chemical element has atomic number 79?", expectedMode: "PASSTHROUGH", category: "static_fact" },
  { id: "pass-static-07", prompt: "How many bits are in a SHA-256 hash?", expectedMode: "PASSTHROUGH", category: "static_fact" },
  { id: "pass-static-08", prompt: "What port does HTTPS use by default?", expectedMode: "PASSTHROUGH", category: "static_fact" },
  { id: "pass-static-09", prompt: "What is the derivative of x^3?", expectedMode: "PASSTHROUGH", category: "static_fact" },
  { id: "pass-static-10", prompt: "Which HTTP status code means Payment Required?", expectedMode: "PASSTHROUGH", category: "static_fact" },
  { id: "pass-static-11", prompt: "What is the time complexity of binary search?", expectedMode: "PASSTHROUGH", category: "static_fact" },
  { id: "pass-static-12", prompt: "Who invented the World Wide Web?", expectedMode: "PASSTHROUGH", category: "static_fact" },
  { id: "pass-static-13", prompt: "How many bytes are in an Ethereum address?", expectedMode: "PASSTHROUGH", category: "static_fact" },
  { id: "pass-static-14", prompt: "What does ACID stand for in databases?", expectedMode: "PASSTHROUGH", category: "static_fact" },
  { id: "pass-static-15", prompt: "What is the capital of Japan?", expectedMode: "PASSTHROUGH", category: "static_fact" },

  // 15 Conceptual / Educational / Explanations
  { id: "pass-edu-01", prompt: "Explain how SSL certificates and TLS handshakes work.", expectedMode: "PASSTHROUGH", category: "conceptual" },
  { id: "pass-edu-02", prompt: "Summarize the difference between TCP and UDP.", expectedMode: "PASSTHROUGH", category: "conceptual" },
  { id: "pass-edu-03", prompt: "How do I configure an MX record in Cloudflare DNS?", expectedMode: "PASSTHROUGH", category: "conceptual" },
  { id: "pass-edu-04", prompt: "Explain what a punycode homograph attack is.", expectedMode: "PASSTHROUGH", category: "conceptual" },
  { id: "pass-edu-05", prompt: "How does EIP-191 personal_sign differ from EIP-712?", expectedMode: "PASSTHROUGH", category: "conceptual" },
  { id: "pass-edu-06", prompt: "Define Certificate Transparency logs.", expectedMode: "PASSTHROUGH", category: "conceptual" },
  { id: "pass-edu-07", prompt: "Compare Ethereum Sepolia and Mainnet.", expectedMode: "PASSTHROUGH", category: "conceptual" },
  { id: "pass-edu-08", prompt: "Why does DNS caching use TTL values?", expectedMode: "PASSTHROUGH", category: "conceptual" },
  { id: "pass-edu-09", prompt: "Explain how x402 HTTP payment flows work.", expectedMode: "PASSTHROUGH", category: "conceptual" },
  { id: "pass-edu-10", prompt: "Describe the CAP theorem in distributed systems.", expectedMode: "PASSTHROUGH", category: "conceptual" },
  { id: "pass-edu-11", prompt: "How does a systemd service restart on failure?", expectedMode: "PASSTHROUGH", category: "conceptual" },
  { id: "pass-edu-12", prompt: "Explain why prompt injection happens in LLM agents.", expectedMode: "PASSTHROUGH", category: "conceptual" },
  { id: "pass-edu-13", prompt: "What is the difference between symmetric and asymmetric encryption?", expectedMode: "PASSTHROUGH", category: "conceptual" },
  { id: "pass-edu-14", prompt: "How do exchange rates affect international trade?", expectedMode: "PASSTHROUGH", category: "conceptual" },
  { id: "pass-edu-15", prompt: "Explain how Caddy provisions Let's Encrypt certificates.", expectedMode: "PASSTHROUGH", category: "conceptual" },

  // 15 Coding / Engineering Tasks
  { id: "pass-code-01", prompt: "Write a TypeScript function to fetch the current ETH price.", expectedMode: "PASSTHROUGH", category: "coding" },
  { id: "pass-code-02", prompt: "Create a Python script to parse JSONL files.", expectedMode: "PASSTHROUGH", category: "coding" },
  { id: "pass-code-03", prompt: "Write a SQL query to group sales by month.", expectedMode: "PASSTHROUGH", category: "coding" },
  { id: "pass-code-04", prompt: "Build a JavaScript debounce utility function.", expectedMode: "PASSTHROUGH", category: "coding" },
  { id: "pass-code-05", prompt: "Write a Rust function to check if a string is a palindrome.", expectedMode: "PASSTHROUGH", category: "coding" },
  { id: "pass-code-06", prompt: "Show me a TypeScript Zod schema for a user profile.", expectedMode: "PASSTHROUGH", category: "coding" },
  { id: "pass-code-07", prompt: "Generate a curl command for an OpenAI chat completion.", expectedMode: "PASSTHROUGH", category: "coding" },
  { id: "pass-code-08", prompt: "Implement a mutex lock in TypeScript using Promises.", expectedMode: "PASSTHROUGH", category: "coding" },
  { id: "pass-code-09", prompt: "Write a Python function to validate an IPv4 address.", expectedMode: "PASSTHROUGH", category: "coding" },
  { id: "pass-code-10", prompt: "Create a Node.js script that checks SSL cert expiry.", expectedMode: "PASSTHROUGH", category: "coding" },
  { id: "pass-code-11", prompt: "Write a SQL migration to add an index on created_at.", expectedMode: "PASSTHROUGH", category: "coding" },
  { id: "pass-code-12", prompt: "Implement binary search in Go.", expectedMode: "PASSTHROUGH", category: "coding" },
  { id: "pass-code-13", prompt: "Write a TypeScript helper to format USDC micro-units.", expectedMode: "PASSTHROUGH", category: "coding" },
  { id: "pass-code-14", prompt: "Create a Python class for a token bucket rate limiter.", expectedMode: "PASSTHROUGH", category: "coding" },
  { id: "pass-code-15", prompt: "Write a JavaScript function to strip HTML tags.", expectedMode: "PASSTHROUGH", category: "coding" },

  // 15 Adversarial False-Positive Traps (historical, opinion, "as of today" static)
  { id: "pass-trap-01", prompt: "What is the capital of France as of today?", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
  { id: "pass-trap-02", prompt: "Is Bitcoin a good long-term store of value?", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
  { id: "pass-trap-03", prompt: "What was the price of Bitcoin in December 2017?", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
  { id: "pass-trap-04", prompt: "Should I buy NVDA stock right now?", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
  { id: "pass-trap-05", prompt: "Will Ethereum reach $10,000 next year?", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
  { id: "pass-trap-06", prompt: "What was the EUR to USD rate in 2020?", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
  { id: "pass-trap-07", prompt: "Is Solana better than Ethereum in your opinion?", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
  { id: "pass-trap-08", prompt: "What was Apple's all-time high stock price in 2022?", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
  { id: "pass-trap-09", prompt: "Forecast what the weather in London will be like next decade.", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
  { id: "pass-trap-10", prompt: "Should I invest in AAPL or MSFT?", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
  { id: "pass-trap-11", prompt: "What was the temperature in Tokyo yesterday?", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
  { id: "pass-trap-12", prompt: "Is gold a good investment compared to BTC?", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
  { id: "pass-trap-13", prompt: "What were the prices of top cryptos in 2021?", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
  { id: "pass-trap-14", prompt: "Give me your opinion on phishing awareness training.", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
  { id: "pass-trap-15", prompt: "Is 2 + 2 still 4 right now?", expectedMode: "PASSTHROUGH", category: "adversarial_trap" },
];
