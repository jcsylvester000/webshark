"use client";
/**
 * Display preferences. Saved to the account (command `profile.savePreferences`) and cached in
 * localStorage so the theme and text size apply before first paint (no flash).
 */
import { create } from "zustand";

export type Prefs = {
  theme: "dark" | "light" | "system"; textSize: "sm" | "md" | "lg"; clock: "12" | "24";
  relativeTimes: boolean; learningTips: boolean; reduceMotion: boolean;
  startPage: "/dashboard" | "/dashboard/workspaces" | "last-project"; onboardingDismissed: boolean;
};
export const DEFAULT_PREFS: Prefs = { theme: "dark", textSize: "md", clock: "12", relativeTimes: true, learningTips: true, reduceMotion: false, startPage: "/dashboard", onboardingDismissed: false };
import { PREFS_KEY } from "./prefs-boot";
export { PREFS_KEY };

export function applyPrefs(p: Prefs) {
  const html = document.documentElement;
  const light = p.theme === "light" || (p.theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
  html.classList.toggle("light", light);
  html.classList.toggle("text-sm-root", p.textSize === "sm");
  html.classList.toggle("text-lg-root", p.textSize === "lg");
  html.classList.toggle("reduce-motion", p.reduceMotion);
  html.style.colorScheme = light ? "light" : "dark";
}

export const usePrefs = create<{ prefs: Prefs; set: (p: Partial<Prefs>) => void }>((set, get) => ({
  prefs: DEFAULT_PREFS,
  set: (patch) => {
    const prefs = { ...get().prefs, ...patch };
    set({ prefs });
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
    applyPrefs(prefs);
  },
}));
