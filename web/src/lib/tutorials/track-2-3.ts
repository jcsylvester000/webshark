/** Steps for Track 2 (Environment designer) and Track 3 (Component icons). */
import { kindOf, NODE_KINDS } from "../nodes";
import { TEMPLATES } from "../templates";
import type { TourCtx, TourStep } from "../tour/types";
import type { StepsDef } from "./index";
import { added, addedEdge, done, edges, inspecting, linkSelected, newResult, nodes, permissionStep, saveStep } from "./helpers";

/** Some node now has a non-empty `field` that differs from when the step started. */
const changed = (field: string, kind?: string) => (c: TourCtx) => nodes(c.state, kind).some((n) => {
  const before = c.start?.canvas.nodes.find((x) => x.id === n.id)?.data[field];
  const v = n.data[field];
  return typeof v === "string" && v.trim() !== "" && v !== before;
});
const edgeChanged = (field: string) => (c: TourCtx) => edges(c.state).some((e) => {
  const before = c.start?.canvas.edges.find((x) => x.id === e.id)?.data?.[field];
  const v = e.data?.[field];
  return v !== undefined && v !== "" && v !== before;
});
const node = (id: string) => `.react-flow__node[data-id="${id}"]`;

export const TRACK_2: StepsDef[] = [
  {
    id: "T20", practice: "blank", steps: [
      { title: "The component palette", body: "Every component is listed by group on the left. Hover one to read what it is. Type in “Search components…” to filter.", target: "aside[aria-label='Component palette']" },
      { title: "Drag a Server onto the canvas", body: "Drag “Server” from the palette and drop it on the canvas (or click it).", target: "btn:Add Server", point: "Drag me", check: added("server"), waiting: "a Server on the canvas" },
      { title: "Click to add", body: "Click “Database” once: it is added in the middle of the canvas.", target: "btn:Add Database", point: "Click", check: added("database"), waiting: "a Database" },
      { title: "Keyboard works too", body: "Search for firewall in the palette search box, press Tab to reach “Firewall / SG”, then press Enter.", target: "field:Search components", check: added("firewall"), waiting: "a Firewall", hint: "You can also just click Firewall / SG." },
      { title: "Connect two components", body: "Hover the Server: small dots (handles) appear on its edges. Drag from a dot to the Database to draw a link.", target: "[data-canvas]", point: "Drag between handles", check: addedEdge, waiting: "a new link" },
      { title: "Move around", body: "Use the controls at the bottom-left: + and − zoom, the square fits everything in view. The minimap at the bottom-right shows the whole diagram.", target: ".react-flow__controls", point: "Fit view", check: (c) => c.clicked(".react-flow__controls-fitview") || c.clicked(".react-flow__controls"), waiting: "a click on the view controls" },
      { title: "Delete a mistake", body: "Click the Firewall on the canvas, then press Delete (or use “Delete node” in the inspector).", target: "[data-canvas]", check: (c) => nodes(c.state, "firewall").length < nodes(c.start, "firewall").length, waiting: "the Firewall to be removed" },
      saveStep("First diagram"),
      done("First diagram drawn", "A diagram is the network map most security and privacy frameworks expect (PCI DSS 1.2.3, NIST CSF ID.AM-03)."),
    ],
  },
  {
    id: "T21", practice: "forge-lemp", steps: [
      { title: "Select a component", body: "Click the server on the canvas. The inspector on the right shows its details.", target: "[data-canvas]", check: inspecting(), waiting: "a selected component" },
      { title: "Name", body: "Give it a clear name, e.g. “App server 1”.", target: "#f-Name", check: changed("label"), waiting: "a new name" },
      { title: "Host / IP", body: "Enter where it lives, e.g. 10.0.1.10 (a private address) or a DNS name.", target: "#f-HostIP", check: changed("host"), waiting: "a host or IP" },
      { title: "Zone", body: "Zones are trust boundaries: Internet, DMZ, App subnet, Data subnet… Enter one.", target: "#f-Zone", check: changed("zone"), waiting: "a zone" },
      { title: "Documented ports", body: "List the ports it SHOULD expose, e.g. 22,443. Tests can later prove they match reality.", target: "#f-Documentedports", check: changed("ports"), waiting: "documented ports" },
      { title: "Owner and runbook", body: "Who is responsible, and where are the instructions? Fill Owner (and optionally a runbook link).", target: "#f-Owner", check: changed("owner"), waiting: "an owner" },
      { title: "Notes", body: "Add purpose and risks. Never paste passwords or keys — write where they are kept instead.", target: "#f-Notes", shout: { tone: "warn", text: "Notes can be shared. Keep secrets out of them." } },
      saveStep("Documented app server"),
      done("Component documented", "This becomes a row in your asset inventory: what it is, where it is, who owns it, which ports it should expose (ISO 27001 A.5.9, NIST CSF ID.AM)."),
    ],
  },
  {
    id: "T22", practice: "aws-3tier", steps: [
      { title: "Select a link", body: "Click one of the lines between components. The inspector shows the connection.", target: "[data-canvas]", check: linkSelected, waiting: "a selected link" },
      { title: "Protocol and port", body: "Fill Protocol (e.g. TCP or postgres) and Port (e.g. 5432).", target: "#f-Protocol", check: (c) => edgeChanged("protocol")(c) || edgeChanged("port")(c), waiting: "a protocol or port" },
      { title: "Encrypted in transit", body: "Tick “Encrypted in transit” only if TLS (or similar) is really used on this link.", target: "field:Encrypted in transit", check: edgeChanged("encrypted"), waiting: "the encryption setting to change" },
      { title: "Add a threat actor", body: "Add a “Threat Actor” from the Security Scenarios group.", target: "btn:Add Threat Actor", point: "Add", check: added("attacker"), waiting: "a Threat Actor" },
      { title: "Draw an attack path", body: "Connect the threat actor to a component, select the new link and tick “Attack path (scenario)”. It turns red and animated.", target: "[data-canvas]", check: (c) => edges(c.state).filter((e) => e.data?.attack).length > edges(c.start).filter((e) => e.data?.attack).length, waiting: "an attack-path link" },
      { title: "Why this matters", body: "Links become the data-flow table in Layout docs. Unencrypted links that cross zones are flagged in the threat model.", shout: { tone: "tip", text: "Attack paths are documentation only; they never send traffic." } },
      saveStep("Documented data flows"),
      done("Data flows documented", "Supports data-flow diagrams (PCI DSS 1.2.4) and transmission security evidence (HIPAA §164.312(e)(1))."),
    ],
  },
  {
    id: "T23", practice: "blank", steps: [
      { title: "Add a Web Application", body: "Click “Web Application” in the palette.", target: "btn:Add Web Application", check: added("webapp"), waiting: "a Web Application" },
      { title: "Select it", body: "Click the new Web Application on the canvas.", target: "[data-canvas]", check: inspecting("Web Application"), waiting: "the Web Application in the inspector" },
      { title: "Paste a URL", body: "Type a site you own (or https://example.com to practise) into Application URL and click Apply. The node takes the site's name and icon.", target: "#app-url", point: "URL", check: changed("url", "webapp"), waiting: "an applied URL" },
      { ...permissionStep("canvas") },
      { title: "Select the app again", body: "Click the Web Application on the canvas again.", target: "[data-canvas]", check: inspecting(), waiting: "the app in the inspector" },
      { title: "Run an audit", body: "Click Audit. Slyshark checks HTTPS, security headers, cookies and exposed files. It never sends attacks.", target: "btn:Audit", point: "Audit", check: (c) => newResult("audit")(c) || nodes(c.state, "webapp").some((n) => n.data.audit && n.data.audit !== c.start?.canvas.nodes.find((x) => x.id === n.id)?.data.audit), waiting: "an audit result", optional: true },
      { title: "Read the result", body: "The node shows a status dot and the audit score. Full details are in Scanner & audit and Results." },
      saveStep("Added web app"),
      done("Diagram linked to evidence", "A dated audit result on the diagram ties documentation to real evidence (NIST CSF ID.RA-01)."),
    ],
  },
  {
    id: "T24", practice: "office-lan", steps: [
      { title: "Export as documentation", body: "Open Export ▾ and choose “Documentation (.md)”. It contains inventory and connection tables.", target: "btn:Export", point: "Export", check: (c) => c.downloaded(/\.md$/), waiting: "a Markdown download" },
      { title: "Export the diagram file", body: "Export ▾ → “Diagram file (.json)” saves the diagram so you can re-import it anywhere.", target: "btn:Export", check: (c) => c.downloaded(/\.json$/), waiting: "a .json download" },
      { title: "Import a diagram", body: "Click Import and choose the .json file you just downloaded. (In a real project, this replaces or merges the canvas.)", target: "btn:Import", check: (c) => c.fileChosen(), waiting: "a chosen file", optional: true },
      done("Exported", "Markdown drops straight into wikis, tickets or audit binders (ISO 27001 A.5.37 documented procedures)."),
    ],
  },
];

