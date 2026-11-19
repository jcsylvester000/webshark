# Slyshark

> Repository and folder name: `webshark` (unchanged). Product name: **Slyshark**.

Slyshark is a documentation and testing workbench for networks, servers and applications.
It draws on Wireshark's capture-analysis ideas and adds an infrastructure designer, a network
console, a port scanner, a security audit and a Postman-style API client.

**Stack:** one Next.js 16 app (React 19 + TypeScript + Tailwind CSS 4 + React Flow) in `web/`.
The UI and the back end (Next.js Route Handlers under `/api/*`) deploy together to **Netlify**.
Data lives in **Neon** serverless Postgres.

## Features (v0.7)
- **Accounts**: register and sign in before the dashboard is reachable. scrypt password hashing and
  random session tokens (only a SHA-256 hash is stored). The Account page lets users edit their profile,
  change their password, see and sign out sessions, and delete the account.
- **Display settings**: Dark/Light/System theme, text size, 12/24-hour clock, relative times, learning
  tips, reduce motion and start page. They're saved to the account and applied before first paint.
- **Beginner-friendly**: personal greeting, getting-started checklist, "Continue where you left off",
  ⓘ learning tips, a Help & glossary page, example console commands and capture filters, and
  plain-language errors.
- **Organization**: workspaces (with colour and description) → projects with description, tags,
  stage (production, staging, development, lab, learning) and pin. Search, filter and sort across all
  projects. Projects can be duplicated, moved, archived and restored.
- **Save history**: save with an optional note; the last 10 saves can be restored.
- **Share links**: a read-only link to the last saved version, with an optional password (10 wrong
  tries lock it for 15 minutes), expiry, view counts and revocation. API secrets are never shared.
  Links can include the API reference (on by default).
- **API docs (OpenAPI)**: each project can hold an OpenAPI 3.1 description (3.2 optional), saved with
  the project. Generate a draft from saved API-client requests (servers, path parameters, query
  parameters, auth schemes, JSON bodies and captured responses; tokens and passwords are redacted),
  start blank, or import a YAML/JSON file. Edit with a guided form or a YAML/JSON editor, check it
  with a plain-language validator, and read it as an interactive reference with code samples (cURL,
  JavaScript, Python) and **Try it** (sent through the server-side HTTP tool; credentials are never
  saved). Export as OpenAPI YAML/JSON, Markdown, PDF or CSV.
- **API security (v0.6)**: an **authentication matrix** (endpoint × auth method, flagging endpoints that
  change data without required auth) and an **OWASP API Security Top 10 (2023) check** of the API
  description (credentials in URLs, Basic auth, unprotected writes and admin paths, guessable IDs,
  SSRF-prone URL fields, mass assignment, missing limits and rate limiting, plain-HTTP servers,
  inventory gaps). Findings can be triaged: Open, Risk accepted, Fixed or Not an issue, with a note.
- **Security assessment report (v0.6)**: one report from every source (API check, web audit, port
  scans, failed batch tests, vulnerability nodes, attack paths and unencrypted links on the diagram,
  plus findings you add), with a risk score, title, assessor, scope, method and executive summary
  (auto-written on request). Export as PDF, Markdown or CSV; optionally share it read-only (off by
  default; built on the server so raw project data never leaves it).
- **Phase 3 docs (v0.7)**:
  - **Public versions (OpenAPI Overlay 1.0):** mark endpoints or tags *Internal*; export a public
    version or the overlay file, and apply overlay files on import. Share links always show the public version.
  - **OpenAPI 3.2 tag tree:** child groups (`parent`) nest in the reference navigation.
  - **Events (AsyncAPI 3.0, 2.x read):** draft from queues on the diagram, import, read as a reference,
    edit as YAML/JSON, check, export YAML/JSON/Markdown, include in share links.
  - **Arazzo 1.0 ↔ batch tests:** export/import scenarios as Arazzo workflows (steps that match
    documented operations use operationId + successCriteria); generate a scenario from the API docs
    (public GETs answer as documented, protected ones refuse missing credentials).
  - **Threat model (STRIDE):** generated from zones, data flows, internet-facing parts, attack paths
    and vulnerabilities, with mitigation notes; part of the security report and its share.
  - **Layout docs:** architecture document from the diagram (overview, trust zones, inventory with
    owner and runbook, data flows, APIs/events linked to the docs, security posture) with per-section
    intros; export Markdown/PDF/CSV. Shared links also show data flows.
- **Workspaces → projects**: organize work into workspaces. Each project keeps its full working
  state: canvas, icons, links, API collections and variables, scanner settings and last results,
  console history, batch scenarios, test results and notes.
  It is stored **only when you click Save project** (Ctrl+S). Reopening a project restores it exactly.
- **Only active projects load**: lists show summaries only. A project's state is fetched when you open
  it, open projects appear as tabs, and closing a tab unloads it. Archive projects to hide them.
- **Environment designer**: drag-and-drop PCs, servers, network gear, data stores, web apps, platform
  zones and threat scenarios, plus 8 templates. Paste a URL into a Web App node and it becomes that
  application, with an optional automatic port scan.
- **Console, port scanner, web audit, API client** (Postman-style), all usable inside a project or
  as scratch tools (nothing stored; "Save as project…").
