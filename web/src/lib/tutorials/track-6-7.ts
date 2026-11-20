/** Steps for Track 6 (API documentation) and Track 7 (Security & architecture docs). */
import type { TourCtx } from "../tour/types";
import type { StepsDef } from "./index";
import { done, nodes, openTab, ops, pressed, saveStep, spec } from "./helpers";

const view = (label: string, body: string, extra: Partial<import("../tour/types").TourStep> = {}) => ({
  title: `Open ${label}`, body, target: `[aria-label='API docs view'] button:nth-child(${["Reference", "Edit", "YAML / JSON", "Auth matrix", "Security check"].indexOf(label) + 1})`,
  point: label, check: pressed(label), waiting: `the ${label} view`, ...extra,
});
const triaged = (c: TourCtx) => Object.keys(c.state?.docs.security.triage ?? {}).length > Object.keys(c.start?.docs.security.triage ?? {}).length
  || Object.entries(c.state?.docs.security.triage ?? {}).some(([k, v]) => JSON.stringify(v) !== JSON.stringify(c.start?.docs.security.triage[k]));
const report = (c: TourCtx) => c.state?.docs.security.report;
const events = (c: TourCtx) => c.state?.docs.events.spec as { channels?: Record<string, unknown>; servers?: Record<string, { protocol?: string }>; operations?: Record<string, { action?: string }>; components?: { messages?: Record<string, { payload?: { properties?: object } }> } } | null | undefined;

