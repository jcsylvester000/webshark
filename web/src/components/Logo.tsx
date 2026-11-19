/** Slyshark mark: a shark fin cutting a network wave. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0c131b" stroke="#1c2a38" />
      <path d="M8 21 C12 20 15 13 21 7 C20 12 20.5 17 24 21 Z" fill="#2ee6c5" />
      <path d="M4 23 Q8 20 12 23 T20 23 T28 23" fill="none" stroke="#2ee6c5" strokeOpacity=".55" strokeWidth="1.6" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <Logo /> <span>Sly<span className="text-fin">shark</span></span>
    </span>
  );
}
