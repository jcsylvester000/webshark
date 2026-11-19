/**
 * Target parsing and policy. Always blocked: link-local/cloud metadata (169.254/16, fe80::/10),
 * multicast, unspecified. Private/loopback only when ALLOW_PRIVATE_TARGETS is on.
 */
import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { badRequest, forbidden } from "../http";

export function extractHost(input: string): string {
  const s = (input ?? "").trim();
  if (!s) throw badRequest("Target is required");
  let host: string;
  if (s.includes("://")) {
    try { host = new URL(s).hostname; } catch { throw badRequest("Invalid URL"); }
  } else {
    const first = s.split("/")[0];
    if (first.startsWith("[")) host = first.slice(1).split("]")[0];
    else if ((first.match(/:/g) ?? []).length === 1) host = first.split(":")[0];
    else host = first;
  }
  host = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host.length > 253 || !/^[a-z0-9.\-:_]+$/.test(host)) throw badRequest("Target contains invalid characters");
  return host;
}

function v4(ip: string) { return ip.split(".").map(Number); }

function alwaysBlocked(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = v4(ip);
    return a === 0 || a >= 224 || (a === 169 && b === 254);
  }
  const l = ip.toLowerCase();
  if (l.startsWith("::ffff:")) return alwaysBlocked(l.slice(7));
  return l === "::" || l.startsWith("ff") || /^fe[89ab]/.test(l);
}

function isPrivate(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = v4(ip);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const l = ip.toLowerCase();
  if (l.startsWith("::ffff:")) return isPrivate(l.slice(7));
  return l === "::1" || /^f[cd]/.test(l);
}

export async function resolveTarget(host: string, allowPrivate: boolean): Promise<string[]> {
  let addrs: string[];
  if (isIP(host)) addrs = [host];
  else {
    try {
      const res = await Promise.race([
        lookup(host, { all: true }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
      ]);
      addrs = [...new Set(res.map((r) => r.address))];
    } catch (e) {
      throw badRequest(e instanceof Error && e.message === "timeout" ? `DNS lookup for ${host} timed out` : `Could not resolve ${host}`);
    }
  }
  if (!addrs.length) throw badRequest(`No addresses found for ${host}`);
  for (const ip of addrs) {
    if (alwaysBlocked(ip)) throw forbidden(`${ip} is a special-purpose address (link-local, cloud metadata or multicast) and is always blocked for safety.`);
    if (!allowPrivate && isPrivate(ip)) {
      throw forbidden(`${ip} is a private (home/office/lab) address. The hosted Slyshark can only test public internet addresses. To test your own network, run Slyshark on a computer inside that network (see Help → Testing your own network).`);
    }
  }
  // Prefer IPv4: serverless hosts often lack IPv6 egress.
  return addrs.sort((a, b) => isIP(a) - isIP(b));
}
