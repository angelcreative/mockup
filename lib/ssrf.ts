import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { normalizeHttpUrl } from "./url";

export class CaptureError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CaptureError";
    this.status = status;
  }
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 255) return true;
  return false;
}

function mappedIpv4(ip: string): string | null {
  const normalized = ip.toLowerCase();
  const dotted = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];

  const hex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;

  const mapped = mappedIpv4(normalized);
  if (mapped) return isBlockedIpv4(mapped);

  const head = normalized.split(":")[0] || "0";
  const value = Number.parseInt(head, 16);
  if (Number.isNaN(value)) return true;
  if (value >= 0xfe80 && value <= 0xfebf) return true;
  if (value >= 0xfc00 && value <= 0xfdff) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!host || BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host.endsWith(".internal")) return true;
  if (/^0x[0-9a-f.]+$/i.test(host) || /^\d+$/.test(host)) return true;
  if (!isIP(host) && !host.includes(".")) return true;
  return false;
}

export async function assertPublicUrl(input: string): Promise<URL> {
  const normalized = normalizeHttpUrl(input);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new CaptureError(400, "Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CaptureError(400, "Only http or https addresses are allowed");
  }

  if (url.username || url.password) {
    throw new CaptureError(400, "That address is not allowed");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(hostname)) {
    throw new CaptureError(400, "That address is not allowed");
  }

  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new CaptureError(400, "That address is not allowed");
    }
    return url;
  }

  let records: { address: string }[];
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new CaptureError(400, "That address doesn't exist. Check the spelling.");
  }

  if (records.length === 0 || records.some((record) => isBlockedIp(record.address))) {
    throw new CaptureError(400, "That address is not allowed");
  }

  return url;
}
