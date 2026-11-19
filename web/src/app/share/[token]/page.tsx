import type { Metadata } from "next";
import { Suspense } from "react";
import { SharedView } from "@/components/SharedView";

export const metadata: Metadata = { title: "Shared project", robots: { index: false, follow: false } };

export default function SharePage() {
  return <Suspense fallback={null}><SharedView /></Suspense>;
}
