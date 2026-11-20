/**
 * Tutorial registry: catalogue metadata (from the approved workbook) + the follow-along steps
 * for each tutorial. Loaded on demand by the tutorial library and the guide overlay only.
 */
import type { Tutorial, TourStep } from "../tour/types";
import { CATALOGUE } from "./catalogue";
import { TRACK_0_1 } from "./track-0-1";
import { TRACK_2, TRACK_2_TEMPLATES, TRACK_3 } from "./track-2-3";
import { TRACK_4, TRACK_5 } from "./track-4-5";
import { TRACK_6, TRACK_7 } from "./track-6-7";
import { TRACK_8, TRACK_9 } from "./track-8-9";

export type StepsDef = { id: string; steps: TourStep[]; practice?: string; seed?: "api"; startPath?: string; title?: string; summary?: string };

/** Steps after an "open the X tab" step get a "Show me" that reopens that tab if the user wandered off. */
function withTabHelp(d: StepsDef): StepsDef {
  let tab: string | undefined = d.practice ? "Design" : undefined;
  const steps = d.steps.map((st) => {
    if (st.target?.startsWith("tab:")) { tab = st.target.slice(4); return st; }
    return st.go || !st.target || !tab ? st : { ...st, go: { tab } };
  });
  return { ...d, steps };
}

const DEFS: StepsDef[] = [...TRACK_0_1, ...TRACK_2, ...TRACK_2_TEMPLATES, ...TRACK_3, ...TRACK_4, ...TRACK_5, ...TRACK_6, ...TRACK_7, ...TRACK_8, ...TRACK_9].map(withTabHelp);
const byId = new Map(DEFS.map((d) => [d.id, d]));

/** Role filters shown in the library (matched against the compliance column and persona). */
export const ROLES: { id: string; label: string; test: RegExp }[] = [
  { id: "hipaa", label: "HIPAA / healthcare", test: /HIPAA|ePHI|clinic|health/i },
  { id: "ph", label: "PH Data Privacy Act", test: /RA 10173|NPC|Data Privacy Act/i },
  { id: "pci", label: "PCI DSS", test: /PCI/i },
  { id: "iso", label: "ISO 27001 / NIST", test: /ISO|NIST/i },
  { id: "api", label: "API teams", test: /API|OpenAPI|AsyncAPI|OWASP/i },
  { id: "beginner", label: "New to networking", test: /beginner|learner|student|everyone/i },
];

export const TUTORIALS: Tutorial[] = CATALOGUE.map((c) => {
  const d = byId.get(c.id);
  if (!d) throw new Error(`Tutorial ${c.id} has no steps`);
  const hay = `${c.compliance} ${c.persona} ${c.title} ${c.covers}`;
  return {
    ...c, title: d.title ?? c.title, summary: d.summary ?? c.summary, steps: d.steps, practice: d.practice, seed: d.seed, startPath: d.startPath,
    prereq: c.prereq.split(/[,;]\s*/).filter((p) => /^[TSC]\d\d$/.test(p)),
    roles: ROLES.filter((r) => r.test.test(hay)).map((r) => r.id),
  };
});

export const tutorialById = (id: string) => TUTORIALS.find((t) => t.id === id);

/** Next tutorial to suggest: first unfinished one in catalogue order, P1 first. */
export function recommendNext(done: Set<string>, after?: string): Tutorial | undefined {
  const order = [...TUTORIALS].sort((a, b) => a.priority.localeCompare(b.priority));
  const i = after ? TUTORIALS.findIndex((t) => t.id === after) : -1;
  return TUTORIALS.slice(i + 1).find((t) => !done.has(t.id) && t.priority === "P1") ?? order.find((t) => !done.has(t.id));
}