const TEMPLATE_TUTORIALS: [string, string, string][] = [
  ["T25", "vercel-next", "Traffic enters through Vercel's edge, runs in serverless functions and reaches a managed Postgres database."],
  ["T26", "netlify-jamstack", "A static site is served from Netlify's CDN; dynamic parts run as functions that call an external API."],
  ["T27", "aws-3tier", "Users reach a load balancer, which spreads traffic over app servers; data lives in a private database and cache."],
  ["T28", "forge-lemp", "One Forge-managed server runs Nginx and PHP, with MySQL, Redis and a queue worker beside it."],
  ["T29", "office-lan", "The ISP line enters through a router and firewall into a core switch that connects staff devices and the file server; remote staff use a VPN."],
  ["T30", "attack-web", "A threat actor tries SQL injection, XSS and exposed secrets against a typical web stack; a WAF stands in the way."],
  ["T31", "attack-ddos-mitm", "A volumetric DDoS hits the load balancer while a man-in-the-middle listens on public Wi-Fi."],
];

function templateSteps(tid: string, story: string): TourStep[] {
  const t = TEMPLATES.find((x) => x.id === tid)!;
  const c = t.canvas();
  const ids = c.nodes.map((n) => n.id);
  const explain: TourStep[] = c.nodes.slice(0, 8).map((n) => {
    const k = kindOf(n.data.kind);
    return { title: `${n.data.label}`, body: `${k.label}: ${k.desc ?? ""}${k.ports ? ` Typical ports: ${k.ports}.` : ""}`, target: node(n.id) };
  });
  const security = tid.startsWith("attack");
  return [
    { title: "Apply the template", body: `Open Templates ▾ and choose “${t.name}”.`, target: "btn:Templates", point: "Templates", check: (x) => ids.every((id) => x.state?.canvas.nodes.some((n) => n.id === id)), waiting: "the template on the canvas" },
    { title: "The big picture", body: story, target: "[data-canvas]" },
    ...explain,
    { title: "Make it yours", body: "Click a component and rename it to match your environment.", target: "[data-canvas]", check: (x) => nodes(x.state).some((n) => n.data.label !== c.nodes.find((o) => o.id === n.id)?.data.label && c.nodes.some((o) => o.id === n.id)), waiting: "a renamed component" },
    { title: "Set zones", body: "Give components a Zone (e.g. Internet, DMZ, App, Data). Zones become trust boundaries in the threat model and layout docs.", target: "#f-Zone || [data-canvas]", check: (x) => nodes(x.state).some((n) => (n.data.zone ?? "") !== "" && c.nodes.some((o) => o.id === n.id)), waiting: "at least one zone" },
    { title: security ? "Read the attack paths" : "Check encryption on each link", body: security ? "Red animated links are attack paths. Click one to see its label; they feed the STRIDE threat model." : "Click each link and make sure “Encrypted in transit” matches reality.", target: "[data-canvas]", shout: { tone: security ? "warn" : "tip", text: security ? "Scenario icons are documentation only; nothing is attacked." : "Unencrypted hops between zones are the most common finding in reviews." } },
    saveStep("Adapted from template"),
    done("Template understood", security ? "Threat scenarios like this support the risk analysis HIPAA requires (§164.308(a)(1)(ii)(A)) and NIST CSF ID.RA-03." : "A ready, explainable architecture diagram supports PCI DSS 1.2.3/1.2.4 and NIST CSF ID.AM-03."),
  ];
}