export const TRACK_6: StepsDef[] = [
  {
    id: "T70", practice: "blank", steps: [
      openTab("API client", "API docs can be drafted from requests you saved here."),
      { title: "Send a request", body: "Type {{baseUrl}}/get in the URL and click Send.", target: "field:URL", check: (c) => c.tool("http"), waiting: "a sent request", optional: true },
      { title: "Save it", body: "Click Save as and name it. Saved requests (and their responses) feed the docs generator.", target: "btn:Save as", check: (c) => (c.state?.api.requests.length ?? 0) > (c.start?.api.requests.length ?? 0), waiting: "a saved request" },
      openTab("API docs", "OpenAPI is the standard format behind Swagger: other tools can read what you write here."),
      { title: "Generate from API client", body: "Click Generate from API client.", target: "btn:Generate from API client", point: "Generate", check: (c) => ops(c.state).length > 0, waiting: "an API description with endpoints" },
      { title: "Secrets are removed", body: "Tokens and passwords are never copied into the docs; they become <redacted>.", shout: { tone: "tip", text: "Generated docs are a draft: review names, descriptions and auth before sharing." } },
      { title: "The check badge", body: "The badge shows errors, warnings and tips. Click it to see what to improve.", target: "[title='Documentation check']", check: (c) => c.clicked("[title='Documentation check']"), waiting: "the documentation check", optional: true },
      saveStep("API docs draft"),
      done("Docs drafted", "A machine-readable API description is the basis for API security reviews (ISO 27001 A.5.37)."),
    ],
  },
  {
    id: "T71", practice: "blank", seed: "api", steps: [
      openTab("API docs"),
      view("Edit", "The guided editor lets you describe the API without YAML."),
      { title: "Overview", body: "In Overview, add a contact email for the team that owns the API.", target: "btn:Overview", check: (c) => Boolean(spec(c.state)?.info.contact?.email), waiting: "a contact email" },
      { title: "Servers", body: "Open Servers and add a second server, e.g. Staging https://staging-api.clinic.example/v1.", target: "btn:Servers", check: (c) => (spec(c.state)?.servers?.length ?? 0) >= 2, waiting: "two servers" },
      { title: "Authentication", body: "Open Authentication. bearerAuth (JWT) is defined. Tick “Required by default on every endpoint”.", target: "btn:Authentication", check: (c) => (spec(c.state)?.security?.length ?? 0) > 0, waiting: "authentication required by default", shout: { tone: "warn", text: "Describe how credentials are sent — never paste real ones." } },
      { title: "Groups", body: "Open Groups / tags and tick Internal on the Admin group so it's left out of public docs.", target: "btn:Groups", check: (c) => (spec(c.state)?.tags ?? []).some((t) => (t as Record<string, unknown>)["x-internal"] === true), waiting: "an internal group" },
      saveStep("API overview"),
      done("Overview complete", "Documents who may call the API and how (HIPAA §164.312(d) authentication; OWASP API2)."),
    ],
  },
  {
    id: "T72", practice: "blank", seed: "api", steps: [
      openTab("API docs"),
      view("Edit", "Endpoints are listed on the left of the guided editor."),
      { title: "Add an endpoint", body: "Click Add endpoint. In the dialog enter GET as the method and /appointments/{appointmentId} as the path.", target: "btn:Add endpoint", check: (c) => ops(c.state).length > ops(c.start).length, waiting: "a new endpoint" },
      { title: "Method and path", body: "Check the path is /appointments/{appointmentId} (edit it in the Path box if needed). Parts in { } become path parameters automatically.", check: (c) => ops(c.state).some((o) => o.path.includes("{appointmentId}")), waiting: "the path /appointments/{appointmentId}" },
      { title: "Who may call it", body: "Under Authentication choose “Requires…” and tick bearerAuth.", check: (c) => ops(c.state).some((o) => o.path.includes("{appointmentId}") && Array.isArray(o.op.security) && (o.op.security as object[]).length > 0) || (spec(c.state)?.security?.length ?? 0) > 0, waiting: "authentication on the endpoint", optional: true },
      { title: "Responses", body: "Add a 404 response with a description.", check: (c) => ops(c.state).some((o) => o.path.includes("{appointmentId}") && Boolean((o.op.responses as Record<string, unknown> | undefined)?.["404"])), waiting: "a 404 response" },
      { title: "Examples build schemas", body: "Paste an example JSON body into a response and click Build schema from example.", shout: { tone: "warn", text: "Use fake data in examples — never real patient or customer data." }, optional: true },
      { title: "Internal endpoints", body: "Open DELETE /admin/users/{userId} and tick Internal only: it disappears from the public version and share links.", check: (c) => ops(c.state).some((o) => o.op["x-internal"] === true), waiting: "an internal endpoint" },
      saveStep("Endpoint docs"),
      done("Endpoint described", "Readable endpoint documentation with minimum-necessary examples (HIPAA §164.502(b); RA 10173)."),
    ],
  },
  {
    id: "T73", practice: "blank", seed: "api", steps: [
      openTab("API docs"),
      view("YAML / JSON", "This is the raw OpenAPI source. Switch between YAML and JSON at any time."),
      { title: "Edit the source", body: "Change the title on the line starting with “title:” (e.g. add “(draft)”).", check: (c) => spec(c.state)?.info.title !== spec(c.start)?.info.title, waiting: "a changed title" },
      { title: "Mistakes are safe", body: "If you type something invalid, an error appears but your last valid version is kept." },
      { title: "The checker", body: "Click the check badge. Click an item to jump to the endpoint in Edit.", target: "[title='Documentation check']", check: (c) => c.clicked("[title='Documentation check']"), waiting: "the checker" },
      saveStep("Edited source"),
      done("Source edited", "Valid documents work with gateways, scanners and code generators."),
    ],
  },
  {
    id: "T74", practice: "blank", seed: "api", steps: [
      openTab("API docs"),
      view("Reference", "The reference is what readers see: servers, authentication and endpoints by group."),
      { title: "Filter endpoints", body: "Type patient in Filter endpoints.", target: "field:Filter endpoints", check: (c) => /patient/i.test(c.value("field:Filter endpoints")), waiting: "a filter" },
      { title: "Code samples", body: "Each endpoint has samples in cURL, JavaScript and Python. Pick a language.", target: "field:Code sample language", check: (c) => c.clicked("field:Code sample language") || c.value("field:Code sample language") !== "curl", waiting: "a code sample language", optional: true },
      { title: "Try it", body: "Open Try it on an endpoint. Credentials typed there are used once and never saved.", target: "btn:Try it", check: (c) => c.clicked("btn:Try it"), waiting: "Try it", shout: { tone: "tip", text: "The sample API is fictional, so a real request will fail. Try it on your own API." } },
      done("Reference used", "Readers can explore and test the API from the docs."),
    ],
  },
  {
    id: "T75", practice: "blank", steps: [
      openTab("API docs"),
      { title: "Import a file", body: "Click Import a file and choose an OpenAPI 3.x or Swagger 2.0 file (YAML or JSON). Swagger 2.0 is converted to OpenAPI 3.1.", target: "btn:Import a file", check: (c) => Boolean(spec(c.state)), waiting: "imported API docs" },
      { title: "Conversion notes", body: "After converting, read the notes: they list what to double-check (e.g. file uploads and security definitions)." },
      { title: "Version", body: "The version selector shows OpenAPI 3.1 (widest tool support) or 3.2 (newer features).", target: "#oas-version" },
      saveStep("Imported docs"),
      done("Docs modernised", "Legacy Swagger docs now work with current tools and Slyshark's security checks."),
    ],
  },
  {
    id: "T76", practice: "blank", seed: "api", steps: [
      openTab("API docs"),
      view("Edit", "First mark the admin endpoint as internal."),
      { title: "Mark it Internal", body: "Open DELETE /admin/users/{userId} in the endpoint list and tick Internal only.", check: (c) => ops(c.state).some((o) => o.op["x-internal"] === true), waiting: "an internal endpoint" },
      { title: "Export the public version", body: "Export ▾ → Public version (.yaml). Internal endpoints and groups are removed.", target: "btn:Export", check: (c) => c.downloaded(/public/), waiting: "a public-version download" },
      { title: "Share links use it too", body: "Share links always show the public version of your API reference." },
      { title: "PDF report", body: "Export ▾ → PDF report for a printable reference.", target: "btn:Export", check: (c) => c.downloaded(/\.pdf$/), waiting: "a PDF", optional: true },
      saveStep("Public docs"),
      done("Published safely", "Partner docs without internal endpoints (ISO 27001 A.5.14 information transfer)."),
    ],
  },
  {
    id: "T77", practice: "blank", seed: "api", steps: [
      openTab("API docs"),
      view("Auth matrix", "Endpoints down the side, login methods across the top."),
      { title: "Review flags", body: "Amber flags mark endpoints that change data without required authentication — e.g. POST /appointments.", shout: { tone: "warn", text: "Every write endpoint should state who may call it." } },
      { title: "Fix one", body: "Click POST /appointments to open it in Edit. Under Authentication choose “Requires…” with bearerAuth.", check: (c) => ops(c.state).some((o) => o.path === "/appointments" && Array.isArray(o.op.security) && (o.op.security as object[]).length > 0), waiting: "authentication on POST /appointments" },
      view("Auth matrix", "Back to the matrix: the flag is gone."),
      { title: "Export", body: "Export the matrix as PDF or CSV.", target: "btn:Export PDF || btn:PDF", check: (c) => c.downloaded(/\.(pdf|csv)$/), waiting: "an export", optional: true },
      saveStep("Auth fixed"),
      done("Access control documented", "A one-page access-control view (HIPAA §164.312(a)(1); OWASP API2/API5; ISO 27001 A.8.3)."),
    ],
  },
  {
    id: "T78", practice: "blank", seed: "api", steps: [
      openTab("API docs"),
      view("Security check", "The API docs are checked against the OWASP API Security Top 10 (2023)."),
      { title: "Read the score", body: "Category tiles API1–API10 show where findings are. API6 and API10 can't be detected from docs alone." },
      { title: "Decide on a finding", body: "Open a finding and set its status (Fixed, Risk accepted, Not an issue) with a reason.", check: triaged, waiting: "a decision on a finding", shout: { tone: "tip", text: "Decisions with reasons are what auditors look for." } },
      saveStep("API findings triaged"),
      done("Findings triaged", "Documented risk decisions (HIPAA §164.308(a)(1)(ii)(B); ISO 27001 6.1.3; NIST CSF ID.RA-06)."),
    ],
  },
  {
    id: "T79", practice: "aws-3tier", steps: [
      { title: "Add a queue", body: "Event docs are drafted from Queue components. Add a Queue to the diagram and connect an app server to it.", target: "btn:Add Queue", check: (c) => nodes(c.state, "queue").length > 0, waiting: "a Queue on the canvas" },
      openTab("API docs"),
      { title: "Switch to Events", body: "Click Events (AsyncAPI).", target: "btn:Events (AsyncAPI)", check: pressed("Events"), waiting: "the Events view" },
      { title: "Draft from the diagram", body: "Click Draft from the diagram (or Start from an example).", target: "btn:Draft from the diagram || btn:Start from an example", check: (c) => Boolean(events(c)), waiting: "event docs" },
      { title: "Servers", body: "In Edit → Servers, choose a secure protocol (e.g. kafka-secure). Unencrypted protocols show a warning.", check: (c) => Object.values(events(c)?.servers ?? {}).some((s) => /secure|amqps|mqtts|wss|https/.test(s.protocol ?? "")), waiting: "a secure protocol", optional: true },
      { title: "Messages", body: "Add an example payload to a message and build its schema.", check: (c) => Object.values(events(c)?.components?.messages ?? {}).some((m) => Boolean(m.payload?.properties)), waiting: "a message payload schema", optional: true },
      saveStep("Event docs"),
      done("Events documented", "Asynchronous data paths are often missing from data-flow maps (PCI DSS 1.2.4; RA 10173 data inventory)."),
    ],
  },
];

