/** Reading and writing OpenAPI documents: YAML/JSON text, Markdown, the PDF/CSV report and code samples. */
import { parse, stringify, YAMLParseError } from "yaml";
import type { Report } from "../export";
import { allParams, deref, effectiveSecurity, exampleFor, groupByTag, ops, schemeLabel, typeText } from "./spec";
import type { OpenApiDoc, OpRef } from "./types";

export const MAX_DOC_BYTES = 2 * 1024 * 1024;

export type ParseResult = { ok: true; doc: OpenApiDoc; format: "yaml" | "json" } | { ok: false; message: string; line?: number };

export function parseDoc(text: string): ParseResult {
  if (text.length > MAX_DOC_BYTES) return { ok: false, message: "The document is larger than 2 MB." };
  const t = text.trim();
  if (!t) return { ok: false, message: "The document is empty." };
  if (t.startsWith("{")) {
    try { return asDoc(JSON.parse(t), "json"); } catch (e) {
      const m = /position (\d+)/.exec(String(e));
      return { ok: false, message: `JSON error: ${(e as Error).message}`, line: m ? t.slice(0, Number(m[1])).split("\n").length : undefined };
    }
  }
  try { return asDoc(parse(t, { maxAliasCount: 50, uniqueKeys: true }), "yaml"); } catch (e) {
    if (e instanceof YAMLParseError) return { ok: false, message: `YAML error: ${e.message.split("\n")[0]}`, line: e.linePos?.[0]?.line };
    return { ok: false, message: String(e) };
  }
}
function asDoc(v: unknown, format: "yaml" | "json"): ParseResult {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, message: "The document must be a mapping/object with openapi, info and paths." };
  return { ok: true, doc: v as OpenApiDoc, format };
}

export const toText = (doc: OpenApiDoc, format: "yaml" | "json") => (format === "json" ? JSON.stringify(doc, null, 2) : stringify(doc, { lineWidth: 0, aliasDuplicateObjects: false }));

// ---- Markdown --------------------------------------------------------------------------------
const md = (s: unknown) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
export function toMarkdown(doc: OpenApiDoc): string {
  const L: string[] = [`# ${doc.info.title} (v${doc.info.version})`, ""];
  if (doc.info.description) L.push(doc.info.description, "");
  L.push(`_OpenAPI ${doc.openapi} · exported from Slyshark on ${new Date().toISOString().slice(0, 10)}_`, "");
  if (doc.servers?.length) { L.push("## Servers", ""); for (const s of doc.servers) L.push(`- \`${s.url}\`${s.description ? ` — ${s.description}` : ""}`); L.push(""); }
  const schemes = Object.entries(doc.components?.securitySchemes ?? {});
  if (schemes.length) { L.push("## Authentication", "", "| Name | Type | Notes |", "|---|---|---|"); for (const [n, s] of schemes) L.push(`| ${md(n)} | ${md(schemeLabel(s))} | ${md(s.description)} |`); L.push(""); }
  L.push("## Endpoints", "", "| Method | Path | Summary | Auth |", "|---|---|---|---|");
  for (const o of ops(doc)) L.push(`| ${o.method.toUpperCase()} | \`${md(o.path)}\` | ${md(o.op.summary)} | ${md(authText(doc, o))} |`);
  for (const [tag, list] of groupByTag(doc)) {
    L.push("", `## ${tag}`, "");
    const t = doc.tags?.find((x) => x.name === tag);
    if (t?.description) L.push(t.description, "");
    for (const o of list) {
      L.push(`### ${o.method.toUpperCase()} \`${o.path}\`${o.op.deprecated ? " (deprecated)" : ""}`, "");
      if (o.op.summary) L.push(`**${o.op.summary}**`, "");
      if (o.op.description) L.push(o.op.description, "");
      L.push(`Authentication: ${authText(doc, o)}`, "");
      const params = allParams(doc, o);
      if (params.length) { L.push("| Parameter | In | Required | Type | Description |", "|---|---|---|---|---|"); for (const p of params) L.push(`| ${md(p.name)} | ${p.in} | ${p.required ? "yes" : "no"} | ${md(typeText(deref(doc, p.schema)))} | ${md(p.description)} |`); L.push(""); }
      const body = deref(doc, o.op.requestBody);
      for (const [ct, m] of Object.entries(body?.content ?? {})) { L.push(`Request body (\`${ct}\`)${body?.required ? ", required" : ""}:`, "", "```json", JSON.stringify(m.example ?? exampleFor(doc, m.schema), null, 2), "```", ""); }
      const resps = Object.entries(o.op.responses ?? {});
      if (resps.length) { L.push("| Response | Description |", "|---|---|"); for (const [c, r] of resps) L.push(`| ${c} | ${md(deref(doc, r)?.description)} |`); L.push(""); }
    }
  }
  return L.join("\n");
}

