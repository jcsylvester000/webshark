/**
 * Environment templates: ready-made layouts modelled on common hosting platforms and on
 * documented attack scenarios. Applying a template replaces the canvas content.
 */
import type { Canvas, CanvasEdge, CanvasNode, DeviceData, LinkData } from "./types";

type N = [id: string, kind: string, label: string, x: number, y: number, extra?: Partial<DeviceData>];
type E = [source: string, target: string, label?: string, extra?: LinkData];

function build(nodes: N[], edges: E[]): Canvas {
  return {
    nodes: nodes.map(([id, kind, label, x, y, extra]): CanvasNode => ({ id, type: "device", position: { x, y }, data: { kind, label, ...extra } })),
    edges: edges.map(([source, target, label, extra], i): CanvasEdge => ({
      id: `e${i}-${source}-${target}`, source, target, type: "link", data: { label, ...extra }, animated: Boolean(extra?.attack),
    })),
  };
}

export type Template = { id: string; name: string; description: string; canvas: () => Canvas };

export const TEMPLATES: Template[] = [
  { id: "blank", name: "Blank canvas", description: "Start from scratch.", canvas: () => ({ nodes: [], edges: [] }) },
  {
    id: "vercel-next", name: "Vercel + Next.js + Neon", description: "Edge network, serverless functions, and managed Postgres.",
    canvas: () => build(
      [["u", "laptop", "Visitors", 0, 160], ["dns", "dns", "DNS (Vercel)", 220, 20], ["edge", "vercel", "Vercel Edge Network", 220, 160, { ports: "443" }],
       ["app", "webapp", "Next.js App", 470, 160, { url: "https://example.vercel.app" }], ["fn", "serverless", "Route Handlers / Server Actions", 470, 320],
       ["db", "database", "Neon Postgres", 730, 320, { ports: "5432", notes: "Pooled connection, sslmode=require" }]],
      [["u", "dns", "lookup", { protocol: "DNS", port: "53" }], ["u", "edge", "HTTPS", { protocol: "HTTPS", port: "443", encrypted: true }],
       ["edge", "app", "SSR / ISR"], ["app", "fn", "invoke"], ["fn", "db", "TLS 5432", { protocol: "Postgres", port: "5432", encrypted: true }]],
    ),
  },
  {
    id: "netlify-jamstack", name: "Netlify JAMstack", description: "Static site on CDN with functions and a third-party API.",
    canvas: () => build(
      [["u", "pc", "Visitors", 0, 140], ["cdn", "netlify", "Netlify CDN", 230, 140, { ports: "443" }], ["site", "webapp", "Static Site", 460, 60, { url: "https://example.netlify.app" }],
       ["fn", "serverless", "Netlify Functions", 460, 230], ["api", "api", "Headless CMS / API", 700, 230, { ports: "443" }]],
      [["u", "cdn", "HTTPS", { encrypted: true, port: "443" }], ["cdn", "site", "cached assets"], ["cdn", "fn", "/.netlify/functions"], ["fn", "api", "REST", { encrypted: true }]],
    ),
  },
  {
    id: "aws-3tier", name: "AWS 3-tier", description: "Route 53, CloudFront, ALB, EC2 auto-scaling pair, RDS, ElastiCache.",
    canvas: () => build(
      [["u", "internet", "Internet", 0, 200], ["r53", "dns", "Route 53", 200, 40], ["cf", "cdn", "CloudFront", 200, 200], ["waf", "waf", "AWS WAF", 400, 200],
       ["alb", "loadbalancer", "Application LB", 600, 200, { zone: "Public subnet" }],
       ["ec2a", "server", "EC2 App A", 820, 110, { zone: "Private subnet", os: "Ubuntu 24.04", ports: "22,443" }],
       ["ec2b", "server", "EC2 App B", 820, 290, { zone: "Private subnet", os: "Ubuntu 24.04", ports: "22,443" }],
       ["sg", "firewall", "Security Group (DB)", 1040, 200], ["rds", "database", "RDS PostgreSQL", 1240, 130, { zone: "Data subnet" }],
       ["redis", "cache", "ElastiCache Redis", 1240, 290, { zone: "Data subnet" }], ["s3", "storage", "S3 Assets", 400, 40]],
      [["u", "r53", "DNS"], ["u", "cf", "HTTPS", { encrypted: true }], ["cf", "s3", "static"], ["cf", "waf"], ["waf", "alb", "443"],
       ["alb", "ec2a", "HTTP 443"], ["alb", "ec2b", "HTTP 443"], ["ec2a", "sg"], ["ec2b", "sg"], ["sg", "rds", "5432", { encrypted: true }], ["sg", "redis", "6379"]],
    ),
  },
  {
    id: "forge-lemp", name: "Laravel Forge (LEMP)", description: "Forge-provisioned server: Nginx, PHP-FPM, MySQL, Redis, queue worker.",
    canvas: () => build(
      [["u", "internet", "Internet", 0, 160], ["cf", "cdn", "Cloudflare (proxy)", 210, 160], ["forge", "forge", "Forge Server", 430, 160, { os: "Ubuntu 24.04", ports: "22,80,443", host: "" }],
       ["app", "webapp", "Laravel App (Nginx + PHP-FPM)", 660, 80, { url: "https://example.com" }], ["worker", "container", "Queue Worker (Horizon)", 660, 260],
       ["mysql", "database", "MySQL 8", 900, 80, { ports: "3306" }], ["redis", "cache", "Redis", 900, 260], ["admin", "terminal", "Admin SSH", 430, 330]],
      [["u", "cf", "HTTPS", { encrypted: true }], ["cf", "forge", "443"], ["forge", "app"], ["forge", "worker"], ["app", "mysql", "3306 (localhost)"], ["app", "redis", "6379"], ["worker", "redis"], ["admin", "forge", "SSH 22", { protocol: "SSH", port: "22", encrypted: true }]],
    ),
  },
  {
    id: "office-lan", name: "Office LAN", description: "ISP router, firewall, core switch, workstations, file and print services.",
    canvas: () => build(
      [["isp", "internet", "ISP", 0, 170], ["rt", "router", "Edge Router", 200, 170, { host: "192.168.1.1" }], ["fw", "firewall", "Firewall", 400, 170],
       ["sw", "switch", "Core Switch", 600, 170], ["pc1", "pc", "Workstation 1", 820, 40, { host: "192.168.1.21" }], ["pc2", "pc", "Workstation 2", 820, 170, { host: "192.168.1.22" }],
       ["nas", "storage", "File Server / NAS", 820, 300, { host: "192.168.1.50", ports: "445,22" }], ["vpn", "vpn", "Remote Access VPN", 400, 330]],
      [["isp", "rt", "WAN"], ["rt", "fw"], ["fw", "sw", "LAN"], ["sw", "pc1"], ["sw", "pc2"], ["sw", "nas", "SMB 445"], ["vpn", "fw", "WireGuard", { encrypted: true }]],
    ),
  },
  {
    id: "attack-web", name: "Scenario: Web app attack paths", description: "Documents SQL injection, XSS, and exposed secrets against a typical web stack.",
    canvas: () => build(
      [["att", "attacker", "External attacker", 0, 180], ["waf", "waf", "WAF", 230, 180], ["app", "webapp", "Customer Portal", 460, 180, { url: "https://portal.example.com" }],
       ["db", "database", "Customer DB", 720, 180], ["v1", "vulnerability", "SQL Injection (login form)", 460, 20, { notes: "Unparameterized query in /login. Fix: prepared statements, ORM bindings." }],
       ["v2", "vulnerability", "Stored XSS (comments)", 460, 350, { notes: "Unescaped user HTML. Fix: output encoding + CSP." }],
       ["v3", "vulnerability", "Exposed /.env", 720, 20, { notes: "Web root serves dotfiles. Fix: deny ^/\\. in Nginx." }]],
      [["att", "waf", "crafted payloads", { attack: true }], ["waf", "app", "bypass via encoding", { attack: true }], ["app", "db", "UNION SELECT", { attack: true }],
       ["v1", "app", "affects"], ["v2", "app", "affects"], ["v3", "app", "affects"]],
    ),
  },
  {
    id: "attack-ddos-mitm", name: "Scenario: DDoS + MITM", description: "Volumetric DDoS on a load balancer and a man-in-the-middle on public Wi-Fi.",
    canvas: () => build(
      [["bot", "attacker", "Botnet", 0, 60], ["cdn", "cdn", "CDN / DDoS scrubbing", 230, 60], ["lb", "loadbalancer", "Load Balancer", 460, 60], ["srv", "server", "Origin Server", 690, 60],
       ["user", "laptop", "Employee laptop", 0, 300], ["mitm", "attacker", "Rogue Wi-Fi AP (MITM)", 230, 300], ["app", "webapp", "Internal App", 460, 300, { url: "http://intranet.example.com" }],
       ["v", "vulnerability", "No HSTS / plain HTTP", 690, 300, { notes: "Session cookies sniffable. Fix: HTTPS + HSTS + Secure cookies, VPN on untrusted networks." }]],
      [["bot", "cdn", "SYN/UDP flood", { attack: true }], ["cdn", "lb", "filtered traffic"], ["lb", "srv"], ["user", "mitm", "joins open Wi-Fi", { attack: true }],
       ["mitm", "app", "intercepts HTTP", { attack: true }], ["v", "app", "affects"]],
    ),
  },
];
