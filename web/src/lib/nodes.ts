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
  kind: string; label: string; group: string; icon: LucideIcon; color: string; ports?: string; hint?: string;
};

export const NODE_KINDS: NodeKind[] = [
  { kind: "pc", label: "PC / Workstation", group: "Clients", icon: Monitor, color: "#60a5fa" },
  { kind: "laptop", label: "Laptop", group: "Clients", icon: Laptop, color: "#60a5fa" },
  { kind: "mobile", label: "Mobile", group: "Clients", icon: Smartphone, color: "#60a5fa" },
  { kind: "terminal", label: "Terminal", group: "Clients", icon: SquareTerminal, color: "#a3e635", hint: "Opens the console scoped to this node" },
  { kind: "internet", label: "Internet", group: "Network", icon: Globe, color: "#38bdf8" },
  { kind: "router", label: "Router", group: "Network", icon: Router, color: "#22d3ee" },
  { kind: "switch", label: "Switch", group: "Network", icon: Network, color: "#22d3ee" },
  { kind: "firewall", label: "Firewall / SG", group: "Network", icon: Shield, color: "#f97316" },
  { kind: "waf", label: "WAF", group: "Network", icon: ShieldAlert, color: "#f97316" },
  { kind: "loadbalancer", label: "Load Balancer", group: "Network", icon: Scale, color: "#2dd4bf", ports: "80,443" },
  { kind: "cdn", label: "CDN / Edge", group: "Network", icon: Zap, color: "#facc15", ports: "443" },
  { kind: "dns", label: "DNS", group: "Network", icon: Waypoints, color: "#a78bfa", ports: "53" },
  { kind: "vpn", label: "VPN Gateway", group: "Network", icon: Lock, color: "#34d399", ports: "51820,1194" },
  { kind: "server", label: "Server", group: "Compute", icon: Server, color: "#4ade80", ports: "22,80,443" },
  { kind: "vm", label: "Virtual Machine", group: "Compute", icon: Cpu, color: "#4ade80", ports: "22" },
  { kind: "container", label: "Container", group: "Compute", icon: Box, color: "#4ade80" },
  { kind: "kubernetes", label: "Kubernetes", group: "Compute", icon: Boxes, color: "#4ade80", ports: "6443" },
  { kind: "serverless", label: "Serverless Fn", group: "Compute", icon: CloudLightning, color: "#4ade80" },
  { kind: "database", label: "Database", group: "Data", icon: Database, color: "#f472b6", ports: "5432" },
  { kind: "cache", label: "Cache (Redis)", group: "Data", icon: MemoryStick, color: "#f472b6", ports: "6379" },
  { kind: "queue", label: "Queue", group: "Data", icon: ListOrdered, color: "#f472b6", ports: "5672" },
  { kind: "storage", label: "Object Storage", group: "Data", icon: HardDrive, color: "#f472b6" },
  { kind: "webapp", label: "Web Application", group: "Applications", icon: AppWindow, color: "#2ee6c5", ports: "80,443", hint: "Paste a URL: the site becomes this node" },
  { kind: "api", label: "API Service", group: "Applications", icon: Braces, color: "#2ee6c5", ports: "443" },
  { kind: "vercel", label: "Vercel", group: "Platforms", icon: Triangle, color: "#e5e7eb" },
  { kind: "netlify", label: "Netlify", group: "Platforms", icon: Cloud, color: "#2dd4bf" },
  { kind: "aws", label: "AWS", group: "Platforms", icon: Cloud, color: "#fb923c" },
  { kind: "forge", label: "Laravel Forge", group: "Platforms", icon: Flame, color: "#f87171" },
  { kind: "attacker", label: "Threat Actor", group: "Security Scenarios", icon: Skull, color: "#ef4444" },
  { kind: "vulnerability", label: "Vulnerability", group: "Security Scenarios", icon: Bug, color: "#ef4444" },
  { kind: "note", label: "Note", group: "Docs", icon: StickyNote, color: "#fde047" },
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
