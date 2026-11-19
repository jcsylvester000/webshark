import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { Terminal } from "@/components/Terminal";

export const metadata: Metadata = { title: "Console" };

export default function TerminalPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Console" subtitle="ping, tcping, dns, curl, scan and audit. Commands run on the Slyshark API host." />
      <Terminal className="m-4 flex-1 rounded-lg border border-line" />
    </div>
  );
}
