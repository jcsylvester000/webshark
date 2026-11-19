"use client";
/** Confirms account deletion on the landing page (?deleted=1). */
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
export function DeletedNotice() {
  const deleted = useSyncExternalStore(subscribe, () => new URLSearchParams(window.location.search).has("deleted"), () => false);
  if (!deleted) return null;
  return <p role="status" className="mt-2 rounded-md border border-line bg-panel px-4 py-3 text-sm text-muted">Your account and all of its data have been deleted. Thanks for trying Slyshark.</p>;
}
