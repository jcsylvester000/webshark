/** Saved layout-docs settings: kept tiny so the project store can load it without the layout builder. */
export const LAYOUT_SECTIONS = [
  { id: "overview", title: "Overview" }, { id: "zones", title: "Trust zones" }, { id: "inventory", title: "Inventory" },
  { id: "flows", title: "Data flows" }, { id: "apis", title: "APIs and events" }, { id: "security", title: "Security posture" },
] as const;
export type SectionId = (typeof LAYOUT_SECTIONS)[number]["id"];
export type LayoutSettings = { title: string; version: string; intro: Partial<Record<SectionId, string>>; include: Record<SectionId, boolean> };
export const emptyLayout = (): LayoutSettings => ({ title: "", version: "1.0", intro: {}, include: { overview: true, zones: true, inventory: true, flows: true, apis: true, security: true } });
export const normalizeLayout = (raw: Partial<LayoutSettings> | undefined): LayoutSettings => ({ ...emptyLayout(), ...raw, intro: { ...raw?.intro }, include: { ...emptyLayout().include, ...raw?.include } });
