/** Port presets, parsing, service names and exposure notes (shared by browser and server). */
export const COMMON = [20, 21, 22, 23, 25, 53, 67, 69, 80, 110, 111, 123, 135, 137, 139, 143, 161, 389, 443, 445, 465, 587, 636, 993, 995, 1433, 1521, 2049, 2375, 2376, 3000, 3306, 3389, 5000, 5173, 5432, 5672, 5900, 6379, 6443, 8000, 8080, 8081, 8443, 8888, 9000, 9090, 9200, 9443, 11211, 15672, 27017];
const WEB = [80, 443, 3000, 4200, 5000, 5173, 8000, 8080, 8443, 8888, 9000];
const DB = [1433, 1521, 3306, 5432, 6379, 9042, 9200, 11211, 27017, 28015];
export const MAX_PORTS = 4096;

export function parsePorts(spec: string, max = MAX_PORTS): number[] {
  const s = (spec ?? "").trim().toLowerCase();
  let ports: number[];
  if (s === "" || s === "common") ports = [...COMMON];
  else if (s === "web") ports = [...WEB];
  else if (s === "db" || s === "database") ports = [...DB];
  else if (s === "top1000" || s === "well-known") ports = Array.from({ length: 1024 }, (_, i) => i + 1);
  else {
    ports = [];
    for (const part of s.split(",").map((p) => p.trim()).filter(Boolean)) {
      const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        const a = Number(m[1]), b = Number(m[2]);
        if (a < 1 || b > 65535 || a > b) throw new Error(`Bad port range: ${part}`);
        if (b - a + ports.length > max) throw new Error(`Too many ports; the limit is ${max}`);
        for (let p = a; p <= b; p++) ports.push(p);
      } else if (/^\d+$/.test(part)) {
        const p = Number(part);
        if (p < 1 || p > 65535) throw new Error(`Bad port: ${part}`);
        ports.push(p);
      } else throw new Error(`Bad port: ${part}`);
    }
  }
  ports = [...new Set(ports)].sort((a, b) => a - b);
  if (ports.length > max) throw new Error(`Too many ports (${ports.length}); the limit is ${max}`);
  return ports;
}

const NAMES: Record<number, string> = {
  20: "ftp", 21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp", 465: "smtp", 587: "smtp", 53: "dns", 67: "dhcp", 69: "tftp", 80: "http",
  110: "pop3", 111: "rpcbind", 123: "ntp", 135: "msrpc", 137: "netbios", 139: "netbios", 143: "imap", 161: "snmp", 389: "ldap", 443: "https",
  445: "smb", 636: "ldaps", 993: "imaps", 995: "pop3s", 1433: "mssql", 1521: "oracle", 2049: "nfs", 2375: "docker", 2376: "docker",
  3000: "dev-http (node/next)", 3306: "mysql", 3389: "rdp", 4200: "dev-http (angular)", 5000: "http-alt", 5173: "dev-http (vite)", 5432: "postgresql",
  5672: "amqp", 5900: "vnc", 6379: "redis", 6443: "kubernetes-api", 8000: "http-alt", 8080: "http-alt", 8081: "http-alt", 8888: "http-alt",
  8443: "https-alt", 9443: "https-alt", 9000: "http-alt/php-fpm", 9042: "cassandra", 9090: "prometheus", 9200: "elasticsearch", 11211: "memcached",
  15672: "rabbitmq-mgmt", 27017: "mongodb", 28015: "rethinkdb",
};
export const serviceName = (p: number) => NAMES[p] ?? "unknown";

export function riskNote(p: number): string | null {
  if ([21, 23].includes(p)) return "Plain-text protocol; prefer SFTP/SSH";
  if (p === 2375) return "Unauthenticated Docker API exposes full host control";
  if ([3306, 5432, 1433, 1521, 27017, 6379, 9200, 11211, 9042].includes(p)) return "Database/cache should not be publicly reachable; restrict with firewall/VPC";
  if ([3389, 5900].includes(p)) return "Remote desktop exposed; put behind VPN and enforce MFA";
  if ([445, 137, 139, 135].includes(p)) return "Windows file-sharing/RPC should never face the internet";
  if (p === 161) return "SNMP may leak device info; use SNMPv3";
  return null;
}
