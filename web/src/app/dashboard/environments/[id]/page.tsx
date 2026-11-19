"use client";
/** Environment designer route. Data is loaded client-side from /api/ws/environments/{id}. */
import { useParams } from "next/navigation";
import { Designer } from "@/components/designer/Designer";

export default function EnvironmentPage() {
  const { id } = useParams<{ id: string }>();
  return <Designer id={id} />;
}
