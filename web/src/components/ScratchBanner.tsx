"use client";
/** Shown on standalone tools: explains scratch mode and offers "Save as project". */
import { useState } from "react";
import { SCRATCH, useProjects } from "@/lib/store";
import { NewProjectDialog } from "./NewProjectDialog";

export function ScratchBanner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/5 px-6 py-2 text-sm">
      <span className="text-amber-200/90">Scratch mode: nothing here is stored. Open a project, or save this work as one.</span>
      <button className="btn text-xs" onClick={() => setOpen(true)}>Save as project…</button>
      {open && <NewProjectDialog title="Save scratch work as a project" initialState={useProjects.getState().loaded[SCRATCH].state} onClose={() => setOpen(false)} />}
    </div>
  );
}
