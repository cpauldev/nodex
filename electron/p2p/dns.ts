import { resolve4, resolve6, resolveTxt } from "node:dns/promises";
import { isIP } from "node:net";
import { powerShellLiteral, runPowerShell } from "../windows.js";

const DNS_TIMEOUT_MS = 2_000;
const GOOGLE_DNS_URL = "https://dns.google/resolve";

export async function resolveHostAddresses(host: string): Promise<string[]> {
  if (isIP(host)) return [host];

  const nativeResults = await Promise.all([
    withTimeout(resolve4(host), DNS_TIMEOUT_MS, []),
    withTimeout(resolve6(host), DNS_TIMEOUT_MS, [])
  ]);
  const addresses = unique(nativeResults.flat());
  if (addresses.length > 0) return addresses;

  const fallbackResults = await Promise.all([
    resolveAddressesOverHttps(host, "A"),
    resolveAddressesOverHttps(host, "AAAA")
  ]);
  return unique(fallbackResults.flat());
}

export async function resolveDnsTxt(name: string): Promise<string[]> {
  const windowsResults = await resolveTxtWithWindows(name);
  if (windowsResults.length > 0) return windowsResults;

  try {
    return (await resolveTxt(name)).flat();
  } catch {
    return resolveTxtOverHttps(name);
  }
}

async function resolveTxtWithWindows(name: string): Promise<string[]> {
  try {
    const { stdout } = await runPowerShell(`
Resolve-DnsName -Name ${powerShellLiteral(name)} -Type TXT -ErrorAction Stop |
  ForEach-Object { $_.Strings } |
  ConvertTo-Json -Compress
`);
    if (!stdout) return [];
    const parsed = JSON.parse(stdout) as string | string[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

async function resolveTxtOverHttps(name: string): Promise<string[]> {
  try {
    const response = await fetch(
      `${GOOGLE_DNS_URL}?name=${encodeURIComponent(name)}&type=TXT`,
      {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(DNS_TIMEOUT_MS)
      }
    );
    if (!response.ok) return [];
    const body = await response.json() as {
      Answer?: Array<{ data?: string; type?: number }>;
    };
    return (body.Answer ?? [])
      .filter((answer) => answer.type === 16 && answer.data)
      .map((answer) => answer.data!.replace(/^"|"$/g, "").replace(/\\"/g, "\""));
  } catch {
    return [];
  }
}

async function resolveAddressesOverHttps(
  host: string,
  type: "A" | "AAAA"
): Promise<string[]> {
  try {
    const response = await fetch(
      `${GOOGLE_DNS_URL}?name=${encodeURIComponent(host)}&type=${type}`,
      {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(DNS_TIMEOUT_MS)
      }
    );
    if (!response.ok) return [];
    const body = await response.json() as {
      Answer?: Array<{ data?: string; type?: number }>;
    };
    const expectedType = type === "A" ? 1 : 28;
    return (body.Answer ?? [])
      .filter((answer) => answer.type === expectedType && answer.data)
      .map((answer) => answer.data!);
  } catch {
    return [];
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
