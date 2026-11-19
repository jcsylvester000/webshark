# Slyshark

> Repository and folder name: `webshark` (unchanged). Product name: **Slyshark**.

Slyshark is a documentation and testing workbench for networks, servers and applications.
It draws on Wireshark's capture-analysis ideas and adds an infrastructure designer, a network
console, a port scanner, a security audit and a Postman-style API client.

| Part | Stack | Folder |
|---|---|---|
| Web app | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, React Flow | `web/` |
| API | Rust (axum 0.8, tokio, sqlx 0.8, reqwest) | `api/` |
| Database | Neon serverless Postgres | migrations in `api/migrations/` |

## Features (v0.1)
- **Accounts**: register and sign in before the dashboard is reachable. Argon2id password hashing,
  opaque session tokens (only a SHA-256 hash is stored), and an httpOnly cookie on the web side.
- **Environment designer**: drag and drop PCs, terminals, routers, firewalls, WAFs, load balancers,
  CDNs, DNS, servers, containers, Kubernetes, databases, caches, queues, web apps, APIs, platform
  zones (Vercel, Netlify, AWS, Laravel Forge), threat actors and vulnerabilities. Templates are
  included for Vercel + Neon, Netlify, AWS 3-tier, Forge LEMP, an office LAN, and two attack scenarios.
  Canvases autosave to Neon, and you can export them as Markdown documentation or JSON.
- **URL → application**: paste a URL into a Web App node. The node takes the site's name and favicon,
  and (with auto-scan on) it is port-scanned straight away.
- **Console**: `ping`, `tcping`, `dns`, `curl`, `headers`, `scan`, `audit`, `nodes`, `history`. It is
  docked under the designer, where node names work as targets and results are written onto the nodes.
- **Port scanner**: TCP connect scan with presets, custom ranges, banner grabbing and exposure notes.
- **Web audit** (light penetration testing): security headers, HTTPS redirect, cookie flags, CORS
  reflection, risky HTTP methods, version disclosure, and exposed `.git`, `.env`, `phpinfo`, `server-status`.
- **API client**: any method, query params, headers, JSON, text, XML, urlencoded or multipart bodies,
  Bearer, Basic or API-key auth, `{{variables}}`, saved collections, redirect chain and cURL export.
- **Packet captures**: `.pcap` and `.pcapng` files in a Wireshark-style list, protocol tree and hex pane.
  Includes display filters, Protocol / Conversation / Endpoint statistics, and Follow TCP Stream.
  Decodes Ethernet, VLAN, SLL, ARP, IPv4, IPv6, ICMP, ICMPv6, TCP, UDP, DNS, mDNS, DHCP, NTP,
  SSDP, QUIC, HTTP, TLS (with the SNI server name) and SSH.
- **Activity log**: every ping, scan, HTTP request and audit is recorded against the user.

## Prerequisites (Windows)
- Node.js 20.9+ (`node -v`)
- Rust stable via https://rustup.rs (`cargo -V`); on Windows also install the "Desktop development with C++" build tools
- A Neon project: https://console.neon.tech → create the database `slyshark` → copy the **direct** connection string

## Run locally
```powershell
# 1) API
cd api
copy .env.example .env        # then paste your Neon DATABASE_URL into .env
cargo run                     # runs migrations, seeds testuser, listens on 127.0.0.1:8080

# 2) Web (new terminal)
cd web
copy .env.example .env.local
npm install
npm run dev                   # http://localhost:3000
```
Sign in with **testuser / password123** (created when `SEED_TEST_USER=true`; turn this off before deploying).
For a sample capture, open `samples/slyshark-demo.pcap` on the Packet Captures page.

## Security model
- Only test systems you own or are authorized to assess. Scans and audits need an explicit
  authorization confirmation and are logged.
- The API blocks link-local and cloud-metadata addresses (169.254.0.0/16), multicast, and the
  unspecified address. Set `ALLOW_PRIVATE_TARGETS=false` if untrusted users can sign up, to stop
  SSRF into your private network.
- Packet captures stay in API memory for at most one hour and are never written to the database.
- The console never runs shell commands. Every command maps to a fixed API tool with validated input.

## Project layout
```text
api/  src/main.rs (boot) · routes/ (auth, environments, requests, tools, captures)
      tools/ (ping, portscan, http_client, audit) · pcap/ (reader, dissect) · migrations/
web/  src/app/ (pages + /api BFF routes) · src/components/ (Shell, Terminal, designer/)
      src/lib/ (api client, node catalog, templates, terminal engine, display filter, docs export)
samples/  slyshark-demo.pcap + its generator script
```

## Relationship to Wireshark
Slyshark does not copy Wireshark source code. Wireshark is GPL-2.0, so copied code would bring
that licence with it. Slyshark reimplements the concepts in Rust and TypeScript: `wiretap` → `api/src/pcap/reader.rs`,
`epan/dissectors` → `api/src/pcap/dissect.rs`, display filters → `web/src/lib/filter.ts`, and the
`sharkd` JSON session (load / frames / frame / follow) → the `/captures` endpoints.
