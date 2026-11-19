"use client";
/** Environment list + "new from template" dialog. */
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api, errMsg } from "@/lib/api";
import { TEMPLATES } from "@/lib/templates";
import type { EnvFull, EnvSummary } from "@/lib/types";

export default function EnvironmentsPage() {
  const router = useRouter();
  const [envs, setEnvs] = useState<EnvSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("blank");
  const [error, setError] = useState<string | null>(null);
  const load = () => api<EnvSummary[]>("/environments").then(setEnvs).catch((e) => setError(errMsg(e)));
  useEffect(() => { load(); }, []);

  async function create() {
    const t = TEMPLATES.find((x) => x.id === template)!;
    try {
      const env = await api<EnvFull>("/environments", { method: "POST", json: { name: name.trim() || t.name, description: t.description, template: t.id, canvas: t.canvas() } });
      router.push(`/dashboard/environments/${env.id}`);
    } catch (e) { setError(errMsg(e)); }
  }

  async function remove(id: string, n: string) {
    if (!confirm(`Delete environment "${n}"? This cannot be undone.`)) return;
    await api(`/environments/${id}`, { method: "DELETE" }).catch((e) => setError(errMsg(e)));
    load();
  }

  return (
    <div>
      <PageHeader title="Environments" subtitle="Topology diagrams for networks, servers and applications.">
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} />New environment</button>
      </PageHeader>
      {error && <p className="mx-6 mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {creating && (
        <div className="panel m-6 p-5">
          <div className="mb-4 max-w-md"><label className="label" htmlFor="env-name">Name</label><input id="env-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production — Resort Booking" autoFocus /></div>
          <div className="label">Start from</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => setTemplate(t.id)} className={`panel p-3 text-left ${template === t.id ? "border-fin ring-1 ring-fin/40" : "hover:border-fin/40"}`}>
                <div className="text-sm font-medium">{t.name}</div><div className="mt-1 text-xs text-muted">{t.description}</div>
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2"><button className="btn-primary" onClick={create}>Create</button><button className="btn" onClick={() => setCreating(false)}>Cancel</button></div>
        </div>
      )}
      <div className="grid gap-3 p-6 sm:grid-cols-2 xl:grid-cols-3">
        {envs?.map((e) => (
          <div key={e.id} className="panel group flex flex-col p-4 hover:border-fin/50">
            <Link href={`/dashboard/environments/${e.id}`} className="flex-1">
              <div className="font-medium group-hover:text-white">{e.name}</div>
              <div className="mt-1 line-clamp-2 text-sm text-muted">{e.description || "No description"}</div>
              <div className="mt-3 font-mono text-xs text-muted">{e.node_count ?? 0} nodes · {e.edge_count ?? 0} links · {e.template ?? "custom"}</div>
            </Link>
            <div className="mt-3 flex justify-between text-xs text-muted">
              <span>Updated {new Date(e.updated_at).toLocaleString()}</span>
              <button onClick={() => remove(e.id, e.name)} className="opacity-0 group-hover:opacity-100 hover:text-danger" aria-label={`Delete ${e.name}`}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
        {envs?.length === 0 && !creating && <p className="text-sm text-muted">No environments yet. Create one to start mapping your infrastructure.</p>}
      </div>
    </div>
  );
}
