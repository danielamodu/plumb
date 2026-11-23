import { z } from "zod";
import type { SanitizedAnswer, SupportedIntent } from "../types.js";

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|system)\s+instructions/i,
  /\bsystem\s+prompt\b/i,
  /\breveal\s+(your|the)\s+(api\s*key|secret|prompt|private\s*key|instructions)\b/i,
  /\byou\s+are\s+now\b/i,
  /<\|im_start\|>|<\|im_end\|>|\[INST\]|<<SYS>>/i,
  /\btransfer\s+(all\s+)?(funds|usdc|eth|tokens)\b/i,
  /\bexecute\s+(shell|bash|command|code)\b/i,
];

const INTENT_SCHEMAS: Record<SupportedIntent, z.ZodType<Record<string, unknown>>> = {
  CRYPTO_PRICE_USD: z.object({
    price_usd: z.number().finite().positive().max(100_000_000),
  }),
  STOCK_PRICE_US_EQUITY: z.object({
    price_usd: z.number().finite().positive().max(10_000_000),
  }),
  FX_NOW_EUR: z.object({
    rate: z.number().finite().positive().max(10_000_000),
  }),
  FX_NOW_CAD: z.object({
    rate: z.number().finite().positive().max(10_000_000),
  }),
  CURRENCY_EXCHANGE_CONVERT: z.object({
    converted_amount: z.number().finite().nonnegative().max(1e15),
  }),
  WEATHER_CHECK_TEMPERATURE: z.object({
    temperature_c: z.number().finite().min(-100).max(75),
  }),
  URL_SCAN_VERDICT: z.object({
    safe: z.boolean(),
  }),
  SSL_VERIFICATION_CERT: z.object({
    certificate_valid: z.boolean(),
  }),
  DNS_RECORD_LOOKUP_GENERAL: z.object({
    has_record: z.boolean(),
  }),
};

function scanForInjection(value: unknown, depth = 0): string | null {
  if (depth > 8 || value === null || value === undefined) return null;
  if (typeof value === "string") {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(value)) {
        return `Matched prompt-injection pattern: ${pattern.source}`;
      }
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = scanForInjection(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const keyHit = scanForInjection(k, depth + 1);
      if (keyHit) return keyHit;
      const valHit = scanForInjection(v, depth + 1);
      if (valHit) return valHit;
    }
  }
  return null;
}

export function sanitizeMinerAnswer(
  intent: SupportedIntent,
  rawAnswer: unknown
): SanitizedAnswer {
  const injectionHit = scanForInjection(rawAnswer);
  if (injectionHit) {
    return {
      valid: false,
      injectionDetected: true,
      rejectionReason: `Prompt injection quarantined: ${injectionHit}`,
    };
  }

  if (!rawAnswer || typeof rawAnswer !== "object" || Array.isArray(rawAnswer)) {
    return {
      valid: false,
      injectionDetected: false,
      rejectionReason: "Miner answer is not a JSON object",
    };
  }

  const schema = INTENT_SCHEMAS[intent];
  if (!schema) {
    return {
      valid: false,
      injectionDetected: false,
      rejectionReason: `Unsupported intent schema: ${intent}`,
    };
  }

  const parsed = schema.safeParse(rawAnswer);
  if (!parsed.success) {
    return {
      valid: false,
      injectionDetected: false,
      rejectionReason: `Schema validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }

  return {
    valid: true,
    data: parsed.data,
    injectionDetected: false,
  };
}

export function formatVerifiedContext(
  intent: SupportedIntent,
  data: Record<string, unknown>,
  minerLabel?: string,
  receiptHash?: string
): string {
  const fields = Object.entries(data)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(", ");
  const sourceTag = minerLabel ? ` | provider=${minerLabel}` : "";
  const receiptTag = receiptHash ? ` | receipt=${receiptHash}` : "";
  return `[TELEGRAPH_VERIFIED_FACT intent=${intent} ${fields}${sourceTag}${receiptTag}]`;
}
