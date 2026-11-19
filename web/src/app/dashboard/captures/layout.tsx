import type { Metadata } from "next";

export const metadata: Metadata = { title: "Packet captures" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