export const TRACK_7: StepsDef[] = [
  {
    id: "T80", practice: "office-lan", seed: "api", steps: [
      openTab("Security report"),
      { title: "Sources", body: "The Include panel lists every source: API check, web audit, port scans, failed tests, the diagram and manual findings.", target: "btn:Include || [aria-label=Findings]" },
      { title: "Title, assessor, scope", body: "Fill Assessor and Scope (systems, URLs and dates covered; what was out of scope).", target: "field:Assessor", check: (c) => Boolean(report(c)?.assessor.trim() && report(c)?.scope.trim()), waiting: "assessor and scope" },
      { title: "Add a manual finding", body: "Click Add finding for something you observed yourself (e.g. a shared admin password).", target: "btn:Add finding", check: (c) => (c.state?.docs.security.manual.length ?? 0) > (c.start?.docs.security.manual.length ?? 0), waiting: "a manual finding" },
      { title: "Triage", body: "Set a status on two findings (Fixed, Risk accepted with a reason, Not an issue).", check: triaged, waiting: "a triaged finding" },
      { title: "Executive summary", body: "Click “Write a summary from the findings”, then edit it.", target: "btn:Write a summary", check: (c) => Boolean(report(c)?.summary.trim()), waiting: "a summary" },
      { title: "Export", body: "Export as PDF, Markdown or CSV.", target: "btn:Export PDF || btn:Markdown", check: (c) => c.downloaded(), waiting: "an export" },
      saveStep("Security report"),
      done("Report ready", "Scope, method, findings and decisions in one defensible document (HIPAA risk analysis; ISO 27001 8.2; NIST CSF ID.RA)."),
    ],
  },
  {
    id: "T81", practice: "attack-web", steps: [
      { title: "STRIDE in one minute", body: "Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege: six questions asked about every part of the diagram." },
      openTab("Security report"),
      { title: "Open the threat model", body: "Click Threat model.", target: "btn:Threat model", check: pressed("Threat model"), waiting: "the threat model" },
      { title: "Threats from your diagram", body: "Threats come from zones, internet-facing parts, unencrypted flows, attack paths and vulnerabilities.", shout: { tone: "tip", text: "Set zones on components: trust boundaries drive the model." } },
      { title: "Record a mitigation", body: "Set a threat to Mitigated and write how (e.g. “TLS enforced, ticket SEC-12”).", check: triaged, waiting: "a mitigated threat" },
      { title: "Export", body: "Export Markdown or PDF: the threat model is included.", target: "btn:Markdown || btn:Export PDF", check: (c) => c.downloaded(), waiting: "an export", optional: true },
      saveStep("Threat model"),
      done("Threats considered", "Shows threats were systematically considered and handled (NIST CSF ID.RA-03)."),
    ],
  },
  {
    id: "T82", practice: "office-lan", steps: [
      openTab("Layout docs"),
      { title: "Unzoned components", body: "If the document warns about unzoned components, open the designer and set a Zone on each component." },
      { title: "Document title", body: "Give the document a title.", target: "field:Document title", check: (c) => Boolean(c.state?.docs.layout.title.trim()), waiting: "a title" },
      { title: "Introductions", body: "Write a short introduction for Trust zones (e.g. which zone holds sensitive data).", target: "field:Trust zones introduction", check: (c) => Boolean(c.state?.docs.layout.intro.zones?.trim()), waiting: "a Trust zones introduction" },
      { title: "Data flows", body: "The Data flows table lists every link; unencrypted ones are highlighted.", target: "[aria-label='Data flows table']" },
      { title: "Export", body: "Export as PDF, Markdown or CSV.", target: "btn:Export PDF || btn:Markdown", check: (c) => c.downloaded(), waiting: "an export" },
      saveStep("Layout docs"),
      done("Architecture documented", "Asset inventory + network and data-flow documentation from one diagram (ISO 27001 A.5.9/A.8.20; PCI DSS 1.2.3/1.2.4)."),
    ],
  },
  {
    id: "T83", practice: "office-lan", steps: [
      { title: "Save first", body: "Share links show the last saved version.", target: "btn:Save project", check: (c) => !c.dirty, waiting: "a saved project" },
      { title: "Open Share", body: "Click Share.", target: "btn:Share", check: (c) => c.exists("#sh-label"), waiting: "the Share dialog" },
      { title: "Choose what to include", body: "Tick Include the security report if the reviewer needs it.", shout: { tone: "warn", text: "Reports list weaknesses: always use a password and a short expiry." } },
      { title: "Password and expiry", body: "Set a password (6+ characters) and a short expiry such as 7 days.", target: "#sh-pw", check: (c) => c.value("#sh-pw").length >= 6, waiting: "a password" },
      { title: "Create and test", body: "Create the link, copy it and open it in a private window to see exactly what the reviewer sees.", target: "btn:Create link", check: (c) => c.cmd("share.create"), waiting: "a share link" },
      { title: "Turn it off later", body: "When the review is over, turn the link off in the same dialog.", check: (c) => c.cmd("share.revoke"), waiting: "a link turned off", optional: true },
      done("Controlled disclosure", "Evidence of controlled disclosure to third parties (RA 10173 data sharing; ISO 27001 A.5.14)."),
    ],
  },
];
