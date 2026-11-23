import { execFile } from "node:child_process";

export interface HttpResponseLike {
  status: number;
  ok: boolean;
  headers: {
    get(name: string): string | null;
    entries?(): IterableIterator<[string, string]>;
  };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
}

export type HttpTransport = (
  urlStr: string,
  opts?: HttpRequestOptions
) => Promise<HttpResponseLike>;

/**
 * Reliable HTTP/HTTPS transport:
 * - On Windows: uses .NET HttpClient via PowerShell with TLS 1.2 to avoid Node
 *   undici's single-IP DNS pin and Windows curl.exe's SChannel renegotiation issue.
 * - On Linux/macOS (EC2 / CI): uses native fetch directly.
 */
export async function httpRequest(
  urlStr: string,
  opts: HttpRequestOptions = {}
): Promise<HttpResponseLike> {
  const maxAttempts = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res =
        process.platform === "win32"
          ? await httpRequestWindowsDotNet(urlStr, opts)
          : await httpRequestNativeFetch(urlStr, opts);
      if ([502, 522, 524, 525].includes(res.status) && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw lastErr;
}

async function httpRequestNativeFetch(
  urlStr: string,
  opts: HttpRequestOptions = {}
): Promise<HttpResponseLike> {
  const res = await fetch(urlStr, {
    method: opts.method || "GET",
    headers: opts.headers || {},
    body:
      opts.body !== undefined
        ? typeof opts.body === "string"
          ? opts.body
          : JSON.stringify(opts.body)
        : undefined,
    signal: AbortSignal.timeout(opts.timeoutMs || 60_000),
  });
  const text = await res.text();
  const hdrMap = new Map<string, string>();
  for (const [k, v] of res.headers.entries()) hdrMap.set(k.toLowerCase(), v);
  return {
    status: res.status,
    ok: res.ok,
    headers: {
      get: (n: string) => hdrMap.get(n.toLowerCase()) ?? null,
      entries: () => hdrMap.entries(),
    },
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

function httpRequestWindowsDotNet(
  urlStr: string,
  opts: HttpRequestOptions = {}
): Promise<HttpResponseLike> {
  return new Promise((resolve, reject) => {
    const payload = {
      url: urlStr,
      method: (opts.method || "GET").toUpperCase(),
      headers: opts.headers || {},
      body:
        opts.body !== undefined
          ? typeof opts.body === "string"
            ? opts.body
            : JSON.stringify(opts.body)
          : null,
      timeoutSec: Math.max(15, Math.ceil((opts.timeoutMs || 60_000) / 1000)),
    };
    const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    const ps = `
      $ErrorActionPreference = 'Stop'
      Add-Type -AssemblyName System.Net.Http
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      $cfg = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}')) | ConvertFrom-Json
      $client = New-Object System.Net.Http.HttpClient
      $client.Timeout = [TimeSpan]::FromSeconds([int]$cfg.timeoutSec)
      $req = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod($cfg.method)), $cfg.url)
      $contentType = 'application/json'
      foreach ($p in $cfg.headers.PSObject.Properties) {
        if ($p.Name -ieq 'Content-Type') { $contentType = [string]$p.Value }
        else { [void]$req.Headers.TryAddWithoutValidation($p.Name, [string]$p.Value) }
      }
      if ($null -ne $cfg.body) {
        $req.Content = New-Object System.Net.Http.StringContent([string]$cfg.body, [System.Text.Encoding]::UTF8, $contentType)
      }
      $resp = $client.SendAsync($req).GetAwaiter().GetResult()
      $respText = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      $hdrs = @{}
      foreach ($h in $resp.Headers) { $hdrs[$h.Key.ToLower()] = ($h.Value -join ', ') }
      foreach ($h in $resp.Content.Headers) { $hdrs[$h.Key.ToLower()] = ($h.Value -join ', ') }
      $out = @{ status = [int]$resp.StatusCode; headers = $hdrs; body = $respText }
      [Console]::Out.Write(($out | ConvertTo-Json -Compress -Depth 6))
      $client.Dispose()
    `;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { maxBuffer: 10 * 1024 * 1024, encoding: "utf8" },
      (err, stdout, stderr) => {
        if (err) {
          return reject(
            new Error(`dotnet http failed for ${urlStr}: ${stderr || err.message}`)
          );
        }
        try {
          const parsed = JSON.parse(stdout.trim()) as {
            status: number;
            headers?: Record<string, string>;
            body: string;
          };
          const hdrMap = new Map<string, string>(
            Object.entries(parsed.headers || {})
          );
          resolve({
            status: parsed.status,
            ok: parsed.status >= 200 && parsed.status < 300,
            headers: {
              get: (n: string) => hdrMap.get(n.toLowerCase()) ?? null,
              entries: () => hdrMap.entries(),
            },
            text: async () => parsed.body,
            json: async () => JSON.parse(parsed.body),
          });
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          reject(
            new Error(
              `Failed to parse dotnet http output: ${msg} | raw=${stdout.slice(0, 200)}`
            )
          );
        }
      }
    );
  });
}
