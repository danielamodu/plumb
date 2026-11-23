import type {
  AdjudicationRecord,
  MinerCallTrace,
  ReferenceSnapshot,
  SupportedIntent,
} from "../types.js";

export function valuesAgree(
  intent: SupportedIntent,
  a: unknown,
  b: unknown
): boolean {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const oa = a as Record<string, unknown>;
  const ob = b as Record<string, unknown>;

  switch (intent) {
    case "URL_SCAN_VERDICT":
      return typeof oa.safe === "boolean" && oa.safe === ob.safe;
    case "SSL_VERIFICATION_CERT":
      return (
        typeof oa.certificate_valid === "boolean" &&
        oa.certificate_valid === ob.certificate_valid
      );
    case "DNS_RECORD_LOOKUP_GENERAL":
      return (
        typeof oa.has_record === "boolean" && oa.has_record === ob.has_record
      );
    case "WEATHER_CHECK_TEMPERATURE": {
      if (typeof oa.temperature_c !== "number" || typeof ob.temperature_c !== "number") {
        return false;
      }
      return Math.abs(oa.temperature_c - ob.temperature_c) <= 2.5;
    }
    case "FX_NOW_EUR":
    case "FX_NOW_CAD": {
      if (typeof oa.rate !== "number" || typeof ob.rate !== "number" || ob.rate === 0) {
        return false;
      }
      return Math.abs(oa.rate - ob.rate) / Math.abs(ob.rate) <= 0.01;
    }
    case "CURRENCY_EXCHANGE_CONVERT": {
      if (
        typeof oa.converted_amount !== "number" ||
        typeof ob.converted_amount !== "number"
      ) {
        return false;
      }
      if (ob.converted_amount === 0) return oa.converted_amount === 0;
      return (
        Math.abs(oa.converted_amount - ob.converted_amount) /
          Math.abs(ob.converted_amount) <=
        0.02
      );
    }
    case "CRYPTO_PRICE_USD":
    case "STOCK_PRICE_US_EQUITY": {
      if (
        typeof oa.price_usd !== "number" ||
        typeof ob.price_usd !== "number" ||
        ob.price_usd === 0
      ) {
        return false;
      }
      return (
        Math.abs(oa.price_usd - ob.price_usd) / Math.abs(ob.price_usd) <= 0.02
      );
    }
  }
}

export function generateBugReportMarkdown(params: {
  intent: SupportedIntent;
  queryParams?: Record<string, unknown>;
  failedCalls: MinerCallTrace[];
  snapshot: ReferenceSnapshot;
}): string {
  const lines = [
    `## Telegraph Miner Accuracy Discrepancy Report`,
    ``,
    `- **Intent**: \`${params.intent}\``,
    `- **Input Params**: \`${JSON.stringify(params.queryParams ?? {})}\``,
    `- **Primary-Source Ground Truth**: \`${JSON.stringify(params.snapshot.referenceValue)}\` (source: \`${params.snapshot.sourceName}\`, captured \`${params.snapshot.capturedAtUtc}\`, tolerance: \`${params.snapshot.toleranceBand}\`)`,
    ``,
    `### Failing Miner Responses`,
    `| Miner ID | Name | Parsed Output | Signal Hash | Receipt Hash | Latency |`,
    `| :--- | :--- | :--- | :--- | :--- | ---: |`,
    ...params.failedCalls.map(
      (c) =>
        `| \`${c.minerId}\` | ${c.minerName ?? "unknown"} | \`${JSON.stringify(c.parsedValue ?? c.error)}\` | \`${c.signalHash ?? "n/a"}\` | \`${c.receiptHash ?? "n/a"}\` | ${c.latencyMs}ms |`
    ),
    ``,
    `_Generated automatically by \`plumb\` Epistemic Adjudicator with cryptographic Telegraph Sepolia escrow receipts._`,
  ];
  return lines.join("\n");
}

export function adjudicateMiners(
  intent: SupportedIntent,
  queryParams: Record<string, unknown> | undefined,
  calls: MinerCallTrace[],
  referenceSnapshot?: ReferenceSnapshot
): {
  status: AdjudicationRecord["status"];
  disagreementDetected: boolean;
  finalValue?: unknown;
  groundTruthCheck?: AdjudicationRecord["groundTruthCheck"];
  bugReportMarkdown?: string;
} {
  const validCalls = calls.filter((c) => c.schemaValid && !c.injectionFlagged && c.parsedValue !== undefined);
  if (validCalls.length === 0) {
    return {
      status: "FAIL_CLOSED_MINER",
      disagreementDetected: false,
    };
  }

  let disagreementDetected = false;
  for (let i = 1; i < validCalls.length; i++) {
    if (!valuesAgree(intent, validCalls[0].parsedValue, validCalls[i].parsedValue)) {
      disagreementDetected = true;
      break;
    }
  }

  if (referenceSnapshot) {
    const matched: MinerCallTrace[] = [];
    const failed: MinerCallTrace[] = [];
    for (const c of validCalls) {
      if (valuesAgree(intent, c.parsedValue, referenceSnapshot.referenceValue)) {
        matched.push(c);
      } else {
        failed.push(c);
      }
    }
    const bugReportMarkdown =
      failed.length > 0
        ? generateBugReportMarkdown({
            intent,
            queryParams,
            failedCalls: failed,
            snapshot: referenceSnapshot,
          })
        : undefined;

    return {
      status: disagreementDetected ? "DISAGREEMENT_RESOLVED" : "VERIFIED_OK",
      disagreementDetected,
      finalValue: matched[0]?.parsedValue ?? referenceSnapshot.referenceValue,
      groundTruthCheck: {
        snapshot: referenceSnapshot,
        matchedMinerIds: matched.map((c) => c.minerId),
        failedMinerIds: failed.map((c) => c.minerId),
      },
      bugReportMarkdown,
    };
  }

  return {
    status: disagreementDetected ? "DISAGREEMENT_RESOLVED" : "VERIFIED_OK",
    disagreementDetected,
    finalValue: validCalls[0].parsedValue,
  };
}