export const TRACK_2_TEMPLATES: StepsDef[] = [
  ...TEMPLATE_TUTORIALS.map(([id, tid, story]) => ({ id, practice: "blank", steps: templateSteps(tid, story) })),
  {
    id: "T32", practice: "blank", steps: [
      { title: "Work from the outside in", body: "Start where traffic enters: add Internet, then DNS and your edge (Firewall / SG, CDN or Load Balancer).", target: "btn:Add Internet", check: added("internet"), waiting: "Internet on the canvas" },
      { title: "Add your edge", body: "Add a Firewall / SG (or WAF / Load Balancer) between the Internet and your services.", target: "btn:Add Firewall", check: (c) => ["firewall", "waf", "loadbalancer", "cdn"].some((k) => added(k)(c)), waiting: "an edge control" },
      { title: "Add what runs your service", body: "Add a Server, Container or Serverless Fn.", target: "aside[aria-label='Component palette']", check: (c) => ["server", "vm", "container", "kubernetes", "serverless"].some((k) => added(k)(c)), waiting: "a compute component" },
      { title: "Add where data lives", body: "Add a Database, Cache, Queue or Object Storage.", target: "aside[aria-label='Component palette']", check: (c) => ["database", "cache", "queue", "storage"].some((k) => added(k)(c)), waiting: "a data component" },
      { title: "Connect the flow", body: "Link each hop in order: Internet → edge → compute → data.", target: "[data-canvas]", check: (c) => edges(c.state).length >= 3, waiting: "at least three links" },
      { title: "Zones and owners", body: "Select each component and set Zone and Owner.", target: "[data-canvas]", check: (c) => nodes(c.state).filter((n) => n.data.zone).length >= 2, waiting: "zones on two or more components" },
      { title: "Add a note", body: "Add a Note component for anything a reader should know (scope, assumptions).", target: "btn:Add Note", check: added("note"), waiting: "a Note", optional: true },
      saveStep("Modelled my environment"),
      done("Your own environment", "You now have a real network map to document, test and share."),
    ],
  },
];

