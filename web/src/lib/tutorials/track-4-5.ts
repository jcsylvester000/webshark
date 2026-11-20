/** Steps for Track 4 (Testing tools) and Track 5 (Batch testing). */
import type { TourCtx } from "../tour/types";
import type { StepsDef } from "./index";
import { at, done, newResult, openTab, permissionStep, ranConsole, saveStep } from "./helpers";

const scenarios = (c: TourCtx) => c.state?.batch.scenarios ?? [];
const moreScenarios = (c: TourCtx) => scenarios(c).length > (c.start?.batch.scenarios.length ?? 0);
const activeScenario = (c: TourCtx) => scenarios(c).find((s) => s.id === c.state?.batch.activeScenarioId);
const ranBatch = (c: TourCtx) => Boolean(c.state?.batch.lastRun && c.state.batch.lastRun !== c.start?.batch.lastRun);

export const TRACK_4: StepsDef[] = [
  {
    id: "T50", practice: "office-lan", steps: [
      openTab("Console", "Commands you run here are kept in this project's history."),
      { title: "Ask for help", body: "Click the “help” example chip (or type help) and press Enter.", target: "field:Console input", point: "Type here", check: ranConsole(/^help\b/), waiting: "the help command" },
      { title: "Is it up? ping", body: "Type ping example.com and press Enter. Hosted servers can't send ICMP, so Slyshark uses a TCP ping: it times a connection to port 443.", target: "field:Console input", check: ranConsole(/^(ping|tcping)\s+\S/), waiting: "a ping command" },
      { title: "Look up addresses: dns", body: "Type dns example.com (dig, nslookup and host work too).", target: "field:Console input", check: ranConsole(/^(dns|dig|nslookup|host)\s+\S/), waiting: "a DNS lookup" },
      { title: "See the headers", body: "Type headers https://example.com to see what the web server sends back.", target: "field:Console input", check: ranConsole(/^(headers|curl|http)\s+\S/), waiting: "a headers or curl command" },
      { title: "Scan common ports (optional)", body: "Type scan scanme.nmap.org web -y. The -y confirms you are allowed to scan the target (scanme.nmap.org is provided by the Nmap project for practice).", target: "field:Console input", shout: { tone: "warn", text: "Only scan systems you own or have permission to test." }, check: ranConsole(/^(scan|nmap|portscan)\s+\S/), waiting: "a scan command", optional: true },
      { title: "Use your diagram", body: "Type nodes to list this project's components. Component names can be used as targets, e.g. ping edge-router.", target: "field:Console input", check: ranConsole(/^nodes\b/), waiting: "the nodes command" },
      { title: "History", body: "Press ↑ in the console to recall earlier commands. Results also appear in the Results tab." },
      saveStep("Console checks"),
      done("Console mastered", "Timestamped command results are evidence that you checked reachability and exposure (NIST CSF ID.RA-01)."),
    ],
  },
  {
    id: "T51", practice: "blank", steps: [
      openTab("Scanner & audit"),
      { title: "Choose a target", body: "Type scanme.nmap.org (a host the Nmap project provides for practice) or a host you own.", target: "field:Target", check: (c) => c.value("field:Target").trim().length > 2, waiting: "a target" },
      { title: "Pick ports", body: "Presets: Common (52 ports), Web, Database, Well-known 1–1024, or Custom ranges like 22,80,8000-8100. Keep Common for now.", target: "field:Ports" },
      { title: "Banners", body: "“Grab service banners” records the first text a service sends. It often reveals software and version — which attackers look for too.", target: "field:Grab service banners" },
      { ...permissionStep("scanner") },
      { title: "Scan", body: "Click Scan ports.", target: "btn:Scan ports", point: "Scan", check: newResult("portscan"), waiting: "a finished scan", optional: true },
      { title: "Read the results", body: "Open: a service answered. Closed: the host said nothing's there. Filtered: no reply, usually a firewall. The Note column flags risky services (e.g. Redis or RDP exposed)." },
      { title: "Export the evidence", body: "Click PDF (or CSV) above the table.", target: "btn:Export PDF", check: (c) => c.downloaded(/\.(pdf|csv)$/), waiting: "an export", optional: true },
      saveStep("Port scan"),
      done("Scan documented", "Shows which services are reachable — supporting evidence for exposure reviews (PCI DSS 11.3, ISO 27001 A.8.8). Not an ASV scan."),
    ],
  },
  {
    id: "T52", practice: "blank", steps: [
      openTab("Scanner & audit"),
      { title: "Target a website", body: "Type a website you own, or https://example.com to practise.", target: "field:Target", check: (c) => /^https?:\/\/|\./.test(c.value("field:Target")), waiting: "a website address" },
      { title: "Exposed files", body: "“Audit: check for exposed files” looks for .git, .env, phpinfo and server-status pages that leak secrets.", target: "field:Audit: check for exposed" },
      { ...permissionStep("scanner") },
      { title: "Run the audit", body: "Click Run web audit.", target: "btn:Run web audit", point: "Audit", check: newResult("audit"), waiting: "an audit result", optional: true },
      { title: "Your score", body: "80+ is good, 50–79 needs work, below 50 needs attention. Each finding has a severity and a → fix.", shout: { tone: "tip", text: "Audits look for misconfigurations only; they never send attacks." } },
      { title: "Fix the top finding", body: "Start with High, then Medium. Typical fixes: add Strict-Transport-Security, a Content-Security-Policy, and Secure/HttpOnly/SameSite cookie flags." },
      { title: "Export the report", body: "Click PDF next to the score.", target: "btn:Export PDF", check: (c) => c.downloaded(/\.(pdf|csv)$/), waiting: "an export", optional: true },
      saveStep("Web audit"),
      done("Audit documented", "Before/after audit reports document hardening of a public site (ISO 27001 A.8.9; HIPAA §164.312(e)(1) for HTTPS)."),
    ],
  },
  {
    id: "T53", practice: "blank", steps: [
      openTab("API client"),
      { title: "Variables", body: "Click the Variables button (the {x} icon). baseUrl is already set to https://httpbin.org, a free test API.", target: "[title=Variables]", point: "Variables", check: (c) => c.clicked("[title=Variables]"), waiting: "the Variables panel" },
      { title: "Use a variable", body: "In the URL box type {{baseUrl}}/get", target: "field:URL", check: (c) => c.value("field:URL").includes("{{baseUrl}}"), waiting: "{{baseUrl}} in the URL" },
      { title: "Send it", body: "Click Send. The response shows status, time, size, body, headers and redirects.", target: "btn:Send", point: "Send", check: newResult("http"), waiting: "a response", optional: true },
      { title: "Authentication", body: "Open the Auth tab and choose Bearer token. Put a variable such as {{token}} instead of a real token.", target: "btn:Auth", check: (c) => c.value("field:Auth type") === "bearer", waiting: "Bearer token auth" },
      { title: "Keep secrets out", body: "Tokens in variables are never put in share links, and generated API docs replace them with <redacted>.", shout: { tone: "warn", text: "Never paste production secrets into shared projects." } },
      { title: "Save to a collection", body: "Click Save as and name it (e.g. Smoke / Get).", target: "btn:Save as", check: (c) => (c.state?.api.requests.length ?? 0) > (c.start?.api.requests.length ?? 0), waiting: "a saved request" },
      { title: "Copy as cURL", body: "Settings → Copy gives a cURL command for scripts and tickets.", target: "btn:Settings", optional: true },
      saveStep("API requests"),
      done("Requests saved", "Saved requests become the source for auto-generated API documentation (tutorial T70)."),
    ],
  },
  {
    id: "T54", startPath: "/dashboard/scanner", steps: [
      { title: "Quick tools", body: "Open Scanner & audit from Quick tools in the sidebar.", target: "nav:Scanner & audit", check: at(/^\/dashboard\/scanner/), waiting: "the quick Scanner page" },
      { title: "Scratch mode", body: "The banner says nothing here is stored. Quick tools are for one-off checks.", target: "btn:Save as project", shout: { tone: "tip", text: "Use Save as project… when the result is worth keeping." } },
      { title: "Run a quick check (optional)", body: "Enter a target, tick permission and run a scan or audit.", target: "field:Target", check: (c) => c.tool("portscan") || c.tool("audit"), waiting: "a quick check", optional: true },
      { title: "Keep it", body: "Click Save as project… and create a project from this work.", target: "btn:Save as project", point: "Save as project", check: (c) => c.cmd("project.create"), waiting: "a new project" },
      done("Nothing lost", "Ad-hoc checks become evidence once they're in a project."),
    ],
  },
  {
    id: "T55", practice: "office-lan", steps: [
      openTab("Console", "Run a quick command to create a result."),
      { title: "Make a result", body: "Type ping example.com (or dns example.com) and press Enter.", target: "field:Console input", check: newResult(), waiting: "a new result", optional: true },
      openTab("Results"),
      { title: "Filter by tool", body: "Use the tool filter to show only one kind of result.", target: "field:Filter by tool", check: (c) => c.value("field:Filter by tool") !== "" && c.value("field:Filter by tool") !== "all", waiting: "a tool filter", optional: true },
      { title: "Export", body: "Export CSV or PDF of everything you tested.", target: "btn:Export CSV", check: (c) => c.downloaded(/\.(csv|pdf)$/), waiting: "an export" },
      { title: "Kept with the project", body: "Results are saved with the project (the latest 300)." },
      done("Activity logged", "A dated log of tests performed supports audit-control evidence (ISO 27001 A.8.15)."),
    ],
  },
  {
    id: "T56", startPath: "/dashboard/captures", steps: [
      { title: "Packet captures", body: "Open Packet captures from Quick tools.", target: "nav:Packet captures", check: at(/^\/dashboard\/captures/), waiting: "the Packet captures page" },
      { title: "Open the sample", body: "Click “Open the sample capture”. Captures are decoded in your browser and never uploaded.", target: "@open-sample", point: "Open", check: (c) => c.exists("[aria-label='Display filter']") && c.text(/slyshark-demo\.pcap/), waiting: "the sample to load", go: { path: "/dashboard/captures" } },
      { title: "Filter: dns", body: "Type dns in the display filter and press Enter (or click the dns example).", target: "field:Display filter", check: (c) => /\bdns\b/.test(c.value("field:Display filter")), waiting: "the dns filter" },
      { title: "Inspect a packet", body: "Click a packet row. The protocol tree (Ethernet → IP → UDP/TCP → application) and raw bytes appear below.", check: (c) => c.text(/Ethernet|Internet Protocol/), waiting: "a selected packet" },
      { title: "Find the TLS server name", body: "Filter tls.handshake. The Server Name Indication (SNI) shows which site a browser asked for, even over HTTPS.", target: "field:Display filter", check: (c) => /tls/.test(c.value("field:Display filter")), waiting: "a tls filter" },
      { title: "Follow a TCP stream", body: "Filter http, select a packet and click “Follow TCP stream” to read the whole conversation.", target: "btn:Follow TCP stream", check: (c) => c.clicked("btn:Follow TCP stream"), waiting: "Follow TCP stream", optional: true },
      { title: "Statistics", body: "Open the conversations view to see who talked to whom.", target: "btn:conversations", check: (c) => c.clicked("btn:conversations"), waiting: "the conversations view" },
      { title: "What this proves", body: "If you can read passwords or patient data in a stream, that traffic is not encrypted.", shout: { tone: "warn", text: "Only capture traffic on networks you own or are authorised to monitor." } },
      done("Captures understood", "Shows whether sensitive data crosses the network unencrypted (HIPAA §164.312(e)(1); PCI DSS 4.2.1)."),
    ],
  },
  {
    id: "T57", startPath: "/dashboard/help", steps: [
      { title: "Why run locally?", body: "The hosted version runs in the cloud, so it can't see your home or office network (192.168.x.x, 10.x.x.x). Running Slyshark on a PC inside that network can.", target: "#own-network", go: { path: "/dashboard/help" } },
      { title: "Set up once", body: "On Windows, double-click “Setup Slyshark.cmd” in the Slyshark folder. It installs what's needed and prepares a local database.", shout: { tone: "warn", text: "Only test networks you own or manage." } },
      { title: "Start it", body: "Double-click “Start Slyshark.cmd”, then open http://localhost:3000. Local mode allows private targets, longer tools and bigger scans.", check: () => ["localhost", "127.0.0.1"].includes(location.hostname), waiting: "Slyshark opened from this computer (localhost)", optional: true },
      { title: "Scan your router", body: "In a project's Scanner & audit tab, target your router (often 192.168.1.1) with the Common preset.", check: (c) => c.tool("portscan"), waiting: "a scan", optional: true },
      { title: "Put it on the diagram", body: "Add the router to the diagram with its host, then Scan from the inspector so the results stay on the node." },
      { title: "Other devices", body: "The start window prints a LAN address so phones and other PCs on the network can open Slyshark too." },
      done("Local testing", "Internal exposure evidence (e.g. open SMB or RDP inside the office) supports internal scans (PCI DSS 11.3.1) and NIST CSF DE.CM-01."),
    ],
  },
];

