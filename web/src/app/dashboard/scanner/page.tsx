"use client";
/** Standalone scanner (scratch mode: nothing is stored). */
import { PageHeader } from "@/components/PageHeader";
import { Scanner } from "@/components/Scanner";
import { ScratchBanner } from "@/components/ScratchBanner";
import { SCRATCH } from "@/lib/store";

export default function ScannerPage() {
  return (
    <div>
      <ScratchBanner />
      <PageHeader title="Scanner & Audit" subtitle="Find open ports and common web misconfigurations on hosts you are authorized to test." />
      <Scanner projectId={SCRATCH} />
    </div>
  );
}
