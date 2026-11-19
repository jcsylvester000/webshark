/** Stage badge and tag chips shared by project cards, the workbench header and shared views. */
import { stageOf } from "@/lib/cqrs";

export function StageBadge({ stage }: { stage: string }) {
  if (!stage || stage === "none") return null;
  const s = stageOf(stage);
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${s.cls}`}>{s.label}</span>;
}

export function Tags({ tags, onClick }: { tags: string[]; onClick?: (t: string) => void }) {
  if (!tags?.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => onClick
        ? <button key={t} type="button" className="chip min-h-6 hover:border-fin/50 hover:text-fin" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(t); }}>#{t}</button>
        : <span key={t} className="chip">#{t}</span>)}
    </span>
  );
}