const GROUP_TUTORIALS: [string, string[], string, { q: string; options: string[]; answer: number; why: string }][] = [
  ["T40", ["Clients"], "Endpoints are where phishing lands: document patching, encryption and who uses them.", { q: "What should you document for a staff laptop?", options: ["Only its colour", "Owner, OS, zone and whether the disk is encrypted", "Nothing, laptops aren't in scope"], answer: 1, why: "Endpoints often hold sensitive data, so owner, OS, zone and encryption matter." }],
  ["T41", ["Network"], "Internet is always untrusted. DNS (port 53) turns names into addresses; routers join networks and switches connect local devices.", { q: "Which port does DNS normally use?", options: ["53", "443", "3389"], answer: 0, why: "DNS uses port 53 (UDP and TCP)." }],
  ["T42", ["Network"], "Firewalls allow or deny by address and port, a WAF inspects web requests, load balancers spread traffic, CDNs cache and absorb attacks, and VPNs bring remote users in securely.", { q: "Which control inspects the content of web requests?", options: ["Switch", "WAF", "DNS"], answer: 1, why: "A Web Application Firewall looks inside HTTP requests (e.g. for SQL injection)." }],
  ["T43", ["Compute"], "Document OS/runtime, exposed ports (22 SSH, 443 HTTPS, 6443 Kubernetes API) and who patches it.", { q: "Should SSH (22) be open to the whole internet?", options: ["Yes, always", "No — restrict it to a VPN or known addresses", "Only on weekends"], answer: 1, why: "Exposed SSH is a constant brute-force target; restrict it." }],
  ["T44", ["Data"], "Data stores belong in private zones. Document encryption at rest and which apps may connect (5432 Postgres, 3306 MySQL, 6379 Redis, 5672 AMQP).", { q: "Where should a production database sit?", options: ["Internet zone", "A private zone reachable only by the apps that need it", "On a staff laptop"], answer: 1, why: "Databases should never accept connections from the internet." }],
  ["T45", ["Applications"], "Web Applications become testable when you paste a URL; API Services link to your API docs and security checks.", { q: "What happens when you apply a URL to a Web Application?", options: ["Nothing", "The node becomes that site (name and icon) and can be audited", "The site is attacked"], answer: 1, why: "Applying a URL turns the node into that application, ready for safe tests." }],
  ["T46", ["Platforms"], "Managed platforms host your apps. Document what the platform manages (shared responsibility) and what you still own: headers, secrets, access.", { q: "On a managed platform, who configures your app's security headers?", options: ["Always the platform", "Usually you", "Nobody"], answer: 1, why: "Platforms secure their infrastructure; your app's configuration is still yours." }],
  ["T47", ["Security Scenarios", "Docs"], "Threat Actor marks where attacks come from; Vulnerability records a known weakness (put the severity in notes); Note adds context anywhere. They are documentation only.", { q: "Does adding a Threat Actor attack anything?", options: ["Yes", "No — it only documents a scenario", "Only on local mode"], answer: 1, why: "Scenario icons never send traffic; they drive the threat model." }],
];