export const TRACK_5: StepsDef[] = [
  {
    id: "T60", practice: "blank", steps: [
      openTab("Batch tests"),
      { title: "From a template", body: "Choose “+ From template…” → Website health & security, then enter your domain (or example.com).", target: "field:New from template", check: moreScenarios, waiting: "a new scenario" },
      { title: "The steps", body: "Each step tests one thing and has an expectation. Click ▸ on a step to see what it expects.", target: "btn:Edit step" },
      { ...permissionStep("batch") },
      { title: "Run it", body: "Click Run scenario.", target: "btn:Run scenario", point: "Run", check: ranBatch, waiting: "a finished run", optional: true },
      { title: "Read pass/fail", body: "Each step shows pass, fail or error with the checks it made and what it actually saw." },
      { title: "Save the run", body: "Click Save run to keep these results permanently.", target: "btn:Save run", check: (c) => c.cmd("batch.saveRun"), waiting: "a saved run", optional: true },
      { title: "Export", body: "Export the run as PDF or CSV.", target: "btn:Export PDF", check: (c) => c.downloaded(/\.(pdf|csv)$/), waiting: "an export", optional: true },
      saveStep("Website checks"),
      done("Repeatable testing", "Dated, repeatable test evidence; run it monthly and keep the history (PCI DSS 11, ISO 27001 A.8.8)."),
    ],
  },
  {
    id: "T61", practice: "blank", steps: [
      openTab("Batch tests"),
      { title: "New scenario", body: "Click New.", target: "btn:New", check: moreScenarios, waiting: "a new scenario" },
      { title: "Name it", body: "Name the scenario, e.g. “Policy checks”.", target: "field:Scenario name", check: (c) => Boolean(activeScenario(c)?.name.trim()), waiting: "a name" },
      { title: "DNS step", body: "Click Add step, set Step type to “DNS lookup”, and target your domain.", target: "btn:Add step", check: (c) => Boolean(activeScenario(c)?.steps.some((s) => s.type === "dns" && s.target)), waiting: "a DNS step with a target" },
      { title: "HTTP step with expectations", body: "Add an HTTP request step to https://your-site. Open ▸ and expect status 2xx and the header Strict-Transport-Security.", target: "btn:Add step", check: (c) => Boolean(activeScenario(c)?.steps.some((s) => s.type === "http" && s.target)), waiting: "an HTTP step" },
      { title: "Port must be closed", body: "Add a Port scan step and expect 3306 to be closed (databases shouldn't be public).", target: "btn:Add step", check: (c) => Boolean(activeScenario(c)?.steps.some((s) => s.type === "portscan")), waiting: "a port-scan step" },
      { title: "Order and switches", body: "Use ↑ ↓ to reorder, the checkbox to disable a step, Parallel steps for speed and Stop on first failure for strict runs." },
      { ...permissionStep("batch") },
      { title: "Run", body: "Click Run scenario.", target: "btn:Run scenario", check: ranBatch, waiting: "a run", optional: true },
      saveStep("Custom checks"),
      done("Policy as tests", "Turns policy (“the database port must not be public”) into a test you can prove passes (ISO 27001 A.8.29)."),
    ],
  },
  {
    id: "T62", practice: "office-lan", steps: [
      openTab("Batch tests"),
      { title: "Generate from canvas", body: "Click Generate from canvas. Every component with a host or URL gets reachability, documented-port and (for web apps) audit steps.", target: "btn:Generate from canvas", check: moreScenarios, waiting: "a generated scenario" },
      { title: "Steps from your diagram", body: "Step names match your components. Ports you documented became expectations." },
      { ...permissionStep("batch") },
      { title: "Run and save", body: "Run the scenario, then Save run.", target: "btn:Run scenario", check: ranBatch, waiting: "a run", optional: true },
      saveStep("Diagram tests"),
      done("Diagram verified", "Proves the diagram matches reality — documented vs. actual exposure (PCI DSS 1.2.3 “accurate” diagram)."),
    ],
  },
  {
    id: "T63", practice: "blank", steps: [
      openTab("API docs", "Tests from API docs need an API description first."),
      { title: "Create a quick spec", body: "Click Start blank (or Import a file you have).", target: "btn:Start blank", check: (c) => Boolean(c.state?.docs.api.spec), waiting: "API docs" },
      openTab("Batch tests"),
      { title: "Generate from API docs", body: "Click Generate from API docs. Public endpoints should answer as documented; protected ones must refuse requests without credentials (401/403).", target: "btn:Generate from API docs", check: moreScenarios, waiting: "a generated scenario", optional: true },
      { title: "Export as Arazzo", body: "Click Arazzo on the scenario (or Export all as Arazzo). Arazzo is the OpenAPI Initiative's workflow format.", target: "btn:Arazzo || btn:Export all as Arazzo", check: (c) => c.downloaded(/arazzo/i), waiting: "an Arazzo download", optional: true },
      { title: "Import a workflow", body: "Import Arazzo… loads a workflow file as a scenario. Steps matching documented endpoints become standard Arazzo steps.", target: "btn:Import Arazzo", check: (c) => c.fileChosen(), waiting: "an imported file", optional: true },
      saveStep("API workflows"),
      done("Access tests from docs", "Access-control tests derived from documentation (OWASP API2/API5; HIPAA §164.312(a)(1))."),
    ],
  },
  {
    id: "T64", startPath: "/dashboard/runs", steps: [
      { title: "Test runs", body: "Open Test runs from the sidebar: every saved run across projects.", target: "nav:Test runs", check: at(/^\/dashboard\/runs/), waiting: "the Test runs page" },
      { title: "Pass ratio", body: "Each run shows passed/total, duration and when it was saved. Compare the same scenario over time." },
      { title: "Export", body: "Export a run as PDF or CSV for your evidence folder.", target: "btn:PDF || btn:CSV", check: (c) => c.downloaded(/\.(pdf|csv)$/), waiting: "an export", optional: true },
      done("History kept", "Shows controls are tested regularly, not just once (HIPAA §164.308(a)(8) evaluation)."),
    ],
  },
];

