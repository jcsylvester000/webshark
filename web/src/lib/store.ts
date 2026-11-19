"use client";
/**
 * Client-side project store (zustand). This is the in-memory WORKING state of CQRS:
 * edits only change memory and mark the project dirty; nothing touches the database until
 * `save()` sends the `project.save` command. Only projects the user opens are loaded
 * (`open()` runs the `GET /api/queries/projects/{id}` query); closing a tab unloads it.
 * The scratch project (id "scratch") backs the standalone tools and is never saved.
 */
import { create } from "zustand";
import { api } from "./api";
import { emptyState, MAX_RESULTS, normalizeState, type ProjectMeta, type ProjectState, type ResultEntry } from "./project";

export const SCRATCH = "scratch";
const TABS_KEY = "slyshark.openProjects";
export const LAST_KEY = "slyshark.lastProject";
export function lastProject(): { id: string; name: string; at: string } | null {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? "null"); } catch { return null; }
}

type Loaded = { meta: ProjectMeta; state: ProjectState; version: number; savedAt: string | null; dirty: boolean; saving: boolean };
type Tab = { id: string; name: string };
type ProjectRow = { id: string; workspace_id: string; workspace_name: string; name: string; description: string; template: string | null; status: string; state: unknown; state_version: number; saved_at: string; tags: string[]; stage: string; pinned: boolean };

type Store = {
  loaded: Record<string, Loaded>;
  tabs: Tab[];
  errors: Record<string, string | undefined>;
  restoreTabs: () => void;
  open: (id: string) => Promise<void>;
  reload: (id: string) => Promise<void>;
  close: (id: string) => void;
  update: (id: string, recipe: (s: ProjectState) => ProjectState) => void;
  setMeta: (id: string, patch: Partial<Pick<ProjectMeta, "name" | "description">>) => void;
  addResult: (id: string, r: Omit<ResultEntry, "id" | "at">) => void;
  save: (id: string, opts?: { force?: boolean; note?: string }) => Promise<void>;
  /** Applies details already persisted by `project.updateDetails` (does not mark the project unsaved). */
  applyDetails: (id: string, d: Partial<ProjectMeta>) => void;
};

// Project requests already on the way (see prefetchProject): open() reuses them instead of asking twice.
const inflight = new Map<string, Promise<ProjectRow>>();
/** Starts loading a project before React has finished starting up (called when the page module loads). */
export function prefetchProject(id: string) {
  if (!inflight.has(id)) inflight.set(id, api<ProjectRow>(`/queries/projects/${id}`));
}

const persistTabs = (tabs: Tab[]) => { try { localStorage.setItem(TABS_KEY, JSON.stringify(tabs)); } catch { /* storage unavailable */ } };
const scratch = (): Loaded => ({ meta: { id: SCRATCH, workspaceId: null, workspaceName: "", name: "Scratch", description: "", template: null, status: "active", tags: [], stage: "none", pinned: false }, state: emptyState(), version: 0, savedAt: null, dirty: false, saving: false });

export const useProjects = create<Store>((set, get) => ({
  loaded: { [SCRATCH]: scratch() },
  tabs: [],
  errors: {},

  restoreTabs: () => {
    try { set({ tabs: JSON.parse(localStorage.getItem(TABS_KEY) ?? "[]") as Tab[] }); } catch { /* ignore */ }
  },

  open: async (id) => {
    if (get().loaded[id]) return;
    const pending = inflight.get(id) ?? api<ProjectRow>(`/queries/projects/${id}`);
    inflight.delete(id);
    const row = await pending.catch((e: Error) => { set((s) => ({ errors: { ...s.errors, [id]: e.message } })); return null; });
    if (!row) return;
    const entry: Loaded = {
      meta: { id: row.id, workspaceId: row.workspace_id, workspaceName: row.workspace_name, name: row.name, description: row.description, template: row.template, status: row.status, tags: row.tags ?? [], stage: row.stage ?? "none", pinned: !!row.pinned },
      state: normalizeState(row.state), version: row.state_version, savedAt: row.saved_at, dirty: false, saving: false,
    };
    set((s) => {
      const tabs = s.tabs.some((t) => t.id === id) ? s.tabs.map((t) => (t.id === id ? { id, name: row.name } : t)) : [...s.tabs, { id, name: row.name }];
      persistTabs(tabs);
      try { localStorage.setItem(LAST_KEY, JSON.stringify({ id, name: row.name, at: new Date().toISOString() })); } catch { /* ignore */ }
      return { loaded: { ...s.loaded, [id]: entry }, tabs, errors: { ...s.errors, [id]: undefined } };
    });
  },

  reload: async (id) => {
    set((s) => { const l = { ...s.loaded }; delete l[id]; return { loaded: l }; });
    await get().open(id);
  },

  close: (id) => set((s) => {
    const l = { ...s.loaded };
    delete l[id];
    const tabs = s.tabs.filter((t) => t.id !== id);
    persistTabs(tabs);
    return { loaded: l, tabs };
  }),

  update: (id, recipe) => set((s) => {
    const cur = s.loaded[id];
    if (!cur) return s;
    const next = recipe(cur.state);
    if (next === cur.state) return s;
    return { loaded: { ...s.loaded, [id]: { ...cur, state: next, dirty: id !== SCRATCH || cur.dirty } } };
  }),

  setMeta: (id, patch) => set((s) => {
    const cur = s.loaded[id];
    if (!cur) return s;
    const tabs = patch.name ? s.tabs.map((t) => (t.id === id ? { ...t, name: patch.name! } : t)) : s.tabs;
    if (patch.name) persistTabs(tabs);
    return { loaded: { ...s.loaded, [id]: { ...cur, meta: { ...cur.meta, ...patch }, dirty: id !== SCRATCH } }, tabs };
  }),

  applyDetails: (id, d) => set((s) => {
    const cur = s.loaded[id];
    if (!cur) return s;
    return { loaded: { ...s.loaded, [id]: { ...cur, meta: { ...cur.meta, ...d } } }, tabs: d.name ? s.tabs.map((t) => (t.id === id ? { ...t, name: d.name! } : t)) : s.tabs };
  }),

  addResult: (id, r) => get().update(id, (st) => ({ ...st, results: [{ ...r, id: Math.random().toString(36).slice(2, 10), at: new Date().toISOString() }, ...st.results].slice(0, MAX_RESULTS) })),

  save: async (id, opts = {}) => {
    const cur = get().loaded[id];
    if (!cur || id === SCRATCH) return;
    set((s) => ({ loaded: { ...s.loaded, [id]: { ...s.loaded[id], saving: true } } }));
    try {
      const r = await api<{ version: number; savedAt: string }>("/commands/project.save", {
        method: "POST", json: { id, state: cur.state, expectedVersion: cur.version, force: opts.force ?? false, name: cur.meta.name, description: cur.meta.description, note: opts.note ?? "" },
      });
      set((s) => {
        const latest = s.loaded[id];
        // Edits made while the save was in flight stay dirty.
        const changed = latest.state !== cur.state || latest.meta !== cur.meta;
        return { loaded: { ...s.loaded, [id]: { ...latest, version: r.version, savedAt: r.savedAt, dirty: changed, saving: false } } };
      });
    } catch (e) {
      set((s) => ({ loaded: { ...s.loaded, [id]: { ...s.loaded[id], saving: false } } }));
      throw e;
    }
  },
}));

export const useProject = (id: string) => useProjects((s) => s.loaded[id]);
export const anyDirty = () => Object.values(useProjects.getState().loaded).some((p) => p.dirty);
