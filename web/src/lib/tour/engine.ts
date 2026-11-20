"use client";
/**
 * Tutorial engine state (zustand). Holds the running tutorial and step, the user's progress
 * (saved to the account through `tutorial.progress`, cached in localStorage), and creates the
 * practice project a tutorial runs in.
 */
import { create } from "zustand";
import { command, query, type WorkspaceSummary } from "../cqrs";
import { emptyState, type ProjectState } from "../project";
import { TEMPLATES } from "../templates";
import type { Tutorial } from "./types";

// The tutorial registry is large: load it only when a tutorial actually starts.
const registry = () => import("../tutorials");

const ACTIVE_KEY = "slyshark.tour.active";
const PROGRESS_KEY = "slyshark.tour.progress";
export const PRACTICE_WORKSPACE = "Tutorial practice";

export type Progress = Record<string, { step: number; status: "started" | "completed"; at: string; projectId?: string }>;
type Active = { id: string; step: number; projectId?: string; startedAt: number };

type TourStore = {
  active: Active | null;
  progress: Progress;
  loaded: boolean;
  /** Set after the last step: shows the completion card. */
  finished: string | null;
  restore: () => void;
  loadProgress: () => Promise<void>;
  /** Starts (or resumes) a tutorial. Returns the page to open. */
  start: (id: string, opts?: { restart?: boolean; projectId?: string }) => Promise<string>;
  goto: (step: number) => void;
  exit: () => void;
  complete: (lastStep: number) => void;
  closeFinished: () => void;
  reset: (id: string | "all") => Promise<void>;
};

const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "null") ?? d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
const record = (tutorialId: string, step: number, completed = false) => command("tutorial.progress", { tutorialId, step, completed }).catch(() => null);

async function practiceProject(t: Tutorial): Promise<string> {
  const all = await query<WorkspaceSummary[]>("workspaces");
  let ws = all.find((w) => w.name === PRACTICE_WORKSPACE)?.id;
  if (!ws) ws = (await command("workspace.create", { name: PRACTICE_WORKSPACE, description: "Practice projects created by tutorials. Safe to delete.", color: "#a78bfa" })).id;
  const tpl = TEMPLATES.find((x) => x.id === t.practice) ?? TEMPLATES[0];
  let state: ProjectState = { ...emptyState(), canvas: { ...tpl.canvas(), meta: {} } };
  if (t.seed === "api") state = (await import("../tutorials/samples")).withSampleApi(state);
  const { id } = await command("project.create", { workspaceId: ws, name: `Practice · ${t.title}`.slice(0, 120), description: `Practice project for the tutorial “${t.title}”. Nothing here is shared.`, template: tpl.id === "blank" ? null : tpl.id, state, tags: ["tutorial"], stage: "learning" });
  return id;
}

export const useTour = create<TourStore>((set, get) => ({
  active: null,
  progress: {},
  loaded: false,
  finished: null,

  restore: () => set({ active: read<Active | null>(ACTIVE_KEY, null), progress: read<Progress>(PROGRESS_KEY, {}) }),

  loadProgress: async () => {
    try {
      const rows = await query<{ tutorial_id: string; step: number; status: "started" | "completed"; updated_at: string }[]>("tutorials");
      const progress: Progress = {};
      const local = read<Progress>(PROGRESS_KEY, {});
      for (const r of rows) progress[r.tutorial_id] = { step: r.step, status: r.status, at: r.updated_at, projectId: local[r.tutorial_id]?.projectId };
      write(PROGRESS_KEY, progress);
      set({ progress, loaded: true });
    } catch { set({ loaded: true }); }
  },

  start: async (id, opts = {}) => {
    const t = (await registry()).tutorialById(id);
    if (!t) throw new Error("Unknown tutorial");
    const prev = get().progress[id];
    const step = opts.restart || !prev || prev.status === "completed" ? 0 : Math.min(prev.step, t.steps.length - 1);
    const cur = get().active;
    let projectId = opts.projectId ?? (opts.restart ? undefined : cur?.id === id ? cur.projectId : prev?.projectId);
    // Reuse the practice project when resuming, unless it was deleted.
    if (projectId && t.practice && !(await query(`projects/${projectId}`).then(() => true, () => false))) projectId = undefined;
    if (t.practice && !projectId) projectId = await practiceProject(t);
    const active: Active = { id, step, projectId, startedAt: Date.now() };
    write(ACTIVE_KEY, active);
    const progress = { ...get().progress, [id]: { step, status: prev?.status === "completed" && !opts.restart ? "completed" as const : "started" as const, at: new Date().toISOString(), projectId } };
    write(PROGRESS_KEY, progress);
    set({ active, progress, finished: null });
    record(id, step);
    return projectId ? `/dashboard/projects/${projectId}` : t.startPath ?? "/dashboard";
  },

  goto: (step) => {
    const a = get().active;
    if (!a) return;
    const active = { ...a, step, startedAt: Date.now() };
    write(ACTIVE_KEY, active);
    const prev = get().progress[a.id];
    const progress = { ...get().progress, [a.id]: { step, status: prev?.status ?? "started" as const, at: new Date().toISOString(), projectId: a.projectId } };
    write(PROGRESS_KEY, progress);
    set({ active, progress });
    record(a.id, step);
  },

  exit: () => { write(ACTIVE_KEY, null); set({ active: null }); },

  complete: (lastStep) => {
    const a = get().active;
    if (!a) return;
    const progress = { ...get().progress, [a.id]: { step: lastStep, status: "completed" as const, at: new Date().toISOString(), projectId: a.projectId } };
    write(PROGRESS_KEY, progress);
    write(ACTIVE_KEY, null);
    set({ active: null, progress, finished: a.id });
    record(a.id, lastStep, true);
  },

  closeFinished: () => set({ finished: null }),

  reset: async (id) => {
    await command("tutorial.reset", { tutorialId: id });
    const progress = id === "all" ? {} : Object.fromEntries(Object.entries(get().progress).filter(([k]) => k !== id));
    write(PROGRESS_KEY, progress);
    set({ progress });
  },
}));
