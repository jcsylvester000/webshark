"use client";
/** Standalone API client (scratch mode: nothing is stored). */
import { ApiClient } from "@/components/ApiClient";
import { ScratchBanner } from "@/components/ScratchBanner";
import { SCRATCH } from "@/lib/store";

export default function ApiClientPage() {
  return (
    <div className="flex h-full flex-col">
      <ScratchBanner />
      <div className="min-h-0 flex-1"><ApiClient projectId={SCRATCH} /></div>
    </div>
  );
}
