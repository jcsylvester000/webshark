/** Endpoint × authentication matrix: who can call what, and where protection is missing. */
import { effectiveSecurity, ops, schemeLabel } from "../openapi/spec";
import type { OpenApiDoc } from "../openapi/types";
import type { Report } from "../export";

export type MatrixRow = {
  key: string; method: string; path: string; summary: string;
  status: "required" | "optional" | "public" | "unstated";
  /** Each inner list is one way to authenticate (all of its schemes together). */
  options: string[][];
  scopes: string[];
  risk: string | null;
};

const WRITE = new Set(["post", "put", "patch", "delete"]);

export function authMatrix(doc: OpenApiDoc): { schemes: string[]; rows: MatrixRow[] } {
  const schemes = Object.keys(doc.components?.securitySchemes ?? {});
  const rows = ops(doc).map((o): MatrixRow => {
    const { reqs, source } = effectiveSecurity(doc, o.op);
    const options = reqs.map((r) => Object.keys(r));
    const anonymous = options.some((x) => x.length === 0);
    const status: MatrixRow["status"] = source === "none" ? "unstated" : !options.length || options.every((x) => !x.length) ? "public" : anonymous ? "optional" : "required";
    const write = WRITE.has(o.method);
    const risk = status === "unstated" && write ? "Changes data; authentication not stated"
      : status === "public" && write ? "Changes data without authentication"
      : status === "optional" && write ? "Changes data; credentials are optional"
      : status === "unstated" ? "Not stated: public or forgotten?" : null;
    return { key: o.key, method: o.method.toUpperCase(), path: o.path, summary: o.op.summary ?? "", status, options, scopes: [...new Set(reqs.flatMap((r) => Object.values(r).flat()))], risk };
  });
  return { schemes, rows };
}

export const STATUS_TEXT: Record<MatrixRow["status"], string> = { required: "Required", optional: "Optional", public: "Public", unstated: "Not stated" };

export function matrixReport(doc: OpenApiDoc, project: string): Report {
  const { schemes, rows } = authMatrix(doc);
  const defs = doc.components?.securitySchemes ?? {};
  return {
    title: `Authentication matrix - ${doc.info.title}`,
    meta: [["Project", project], ["API version", doc.info.version], ["Endpoints", String(rows.length)], ["Without required auth", String(rows.filter((r) => r.status !== "required").length)]],
    sections: [
      { heading: "Endpoints", columns: [{ key: "method", label: "Method" }, { key: "path", label: "Path" }, { key: "summary", label: "Summary" }, { key: "status", label: "Auth", value: (r: MatrixRow) => STATUS_TEXT[r.status] },
        ...schemes.map((s) => ({ key: s, label: s, value: (r: MatrixRow) => r.options.some((x) => x.includes(s)) ? (r.options.every((x) => x.includes(s)) ? "required" : "one option") : "" })),
        { key: "scopes", label: "Scopes", value: (r: MatrixRow) => r.scopes.join(" ") }, { key: "risk", label: "Risk", value: (r: MatrixRow) => r.risk ?? "" }], rows },
      { heading: "Authentication methods", columns: [{ key: "name", label: "Name" }, { key: "type", label: "Type" }, { key: "desc", label: "Description" }], rows: schemes.map((n) => ({ name: n, type: schemeLabel(defs[n]), desc: defs[n].description ?? "" })) },
    ],
  };
}
