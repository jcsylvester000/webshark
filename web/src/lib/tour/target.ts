/** Resolves tutorial targets ("@id", "btn:Text", "tab:Text", "field:Text", "nav:Text" or CSS) to visible elements. */

const CLICKABLE = "button, a, [role=menuitem], [role=tab], [role=radio], [role=option], summary, label";

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const st = getComputedStyle(el);
  return st.visibility !== "hidden" && st.display !== "none";
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const textOf = (el: Element) => norm(el.getAttribute("aria-label")) || norm(el.textContent);
const starts = (el: Element, t: string) => {
  const want = norm(t);
  return norm(el.getAttribute("aria-label")).startsWith(want) || norm(el.textContent).startsWith(want) || norm(el.getAttribute("title")).startsWith(want);
};

function labelText(el: Element): string {
  const id = el.getAttribute("id");
  if (id) { const l = document.querySelector(`label[for="${CSS.escape(id)}"]`); if (l) return norm(l.textContent); }
  const wrap = el.closest("label");
  if (wrap) return norm(wrap.textContent);
  return norm(el.getAttribute("aria-label")) || norm(el.getAttribute("placeholder"));
}

function candidates(spec: string): Element[] {
  const i = spec.indexOf(":");
  const kind = i > 0 ? spec.slice(0, i) : "";
  const arg = i > 0 ? spec.slice(i + 1) : "";
  if (spec.startsWith("@")) return [...document.querySelectorAll(`[data-tour="${CSS.escape(spec.slice(1))}"]`)];
  switch (kind) {
    case "btn": return [...document.querySelectorAll(CLICKABLE)].filter((e) => !e.closest("[data-tour-ui]") && starts(e, arg));
    case "tab": return [...document.querySelectorAll("[role=tab]")].filter((e) => starts(e, arg));
    case "nav": return [...document.querySelectorAll("aside nav a")].filter((e) => norm(e.getAttribute("title")) === norm(arg) || textOf(e) === norm(arg));
    case "field": return [...document.querySelectorAll("input, select, textarea")].filter((e) => !e.closest("[data-tour-ui]") && labelText(e).startsWith(norm(arg)));
    default:
      try { return [...document.querySelectorAll(spec)]; } catch { return []; }
  }
}

/** First visible element for a target, or null. */
export function resolve(spec?: string): HTMLElement | null {
  if (!spec || typeof document === "undefined") return null;
  for (const s of spec.split("||").map((x) => x.trim())) {
    const el = candidates(s).find(visible);
    if (el) return el as HTMLElement;
  }
  return null;
}

/** Does `el` (e.g. the element that was clicked) belong to the target? Works after the target left the DOM. */
export function matches(el: Element | null, spec: string): boolean {
  if (!el) return false;
  return spec.split("||").map((x) => x.trim()).some((s) => {
    if (s.startsWith("@")) return Boolean(el.closest(`[data-tour="${CSS.escape(s.slice(1))}"]`));
    const i = s.indexOf(":");
    const kind = i > 0 ? s.slice(0, i) : "";
    const arg = i > 0 ? s.slice(i + 1) : "";
    if (kind === "btn") { const c = el.closest(CLICKABLE); return Boolean(c && starts(c, arg)); }
    if (kind === "tab") { const c = el.closest("[role=tab]"); return Boolean(c && starts(c, arg)); }
    if (kind === "nav") { const c = el.closest("a"); return Boolean(c && (norm(c.getAttribute("title")) === norm(arg) || textOf(c) === norm(arg))); }
    if (kind === "field") { const c = el.closest("input, select, textarea"); return Boolean(c && labelText(c).startsWith(norm(arg))); }
    try { return Boolean(el.closest(s)); } catch { return false; }
  });
}

export function valueOf(spec: string): string {
  const el = resolve(spec) as HTMLInputElement | null;
  return el && "value" in el ? String(el.value ?? "") : "";
}
export function checkedOf(spec: string): boolean {
  const el = resolve(spec) as HTMLInputElement | null;
  return Boolean(el?.checked);
}
export function selectedTab(): string {
  return norm(document.querySelector("[role=tab][aria-selected=true]")?.textContent).replace(/\s*\(\d+\)$/, "");
}
