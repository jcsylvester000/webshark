/** Shared front-end types that mirror the Rust API responses. */
export type User = { id: string; username: string; email: string; display_name: string | null; role: string; created_at: string };

export type PortResult = { port: number; state: "open" | "closed" | "filtered"; service: string; rtt_ms: number | null; banner: string | null; note: string | null };
export type ScanResponse = { target: string; address: string; scanned: number; open: PortResult[]; closed_count: number; filtered_count: number; duration_ms: number; results: PortResult[] };

export type PingAttempt = { seq: number; ok: boolean; rtt_ms: number | null; error: string | null };
export type PingResponse = { host: string; address: string; mode: string; port: number | null; attempts: PingAttempt[]; sent: number; received: number; loss_pct: number; min_ms: number | null; avg_ms: number | null; max_ms: number | null; raw: string[] };

export type KeyValue = { key: string; value: string; enabled: boolean };
export type Auth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "apikey"; key: string; value: string; in_query: boolean };
export type BodyMode = "none" | "json" | "text" | "xml" | "urlencoded" | "form";
export type HttpRequestSpec = {
  method: string; url: string; headers: KeyValue[]; params: KeyValue[]; auth: Auth;
  body: { mode: BodyMode; raw: string; fields: KeyValue[] }; timeout_ms: number; follow_redirects: boolean;
};
export type HttpResponse = {
  status: number; status_text: string; http_version: string; url: string; remote_addr: string; headers: KeyValue[];
  body: string; body_base64: string | null; is_binary: boolean; truncated: boolean; size_bytes: number; time_ms: number;
  redirects: { url: string; status: number; location: string | null }[];
};

export type Finding = { id: string; title: string; severity: "pass" | "info" | "low" | "medium" | "high"; detail: string; recommendation: string };
export type AuditReport = { url: string; final_url: string; status: number; score: number; findings: Finding[] };

export type EnvSummary = { id: string; name: string; description: string; template: string | null; node_count: number | null; edge_count: number | null; created_at: string; updated_at: string };
export type EnvFull = { id: string; name: string; description: string; template: string | null; canvas: Canvas; created_at: string; updated_at: string };

export type DeviceData = {
  kind: string; label: string; host?: string; url?: string; os?: string; ports?: string; notes?: string; tags?: string;
  zone?: string; status?: "up" | "down" | "unknown";
  scan?: { at: string; address: string; open: { port: number; service: string; note: string | null }[] };
  ping?: { at: string; ok: boolean; avg_ms: number | null };
  audit?: { at: string; score: number; issues: number };
  [k: string]: unknown;
};
export type LinkData = { label?: string; protocol?: string; port?: string; encrypted?: boolean; attack?: boolean; [k: string]: unknown };
export type CanvasNode = { id: string; type?: string; position: { x: number; y: number }; data: DeviceData; width?: number; height?: number; [k: string]: unknown };
export type CanvasEdge = { id: string; source: string; target: string; type?: string; data?: LinkData; label?: string; animated?: boolean; [k: string]: unknown };
export type Canvas = { nodes: CanvasNode[]; edges: CanvasEdge[]; meta?: { authorized?: boolean; autoScan?: boolean } };

export type Frame = { no: number; time: number; src: string; dst: string; sport: number | null; dport: number | null; protocol: string; length: number; info: string; stack: string; stream: number | null; flags: string | null };
export type TreeNode = { label: string; start: number; len: number; children?: TreeNode[] };
export type CaptureLoad = {
  id: string; name: string; format: string; count: number; truncated: boolean; linktype: string; duration_s: number; bytes: number; first_ts: number;
  frames: Frame[];
  stats: { protocols: { protocol: string; packets: number; bytes: number }[]; conversations: { a: string; b: string; packets: number; bytes: number }[]; endpoints: { address: string; packets: number; bytes: number }[] };
};
