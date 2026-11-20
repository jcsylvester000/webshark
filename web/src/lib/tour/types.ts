/**
 * Tutorial model. A tutorial is a list of steps; each step points at a control (target), shows
 * guide elements (help box, shout-out, spotlight, pointer) and waits until `check` says the
 * user did the action. Targets use a small selector language (see target.ts):
 *   "@id"          → [data-tour="id"]
 *   "btn:Text"     → visible button / link / menu item / tab whose text or aria-label starts with Text
 *   "tab:Text"     → workbench tab with that label
 *   "field:Text"   → input/select/textarea whose label or aria-label starts with Text
 *   "nav:Text"     → sidebar link with that label
 *   anything else  → CSS selector
 */
import type { Prefs } from "../prefs";
import type { ProjectMeta, ProjectState } from "../project";

export type Level = "Beginner" | "Intermediate" | "Advanced";
export type Tone = "tip" | "warn" | "win";

export type TourCtx = {
  path: string;
  /** Project open on the current page (undefined elsewhere). */
  state?: ProjectState;
  meta?: ProjectMeta;
  dirty: boolean;
  version: number;
  /** Project state when this step started (for "added one more" style checks). */
  start?: ProjectState;
  startVersion: number;
  startPrefs?: Prefs;
  /** Events since this step started. */
  clicked: (target: string) => boolean;
  cmd: (name: string) => boolean;
  tool: (name: string) => boolean;
  downloaded: (pattern?: RegExp) => boolean;
  fileChosen: () => boolean;
  key: (combo: string) => boolean;
  /** Live DOM helpers. */
  exists: (target: string) => boolean;
  value: (target: string) => string;
  checked: (target: string) => boolean;
  tab: () => string;
  text: (pattern: RegExp) => boolean;
  quizOk: boolean;
};

export type Quiz = { q: string; options: string[]; answer: number; why: string };

export type TourStep = {
  title: string;
  body: string;
  target?: string;
  /** Pointer label next to the target (e.g. "Click here"). Defaults to none (spotlight only). */
  point?: string;
  shout?: { tone: Tone; text: string };
  /** When omitted the step is read-only: Next is always available. */
  check?: (c: TourCtx) => boolean;
  /** Plain-language description of what is being detected ("Waiting for: …"). */
  waiting?: string;
  /** "Show me" helper: navigate to a path (":project" = current project) and/or open a workbench tab. */
  go?: { path?: string; tab?: string };
  hint?: string;
  quiz?: Quiz;
  /** Allows Next before the action is detected (e.g. steps that need a network or a local install). */
  optional?: boolean;
};

export type Tutorial = {
  id: string;
  track: string;
  title: string;
  level: Level;
  minutes: number;
  persona: string;
  summary: string;
  covers: string;
  output: string;
  docValue: string;
  compliance: string;
  priority: "P1" | "P2" | "P3";
  /** Template for a practice project created when the tutorial starts (needs a project page). */
  practice?: string;
  /** Extra sample data for the practice project ("api" = a fictional clinic API description). */
  seed?: "api";
  /** Page the tutorial starts on when it doesn't need a project. */
  startPath?: string;
  prereq?: string[];
  roles?: string[];
  steps: TourStep[];
};

export const TRACKS: { id: string; name: string; blurb: string }[] = [
  { id: "0", name: "Getting started", blurb: "Accounts, navigation, display settings and how tutorials work." },
  { id: "1", name: "Workspaces & projects", blurb: "Organise work, save safely, restore history and share read-only links." },
  { id: "2", name: "Environment designer", blurb: "Draw environments, describe components and links, and use every template." },
  { id: "3", name: "Component icons", blurb: "What every icon means, what to document and common mistakes." },
  { id: "4", name: "Testing tools", blurb: "Console, port scanner, web audit, API client, results and packet captures." },
  { id: "5", name: "Batch testing", blurb: "Repeatable test scenarios, expectations, generated tests and Arazzo." },
  { id: "6", name: "API documentation", blurb: "OpenAPI and AsyncAPI docs, the auth matrix and the OWASP API check." },
  { id: "7", name: "Security & architecture docs", blurb: "Security report, STRIDE threat model, layout docs and safe sharing." },
  { id: "8", name: "Scenario capstones", blurb: "End-to-end scenarios that produce real deliverables." },
  { id: "9", name: "Compliance evidence", blurb: "Turn Slyshark outputs into filed evidence for audits." },
];
