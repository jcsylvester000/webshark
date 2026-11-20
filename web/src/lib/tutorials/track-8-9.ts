/** Steps for Track 8 (Scenario capstones) and Track 9 (Compliance evidence). */
import type { TourCtx, TourStep } from "../tour/types";
import type { StepsDef } from "./index";
import { done, edges, newResult, nodes, onTab, openTab, ops, saveStep } from "./helpers";

const triaged = (c: TourCtx) => Object.keys(c.state?.docs.security.triage ?? {}).length > Object.keys(c.start?.docs.security.triage ?? {}).length;
const zoned = (n: number) => (c: TourCtx) => nodes(c.state).filter((x) => x.data.zone?.trim()).length >= n;
const owned = (n: number) => (c: TourCtx) => nodes(c.state).filter((x) => (x.data.owner as string | undefined)?.trim()).length >= n;
const hasKinds = (kinds: string[]) => (c: TourCtx) => kinds.every((k) => k.split("|").some((one) => nodes(c.state, one).length > 0));
const tested = (c: TourCtx) => newResult()(c) || Boolean(c.state?.batch.lastRun && c.state.batch.lastRun !== c.start?.batch.lastRun);

type Capstone = {
  id: string; practice: string; seed?: "api";
  briefing: string; checklist: string[];
  model: { body: string; kinds: string[]; zones: number; owners?: number };
  test: { tab: "Scanner & audit" | "Batch tests" | "Console" | "API docs"; body: string };
  docs: { tab: "Layout docs" | "Security report" | "API docs"; body: string }[];
  decide: string;
  deliver: "share" | "export";
  debrief: string;
};

function capstone(k: Capstone): StepsDef {
  const steps: TourStep[] = [
    { title: "Scenario briefing", body: `${k.briefing}\n\nWhat “done” looks like:\n${k.checklist.map((x) => `• ${x}`).join("\n")}` },
    { title: "Ground rules", body: "Use fictional data in practice projects. Test only systems you own or have written permission to test.", shout: { tone: "warn", text: "Unauthorised scanning can be illegal (in the Philippines, RA 10175). Keep written permission on file." } },
    { title: "Part A · Model the environment", body: k.model.body, target: "aside[aria-label='Component palette']", check: hasKinds(k.model.kinds), waiting: `components: ${k.model.kinds.map((x) => x.split("|")[0]).join(", ")}`, go: { tab: "Design" } },
    { title: "Part A · Zones and owners", body: `Select components and set Zone${k.model.owners ? " and Owner" : ""}. Zones are the trust boundaries reviewers ask about.`, target: "[data-canvas]", check: (c) => zoned(k.model.zones)(c) && (!k.model.owners || owned(k.model.owners)(c)), waiting: `zones on ${k.model.zones} components${k.model.owners ? ` and owners on ${k.model.owners}` : ""}`, go: { tab: "Design" } },
    { title: "Part A · Mark encryption", body: "Click each link and tick “Encrypted in transit” only where it's true. Unencrypted hops become findings.", target: "[data-canvas]", check: (c) => edges(c.state).some((e) => e.data?.encrypted !== c.start?.canvas.edges.find((x) => x.id === e.id)?.data?.encrypted), waiting: "an encryption decision on a link", go: { tab: "Design" } },
    saveStep("Part A: model"),
    openTab(k.test.tab),
    { title: "Part B · Test (with permission)", body: k.test.body, check: tested, waiting: "a test result", optional: true, go: { tab: k.test.tab } },
    ...k.docs.flatMap((d): TourStep[] => [openTab(d.tab), { title: `Part C · ${d.tab}`, body: d.body, check: (c) => onTab(d.tab)(c) && (d.tab === "Layout docs" ? Boolean(c.state?.docs.layout.title.trim() || Object.values(c.state?.docs.layout.intro ?? {}).some(Boolean)) : d.tab === "Security report" ? Boolean(c.state?.docs.security.report.scope.trim()) : ops(c.state).length > 0), waiting: d.tab === "Layout docs" ? "a title or introduction" : d.tab === "Security report" ? "a scope" : "documented endpoints", go: { tab: d.tab } }]),
    { title: "Part D · Decide", body: k.decide, check: triaged, waiting: "at least one decision (status + note)", go: { tab: "Security report" } },
    saveStep("Capstone documented"),
    k.deliver === "share"
      ? { title: "Part E · Deliver", body: "Create a password-protected share link with a short expiry for the reviewer (Share → include what they need).", target: "btn:Share", check: (c) => c.cmd("share.create"), waiting: "a share link" }
      : { title: "Part E · Deliver", body: "Export the deliverables (PDF or Markdown) from the documentation tabs.", check: (c) => c.downloaded(), waiting: "an export" },
    { title: "Debrief", body: k.debrief },
    done("Capstone complete", "See the Compliance Mapping in the tutorial catalogue for how each output supports a framework."),
  ];
  return { id: k.id, practice: k.practice, seed: k.seed, steps };
}

