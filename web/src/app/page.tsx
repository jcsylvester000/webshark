/** Public landing page (static, no data fetching). */
import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { DeletedNotice } from "@/components/DeletedNotice";

const FEATURES = [
  ["Environment designer", "Drag PCs, servers, load balancers, CDNs, databases and platform zones (Vercel, Netlify, AWS, Forge) onto a canvas, or start from a template."],
  ["Live console", "ping, tcping, dns, curl and scan from a terminal docked to your diagram. Results are written back onto the nodes."],
  ["URL → application", "Paste a URL into a Web App node and it becomes that application, ready to scan and audit."],
  ["Port scanner & audit", "TCP connect scans with banner grabs, and security-header, CORS, cookie and exposed-file checks."],
  ["API client", "Postman-style requests: any method, params, headers, JSON/form bodies, Bearer/Basic/API-key auth, saved collections."],
  ["Packet analysis", "Open .pcap/.pcapng captures with Wireshark-style list, protocol tree, hex view, display filters and TCP stream follow."],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6">
      <header className="flex items-center justify-between py-6">
        <Wordmark />
        <nav className="flex gap-2">
          <Link href="/login" className="btn">Sign in</Link>
          <Link href="/register" className="btn-primary">Create account</Link>
        </nav>
      </header>
      <DeletedNotice />
      <section className="py-20">
        <p className="font-mono text-sm text-fin">network · server · application documentation</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight tracking-tight">
          Map it, test it, and document it, <span className="text-fin">all on one canvas.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Slyshark combines a topology designer, a network console, a port scanner, an API client, and a packet analyzer.
          It is built for documenting how your systems connect, and for checking where they might be exposed.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/register" className="btn-primary px-5 py-2.5">Get started</Link>
          <Link href="/login" className="btn px-5 py-2.5">I have an account</Link>
        </div>
      </section>
      <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([t, d]) => (
          <div key={t} className="panel p-5">
            <h2 className="font-medium">{t}</h2>
            <p className="mt-2 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>
      <footer className="border-t border-line py-6 text-xs text-muted">
        Only test systems you own or are authorized to assess. Slyshark logs every scan to your account.
      </footer>
    </main>
  );
}
