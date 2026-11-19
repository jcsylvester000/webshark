"use client";
/** Standalone console (scratch mode: nothing is stored). */
import { PageHeader } from "@/components/PageHeader";
import { ScratchBanner } from "@/components/ScratchBanner";
import { Terminal } from "@/components/Terminal";
import { SCRATCH } from "@/lib/store";

export default function TerminalPage() {
  return (
    <div className="flex h-full flex-col">
      <ScratchBanner />
      <PageHeader title="Console" subtitle="ping, tcping, dns, curl, scan and audit. Commands run on the Slyshark server (TCP-based on Netlify)." />
      <Terminal projectId={SCRATCH} className="m-4 flex-1 rounded-lg border border-line" />
    </div>
  );
}