export const TRACK_8: StepsDef[] = [
  capstone({ id: "S01", practice: "netlify-jamstack", briefing: "You run a small business website on a CDN. Map it, audit it, fix headers and produce a before/after report.", checklist: ["Diagram with DNS, CDN and app", "Audit result", "Website test run", "Security report + layout PDF"],
    model: { body: "The template already has the site. Add a DNS component if it's missing and set the Web Application's URL to your site.", kinds: ["dns", "webapp|serverless"], zones: 2 },
    test: { tab: "Batch tests", body: "Create “Website health & security” from a template with your domain, tick permission and Run scenario. Save the run." },
    docs: [{ tab: "Security report", body: "Fill Assessor and Scope; the audit and test results appear as findings." }, { tab: "Layout docs", body: "Give the layout document a title." }],
    decide: "Triage the top finding (e.g. missing Content-Security-Policy): Fixed after you change the headers, or Risk accepted with a reason.", deliver: "export",
    debrief: "Re-run the audit after fixing headers; the before/after reports prove hardening to clients, insurers and partners." }),
  capstone({ id: "S02", practice: "office-lan", briefing: "You look after an office network. Run Slyshark locally, discover devices and build the inventory.", checklist: ["Every device on the diagram with zone, owner and ports", "Exposure test run", "Layout docs inventory"],
    model: { body: "Add any device that's missing (printers, Wi-Fi access points, staff phones) with their IP addresses.", kinds: ["router", "switch", "pc|laptop"], zones: 3, owners: 2 },
    test: { tab: "Batch tests", body: "Click Generate from canvas, tick permission and run it. On a local install you can test private addresses." },
    docs: [{ tab: "Layout docs", body: "Title the document and write the Inventory introduction." }],
    decide: "In Security report, triage any exposed service (e.g. SMB 445 reachable from Wi-Fi).", deliver: "export",
    debrief: "A current inventory and map is the foundation of every security programme (NIST CSF ID.AM, CIS Control 1)." }),
  capstone({ id: "S03", practice: "vercel-next", seed: "api", briefing: "Your startup's SaaS API runs on Vercel with Neon. Document it and answer customers' security questionnaires.", checklist: ["Complete OpenAPI docs", "Auth matrix with no review flags", "OWASP findings triaged", "Public reference shared"],
    model: { body: "Add an API Service to the diagram for the API.", kinds: ["api"], zones: 2 },
    test: { tab: "Batch tests", body: "Generate tests from API docs and export them as Arazzo for CI (run them against your real API)." },
    docs: [{ tab: "API docs", body: "Review the endpoints and fix the Auth matrix flags." }, { tab: "Security report", body: "Fill the scope: the API, its servers and the review date." }],
    decide: "In API docs → Security check, decide on each OWASP finding with a reason.", deliver: "share",
    debrief: "Customers' security questionnaires usually ask exactly what you just documented (OWASP API Top 10; ISO 27001 A.8.25–A.8.29)." }),
  capstone({ id: "S04", practice: "office-lan", briefing: "A clinic stores electronic protected health information (ePHI) in an EHR system. Build the evidence pack for its HIPAA risk analysis.", checklist: ["ePHI systems on the diagram (EHR, database, backups, workstations, VPN)", "Encrypted flows marked", "Threat model with mitigations", "Layout docs + security report"],
    model: { body: "Add the EHR (Web Application), its Database, backups (Object Storage) and keep the workstations and VPN. In each component's Notes write “contains ePHI” where true.", kinds: ["webapp", "database", "storage", "vpn"], zones: 4, owners: 3 },
    test: { tab: "Scanner & audit", body: "With written permission, audit the EHR portal URL and scan the clinic's public address." },
    docs: [{ tab: "Layout docs", body: "Title it “ePHI systems inventory and data flows” and introduce the zones." }, { tab: "Security report", body: "Scope: systems that create, receive, maintain or transmit ePHI." }],
    decide: "In the Threat model, record how each high threat is mitigated (e.g. “TLS 1.2+ enforced”, “MFA on VPN”).", deliver: "share",
    debrief: "Supports the documented risk analysis (45 CFR §164.308(a)(1)(ii)(A)) and evaluation (§164.308(a)(8)). The proposed HIPAA update would also require a technology asset inventory and network map — not final yet. Have a qualified professional review the pack." }),
  capstone({ id: "S05", practice: "aws-3tier", briefing: "Under the Philippine Data Privacy Act, document the security measures that protect personal data in your systems.", checklist: ["Processing systems and personal-data flows on the diagram", "Technical measures evidenced", "Organizational/physical measures as manual findings", "Risk decisions"],
    model: { body: "In each component's Notes, list the personal data it handles (e.g. names, contact numbers, IDs).", kinds: ["database", "server|vm"], zones: 3, owners: 2 },
    test: { tab: "Scanner & audit", body: "Audit the public site to evidence technical measures (HTTPS, headers, cookies)." },
    docs: [{ tab: "Layout docs", body: "Title it as the security measures annex for your Privacy Impact Assessment." }, { tab: "Security report", body: "Scope: personal data processing systems. Add manual findings for organizational and physical measures." }],
    decide: "Triage each finding with an owner and a target date in the note.", deliver: "share",
    debrief: "Supports reasonable and appropriate security measures (RA 10173 Sec. 20; IRR Secs. 25–29; NPC Circular 2023-06). Have your DPO or counsel review it." }),
  capstone({ id: "S06", practice: "aws-3tier", briefing: "Your e-commerce site takes card payments. Draw the cardholder data environment (CDE) and test its boundaries.", checklist: ["CDE zone boundary", "All connections and account-data flows", "Closed-port tests", "Diagram and data-flow exports"],
    model: { body: "Put payment components in a zone named CDE; everything else in Corporate or Internet.", kinds: ["database", "firewall|waf|loadbalancer"], zones: 4 },
    test: { tab: "Batch tests", body: "Add port-scan steps that expect database ports to be CLOSED from outside, then run them with permission." },
    docs: [{ tab: "Layout docs", body: "Title it “CDE network and data-flow diagrams”." }],
    decide: "Triage any finding on CDE components in Security report.", deliver: "export",
    debrief: "Supports PCI DSS v4.0.1 1.2.3 (network diagram), 1.2.4 (data-flow diagram) and 11.3 testing evidence. Slyshark is not an ASV and does not replace a penetration test (11.4)." }),
  capstone({ id: "S07", practice: "aws-3tier", seed: "api", briefing: "Produce ISO 27001 / NIST CSF evidence from one project.", checklist: ["Inventory with owners", "Network segregation (zones)", "Vulnerability findings with decisions", "Change notes in History"],
    model: { body: "Make sure every component has a zone and an owner.", kinds: ["database", "server|vm"], zones: 4, owners: 4 },
    test: { tab: "Batch tests", body: "Generate from canvas and run with permission; save the run." },
    docs: [{ tab: "Layout docs", body: "Title the document and write intros for Inventory and Trust zones." }, { tab: "Security report", body: "Fill scope and method." }],
    decide: "Triage findings with owner and ticket references.", deliver: "export",
    debrief: "Evidence for ISO/IEC 27001:2022 A.5.9, A.8.8, A.8.9, A.8.20, A.8.22 and NIST CSF 2.0 ID.AM, ID.RA, PR.PS, DE.CM." }),
  capstone({ id: "S08", practice: "attack-ddos-mitm", briefing: "After a DDoS and a suspected man-in-the-middle, document what happened and what changed.", checklist: ["Attack paths mapped to your environment", "Threat model with mitigations", "Lessons-learned findings"],
    model: { body: "Rename components to match your environment and keep the attack paths.", kinds: ["attacker", "loadbalancer"], zones: 3 },
    test: { tab: "Console", body: "Check the public endpoints respond again (ping, headers)." },
    docs: [{ tab: "Security report", body: "Scope: the incident window and affected systems. Add manual findings for lessons learned." }],
    decide: "In the Threat model, mark the DoS and tampering threats with the mitigations you added (CDN, TLS everywhere).", deliver: "export",
    debrief: "Captures what happened, which controls apply and what changed (NIST CSF RS.AN / ID.IM; ISO 27001 A.5.27)." }),
  capstone({ id: "S09", practice: "attack-web", seed: "api", briefing: "A client asked for a mini-assessment of their web app. Work only inside the agreed scope.", checklist: ["Written authorisation recorded in scope", "Scans/audits only on in-scope targets", "Findings triaged", "Password-protected report"],
    model: { body: "Keep the template and set the web app URL to the in-scope site.", kinds: ["webapp", "database"], zones: 3 },
    test: { tab: "Scanner & audit", body: "With written permission on file, audit the in-scope URL and scan its host." },
    docs: [{ tab: "Security report", body: "Scope: list in-scope targets, dates and the authorisation reference." }],
    decide: "Triage every High finding and write the executive summary.", deliver: "share",
    debrief: "A professional deliverable with scope, method, findings and decisions. Testing without permission risks liability under RA 10175." }),
  capstone({ id: "S10", practice: "aws-3tier", briefing: "Document an event-driven system: producers, Kafka topics and consumers.", checklist: ["Queue on the diagram", "AsyncAPI document", "Event channels in layout docs"],
    model: { body: "Add a Queue (Kafka) and connect producers and consumers to it.", kinds: ["queue"], zones: 2 },
    test: { tab: "API docs", body: "Switch to Events (AsyncAPI) and Draft from the diagram." },
    docs: [{ tab: "Layout docs", body: "Check that APIs and events appear; title the document." }],
    decide: "In Security report → Threat model, mitigate any unencrypted hop to the broker.", deliver: "export",
    debrief: "Documents asynchronous data paths often missing from network maps (PCI DSS 1.2.4; NIST CSF ID.AM-03)." }),
  capstone({ id: "S11", practice: "vercel-next", seed: "api", briefing: "Re-check API security expectations on every release.", checklist: ["Tests generated from API docs", "Arazzo exported for CI", "Saved runs per release"],
    model: { body: "Add an API Service component for the API under test.", kinds: ["api"], zones: 1 },
    test: { tab: "Batch tests", body: "Generate from API docs and export Arazzo. Run against your staging API with permission." },
    docs: [{ tab: "API docs", body: "Confirm the docs match this release." }],
    decide: "Record any failing expectation as a finding with a ticket.", deliver: "export",
    debrief: "Shows security expectations are re-checked on every change (ISO 27001 A.8.29, A.8.32)." }),
  capstone({ id: "S12", practice: "office-lan", briefing: "Networking 101: IP addresses, DNS, ports, TCP vs UDP, HTTP status codes and TLS, hands-on.", checklist: ["Console lookups", "A packet capture explored", "Glossary terms read"],
    model: { body: "Look at the Office LAN: router, firewall, switch and devices. Each has an IP address.", kinds: ["router"], zones: 1 },
    test: { tab: "Console", body: "Run dns example.com, then ping example.com, then headers https://example.com." },
    docs: [{ tab: "Layout docs", body: "Read how the inventory turns IP addresses and ports into documentation; give it a title." }],
    decide: "Open Security report and mark one design finding as “Not an issue” or “Risk accepted” with your reasoning.", deliver: "export",
    debrief: "You now know the vocabulary used in every security document. Next: Packet captures (T56) and the glossary." }),
  capstone({ id: "S13", practice: "blank", briefing: "Migrate legacy Swagger 2.0 docs and publish a public reference.", checklist: ["Swagger 2.0 imported and converted", "Checker errors fixed", "Internal endpoints marked", "Public version exported"],
    model: { body: "Add an API Service component for the API you're documenting.", kinds: ["api"], zones: 1 },
    test: { tab: "API docs", body: "Import your swagger.json; it is converted to OpenAPI 3.1." },
    docs: [{ tab: "API docs", body: "Fix errors shown by the check badge and mark admin endpoints Internal." }],
    decide: "In API docs → Security check, decide on each finding.", deliver: "export",
    debrief: "Modern, shareable API docs without leaking internal endpoints (ISO 27001 A.5.14)." }),
  capstone({ id: "S14", practice: "office-lan", briefing: "Onboard a new team member with your documentation.", checklist: ["Layout docs ready", "Share link for the newcomer", "Tutorials suggested"],
    model: { body: "Make sure the diagram is current: owners and runbook links on key components.", kinds: ["router"], zones: 2, owners: 2 },
    test: { tab: "Console", body: "Run nodes to show the newcomer how the console uses component names." },
    docs: [{ tab: "Layout docs", body: "Write introductions so a newcomer understands each zone." }],
    decide: "Open Security report and record one known risk the newcomer should be aware of.", deliver: "share",
    debrief: "Send the newcomer the share link and point them to Tutorials → Getting started. Knowledge lives in documentation, not in people's heads (NIST CSF PR.AT)." }),
];

