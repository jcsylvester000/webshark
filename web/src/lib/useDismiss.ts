"use client";
/** Closes a popover/menu/dialog on Escape or on a click outside `ref` (keyboard and pointer friendly). */
import { useEffect, type RefObject } from "react";

export function useDismiss(open: boolean, close: () => void, ref?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    const onDown = (e: PointerEvent) => { if (ref?.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener("keydown", onKey);
    if (ref) document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open, close, ref]);
}
