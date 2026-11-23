import type { BoundaryDecision, SupportedIntent } from "../types.js";

const CRYPTO_ALIASES: Record<string, string> = {
  bitcoin: "BTC",
  btc: "BTC",
  ethereum: "ETH",
  ether: "ETH",
  eth: "ETH",
  solana: "SOL",
  sol: "SOL",
  avalanche: "AVAX",
  avax: "AVAX",
  chainlink: "LINK",
  link: "LINK",
  uniswap: "UNI",
  uni: "UNI",
  arbitrum: "ARB",
  arb: "ARB",
  optimism: "OP",
  dogecoin: "DOGE",
  doge: "DOGE",
  ripple: "XRP",
  xrp: "XRP",
  cardano: "ADA",
  ada: "ADA",
  bnb: "BNB",
  aave: "AAVE",
  sui: "SUI",
  polkadot: "DOT",
  dot: "DOT",
  litecoin: "LTC",
  ltc: "LTC",
  toncoin: "TON",
  ton: "TON",
  pepe: "PEPE",
  shib: "SHIB",
  matic: "MATIC",
  polygon: "MATIC",
};

const STOCK_ALIASES: Record<string, string> = {
  apple: "AAPL",
  aapl: "AAPL",
  nvidia: "NVDA",
  nvda: "NVDA",
  microsoft: "MSFT",
  msft: "MSFT",
  tesla: "TSLA",
  tsla: "TSLA",
  alphabet: "GOOGL",
  googl: "GOOGL",
  goog: "GOOG",
  amazon: "AMZN",
  amzn: "AMZN",
  meta: "META",
  amd: "AMD",
  netflix: "NFLX",
  nflx: "NFLX",
  spy: "SPY",
  qqq: "QQQ",
  coinbase: "COIN",
  coin: "COIN",
  palantir: "PLTR",
  pltr: "PLTR",
  intel: "INTC",
  intc: "INTC",
  oracle: "ORCL",
  orcl: "ORCL",
  jpmorgan: "JPM",
  jpm: "JPM",
  walmart: "WMT",
  wmt: "WMT",
  disney: "DIS",
  dis: "DIS",
  uber: "UBER",
  broadcom: "AVGO",
  avgo: "AVGO",
};

const FIAT_CODES = new Set([
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "NGN",
  "INR",
  "BRL",
  "MXN",
  "SGD",
  "HKD",
  "KRW",
  "SEK",
  "NOK",
  "NZD",
  "ZAR",
  "AED",
]);

const DNS_TYPES = new Set([
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "NS",
  "TXT",
  "SOA",
  "CAA",
  "SRV",
  "PTR",
]);

function decision(
  startMs: number,
  mode: "PASSTHROUGH" | "VERIFY",
  reason: string,
  confidence: number,
  intent?: SupportedIntent,
  params?: Record<string, unknown>
): BoundaryDecision {
  return {
    mode,
    intent,
    params,
    reason,
    confidence,
    classifierLatencyMs: Number((performance.now() - startMs).toFixed(3)),
  };
}

function isNonLivePassthrough(text: string): string | null {
  if (
    /\b(write|create|implement|code|build|generate|show me)\b[\s\S]{0,60}\b(function|script|code|class|component|snippet|program|python|typescript|javascript|rust|golang|sql|curl)\b/i.test(
      text
    )
  ) {
    return "code_generation_request";
  }
  if (
    /^\s*(explain|how do i|how does|how to|what is the difference|summarize|define|describe|compare|why is|why does|tell me about)\b/i.test(
      text
    )
  ) {
    return "conceptual_or_educational_query";
  }
  if (
    /\b(good (long[- ]term )?(investment|store of value)|should i (buy|sell|invest)|worth buying|your opinion|predict|forecast what|will .* reach)\b/i.test(
      text
    )
  ) {
    return "opinion_or_prediction_query";
  }
  if (
    /\b(was the price|were the prices|in (19\d\d|20[01]\d|202[0-5])|last year|yesterday|historically|all[- ]time high)\b/i.test(
      text
    )
  ) {
    return "historical_not_live_query";
  }
  return null;
}