- **Batch testing**: build scenarios of DNS / TCP ping / port scan / HTTP / audit steps with
  expectations (status codes, latency, ports open or closed, header present, body contains, minimum
  audit score). Start from a template (Website health & security, API smoke test, Exposure check),
  or generate a scenario from the canvas. Run in parallel, then **Save run** to keep the results.
- **Exports**: CSV and PDF for batch runs, scans, audits, project results, saved-run lists and packet
  lists. They are generated in the browser (jsPDF), and Markdown/JSON export is available for the canvas.
- **Packet captures**: `.pcap` and `.pcapng` files are decoded in the browser (never uploaded, up to 200 MB),
  with a Wireshark-style list, protocol tree and hex view, filters, statistics, and Follow TCP Stream.

## CQRS design
| Side | Where | What it does |
|---|---|---|
| Commands (writes) | `POST /api/commands/{name}` → `src/server/cqrs/commands.ts` | `workspace.create/update/delete`, `project.create/save/rename/setStatus/move/delete`, `batch.saveRun/deleteRun` |
| Queries (reads) | `GET /api/queries/*` → `src/server/cqrs/queries.ts` | Read model views `workspace_summaries`, `project_summaries`, `batch_run_summaries`, plus single-project snapshot load |
| Working state | browser, `src/lib/store.ts` (zustand) | Every edit happens here and marks the project *unsaved*; nothing is persisted until a command runs |
| Stateless tools | `/api/tools/*` | ping, dns, portscan, http, audit. They return results and store nothing |

`project.save` uses optimistic concurrency (`expectedVersion`). If the project was saved somewhere
else, you're asked before anything is overwritten.

## Run locally (PowerShell)
```powershell
cd web
copy .env.example .env.local     # paste your Neon DATABASE_URL
npm install
npm run db:migrate               # creates tables (0001–0003) + testuser / password123
npm run dev                      # http://localhost:3000
```

## Deploy to Netlify
1. Push this repo to GitHub (see below).
2. Netlify → **Add new project → Import from Git** → pick `jcsylvester000/webshark`.
   `netlify.toml` already sets base `web`, command `npm run netlify-build`, publish `.next`, Node 22.
3. **Site configuration → Environment variables** (scopes: Builds + Functions):
   `DATABASE_URL` (Neon **pooled** connection string), `SEED_TEST_USER=true` (testing only),
   optionally `ALLOW_PRIVATE_TARGETS`, `TOOL_BUDGET_MS`.
4. Deploy. Every build runs database migrations first, then `next build`. Netlify's Next.js adapter
   (OpenNext) is applied automatically.

### Serverless notes
- **Ping uses TCP connect**, not ICMP: serverless functions cannot open raw sockets.
- Scans and audits run from Netlify's servers, so they test public hosts. Private/LAN addresses are
  blocked in production (`ALLOW_PRIVATE_TARGETS=false`) to prevent SSRF. Run `npm run dev` on your
  own network to test internal hosts.
- Netlify synchronous functions stop at 10 s by default. Slyshark keeps each tool request under
  `TOOL_BUDGET_MS` (8.5 s) and batches port scans.

## Security model
- Only test systems you own or are authorized to assess. Scans and audits require explicit
  confirmation and are logged.
- Link-local and cloud-metadata addresses (169.254.0.0/16), multicast and unspecified addresses are
  always blocked. HTTP requests pin the resolved IP and re-check every redirect hop.
- The console never runs shell commands. Every command maps to a fixed tool with validated input.

## Project layout
```text
netlify.toml                 Netlify build config (base = web)
web/db/migrations/           SQL migrations (applied by scripts/migrate.mjs)
web/scripts/migrate.mjs      migrations + optional test-user seed
web/src/app/api/             auth/*, commands/[name], queries/*, tools/*, health
web/src/server/              server-only: db, auth, config, cqrs/ (commands, queries), tools/ (target, ping, portscan, httpClient, audit)
web/src/app/dashboard/       overview, workspaces, projects/[id] (workbench), runs, scratch tools, captures
web/src/components/          Shell, designer/*, docs/* (API docs: editor, reference, Try it, auth matrix, security check), security/* (FindingsList, SecurityReport, ThreatModel), docs/EventsDocs, LayoutDocs, ApiClient, Scanner, Terminal, BatchTests, ResultsPanel, ExportMenu, NewProjectDialog
web/src/lib/                 store (working state), cqrs, project, batch, export, reports, api, scan, ports, terminal, filter, docs, openapi/* (model, generator, validator, YAML/JSON I/O), security/* (owasp, authMatrix, assessment, triage, threats), openapi/{arazzo,overlay}, asyncapi, layout, pcap/*
samples/                     slyshark-demo.pcap + generator
```

## Relationship to Wireshark
Slyshark does not copy Wireshark source code (Wireshark is GPL-2.0). It reimplements the concepts in
TypeScript: `wiretap` → `lib/pcap/reader.ts`, `epan/dissectors` → `lib/pcap/dissect.ts`,
display filters → `lib/filter.ts`, and the `sharkd` load/frames/frame/follow session → `lib/pcap/analyze.ts`.