function groupSteps(groups: string[], tip: string, quiz: TourStep["quiz"], tid: string): TourStep[] {
  let kinds = NODE_KINDS.filter((k) => groups.includes(k.group));
  if (tid === "T41") kinds = kinds.filter((k) => ["internet", "router", "switch", "dns"].includes(k.kind));
  if (tid === "T42") kinds = kinds.filter((k) => !["internet", "router", "switch", "dns"].includes(k.kind));
  const list = kinds.map((k) => k.kind);
  return [
    { title: `The ${groups.join(" & ")} group`, body: `${tip}`, target: "aside[aria-label='Component palette']" },
    ...kinds.map((k): TourStep => ({ title: k.label, body: `${k.desc ?? ""}${k.ports ? ` Typical ports: ${k.ports}.` : ""}${k.hint ? ` Tip: ${k.hint}.` : ""} Click it to add one.`, target: `btn:Add ${k.label}`, point: "Add", check: added(k.kind), waiting: `a ${k.label}` })),
    { title: "Connect them realistically", body: "Draw links between the new components the way they'd really talk to each other.", target: "[data-canvas]", check: (c) => edges(c.state).length >= Math.min(2, list.length - 1), waiting: "links between the components" },
    { title: "Document one", body: "Select one of them and fill Zone (and Documented ports where it applies).", target: "[data-canvas]", check: (c) => nodes(c.state).some((n) => list.includes(n.data.kind) && (n.data.zone || n.data.notes)), waiting: "a zone or notes on one of them" },
    { title: "Quick check", body: "One question to lock it in.", quiz },
    done("Icons learned", "Knowing what each icon means keeps your diagrams readable by auditors and teammates (NIST CSF ID.AM, ISO 27001 A.5.9)."),
  ];
}

export const TRACK_3: StepsDef[] = GROUP_TUTORIALS.map(([id, groups, tip, quiz]) => ({ id, practice: "blank", steps: groupSteps(groups, tip, quiz, id) }));