export function authText(doc: OpenApiDoc, o: OpRef): string {
  const { reqs, source } = effectiveSecurity(doc, o.op);
  if (source === "none") return "Auth not stated";
  if (!reqs.length || reqs.every((r) => !Object.keys(r).length)) return "None (public)";
  return reqs.map((r) => Object.keys(r).map((n) => schemeLabel(doc.components?.securitySchemes?.[n])).join(" + ")).join(" or ");
}

/** Tabular version of the reference, for the shared CSV/PDF exporter. */
export function apiReport(doc: OpenApiDoc, project: string): Report {
  const list = ops(doc);
  return {
    title: `API reference - ${doc.info.title}`, subtitle: doc.info.description?.split("\n")[0]?.slice(0, 140),
    meta: [["Project", project], ["API version", doc.info.version], ["OpenAPI", doc.openapi], ["Servers", (doc.servers ?? []).map((s) => s.url).join(", ") || "-"], ["Endpoints", String(list.length)]],
    sections: [
      { heading: "Endpoints", columns: [{ key: "method", label: "Method" }, { key: "path", label: "Path" }, { key: "summary", label: "Summary" }, { key: "tag", label: "Tag" }, { key: "auth", label: "Authentication" }, { key: "deprecated", label: "Deprecated" }],
        rows: list.map((o) => ({ method: o.method.toUpperCase(), path: o.path, summary: o.op.summary ?? "", tag: o.op.tags?.join(", ") ?? "", auth: authText(doc, o), deprecated: o.op.deprecated ? "yes" : "" })) },
      { heading: "Parameters", columns: [{ key: "ep", label: "Endpoint" }, { key: "name", label: "Name" }, { key: "in", label: "In" }, { key: "req", label: "Required" }, { key: "type", label: "Type" }, { key: "desc", label: "Description" }],
        rows: list.flatMap((o) => allParams(doc, o).map((p) => ({ ep: o.key, name: p.name, in: p.in, req: p.required ? "yes" : "no", type: typeText(deref(doc, p.schema)), desc: p.description ?? "" }))) },
      { heading: "Responses", columns: [{ key: "ep", label: "Endpoint" }, { key: "code", label: "Status" }, { key: "desc", label: "Description" }, { key: "ct", label: "Content type" }],
        rows: list.flatMap((o) => Object.entries(o.op.responses ?? {}).map(([code, r]) => { const d = deref(doc, r); return { ep: o.key, code, desc: d?.description ?? "", ct: Object.keys(d?.content ?? {}).join(", ") }; })) },
      { heading: "Authentication schemes", columns: [{ key: "name", label: "Name" }, { key: "type", label: "Type" }, { key: "desc", label: "Description" }],
        rows: Object.entries(doc.components?.securitySchemes ?? {}).map(([name, s]) => ({ name, type: schemeLabel(s), desc: s.description ?? "" })) },
    ],
  };
}

// ---- code samples ----------------------------------------------------------------------------
export type SampleInput = { method: string; url: string; headers: [string, string][]; body: string | null };
const sq = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
export function samples(i: SampleInput): Record<"cURL" | "JavaScript" | "Python", string> {
  const m = i.method.toUpperCase();
  const curl = [`curl -X ${m} ${sq(i.url)}`, ...i.headers.map(([k, v]) => `-H ${sq(`${k}: ${v}`)}`), ...(i.body ? [`-d ${sq(i.body)}`] : [])].join(" \\\n  ");
  const hdrs = Object.fromEntries(i.headers);
  const js = `const res = await fetch(${JSON.stringify(i.url)}, {\n  method: ${JSON.stringify(m)},\n  headers: ${JSON.stringify(hdrs, null, 2).replace(/\n/g, "\n  ")},${i.body ? `\n  body: ${JSON.stringify(i.body)},` : ""}\n});\nconsole.log(res.status, await res.text());`;
  const py = `import requests\n\nres = requests.request(\n    ${JSON.stringify(m)},\n    ${JSON.stringify(i.url)},\n    headers=${JSON.stringify(hdrs)},${i.body ? `\n    data=${JSON.stringify(i.body)},` : ""}\n)\nprint(res.status_code, res.text)`;
  return { cURL: curl, JavaScript: js, Python: py };
}
