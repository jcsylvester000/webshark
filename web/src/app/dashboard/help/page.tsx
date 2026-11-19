"use client";
/** Help & glossary: getting started, safe-testing rules, glossary, filter and console cheat-sheets, shortcuts. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { CONSOLE_EXAMPLES, FILTER_EXAMPLES, GLOSSARY } from "@/lib/glossary";

const STEPS = [
  ["Create a workspace", "Workspaces are folders for related projects, e.g. one per client, course or site.", "/dashboard/workspaces"],
  ["Create a project", "Pick a template (Vercel, AWS, office LAN…) or start blank. Add a description, tags and a stage so you can find it later.", "/dashboard/workspaces"],
  ["Map your environment", "In the Design tab, drag components from the left palette and connect them. Paste a URL into a Web App node to turn it into that site.", null],
  ["Test it", "Ping, scan and audit from the inspector, the Console tab or the Scanner tab. Results appear in the Results tab.", null],
  ["Automate with batch tests", "In the Batch Tests tab, start from a template or generate a scenario from your map, run it, then Save run.", null],
  ["Document it", "API docs describes your API (OpenAPI) and events (AsyncAPI); Layout docs writes up zones, inventory and data flows from your map; Security report gathers every finding and a STRIDE threat model.", null],
  ["Save, share and export", "Click Save project (Ctrl+S). Use Share for a read-only link, optionally password-protected. Export results as CSV or PDF.", null],
] as const;

const DOC_FEATURES: [string, string][] = [
  ["API docs → REST API", "Generate a draft from your saved API-client requests, start blank, or import OpenAPI / Swagger 2.0. Edit with the form or as YAML/JSON, read the reference, and use Try it."],
  ["API docs → Auth matrix and Security check", "See which endpoints need a login, and check the description against the OWASP API Security Top 10. Mark findings Fixed, Risk accepted or Not an issue."],
  ["API docs → Events", "Describe Kafka topics, MQTT or RabbitMQ queues and their messages with AsyncAPI, drafted from queues on your map."],
  ["Batch tests → API workflows", "Turn your API docs into tests, and import or export them as Arazzo workflows."],
  ["Security report", "One report from the API check, web audit, port scans, failed tests and your map, plus a STRIDE threat model. Export as PDF, Markdown or CSV."],
  ["Layout docs", "Architecture documentation written from your map. Give components a Zone, Owner and Runbook link, and links a protocol, port and Encrypted flag."],
];

export default function HelpPage() {
  const [q, setQ] = useState("");
  const terms = useMemo(() => GLOSSARY.filter((g) => !q || `${g.term} ${g.text}`.toLowerCase().includes(q.toLowerCase())), [q]);
  return (
    <div>
      <PageHeader title="Help & glossary" subtitle="How Slyshark works, plus the networking and security terms you'll meet along the way." />
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <section className="panel p-5">
          <h2 className="font-medium">Getting started in {STEPS.length} steps</h2>
          <ol className="mt-3 space-y-3">
            {STEPS.map(([t, d, href], i) => (
              <li key={t} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-fin/15 text-xs font-semibold text-fin">{i + 1}</span>
                <span><span className="font-medium">{href ? <Link href={href} className="hover:text-fin">{t}</Link> : t}</span><span className="block text-sm text-muted">{d}</span></span></li>
            ))}
          </ol>
        </section>

        <section className="panel p-5">
          <h2 className="font-medium">Documentation features</h2>
          <dl className="mt-3 space-y-2 text-sm">{DOC_FEATURES.map(([t, d]) => <div key={t}><dt className="font-medium">{t}</dt><dd className="text-muted">{d}</dd></div>)}</dl>
        </section>

        <section className="panel p-5">
          <h2 className="font-medium">What gets saved?</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li><span className="text-ink">Projects</span> are saved only when you click <b>Save project</b> or press Ctrl+S. Until then, the header shows &ldquo;Unsaved changes&rdquo;.</li>
            <li>Every save is kept in <b>History</b> (the last 10), so you can restore an earlier version. Add a short note when you save to remember what changed.</li>
            <li><span className="text-ink">Batch test runs</span> are saved when you click <b>Save run</b>.</li>
            <li><span className="text-ink">Quick tools</span> (Console, API client, Scanner) outside a project never save. Use &ldquo;Save as project…&rdquo; to keep that work.</li>
            <li><span className="text-ink">Packet captures</span> are decoded in your browser and are never uploaded.</li>
          </ul>
        </section>

        <section className="panel border-amber-500/40 p-5">
          <h2 className="font-medium">Test safely and legally</h2>
          <p className="mt-2 text-sm text-muted">Only scan or audit systems you own or have <b>written permission</b> to test. Unauthorised scanning can break laws such as the Philippine Cybercrime Prevention Act (RA 10175). Slyshark&apos;s audits look for misconfigurations only; they never send attack payloads.</p>
          <h3 id="own-network" className="mt-4 text-sm font-medium">Testing your own network</h3>
          <p className="mt-1 text-sm text-muted">The hosted Slyshark runs in the cloud, so it can only reach public internet addresses. To test devices at home or in a lab (192.168.x.x, 10.x.x.x), run Slyshark on a computer inside that network: double-click <b>Setup Slyshark.cmd</b> once, then <b>Start Slyshark.cmd</b> (see the README). Local mode allows private addresses and longer tests.</p>
        </section>

        <section className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium">Glossary</h2>
            <input aria-label="Search glossary" className="input w-64" placeholder="Search terms…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {terms.map((g) => <div key={g.term} className="rounded-md border border-line p-3"><dt className="font-medium">{g.term}</dt><dd className="mt-1 text-sm text-muted">{g.text}</dd></div>)}
            {!terms.length && <p className="text-sm text-muted">No matching term.</p>}
          </dl>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="panel p-5">
            <h2 className="font-medium">Display filter cheat-sheet</h2>
            <table className="mt-3 w-full text-sm"><tbody>{FILTER_EXAMPLES.map((x) => <tr key={x.f} className="border-t border-line/60"><td className="py-1.5 pr-3 font-mono text-fin">{x.f}</td><td className="py-1.5 text-muted">{x.why}</td></tr>)}</tbody></table>
          </section>
          <section className="panel p-5">
            <h2 className="font-medium">Console commands</h2>
            <table className="mt-3 w-full text-sm"><tbody>{CONSOLE_EXAMPLES.map((x) => <tr key={x.c} className="border-t border-line/60"><td className="py-1.5 pr-3 font-mono text-fin">{x.c}</td><td className="py-1.5 text-muted">{x.why}</td></tr>)}</tbody></table>
          </section>
        </div>

        <section className="panel p-5">
          <h2 className="font-medium">Keyboard shortcuts</h2>
          <table className="mt-3 w-full text-sm"><tbody>
            {[["Ctrl / ⌘ + S", "Save project"], ["Delete / Backspace", "Remove selected node or link (designer)"], ["↑ / ↓", "Previous / next packet, or console history"], ["Ctrl + L", "Clear the console"], ["Esc", "Close a dialog"]].map(([k, v]) => <tr key={k} className="border-t border-line/60"><td className="py-1.5 pr-3 font-mono">{k}</td><td className="py-1.5 text-muted">{v}</td></tr>)}
          </tbody></table>
        </section>
      </div>
    </div>
  );
}