export const TRACK_9: StepsDef[] = [
  { id: "C01", practice: "office-lan", steps: [
    { title: "What auditors ask for", body: "An inventory of systems with owners, locations and purpose (ISO 27001 A.5.9; NIST CSF ID.AM-01/02; PCI DSS 12.5.1). Outputs here are evidence drafts for professional review." },
    { title: "Complete every component", body: "Select each component and fill Zone, Owner, Documented ports and OS / Runtime.", target: "[data-canvas]", check: (c) => nodes(c.state).filter((n) => !["note", "internet"].includes(n.data.kind)).every((n) => n.data.zone && n.data.owner), waiting: "zone and owner on every component", go: { tab: "Design" } },
    { title: "Common pitfall", body: "Stale inventories fail audits. Add “Reviewed <date>” to the project note when you check it.", shout: { tone: "warn", text: "Missing owners are the most common inventory finding." } },
    openTab("Layout docs"),
    { title: "Export the inventory", body: "Export CSV (spreadsheet of components) or PDF.", target: "btn:Export CSV || btn:Export PDF", check: (c) => c.downloaded(), waiting: "an export" },
    { title: "File it", body: "Save it in your evidence folder as “Asset inventory <date>”. Review at least quarterly and after changes." },
    saveStep("Inventory reviewed"), done("Inventory evidence", "Filed asset inventory with a review cadence."),
  ] },
  { id: "C02", practice: "aws-3tier", steps: [
    { title: "What the requirement asks", body: "Accurate diagrams of all connections and of how sensitive data flows (PCI DSS 1.2.3/1.2.4; NIST CSF ID.AM-03; proposed HIPAA network map)." },
    { title: "Describe every link", body: "Select each link and fill Label, Protocol and Port.", target: "[data-canvas]", check: (c) => edges(c.state).filter((e) => e.data?.protocol || e.data?.port).length >= Math.min(4, edges(c.state).length), waiting: "protocol or port on the links", go: { tab: "Design" } },
    { title: "Show boundaries", body: "Zones on every component make trust boundaries visible.", target: "[data-canvas]", check: zoned(4), waiting: "zones on four components", go: { tab: "Design" } },
    openTab("Layout docs"),
    { title: "Export", body: "Export the Data flows (CSV or PDF), and Design → Export ▾ → Documentation (.md).", target: "btn:Export PDF || btn:Export CSV", check: (c) => c.downloaded(), waiting: "an export" },
    { title: "Keep it accurate", body: "Update the diagram on every change and save with a note; History shows when it was last reviewed." },
    saveStep("Diagrams reviewed"), done("Diagram evidence", "Network and data-flow diagrams ready for review."),
  ] },
  { id: "C03", practice: "office-lan", steps: [
    { title: "Encryption in transit", body: "HIPAA §164.312(e)(1), PCI DSS 4.2.1, ISO 27001 A.8.24 and RA 10173 expect sensitive data to be protected in transit." },
    { title: "Mark every link", body: "Tick “Encrypted in transit” only where TLS, SSH, VPN or similar is really used.", target: "[data-canvas]", check: (c) => edges(c.state).some((e) => e.data?.encrypted !== c.start?.canvas.edges.find((x) => x.id === e.id)?.data?.encrypted), waiting: "an encryption decision", go: { tab: "Design" } },
    openTab("Security report"),
    { title: "Unencrypted flows", body: "Design findings and the threat model list unencrypted flows. Decide on each: Fixed (and how) or Risk accepted (and why).", check: triaged, waiting: "a decision" },
    { title: "Prove it", body: "For extra evidence, capture traffic (Packet captures) and show the content is unreadable.", shout: { tone: "tip", text: "If you can read it in a capture, so can an attacker on that network." } },
    { title: "Export", body: "Export the security report.", target: "btn:Export PDF || btn:Markdown", check: (c) => c.downloaded(), waiting: "an export" },
    saveStep("Encryption reviewed"), done("Encryption evidence", "A dated encryption review with decisions."),
  ] },
  { id: "C04", practice: "blank", seed: "api", steps: [
    { title: "Access control for APIs", body: "HIPAA §164.312(a)(1) and (d), OWASP API2/API5 and ISO 27001 A.8.3/A.8.5: only the right people and systems may call each endpoint." },
    openTab("API docs"),
    { title: "Open the Auth matrix", body: "Click Auth matrix.", target: "[aria-label='API docs view'] button:nth-child(4)", check: (c) => c.clicked("[aria-label='API docs view'] button:nth-child(4)"), waiting: "the Auth matrix" },
    { title: "Fix “Not stated”", body: "Open each flagged endpoint in Edit and set its authentication (POST /appointments needs bearerAuth; /admin should never be public).", check: (c) => ops(c.state).filter((o) => /appointments|admin/.test(o.path)).every((o) => Array.isArray(o.op.security) && (o.op.security as object[]).length > 0), waiting: "authentication on /appointments and /admin" },
    { title: "Test that it refuses", body: "Batch tests → Generate from API docs creates checks that protected endpoints refuse anonymous calls (run against your real API).", optional: true },
    { title: "Export the matrix", body: "Back in Auth matrix, export PDF.", target: "btn:Export PDF || btn:PDF", check: (c) => c.downloaded(), waiting: "an export", optional: true },
    saveStep("Access control reviewed"), done("Access-control evidence", "Auth matrix + tests: access control you can show, not just describe."),
  ] },
  { id: "C05", practice: "office-lan", seed: "api", steps: [
    { title: "A findings register", body: "HIPAA risk management, ISO 27001 A.8.8, NIST CSF ID.RA-01/06 and PCI DSS 6.3.1 expect vulnerabilities to be identified, ranked and treated." },
    openTab("Security report"),
    { title: "Decide on findings", body: "Set a status on findings and write the owner and ticket in the note (e.g. “IT – SEC-41, due 30 Nov”).", check: triaged, waiting: "a decision with a note" },
    { title: "Pitfall", body: "“Risk accepted” without a reason or an approver doesn't satisfy auditors.", shout: { tone: "warn", text: "Write who accepted the risk and until when." } },
    { title: "Export the register", body: "Export CSV: one row per finding with status and notes.", target: "btn:Export CSV", check: (c) => c.downloaded(/\.csv$/), waiting: "a CSV export" },
    saveStep("Findings register"), done("Register filed", "A findings register with decisions, ready for your risk review."),
  ] },
  { id: "C06", practice: "netlify-jamstack", steps: [
    { title: "Testing on a schedule", body: "HIPAA §164.308(a)(8) evaluation, PCI DSS 11.3 (quarterly) and NIST CSF DE.CM expect regular testing. Slyshark supports this evidence; it does not replace an ASV scan." },
    openTab("Batch tests"),
    { title: "A repeatable scenario", body: "Create “Website health & security” from a template for your domain.", target: "field:New from template", check: (c) => (c.state?.batch.scenarios.length ?? 0) > (c.start?.batch.scenarios.length ?? 0), waiting: "a scenario" },
    { title: "Run and save monthly", body: "Run with permission and Save run. Repeat each month (put a reminder in your calendar).", target: "btn:Run scenario", check: (c) => c.cmd("batch.saveRun"), waiting: "a saved run", optional: true },
    { title: "Show the history", body: "Test runs lists every saved run for comparison; export PDFs for the evidence folder.", target: "nav:Test runs" },
    saveStep("Testing schedule"), done("Cadence evidenced", "Run history proves testing happens regularly."),
  ] },
  { id: "C07", practice: "office-lan", steps: [
    { title: "Sharing with third parties", body: "RA 10173 data-sharing principles, HIPAA minimum necessary (§164.502(b)) and ISO 27001 A.5.14: share the least information needed, protect it and be able to revoke it." },
    { title: "Save, then Share", body: "Save the project and open Share.", target: "btn:Share", check: (c) => c.exists("#sh-label"), waiting: "the Share dialog" },
    { title: "Least information", body: "Only tick what the reviewer needs. Leave the security report off unless they must see it." },
    { title: "Password and expiry", body: "Set a password and a short expiry.", target: "#sh-pw", check: (c) => c.value("#sh-pw").length >= 6, waiting: "a password" },
    { title: "Create the link", body: "Create the link; the list keeps label, expiry and view counts as your sharing log.", target: "btn:Create link", check: (c) => c.cmd("share.create"), waiting: "a link" },
    { title: "Revoke after review", body: "Turn the link off when the review ends.", check: (c) => c.cmd("share.revoke"), waiting: "a revoked link", optional: true },
    done("Sharing evidenced", "A sharing log with least information, passwords, expiry and revocation."),
  ] },
  { id: "C08", practice: "blank", steps: [
    { title: "Documentation hygiene", body: "RA 10173 data minimisation, HIPAA minimum necessary and ISO 27001 A.8.11 data masking: documents should never contain secrets or real personal data." },
    openTab("API client"),
    { title: "Secrets in variables", body: "Open Variables and add a variable named token with a placeholder value. Use {{token}} in requests instead of the real value.", target: "[title=Variables]", check: (c) => (c.state?.api.variables ?? []).some((v) => v.key === "token"), waiting: "a token variable" },
    openTab("Notes"),
    { title: "Say where, not what", body: "Write in Notes where credentials are kept (e.g. “Admin password: in the team vault, entry ‘Router’”).", target: "#notes", check: (c) => /vault|password manager|kept in|stored in/i.test(c.state?.notes ?? ""), waiting: "a note that says where credentials are kept" },
    { title: "Fake data in examples", body: "Use invented names and numbers in API examples and test data.", shout: { tone: "warn", text: "Check every export before sending it: search it for passwords, tokens and real names." } },
    saveStep("Hygiene checked"), done("Clean documents", "Shareable documents with no secrets and no real personal data."),
  ] },
];

