/** Building blocks for tutorial steps: common checks and reusable steps. */
import type { ProjectState } from "../project";
import type { TourCtx, TourStep } from "../tour/types";

type S = ProjectState | undefined;
export const nodes = (s: S, kind?: string) => (s?.canvas.nodes ?? []).filter((n) => !kind || n.data.kind === kind);
export const edges = (s: S) => s?.canvas.edges ?? [];
export const results = (s: S, tool?: string) => (s?.results ?? []).filter((r) => !tool || r.tool === tool);
export const history = (s: S) => s?.console.history ?? [];
export const spec = (s: S) => s?.docs.api.spec ?? null;
export const ops = (s: S) => {
  const sp = spec(s);
  if (!sp?.paths) return [] as { path: string; method: string; op: Record<string, unknown> }[];
  return Object.entries(sp.paths).flatMap(([path, item]) => Object.entries(item ?? {}).filter(([m]) => /^(get|put|post|delete|patch|options|head|trace|query)$/.test(m)).map(([method, op]) => ({ path, method, op: op as Record<string, unknown> })));
};

/** One more node (of a kind) than when the step started. */
export const added = (kind?: string) => (c: TourCtx) => nodes(c.state, kind).length > nodes(c.start, kind).length;
export const addedEdge = (c: TourCtx) => edges(c.state).length > edges(c.start).length;
export const newResult = (tool?: string) => (c: TourCtx) => results(c.state, tool).length > results(c.start, tool).length || (tool ? c.tool(tool) : false);
export const ranConsole = (re: RegExp) => (c: TourCtx) => history(c.state).slice(history(c.start).length).some((h) => re.test(h));
export const saved = (c: TourCtx) => c.version > c.startVersion;
export const onTab = (label: string) => (c: TourCtx) => c.tab() === label.toLowerCase();
export const at = (re: RegExp) => (c: TourCtx) => re.test(c.path);
/** The inspector shows a component of this type (or any component when omitted). */
export const inspecting = (label?: string) => () => {
  const h = document.querySelector("aside[aria-label=Inspector] h2")?.textContent?.trim();
  return Boolean(h) && (label ? h === label : Boolean(document.querySelector("aside[aria-label=Inspector] #f-Name")));
};
export const linkSelected = () => document.querySelector("aside[aria-label=Inspector] h2")?.textContent?.trim() === "Connection";
export const pressed = (label: string) => () => [...document.querySelectorAll("[aria-pressed=true]")].some((b) => b.textContent?.trim().toLowerCase().startsWith(label.toLowerCase()));
export const any = (...fs: ((c: TourCtx) => boolean)[]) => (c: TourCtx) => fs.some((f) => f(c));
export const all = (...fs: ((c: TourCtx) => boolean)[]) => (c: TourCtx) => fs.every((f) => f(c));

const TAB_INTRO: Record<string, string> = {
  Design: "the diagram of your environment",
  Console: "a terminal for network commands",
  "API client": "a Postman-style request builder",
  "API docs": "OpenAPI and AsyncAPI documentation",
  "Scanner & audit": "the port scanner and web audit",
  "Batch tests": "repeatable test scenarios",
  "Security report": "the assessment report and threat model",
  "Layout docs": "architecture documentation built from the diagram",
  Results: "everything you tested in this project",
  Notes: "free-text notes saved with the project",
};

/** Opens a workbench tab. */
export const openTab = (label: string, extra = ""): TourStep => ({
  title: `Open the ${label} tab`,
  body: `The ${label} tab holds ${TAB_INTRO[label] ?? label}.${extra ? ` ${extra}` : ""}`,
  target: `tab:${label}`, point: "Click this tab",
  check: onTab(label), waiting: `the ${label} tab to open`,
});

/** Saves the project (optionally reminding about notes). */
export const saveStep = (note?: string): TourStep => ({
  title: "Save your work",
  body: note ? `Click Save project, or use the ▾ menu and choose “Save with a note…”. A note such as “${note}” helps you find this version in History.` : "Slyshark only stores the project when you click Save project (or press Ctrl+S).",
  target: "btn:Save project", point: "Save",
  shout: { tone: "tip", text: "Nothing is stored until you save, so you can experiment freely." },
  check: saved, waiting: "the project to be saved",
});

export const permissionStep = (where: "canvas" | "batch" | "scanner"): TourStep => where === "canvas" ? {
  title: "Confirm you may test",
  body: "Click an empty spot on the canvas so the inspector shows the environment, then tick “I own the hosts in this environment or have written permission to test them”.",
  target: "aside[aria-label=Inspector] input[type=checkbox]",
  shout: { tone: "warn", text: "Only scan or audit systems you own or have written permission to test. Unauthorised scanning can be illegal (in the Philippines, RA 10175)." },
  check: (c) => Boolean(c.state?.canvas.meta?.authorized), waiting: "the permission box to be ticked",
} : {
  title: "Confirm you may test",
  body: where === "batch" ? "Tick “I own these targets or have permission to scan/audit them”." : "Tick the permission box next to the target before scanning or auditing.",
  target: where === "batch" ? "field:I own these targets" : "field:I own",
  shout: { tone: "warn", text: "Only test systems you own or have written permission to test. Safe practice targets: example.com (audit), scanme.nmap.org (scans)." },
  check: (c) => c.checked(where === "batch" ? "field:I own these targets" : "field:I own"), waiting: "the permission box to be ticked",
};

export const done = (title: string, body: string): TourStep => ({ title, body, shout: { tone: "win", text: "Well done! This tutorial is complete." } });
