/**
 * Node catalog for the environment designer. Each kind defines its palette group,
 * icon, accent color, and the default ports documented for that kind of component.
 */
import {
  AppWindow, Boxes, Box, Braces, Bug, Cloud, CloudLightning, Cpu, Database, Flame, Globe, HardDrive, Laptop,
  ListOrdered, Lock, MemoryStick, Monitor, Network, Router, Scale, Server, Shield, ShieldAlert, Skull, Smartphone,
  SquareTerminal, StickyNote, Triangle, Waypoints, Zap, type LucideIcon,
} from "lucide-react";

export type NodeKind = {
  kind: string; label: string; group: string; icon: LucideIcon; color: string; ports?: string; hint?: string; desc?: string;
};

export const NODE_KINDS: NodeKind[] = [
  { kind: "pc", label: "PC / Workstation", group: "Clients", icon: Monitor, color: "#60a5fa", desc: "A desktop computer used by a person. Good for documenting staff devices." },
  { kind: "laptop", label: "Laptop", group: "Clients", icon: Laptop, color: "#60a5fa", desc: "A portable computer, often on Wi-Fi or VPN." },
  { kind: "mobile", label: "Mobile", group: "Clients", icon: Smartphone, color: "#60a5fa", desc: "A phone or tablet that uses your apps or Wi-Fi." },
  { kind: "terminal", label: "Terminal", group: "Clients", icon: SquareTerminal, color: "#a3e635", hint: "Opens the console scoped to this node", desc: "A command-line console. Double-click it on the canvas to open the console." },
  { kind: "internet", label: "Internet", group: "Network", icon: Globe, color: "#38bdf8", desc: "The public internet: where visitors and attackers come from." },
  { kind: "router", label: "Router", group: "Network", icon: Router, color: "#22d3ee", desc: "Connects networks together and forwards traffic between them (e.g. your ISP router)." },
  { kind: "switch", label: "Switch", group: "Network", icon: Network, color: "#22d3ee", desc: "Connects devices inside one local network (LAN)." },
  { kind: "firewall", label: "Firewall / SG", group: "Network", icon: Shield, color: "#f97316", desc: "Allows or blocks traffic by address and port. In the cloud this is a security group." },
  { kind: "waf", label: "WAF", group: "Network", icon: ShieldAlert, color: "#f97316", desc: "Web Application Firewall: inspects web requests and blocks attacks like SQL injection." },
  { kind: "loadbalancer", label: "Load Balancer", group: "Network", icon: Scale, color: "#2dd4bf", ports: "80,443", desc: "Spreads traffic across several servers so the app stays fast and available." },
  { kind: "cdn", label: "CDN / Edge", group: "Network", icon: Zap, color: "#facc15", ports: "443", desc: "Content Delivery Network: caches your site close to visitors worldwide." },
  { kind: "dns", label: "DNS", group: "Network", icon: Waypoints, color: "#a78bfa", ports: "53", desc: "Turns names like example.com into IP addresses." },
  { kind: "vpn", label: "VPN Gateway", group: "Network", icon: Lock, color: "#34d399", ports: "51820,1194", desc: "Encrypted tunnel that lets remote users join a private network safely." },
  { kind: "server", label: "Server", group: "Compute", icon: Server, color: "#4ade80", ports: "22,80,443", desc: "A machine that runs services such as websites, APIs or databases." },
  { kind: "vm", label: "Virtual Machine", group: "Compute", icon: Cpu, color: "#4ade80", ports: "22", desc: "A virtual machine: a server running inside another computer or cloud host." },
  { kind: "container", label: "Container", group: "Compute", icon: Box, color: "#4ade80", desc: "A lightweight packaged app (e.g. Docker) running on a host." },
  { kind: "kubernetes", label: "Kubernetes", group: "Compute", icon: Boxes, color: "#4ade80", ports: "6443", desc: "A platform that runs and scales many containers." },
  { kind: "serverless", label: "Serverless Fn", group: "Compute", icon: CloudLightning, color: "#4ade80", desc: "Code that runs on demand without managing servers (e.g. Netlify/Vercel functions)." },
  { kind: "database", label: "Database", group: "Data", icon: Database, color: "#f472b6", ports: "5432", desc: "Stores data (PostgreSQL, MySQL…). Should not be reachable from the internet." },
  { kind: "cache", label: "Cache (Redis)", group: "Data", icon: MemoryStick, color: "#f472b6", ports: "6379", desc: "Fast in-memory store (Redis) for sessions and frequently used data." },
  { kind: "queue", label: "Queue", group: "Data", icon: ListOrdered, color: "#f472b6", ports: "5672", desc: "Holds background jobs and messages between services." },
  { kind: "storage", label: "Object Storage", group: "Data", icon: HardDrive, color: "#f472b6", desc: "File or object storage (S3, NAS) for uploads and backups." },
  { kind: "webapp", label: "Web Application", group: "Applications", icon: AppWindow, color: "#2ee6c5", ports: "80,443", hint: "Paste a URL: the site becomes this node", desc: "A website or web app. Paste its URL and the node becomes that site." },
  { kind: "api", label: "API Service", group: "Applications", icon: Braces, color: "#2ee6c5", ports: "443", desc: "A service other apps call over HTTP (REST/GraphQL)." },
  { kind: "vercel", label: "Vercel", group: "Platforms", icon: Triangle, color: "#e5e7eb", desc: "Vercel hosting platform zone (edge network + serverless)." },
  { kind: "netlify", label: "Netlify", group: "Platforms", icon: Cloud, color: "#2dd4bf", desc: "Netlify hosting platform zone (CDN + functions)." },
  { kind: "aws", label: "AWS", group: "Platforms", icon: Cloud, color: "#fb923c", desc: "Amazon Web Services zone (EC2, RDS, S3…)." },
  { kind: "forge", label: "Laravel Forge", group: "Platforms", icon: Flame, color: "#f87171", desc: "A Laravel Forge-managed server (Nginx, PHP, MySQL)." },
  { kind: "attacker", label: "Threat Actor", group: "Security Scenarios", icon: Skull, color: "#ef4444", desc: "A threat actor for documenting attack scenarios (not a real attack)." },
  { kind: "vulnerability", label: "Vulnerability", group: "Security Scenarios", icon: Bug, color: "#ef4444", desc: "A known weakness you want to document and fix." },
  { kind: "note", label: "Note", group: "Docs", icon: StickyNote, color: "#fde047", desc: "A sticky note for comments on the diagram." },
];

export const KIND_MAP = Object.fromEntries(NODE_KINDS.map((k) => [k.kind, k])) as Record<string, NodeKind>;
export const GROUPS = Array.from(new Set(NODE_KINDS.map((k) => k.group)));

export function kindOf(kind: string): NodeKind {
  return KIND_MAP[kind] ?? KIND_MAP.server;
}

/** Host to test for a node: explicit host, else the URL's hostname. */
export function nodeTarget(d: { host?: string; url?: string }): string | null {
  if (d.host?.trim()) return d.host.trim();
  if (d.url?.trim()) {
    try { return new URL(d.url.includes("://") ? d.url : `https://${d.url}`).hostname; } catch { return null; }
  }
  return null;
}
