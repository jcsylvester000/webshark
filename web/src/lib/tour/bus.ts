"use client";
/**
 * Tutorial event bus: records what the user just did (clicks, keys, successful commands and tool
 * calls, downloads, chosen files) so tutorial steps can detect actions. Events are kept in memory
 * only (last 200) and never leave the browser.
 */
export type TourEvent =
  | { type: "click"; el: Element; at: number }
  | { type: "key"; combo: string; at: number }
  | { type: "cmd"; name: string; at: number }
  | { type: "tool"; name: string; at: number }
  | { type: "download"; name: string; at: number }
  | { type: "file"; name: string; at: number };

const events: TourEvent[] = [];
let installed = false;

type NewEvent = TourEvent extends infer E ? (E extends TourEvent ? Omit<E, "at"> : never) : never;
export function emit(e: NewEvent) {
  events.push({ ...e, at: Date.now() } as TourEvent);
  if (events.length > 200) events.splice(0, events.length - 200);
}
export const since = (t: number) => events.filter((e) => e.at >= t);

function combo(e: KeyboardEvent) {
  const parts = [e.ctrlKey || e.metaKey ? "Ctrl" : "", e.shiftKey ? "Shift" : "", e.altKey ? "Alt" : ""].filter(Boolean);
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [...parts, k].join("+");
}

/** Installs the global listeners once (called by the tutorial overlay). */
export function installBus() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  document.addEventListener("click", (e) => { if (e.target instanceof Element && !e.target.closest("[data-tour-ui]")) emit({ type: "click", el: e.target }); }, true);
  document.addEventListener("keydown", (e) => emit({ type: "key", combo: combo(e) }), true);
  document.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement | null;
    if (t?.type === "file" && t.files?.length) emit({ type: "file", name: t.files[0].name });
  }, true);
  // Exports create a temporary <a download> and click it; record those downloads.
  const proto = HTMLAnchorElement.prototype;
  const click = proto.click;
  proto.click = function (this: HTMLAnchorElement) { if (this.download) emit({ type: "download", name: this.download }); return click.call(this); };
  const dispatch = proto.dispatchEvent;
  proto.dispatchEvent = function (this: HTMLAnchorElement, ev: Event) { if (this.download && ev.type === "click") emit({ type: "download", name: this.download }); return dispatch.call(this, ev); };
}
