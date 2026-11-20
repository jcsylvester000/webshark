import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PREFS_BOOT_SCRIPT } from "@/lib/prefs-boot";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Slyshark — Network, Server & App Documentation", template: "%s · Slyshark" },
  description: "Design, document, and test network, server and application environments: drag-and-drop topologies, console, port scanner, API client and packet analysis.",
};

export const viewport: Viewport = { themeColor: "#070b10" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} antialiased`} suppressHydrationWarning>
      <body className="min-h-screen">
        {/* Applies the saved theme/text size before first paint (no flash). Kept in <body>, not a custom
            <head>: hosts such as Netlify inject comments into <head>, which breaks React hydration of a
            hand-written head. */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