function extractDomain(text: string): string | null {
  const urlMatch = text.match(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  const bareMatch = text.match(
    /\b([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)\b/i
  );
  if (bareMatch) {
    const candidate = bareMatch[1].toLowerCase();
    // Avoid matching decimal numbers like 3.14 or file extensions without TLD context
    if (/[a-z]{2,}$/.test(candidate)) return candidate;
  }
  return null;
}

export function classifyEpistemicBoundary(prompt: string): BoundaryDecision {
  const startMs = performance.now();
  const text = prompt.trim();
  if (!text) {
    return decision(startMs, "PASSTHROUGH", "empty_prompt", 1.0);
  }

  const guardReason = isNonLivePassthrough(text);
  if (guardReason) {
    return decision(startMs, "PASSTHROUGH", guardReason, 0.96);
  }

  const lower = text.toLowerCase();

  // 1. URL_SCAN_VERDICT
  const urlMatch = text.match(/https?:\/\/[^\s<>"'`)]+/i);
  if (
    urlMatch &&
    /\b(safe|phish|phishing|malicious|malware|scam|suspicious|legit|legitimate|dangerous|scan|verdict|trust|click)\b/i.test(
      lower
    )
  ) {
    const cleanUrl = urlMatch[0].replace(/[.,;!?]+$/, "");
    return decision(
      startMs,
      "VERIFY",
      "live_url_safety_check",
      0.95,
      "URL_SCAN_VERDICT",
      { url: cleanUrl }
    );
  }

  // 2. SSL_VERIFICATION_CERT
  if (/\b(ssl|tls|https certificate|certificate|cert)\b/i.test(lower)) {
    const host = extractDomain(text);
    if (host) {
      return decision(
        startMs,
        "VERIFY",
        "live_ssl_certificate_check",
        0.95,
        "SSL_VERIFICATION_CERT",
        { host }
      );
    }
  }

  // 3. DNS_RECORD_LOOKUP_GENERAL
  if (/\b(dns|mx|txt|aaaa|cname|spf|dmarc|ns|soa|caa|srv|ptr)\b/i.test(lower) && /\b(record|dns|lookup|have an?|has an?|resolve)\b/i.test(lower)) {
    const host = extractDomain(text);
    if (host) {
      const tokens = text.toUpperCase().match(/\b(AAAA|CNAME|MX|NS|TXT|SOA|CAA|SRV|PTR|A)\b/g) ?? [];
      const recType = tokens.find((t) => DNS_TYPES.has(t)) ?? "A";
      return decision(
        startMs,
        "VERIFY",
        "live_dns_record_lookup",
        0.94,
        "DNS_RECORD_LOOKUP_GENERAL",
        { name: host, record_type: recType }
      );
    }
  }

  // 4. CURRENCY_EXCHANGE_CONVERT
  const convertMatch = text.match(
    /\b(?:convert|exchange|change)\s+(\d+(?:[.,]\d+)?)\s+([a-z]{3})\s+(?:to|into|in)\s+([a-z]{3})\b/i
  );
  if (convertMatch) {
    const amount = Number(convertMatch[1].replace(",", ""));
    const fromCur = convertMatch[2].toUpperCase();
    const toCur = convertMatch[3].toUpperCase();
    if (Number.isFinite(amount) && amount > 0 && FIAT_CODES.has(fromCur) && FIAT_CODES.has(toCur)) {
      return decision(
        startMs,
        "VERIFY",
        "live_currency_conversion",
        0.95,
        "CURRENCY_EXCHANGE_CONVERT",
        { from_currency: fromCur, to_currency: toCur, amount }
      );
    }
  }

  // 5. FX_NOW_EUR / FX_NOW_CAD
  const fxPairMatch = text.match(/\b(EUR|CAD)\s*(?:to|\/|-)\s*([A-Z]{3})\b/i);
  if (
    fxPairMatch &&
    /\b(rate|exchange|fx|forex|worth|trading|current|live|now)\b/i.test(lower)
  ) {
    const baseCur = fxPairMatch[1].toUpperCase();
    const quoteCur = fxPairMatch[2].toUpperCase();
    if (FIAT_CODES.has(quoteCur) && quoteCur !== baseCur) {
      return decision(
        startMs,
        "VERIFY",
        `live_fx_rate_${baseCur.toLowerCase()}`,
        0.94,
        baseCur === "EUR" ? "FX_NOW_EUR" : "FX_NOW_CAD",
        { currency: quoteCur }
      );
    }
  }

  // 6. WEATHER_CHECK_TEMPERATURE
  if (/\b(temperature|weather|how hot|how cold|degrees)\b/i.test(lower)) {
    const locMatch = text.match(
      /\b(?:in|at|for)\s+([A-Za-z][A-Za-z\s,'-]{1,40}?)(?:\s+(?:right now|currently|today|now|at the moment))?[?.!]*$/i
    );
    if (locMatch) {
      const location = locMatch[1].trim().replace(/[?.!,]+$/, "");
      if (location.length >= 2) {
        return decision(
          startMs,
          "VERIFY",
          "live_weather_temperature",
          0.93,
          "WEATHER_CHECK_TEMPERATURE",
          { location }
        );
      }
    }
  }

  // 7. CRYPTO_PRICE_USD
  const hasMarketPriceCue =
    /\b(price|trading|worth|cost|quote|market value|current|live|right now|spot)\b/i.test(
      lower
    );
  if (hasMarketPriceCue) {
    const words = lower.match(/\b[a-z]{2,15}\b/g) ?? [];
    for (const w of words) {
      if (CRYPTO_ALIASES[w]) {
        return decision(
          startMs,
          "VERIFY",
          "live_crypto_price_usd",
          0.94,
          "CRYPTO_PRICE_USD",
          { symbol: CRYPTO_ALIASES[w] }
        );
      }
    }
  }

  // 8. STOCK_PRICE_US_EQUITY
  if (
    hasMarketPriceCue ||
    /\b(stock|share|shares|equity|nasdaq|nyse|ticker)\b/i.test(lower)
  ) {
    const dollarTicker = text.match(/\$([A-Z]{1,5})\b/);
    if (dollarTicker) {
      return decision(
        startMs,
        "VERIFY",
        "live_us_equity_price",
        0.93,
        "STOCK_PRICE_US_EQUITY",
        { ticker: dollarTicker[1] }
      );
    }
    const words = lower.match(/\b[a-z]{1,15}\b/g) ?? [];
    for (const w of words) {
      if (STOCK_ALIASES[w]) {
        return decision(
          startMs,
          "VERIFY",
          "live_us_equity_price",
          0.93,
          "STOCK_PRICE_US_EQUITY",
          { ticker: STOCK_ALIASES[w] }
        );
      }
    }
  }

  return decision(startMs, "PASSTHROUGH", "no_live_intent_matched", 0.9);
}
