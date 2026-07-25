// Admin configuration, all sourced from env. The whole admin surface is
// fail-closed: if either gate (IP allowlist or token) is unset, the admin
// router answers 404 to every request, so a default deployment exposes no
// admin endpoint at all.

function parseIpList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export const adminAllowIps: string[] = parseIpList(process.env.ADMIN_ALLOW_IPS);
export const adminToken: string = process.env.ADMIN_TOKEN || '';

export function adminEnabled(): boolean {
  return adminAllowIps.length > 0 && adminToken.length >= 32;
}

// Normalize an IP for allowlist comparison. IPv4-mapped IPv6 addresses
// (::ffff:127.0.0.1) appear when a dual-stack socket carries an IPv4 peer;
// strip the prefix so an allowlist entry of 127.0.0.1 matches both forms.
export function normalizeIp(ip: string): string {
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

export function ipAllowed(ip: string | undefined): boolean {
  if (!ip) return false;
  const norm = normalizeIp(ip);
  return adminAllowIps.some((entry) => normalizeIp(entry) === norm);
}
