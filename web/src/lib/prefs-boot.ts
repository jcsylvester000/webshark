/** Server-safe constants for the preference boot script (no client-only imports). */
export const PREFS_KEY = "slyshark.prefs";

/** Inline script for <head>: applies the cached theme/text size before React hydrates (no flash). */
export const PREFS_BOOT_SCRIPT = `try{var p=JSON.parse(localStorage.getItem("${PREFS_KEY}")||"{}");var h=document.documentElement;var l=p.theme==="light"||(p.theme==="system"&&matchMedia("(prefers-color-scheme: light)").matches);if(l){h.classList.add("light");h.style.colorScheme="light"}if(p.textSize==="sm")h.classList.add("text-sm-root");if(p.textSize==="lg")h.classList.add("text-lg-root");if(p.reduceMotion)h.classList.add("reduce-motion")}catch(e){}`;
