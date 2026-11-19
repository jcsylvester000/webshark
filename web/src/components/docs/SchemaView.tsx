"use client";
/** Read-only tree of a JSON Schema: fields, types, required flags and descriptions. */
import { deref, typeText } from "@/lib/openapi/spec";
import type { OpenApiDoc, Schema } from "@/lib/openapi/types";

export function SchemaView({ doc, schema, depth = 0, seen = [] }: { doc: OpenApiDoc; schema: Schema | undefined; depth?: number; seen?: string[] }) {
  if (!schema) return <span className="text-xs text-muted">Not described</span>;
  const ref = schema.$ref;
  if (ref && seen.includes(ref)) return <span className="font-mono text-xs text-muted">{ref.split("/").pop()} (refers to itself)</span>;
  const s = deref(doc, schema);
  if (!s) return <span className="font-mono text-xs text-danger">Broken reference {ref}</span>;
  const nextSeen = ref ? [...seen, ref] : seen;
  const props = Object.entries(s.properties ?? {});
  const variants = s.oneOf ?? s.anyOf ?? s.allOf;
  return (
    <div className="text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-fin">{ref ? ref.split("/").pop() : typeText(s)}</span>
        {s.enum && <span className="text-muted">one of: <span className="font-mono">{s.enum.map((e) => JSON.stringify(e)).join(", ")}</span></span>}
        {s.description && depth === 0 && <span className="text-muted">{s.description}</span>}
      </div>
      {variants && depth < 6 && <div className="mt-1 space-y-1 border-l border-line pl-3"><span className="text-muted">{s.oneOf ? "One of:" : s.anyOf ? "Any of:" : "All of:"}</span>{variants.map((v, i) => <SchemaView key={i} doc={doc} schema={v} depth={depth + 1} seen={nextSeen} />)}</div>}
      {props.length > 0 && depth < 6 && (
        <table className="mt-1 w-full border-l border-line">
          <tbody>{props.map(([k, p]) => {
            const r = deref(doc, p);
            const nested = r && (r.properties || (r.type === "array" && deref(doc, r.items)?.properties));
            return (
              <tr key={k} className="border-b border-line/40 align-top last:border-0">
                <td className="whitespace-nowrap py-1 pl-3 pr-3 font-mono">{k}{s.required?.includes(k) && <span className="ml-1 text-danger" title="required">*</span>}</td>
                <td className="py-1 pr-3">
                  {nested ? <details><summary className="cursor-pointer font-mono text-fin">{typeText(p)}</summary><div className="mt-1"><SchemaView doc={doc} schema={r.type === "array" ? r.items : p} depth={depth + 1} seen={nextSeen} /></div></details> : <span className="font-mono text-fin">{typeText(p)}</span>}
                  {r?.description && <span className="block text-muted">{r.description}</span>}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      {s.type === "array" && !props.length && deref(doc, s.items)?.properties && depth < 6 && <div className="mt-1 border-l border-line pl-3"><SchemaView doc={doc} schema={s.items} depth={depth + 1} seen={nextSeen} /></div>}
    </div>
  );
}
