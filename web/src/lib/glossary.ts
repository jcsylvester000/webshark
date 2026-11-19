/** Plain-language explanations used by Help and ⓘ tips (written for learners). */
export const GLOSSARY: { term: string; text: string; tags: string[] }[] = [
  { term: "IP address", text: "A number that identifies a device on a network, like 93.184.216.34 (IPv4) or 2606:2800::1 (IPv6). Private ranges such as 192.168.x.x, 10.x.x.x and 172.16–31.x.x are used inside homes, offices and labs.", tags: ["network"] },
  { term: "DNS", text: "The internet's phone book. It turns a name like example.com into an IP address. An 'A' record is an IPv4 address and 'AAAA' is IPv6; CNAME points to another name.", tags: ["network"] },
  { term: "Port", text: "A numbered door on a device that a service listens on: 80 is web (HTTP), 443 is secure web (HTTPS), 22 is SSH and 5432 is PostgreSQL. A device has 65,535 TCP ports.", tags: ["network", "scan"] },
  { term: "TCP vs UDP", text: "TCP sets up a connection first (the 'handshake' of SYN, SYN-ACK and ACK) and guarantees delivery; web, SSH and databases use it. UDP just sends packets without a connection; DNS and video calls often use it.", tags: ["network", "capture"] },
  { term: "Ping (TCP ping)", text: "Checks if a host answers and how fast (latency in milliseconds). Classic ping uses ICMP, which hosted servers can't send, so Slyshark times a TCP connection to a port instead. A quick refusal still proves the host is up.", tags: ["network"] },
  { term: "Port scan", text: "Tries to connect to many ports to see which services are reachable. Only scan systems you own or have written permission to test.", tags: ["scan"] },
  { term: "Open / closed / filtered", text: "Open: a service accepted the connection. Closed: the host answered 'nothing here' (a TCP reset). Filtered: no answer at all, usually because a firewall drops the traffic.", tags: ["scan"] },
  { term: "Banner", text: "The first text a service sends when you connect, e.g. 'SSH-2.0-OpenSSH_9.6' or a web server name. It often reveals software and version, which attackers look for.", tags: ["scan"] },
  { term: "HTTP status code", text: "The server's answer code: 2xx success (200 OK), 3xx redirect (301, 302), 4xx client problem (401 unauthorized, 403 forbidden, 404 not found), 5xx server error (500).", tags: ["http"] },
  { term: "Bearer token", text: "A secret string sent in the 'Authorization: Bearer …' header to prove who you are to an API. Treat it like a password.", tags: ["http"] },
  { term: "HTTPS / TLS", text: "HTTPS is HTTP wrapped in TLS encryption, so others on the network can't read or change the traffic. Modern sites should use HTTPS for everything.", tags: ["http", "security"] },
  { term: "SNI", text: "Server Name Indication: the website name a browser sends at the start of a TLS connection. It's visible in captures even though the rest is encrypted.", tags: ["capture", "security"] },
  { term: "HSTS", text: "Strict-Transport-Security header: tells browsers to always use HTTPS for a site, preventing downgrade attacks on public Wi-Fi.", tags: ["security"] },
  { term: "CSP", text: "Content-Security-Policy header: lists which scripts, styles and images a page may load. A strong CSP limits the damage of cross-site scripting (XSS).", tags: ["security"] },
  { term: "CORS", text: "Rules that decide which other websites may read responses from an API in the browser. Reflecting any Origin back, especially with credentials, can leak user data.", tags: ["security"] },
  { term: "Severity", text: "How serious a finding is. High: fix first (e.g. exposed .env or .git). Medium: important hardening (e.g. no CSP). Low: good practice. Info: worth knowing. Pass: already done right.", tags: ["security"] },
  { term: "SQL injection / XSS", text: "Common web attacks. SQL injection smuggles database commands through inputs; XSS smuggles scripts into pages other users view. Slyshark documents these scenarios but does not attack.", tags: ["security"] },
  { term: "Firewall / WAF", text: "A firewall allows or blocks traffic by address and port. A WAF (web application firewall) inspects web requests and blocks attack patterns like SQL injection.", tags: ["network", "security"] },
  { term: "Load balancer", text: "Spreads incoming traffic across several servers so the site stays fast and keeps working if one server fails.", tags: ["network"] },
  { term: "CDN", text: "Content Delivery Network: servers around the world that cache your site close to visitors (Cloudflare, Vercel Edge, Netlify CDN, CloudFront).", tags: ["network"] },
  { term: "Packet capture (pcap)", text: "A recording of network traffic. Wireshark, tcpdump and dumpcap save .pcap or .pcapng files that you can open on the Packet captures page.", tags: ["capture"] },
  { term: "Display filter", text: "A rule that shows only matching packets, e.g. 'dns', 'tcp.port == 443' or 'ip.addr == 10.0.0.5 && http'. Combine rules with && (and), || (or) and ! (not).", tags: ["capture"] },
  { term: "TCP stream", text: "All packets of one TCP conversation between two endpoints. 'Follow TCP stream' rebuilds the readable data, like an HTTP request and its response.", tags: ["capture"] },
];

export const FILTER_EXAMPLES: { f: string; why: string }[] = [
  { f: "dns", why: "Only DNS lookups" },
  { f: "http", why: "Unencrypted web traffic" },
  { f: "tls.handshake", why: "Start of HTTPS connections (look for SNI)" },
  { f: "tcp.flags.syn == 1", why: "New TCP connections" },
  { f: "tcp.port == 443", why: "Anything on HTTPS port 443" },
  { f: "ip.addr == 192.168.1.10", why: "Traffic to or from one device" },
  { f: "!arp && !dns", why: "Hide background noise" },
  { f: "frame.len > 1000", why: "Large packets" },
];

export const CONSOLE_EXAMPLES: { c: string; why: string }[] = [
  { c: "help", why: "List all commands" },
  { c: "ping example.com", why: "Is it up? How fast?" },
  { c: "dns example.com", why: "Look up its addresses" },
  { c: "curl -i https://example.com", why: "Fetch a page with headers" },
  { c: "headers https://example.com", why: "Just the response headers" },
  { c: "scan example.com web -y", why: "Check common web ports (only targets you may test)" },
];
