import * as tls from "node:tls";
import * as dns from "node:dns/promises";
import type { ReferenceSnapshot, SupportedIntent } from "../types.js";

const KNOWN_MALICIOUS_FIXTURES = [
  "testsafebrowsing.appspot.com/s/phishing.html",
  "testsafebrowsing.appspot.com/s/malware.html",
  "testsafebrowsing.appspot.com/s/unwanted.html",
  "secure.eicar.org/eicar.com.txt",
];

function liveTlsCheck(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = tls.connect(
      { host, port: 443, servername: host, rejectUnauthorized: true, timeout: 4000 },
      () => {
        const ok = sock.authorized;
        sock.end();
        resolve(ok);
      }
    );
    sock.on("error", () => resolve(false));
    sock.on("timeout", () => {
      sock.destroy();
      resolve(false);
    });
  });
}

/**
 * Fetches a fast primary-source ReferenceSnapshot for deterministic intents
 * so live /v1/chat/completions calls can populate groundTruthCheck, honest
 * /scoreboard accuracy, and 1-click /api/bug-report/:id markdown automatically.
 */
export async function fetchReferenceSnapshot(
  intent: SupportedIntent,
  params?: Record<string, unknown>
): Promise<ReferenceSnapshot | undefined> {
  const capturedAtUtc = new Date().toISOString();
  try {
    if (intent === "URL_SCAN_VERDICT" && typeof params?.url === "string") {
      const lower = params.url.toLowerCase();
      if (KNOWN_MALICIOUS_FIXTURES.some((f) => lower.includes(f))) {
        return {
          sourceName: "official_gsb_eicar_fixture",
          capturedAtUtc,
          referenceValue: { safe: false },
          toleranceBand: "exact_boolean",
        };
      }
      return undefined;
    }

    if (intent === "SSL_VERIFICATION_CERT" && typeof params?.host === "string") {
      const valid = await liveTlsCheck(params.host);
      return {
        sourceName: "live_node_tls_handshake",
        capturedAtUtc,
        referenceValue: { certificate_valid: valid },
        toleranceBand: "exact_boolean",
      };
    }

    if (
      intent === "DNS_RECORD_LOOKUP_GENERAL" &&
      typeof params?.name === "string" &&
      typeof params?.record_type === "string"
    ) {
      const rt = params.record_type.toUpperCase();
      let hasRecord = false;
      try {
        if (rt === "MX") hasRecord = (await dns.resolveMx(params.name)).length > 0;
        else if (rt === "TXT") hasRecord = (await dns.resolveTxt(params.name)).length > 0;
        else if (rt === "AAAA") hasRecord = (await dns.resolve6(params.name)).length > 0;
        else if (rt === "NS") hasRecord = (await dns.resolveNs(params.name)).length > 0;
        else hasRecord = (await dns.resolve4(params.name)).length > 0;
      } catch {
        hasRecord = false;
      }
      return {
        sourceName: `live_node_dns_${rt.toLowerCase()}`,
        capturedAtUtc,
        referenceValue: { has_record: hasRecord },
        toleranceBand: "exact_boolean",
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}
