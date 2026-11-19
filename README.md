# Slyshark

> Repository and folder name: `webshark` (unchanged). Product name: **Slyshark**.

Slyshark is a documentation and testing workbench for networks, servers and applications.
It draws on Wireshark's capture-analysis ideas and adds an infrastructure designer, a network
console, a port scanner, a security audit and a Postman-style API client.

**Stack:** one Next.js 16 app (React 19 + TypeScript + Tailwind CSS 4 + React Flow) in `web/`.
The UI and the back end (Next.js Route Handlers under `/api/*`) deploy together to **Netlify**.
Data lives in **Neon** serverless Postgres.

## Features (v0.2)
- **Accounts**: register and sign in before the dashboard is reachable. scrypt password hashing,
  random session tokens (only a SHA-256 hash is stored), and an httpOnly cookie.
- **Environment designer**: drag and drop PCs, terminals, routers, firewalls, WAFs, load balancers, CDNs,
  DNS, servers, containers, Kubernetes, databases, caches, queues, web apps, APIs, platform zones
  (Vercel, Netlify, AWS, Laravel Forge), threat actors and vulnerabilities. Eight templates are included,
  plus autosave and Markdown/JSON export.
- **URL → application**: paste a URL into a Web App node. The node takes the site's name and icon,
  and (with auto-scan on) it is port-scanned straight away.
- **Console**: `ping` and `tcping` (TCP connect), `dns`, `curl`, `headers`, `scan`, `audit`, `nodes`, `history`.
- **Port scanner**: TCP connect scan with banners and exposure notes. Large scans are split into
  batches of 200 ports so each request finishes inside serverless time limits.
- **Web audit** (light penetration testing): security headers, HTTPS redirect, cookie flags, CORS
  reflection, risky methods, version disclosure, and exposed `.git`, `.env`, `phpinfo`, `server-status`.
- **API client**: any method, params, headers, JSON, text, XML, urlencoded or multipart bodies, Bearer,
  Basic or API-key auth, `{{variables}}`, saved collections, redirect chain and cURL export.
- **Packet captures**: `.pcap` and `.pcapng` files are decoded **in your browser**: they are never
  uploaded, and files up to 200 MB work. Wireshark-style list, protocol tree, hex view, display filters,
  statistics, and Follow TCP Stream.
- **Activity log** of every network action.

## Run locally (PowerShell)
```powershell
cd web
copy .env.example .env.local     # paste your Neon DATABASE_URL
npm install
npm run db:migrate               # creates tables + testuser / password123
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
web/src/app/api/             Route Handlers: auth, settings, environments, requests, tools/*, health
web/src/server/              server-only: db (postgres.js), auth, config, tools (target, ping, portscan, httpClient, audit)
web/src/app/dashboard/       UI pages · web/src/components/ (Shell, Terminal, designer/)
web/src/lib/                 browser logic: api, scan batching, ports, terminal, filter, docs, pcap/ (reader, dissect, analyze)
samples/                     slyshark-demo.pcap + generator
```

## Relationship to Wireshark
Slyshark does not copy Wireshark source code (Wireshark is GPL-2.0). It reimplements the concepts in
TypeScript: `wiretap` → `lib/pcap/reader.ts`, `epan/dissectors` → `lib/pcap/dissect.ts`,
display filters → `lib/filter.ts`, and the `sharkd` load/frames/frame/follow session → `lib/pcap/analyze.ts`.
