import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF guard. True when an IPv4/IPv6 literal is private, loopback, link-local, ULA, CGNAT, multicast, or the
 * cloud-metadata address — i.e. a host our server must NEVER fetch when the URL is attacker/merchant-supplied.
 * Anything that isn't a clearly-public unicast address is blocked (fail closed).
 */
export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedIpv4(ip);
  if (kind === 6) return isBlockedIpv6(ip);
  return true; // not a valid IP → block
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + cloud metadata (IMDS)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const lc = ip.toLowerCase();
  if (lc === '::1' || lc === '::') return true; // loopback / unspecified
  if (lc.startsWith('fe80') || lc.startsWith('febf')) return true; // link-local fe80::/10
  if (lc.startsWith('fc') || lc.startsWith('fd')) return true; // unique local fc00::/7
  if (lc.startsWith('ff')) return true; // multicast
  const mapped = lc.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped ::ffff:a.b.c.d
  if (mapped) return isBlockedIpv4(mapped[1]!);
  return false;
}

export interface FetchRemoteImageOptions {
  timeoutMs?: number;
  maxBytes?: number;
  allowedTypes?: string[];
}

/**
 * SSRF-hardened fetch of a remote IMAGE, suitable for a URL we do not fully trust (e.g. a merchant-pasted
 * guide image URL fed to the AI model). Defenses: https only; the host must resolve to a PUBLIC unicast IP
 * (private/loopback/link-local/metadata blocked via {@link isBlockedIp}); redirects are NOT followed (so an
 * allowed host can't 30x-bounce to an internal target); the body is size-capped; and only an allow-listed
 * image content type is accepted. Returns the bytes + content type, or null on any violation/error — never
 * throws. Residual: DNS rebinding (the host could resolve to a different IP between this check and the fetch)
 * is not fully closed here; acceptable because the response is only fed to the model (never returned to the
 * caller) and must still be an allow-listed image type.
 */
export async function fetchRemoteImage(
  rawUrl: string,
  opts: FetchRemoteImageOptions = {},
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const maxBytes = opts.maxBytes ?? 8 * 1024 * 1024;
  const allowed = opts.allowedTypes ?? ['image/png', 'image/jpeg', 'image/webp'];

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  try {
    const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
    const ip = isIP(host) !== 0 ? host : (await lookup(host)).address;
    if (isBlockedIp(ip)) return null;
  } catch {
    return null; // unresolvable host → block
  }

  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    if (res.status !== 200) return null; // reject 3xx redirects and any non-OK
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (!allowed.includes(contentType)) return null;
    const declaredLen = Number(res.headers.get('content-length'));
    if (Number.isFinite(declaredLen) && declaredLen > maxBytes) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) return null;
    return { bytes, contentType };
  } catch {
    return null;
  }
}
