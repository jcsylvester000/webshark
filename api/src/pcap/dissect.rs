//! Protocol dissectors (the Slyshark equivalent of Wireshark's `epan/dissectors/`).
//! Each layer appends a node to the protocol tree with byte offsets so the UI can
//! highlight the matching bytes in the hex pane, exactly like Wireshark's detail view.
use std::{
    collections::HashMap,
    net::{Ipv4Addr, Ipv6Addr},
};

use serde::Serialize;

use super::reader::RawPacket;

#[derive(Serialize, Clone)]
pub struct Node {
    pub label: String,
    pub start: usize,
    pub len: usize,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<Node>,
}

impl Node {
    fn new(label: impl Into<String>, start: usize, len: usize) -> Self {
        Node {
            label: label.into(),
            start,
            len,
            children: vec![],
        }
    }
    fn add(&mut self, label: impl Into<String>, start: usize, len: usize) -> &mut Self {
        self.children.push(Node::new(label, start, len));
        self
    }
}

/// One row of the packet list (Wireshark's top pane).
#[derive(Serialize, Clone, Default)]
pub struct Summary {
    pub no: u32,
    pub time: f64,
    pub src: String,
    pub dst: String,
    pub sport: Option<u16>,
    pub dport: Option<u16>,
    pub protocol: String,
    pub length: u32,
    pub info: String,
    /// Protocol stack, e.g. "eth:ip:tcp:http" (used by display filters).
    pub stack: String,
    pub stream: Option<u32>,
    pub flags: Option<String>,
}

struct Ctx {
    s: Summary,
    stack: Vec<&'static str>,
    tree: Vec<Node>,
}

impl Ctx {
    fn proto(&mut self, name: &'static str, display: &str) {
        self.stack.push(name);
        self.s.protocol = display.to_string();
    }
}

type FlowKey = (String, u16, String, u16);

#[derive(Default)]
pub struct Dissector {
    streams: HashMap<FlowKey, u32>,
    isn: HashMap<FlowKey, u32>,
    next_stream: u32,
}

fn get(d: &[u8], off: usize, n: usize) -> Option<&[u8]> {
    d.get(off..off.checked_add(n)?)
}
fn be16(d: &[u8], o: usize) -> u16 {
    u16::from_be_bytes([d[o], d[o + 1]])
}
fn be32(d: &[u8], o: usize) -> u32 {
    u32::from_be_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
}
fn mac(b: &[u8]) -> String {
    b.iter()
        .map(|x| format!("{x:02x}"))
        .collect::<Vec<_>>()
        .join(":")
}

impl Dissector {
    pub fn dissect(&mut self, no: u32, p: &RawPacket, rel: f64) -> (Summary, Vec<Node>) {
        let mut c = Ctx {
            s: Summary {
                no,
                time: (rel * 1e6).round() / 1e6,
                length: p.orig_len,
                ..Default::default()
            },
            stack: vec![],
            tree: vec![],
        };
        let d = &p.data;
        let mut frame = Node::new(
            format!(
                "Frame {no}: {} bytes on wire, {} bytes captured",
                p.orig_len,
                d.len()
            ),
            0,
            d.len(),
        );
        frame
            .add(format!("Arrival time (epoch): {:.6}", p.ts), 0, 0)
            .add(format!("Time since first frame: {:.6} s", rel), 0, 0)
            .add(
                format!("Link type: {} ({})", p.linktype, linktype_name(p.linktype)),
                0,
                0,
            );
        c.tree.push(frame);
        c.stack.push("frame");
        match p.linktype {
            1 => self.ethernet(&mut c, d, 0),
            113 => self.sll(&mut c, d),
            0 => {
                if d.len() >= 4 {
                    let fam = u32::from_le_bytes([d[0], d[1], d[2], d[3]]);
                    c.tree
                        .push(Node::new(format!("Null/Loopback, Family: {fam}"), 0, 4));
                    if fam == 2 {
                        self.ipv4(&mut c, d, 4)
                    } else {
                        self.ipv6(&mut c, d, 4)
                    }
                }
            }
            12 | 14 | 101 | 228 | 229 => match d.first().map(|b| b >> 4) {
                Some(4) => self.ipv4(&mut c, d, 0),
                Some(6) => self.ipv6(&mut c, d, 0),
                _ => c.proto("data", "RAW"),
            },
            _ => c.proto("data", "UNKNOWN"),
        }
        if c.s.info.is_empty() {
            c.s.info = format!("{} bytes", d.len());
        }
        c.s.stack = c.stack.join(":");
        (c.s, c.tree)
    }

    fn ethernet(&mut self, c: &mut Ctx, d: &[u8], off: usize) {
        let Some(h) = get(d, off, 14) else {
            return c.proto("eth", "Ethernet");
        };
        let ty = be16(h, 12);
        let mut n = Node::new(
            format!(
                "Ethernet II, Src: {}, Dst: {}",
                mac(&h[6..12]),
                mac(&h[0..6])
            ),
            off,
            14,
        );
        n.add(format!("Destination: {}", mac(&h[0..6])), off, 6)
            .add(format!("Source: {}", mac(&h[6..12])), off + 6, 6)
            .add(
                format!("Type: {} (0x{ty:04x})", ethertype_name(ty)),
                off + 12,
                2,
            );
        c.tree.push(n);
        c.proto("eth", "Ethernet");
        c.s.src = mac(&h[6..12]);
        c.s.dst = mac(&h[0..6]);
        self.ethertype(c, d, off + 14, ty);
    }

    fn sll(&mut self, c: &mut Ctx, d: &[u8]) {
        let Some(h) = get(d, 0, 16) else { return };
        let ty = be16(h, 14);
        c.tree.push(Node::new(
            format!("Linux cooked capture v1, Protocol: 0x{ty:04x}"),
            0,
            16,
        ));
        c.proto("sll", "SLL");
        self.ethertype(c, d, 16, ty);
    }

    fn ethertype(&mut self, c: &mut Ctx, d: &[u8], off: usize, ty: u16) {
        match ty {
            0x0800 => self.ipv4(c, d, off),
            0x86dd => self.ipv6(c, d, off),
            0x0806 => self.arp(c, d, off),
            0x8100 | 0x88a8 => {
                if let Some(h) = get(d, off, 4) {
                    let inner = be16(h, 2);
                    let mut n = Node::new(
                        format!("802.1Q Virtual LAN, ID: {}", be16(h, 0) & 0x0fff),
                        off,
                        4,
                    );
                    n.add(format!("Type: 0x{inner:04x}"), off + 2, 2);
                    c.tree.push(n);
                    c.stack.push("vlan");
                    self.ethertype(c, d, off + 4, inner);
                }
            }
            _ => c.s.info = format!("Ethertype 0x{ty:04x}"),
        }
    }

    fn arp(&mut self, c: &mut Ctx, d: &[u8], off: usize) {
        c.proto("arp", "ARP");
        let Some(h) = get(d, off, 28) else { return };
        let op = be16(h, 6);
        let (smac, sip, tip) = (
            mac(&h[8..14]),
            Ipv4Addr::new(h[14], h[15], h[16], h[17]),
            Ipv4Addr::new(h[24], h[25], h[26], h[27]),
        );
        c.s.info = if op == 1 {
            format!("Who has {tip}? Tell {sip}")
        } else {
            format!("{sip} is at {smac}")
        };
        let mut n = Node::new(
            format!(
                "Address Resolution Protocol ({})",
                if op == 1 { "request" } else { "reply" }
            ),
            off,
            28,
        );
        n.add(format!("Opcode: {op}"), off + 6, 2)
            .add(format!("Sender MAC: {smac}"), off + 8, 6)
            .add(format!("Sender IP: {sip}"), off + 14, 4)
            .add(format!("Target MAC: {}", mac(&h[18..24])), off + 18, 6)
            .add(format!("Target IP: {tip}"), off + 24, 4);
        c.tree.push(n);
    }

    fn ipv4(&mut self, c: &mut Ctx, d: &[u8], off: usize) {
        c.proto("ip", "IPv4");
        let Some(h) = get(d, off, 20) else { return };
        let ihl = ((h[0] & 0x0f) as usize) * 4;
        let total = be16(h, 2) as usize;
        let proto = h[9];
        let (src, dst) = (
            Ipv4Addr::new(h[12], h[13], h[14], h[15]),
            Ipv4Addr::new(h[16], h[17], h[18], h[19]),
        );
        let frag = be16(h, 6);
        let mut n = Node::new(
            format!("Internet Protocol Version 4, Src: {src}, Dst: {dst}"),
            off,
            ihl.max(20),
        );
        n.add(format!("Header length: {ihl} bytes"), off, 1)
            .add(format!("Total length: {total}"), off + 2, 2)
            .add(format!("Identification: 0x{:04x}", be16(h, 4)), off + 4, 2)
            .add(
                format!(
                    "Flags: {}{}  Fragment offset: {}",
                    if frag & 0x4000 != 0 { "DF " } else { "" },
                    if frag & 0x2000 != 0 { "MF" } else { "" },
                    (frag & 0x1fff) * 8
                ),
                off + 6,
                2,
            )
            .add(format!("Time to live: {}", h[8]), off + 8, 1)
            .add(
                format!("Protocol: {} ({proto})", ip_proto_name(proto)),
                off + 9,
                1,
            )
            .add(format!("Source: {src}"), off + 12, 4)
            .add(format!("Destination: {dst}"), off + 16, 4);
        c.tree.push(n);
        c.s.src = src.to_string();
        c.s.dst = dst.to_string();
        if frag & 0x1fff != 0 {
            c.s.info = format!("Fragmented IP protocol (proto={})", ip_proto_name(proto));
            return;
        }
        let end = if total >= ihl {
            (off + total).min(d.len())
        } else {
            d.len()
        };
        self.transport(c, d, off + ihl, end, proto);
    }

    fn ipv6(&mut self, c: &mut Ctx, d: &[u8], off: usize) {
        c.proto("ipv6", "IPv6");
        let Some(h) = get(d, off, 40) else { return };
        let mut next = h[6];
        let plen = be16(h, 4) as usize;
        let src = Ipv6Addr::from(<[u8; 16]>::try_from(&h[8..24]).unwrap());
        let dst = Ipv6Addr::from(<[u8; 16]>::try_from(&h[24..40]).unwrap());
        let mut n = Node::new(
            format!("Internet Protocol Version 6, Src: {src}, Dst: {dst}"),
            off,
            40,
        );
        n.add(format!("Payload length: {plen}"), off + 4, 2)
            .add(
                format!("Next header: {} ({next})", ip_proto_name(next)),
                off + 6,
                1,
            )
            .add(format!("Hop limit: {}", h[7]), off + 7, 1)
            .add(format!("Source: {src}"), off + 8, 16)
            .add(format!("Destination: {dst}"), off + 24, 16);
        c.tree.push(n);
        c.s.src = src.to_string();
        c.s.dst = dst.to_string();
        let mut p = off + 40;
        for _ in 0..6 {
            match next {
                0 | 43 | 60 => {
                    let Some(e) = get(d, p, 2) else { return };
                    next = e[0];
                    p += (e[1] as usize + 1) * 8;
                }
                44 => {
                    let Some(e) = get(d, p, 8) else { return };
                    next = e[0];
                    p += 8;
                }
                _ => break,
            }
        }
        let end = (off + 40 + plen).min(d.len());
        self.transport(c, d, p, end.max(p), next);
    }

    fn transport(&mut self, c: &mut Ctx, d: &[u8], off: usize, end: usize, proto: u8) {
        match proto {
            6 => self.tcp(c, d, off, end),
            17 => self.udp(c, d, off, end),
            1 => self.icmp(c, d, off, end),
            58 => self.icmpv6(c, d, off),
            _ => c.s.info = format!("IP protocol {} ({proto})", ip_proto_name(proto)),
        }
    }

    fn icmp(&mut self, c: &mut Ctx, d: &[u8], off: usize, end: usize) {
        c.proto("icmp", "ICMP");
        let Some(h) = get(d, off, 8) else { return };
        let (t, code) = (h[0], h[1]);
        let name = match t {
            0 => "Echo (ping) reply",
            3 => "Destination unreachable",
            5 => "Redirect",
            8 => "Echo (ping) request",
            11 => "Time-to-live exceeded",
            _ => "ICMP",
        };
        c.s.info = if t == 0 || t == 8 {
            format!("{name} id=0x{:04x}, seq={}", be16(h, 4), be16(h, 6))
        } else {
            format!("{name} (type={t}, code={code})")
        };
        let mut n = Node::new(
            "Internet Control Message Protocol",
            off,
            end.saturating_sub(off).max(8),
        );
        n.add(format!("Type: {t} ({name})"), off, 1)
            .add(format!("Code: {code}"), off + 1, 1)
            .add(format!("Checksum: 0x{:04x}", be16(h, 2)), off + 2, 2);
        c.tree.push(n);
    }

    fn icmpv6(&mut self, c: &mut Ctx, d: &[u8], off: usize) {
        c.proto("icmpv6", "ICMPv6");
        let Some(h) = get(d, off, 4) else { return };
        let name = match h[0] {
            1 => "Destination Unreachable",
            3 => "Time Exceeded",
            128 => "Echo (ping) request",
            129 => "Echo (ping) reply",
            133 => "Router Solicitation",
            134 => "Router Advertisement",
            135 => "Neighbor Solicitation",
            136 => "Neighbor Advertisement",
            143 => "Multicast Listener Report v2",
            _ => "ICMPv6",
        };
        c.s.info = name.to_string();
        let mut n = Node::new("Internet Control Message Protocol v6", off, d.len() - off);
        n.add(format!("Type: {} ({name})", h[0]), off, 1).add(
            format!("Code: {}", h[1]),
            off + 1,
            1,
        );
        c.tree.push(n);
    }

    fn udp(&mut self, c: &mut Ctx, d: &[u8], off: usize, end: usize) {
        c.proto("udp", "UDP");
        let Some(h) = get(d, off, 8) else { return };
        let (sp, dp, len) = (be16(h, 0), be16(h, 2), be16(h, 4));
        c.s.sport = Some(sp);
        c.s.dport = Some(dp);
        let mut n = Node::new(
            format!("User Datagram Protocol, Src Port: {sp}, Dst Port: {dp}"),
            off,
            8,
        );
        n.add(format!("Source Port: {sp}"), off, 2)
            .add(format!("Destination Port: {dp}"), off + 2, 2)
            .add(format!("Length: {len}"), off + 4, 2);
        c.tree.push(n);
        let pay = off + 8;
        let plen = end.saturating_sub(pay);
        c.s.info = format!("{sp} → {dp} Len={plen}");
        let has = |p: u16| sp == p || dp == p;
        if plen == 0 {
            return;
        }
        if has(53) || has(5353) || has(5355) {
            self.dns(c, d, pay, end, if has(5353) { "mdns" } else { "dns" });
        } else if has(67) || has(68) {
            c.proto("dhcp", "DHCP");
            c.s.info = format!(
                "DHCP {}",
                if get(d, pay, 1) == Some(&[1]) {
                    "Request/Discover"
                } else {
                    "Reply/Offer/ACK"
                }
            );
            c.tree
                .push(Node::new("Dynamic Host Configuration Protocol", pay, plen));
        } else if has(123) {
            c.proto("ntp", "NTP");
            c.s.info = "NTP".into();
            c.tree.push(Node::new("Network Time Protocol", pay, plen));
        } else if has(1900) {
            c.proto("ssdp", "SSDP");
            c.s.info = first_line(&d[pay..end]);
            c.tree
                .push(Node::new("Simple Service Discovery Protocol", pay, plen));
        } else if has(443) && get(d, pay, 1).is_some_and(|b| b[0] & 0x80 != 0 || b[0] & 0x40 != 0) {
            c.proto("quic", "QUIC");
            c.s.info = format!(
                "QUIC {} header, Len={plen}",
                if d[pay] & 0x80 != 0 { "long" } else { "short" }
            );
            c.tree.push(Node::new("QUIC IETF", pay, plen));
        }
    }

    fn tcp(&mut self, c: &mut Ctx, d: &[u8], off: usize, end: usize) {
        c.proto("tcp", "TCP");
        let Some(h) = get(d, off, 20) else { return };
        let (sp, dp, seq, ack) = (be16(h, 0), be16(h, 2), be32(h, 4), be32(h, 8));
        let hl = ((h[12] >> 4) as usize) * 4;
        let fl = h[13];
        let win = be16(h, 14);
        let names = [
            (0x02, "SYN"),
            (0x10, "ACK"),
            (0x01, "FIN"),
            (0x04, "RST"),
            (0x08, "PSH"),
            (0x20, "URG"),
        ];
        let flags: Vec<&str> = names
            .iter()
            .filter(|(b, _)| fl & b != 0)
            .map(|(_, n)| *n)
            .collect();
        let fwd: FlowKey = (c.s.src.clone(), sp, c.s.dst.clone(), dp);
        let rev: FlowKey = (c.s.dst.clone(), dp, c.s.src.clone(), sp);
        let stream = match self.streams.get(&fwd).or_else(|| self.streams.get(&rev)) {
            Some(s) => *s,
            None => {
                let s = self.next_stream;
                self.next_stream += 1;
                self.streams.insert(fwd.clone(), s);
                s
            }
        };
        let base = *self.isn.entry(fwd).or_insert(seq);
        let rseq = seq.wrapping_sub(base);
        let rack = self
            .isn
            .get(&rev)
            .map(|b| ack.wrapping_sub(*b))
            .unwrap_or(ack);
        let pay = off + hl;
        let plen = end.saturating_sub(pay);
        c.s.sport = Some(sp);
        c.s.dport = Some(dp);
        c.s.stream = Some(stream);
        c.s.flags = Some(flags.join(","));
        c.s.info = format!(
            "{sp} → {dp} [{}] Seq={rseq}{} Win={win} Len={plen}",
            flags.join(", "),
            if fl & 0x10 != 0 {
                format!(" Ack={rack}")
            } else {
                String::new()
            }
        );
        let mut n = Node::new(format!("Transmission Control Protocol, Src Port: {sp}, Dst Port: {dp}, Seq: {rseq}, Len: {plen}"), off, hl.max(20));
        n.add(format!("Source Port: {sp}"), off, 2)
            .add(format!("Destination Port: {dp}"), off + 2, 2)
            .add(format!("[Stream index: {stream}]"), off, 0)
            .add(
                format!("Sequence number: {rseq} (relative), raw {seq}"),
                off + 4,
                4,
            )
            .add(
                format!("Acknowledgment number: {rack} (relative)"),
                off + 8,
                4,
            )
            .add(format!("Header length: {hl} bytes"), off + 12, 1)
            .add(
                format!("Flags: 0x{fl:03x} ({})", flags.join(", ")),
                off + 13,
                1,
            )
            .add(format!("Window: {win}"), off + 14, 2);
        c.tree.push(n);
        if plen == 0 || pay >= d.len() {
            return;
        }
        let payload = &d[pay..end.min(d.len())];
        let has = |p: u16| sp == p || dp == p;
        if is_http(payload) {
            self.http(c, payload, pay);
        } else if payload.len() >= 6 && (20..=23).contains(&payload[0]) && payload[1] == 3 {
            self.tls(c, payload, pay);
        } else if payload.starts_with(b"SSH-") {
            c.proto("ssh", "SSH");
            c.s.info = format!("Protocol ({})", first_line(payload));
            c.tree.push(Node::new(
                format!("SSH Protocol: {}", first_line(payload)),
                pay,
                payload.len(),
            ));
        } else if has(53) && payload.len() > 2 {
            self.dns(c, d, pay + 2, end, "dns");
        } else if has(22) {
            c.proto("ssh", "SSH");
            c.s.info = format!("Encrypted packet (len={plen})");
            c.tree
                .push(Node::new("SSH Protocol (encrypted)", pay, plen));
        } else {
            c.tree
                .push(Node::new(format!("Data ({plen} bytes)"), pay, plen));
        }
    }

    fn http(&mut self, c: &mut Ctx, p: &[u8], off: usize) {
        c.proto("http", "HTTP");
        let text = String::from_utf8_lossy(p);
        let head_end = text.find("\r\n\r\n").map(|i| i + 4).unwrap_or(text.len());
        let mut n = Node::new("Hypertext Transfer Protocol", off, p.len());
        let mut o = off;
        for line in text[..head_end].split("\r\n").filter(|l| !l.is_empty()) {
            n.add(line.to_string(), o, line.len() + 2);
            o += line.len() + 2;
        }
        if head_end < p.len() {
            n.add(
                format!("Body: {} bytes", p.len() - head_end),
                off + head_end,
                p.len() - head_end,
            );
        }
        c.s.info = text.lines().next().unwrap_or("").to_string();
        c.tree.push(n);
    }

    fn tls(&mut self, c: &mut Ctx, p: &[u8], off: usize) {
        c.proto("tls", "TLS");
        let ver = match be16(p, 1) {
            0x0300 => "SSLv3",
            0x0301 => "TLSv1.0",
            0x0302 => "TLSv1.1",
            0x0303 => "TLSv1.2",
            _ => "TLS",
        };
        let rlen = be16(p, 3) as usize;
        let kind = match p[0] {
            20 => "Change Cipher Spec",
            21 => "Alert",
            22 => "Handshake",
            23 => "Application Data",
            _ => "Record",
        };
        let mut n = Node::new(
            format!("Transport Layer Security: {ver} Record Layer: {kind}"),
            off,
            p.len(),
        );
        n.add(format!("Content Type: {kind} ({})", p[0]), off, 1)
            .add(format!("Version: {ver}"), off + 1, 2)
            .add(format!("Length: {rlen}"), off + 3, 2);
        let mut info = format!("{ver} {kind}");
        if p[0] == 22 && p.len() > 9 {
            let hs = match p[5] {
                1 => "Client Hello",
                2 => "Server Hello",
                4 => "New Session Ticket",
                11 => "Certificate",
                12 => "Server Key Exchange",
                14 => "Server Hello Done",
                16 => "Client Key Exchange",
                _ => "Handshake",
            };
            info = format!("{ver} {hs}");
            n.add(format!("Handshake Type: {hs} ({})", p[5]), off + 5, 1);
            if p[5] == 1 {
                if let Some((sni, at)) = client_hello_sni(p) {
                    n.add(
                        format!("Server Name Indication: {sni}"),
                        off + at,
                        sni.len(),
                    );
                    info = format!("{info} (SNI={sni})");
                }
            }
        }
        c.s.info = info;
        c.tree.push(n);
    }

    fn dns(&mut self, c: &mut Ctx, d: &[u8], off: usize, end: usize, name: &'static str) {
        c.proto(name, if name == "mdns" { "MDNS" } else { "DNS" });
        let end = end.min(d.len());
        let Some(h) = get(d, off, 12) else { return };
        let (id, flags, qd, an) = (be16(h, 0), be16(h, 2), be16(h, 4), be16(h, 6));
        let resp = flags & 0x8000 != 0;
        let msg = &d[off..end];
        let mut n = Node::new(
            format!(
                "Domain Name System ({})",
                if resp { "response" } else { "query" }
            ),
            off,
            msg.len(),
        );
        n.add(format!("Transaction ID: 0x{id:04x}"), off, 2)
            .add(
                format!(
                    "Flags: 0x{flags:04x} {}",
                    if resp {
                        "Standard query response"
                    } else {
                        "Standard query"
                    }
                ),
                off + 2,
                2,
            )
            .add(format!("Questions: {qd}  Answer RRs: {an}"), off + 4, 4);
        let mut p = 12;
        let mut qtext = String::new();
        for _ in 0..qd.min(4) {
            let Some((qname, np)) = read_name(msg, p) else {
                break;
            };
            if np + 4 > msg.len() {
                break;
            }
            let qt = rr_type(be16(msg, np));
            n.add(format!("Query: {qname} type {qt}"), off + p, np + 4 - p);
            qtext = format!("{qt} {qname}");
            p = np + 4;
        }
        let mut answers = vec![];
        for _ in 0..an.min(16) {
            let Some((aname, np)) = read_name(msg, p) else {
                break;
            };
            if np + 10 > msg.len() {
                break;
            }
            let ty = be16(msg, np);
            let rdlen = be16(msg, np + 8) as usize;
            let rd = np + 10;
            if rd + rdlen > msg.len() {
                break;
            }
            let val = match (ty, rdlen) {
                (1, 4) => Ipv4Addr::new(msg[rd], msg[rd + 1], msg[rd + 2], msg[rd + 3]).to_string(),
                (28, 16) => {
                    Ipv6Addr::from(<[u8; 16]>::try_from(&msg[rd..rd + 16]).unwrap()).to_string()
                }
                (5, _) | (2, _) | (12, _) => read_name(msg, rd).map(|x| x.0).unwrap_or_default(),
                _ => format!("{rdlen} bytes"),
            };
            n.add(
                format!("Answer: {aname} type {} {val}", rr_type(ty)),
                off + p,
                rd + rdlen - p,
            );
            answers.push(format!("{} {val}", rr_type(ty)));
            p = rd + rdlen;
        }
        c.s.info = if resp {
            format!(
                "Standard query response 0x{id:04x} {qtext} {}",
                answers.join(" ")
            )
        } else {
            format!("Standard query 0x{id:04x} {qtext}")
        };
        c.tree.push(n);
    }
}

fn read_name(msg: &[u8], mut p: usize) -> Option<(String, usize)> {
    let mut labels = vec![];
    let mut jumped = false;
    let mut next = 0;
    for _ in 0..64 {
        let len = *msg.get(p)? as usize;
        if len == 0 {
            if !jumped {
                next = p + 1;
            }
            return Some((
                if labels.is_empty() {
                    "<Root>".into()
                } else {
                    labels.join(".")
                },
                next,
            ));
        }
        if len & 0xc0 == 0xc0 {
            let ptr = ((len & 0x3f) << 8) | *msg.get(p + 1)? as usize;
            if !jumped {
                next = p + 2;
            }
            jumped = true;
            p = ptr;
            continue;
        }
        labels.push(String::from_utf8_lossy(msg.get(p + 1..p + 1 + len)?).to_string());
        p += len + 1;
    }
    None
}

fn client_hello_sni(p: &[u8]) -> Option<(String, usize)> {
    let mut o = 5 + 4 + 2 + 32;
    o += 1 + *p.get(o)? as usize;
    o += 2 + be16(p.get(o..o + 2)?, 0) as usize;
    o += 1 + *p.get(o)? as usize;
    let ext_end = o + 2 + be16(p.get(o..o + 2)?, 0) as usize;
    o += 2;
    while o + 4 <= ext_end.min(p.len()) {
        let (ty, len) = (be16(p, o), be16(p, o + 2) as usize);
        if ty == 0 && o + 9 <= p.len() {
            let nlen = be16(p, o + 7) as usize;
            let name = p.get(o + 9..o + 9 + nlen)?;
            return Some((String::from_utf8_lossy(name).to_string(), o + 9));
        }
        o += 4 + len;
    }
    None
}

fn is_http(p: &[u8]) -> bool {
    const M: [&[u8]; 9] = [
        b"GET ",
        b"POST ",
        b"PUT ",
        b"DELETE ",
        b"HEAD ",
        b"OPTIONS ",
        b"PATCH ",
        b"CONNECT ",
        b"HTTP/1.",
    ];
    M.iter().any(|m| p.starts_with(m))
}

fn first_line(p: &[u8]) -> String {
    String::from_utf8_lossy(p)
        .lines()
        .next()
        .unwrap_or("")
        .chars()
        .take(120)
        .collect()
}

fn rr_type(t: u16) -> String {
    match t {
        1 => "A",
        2 => "NS",
        5 => "CNAME",
        6 => "SOA",
        12 => "PTR",
        15 => "MX",
        16 => "TXT",
        28 => "AAAA",
        33 => "SRV",
        65 => "HTTPS",
        255 => "ANY",
        _ => return format!("TYPE{t}"),
    }
    .to_string()
}

pub fn ip_proto_name(p: u8) -> &'static str {
    match p {
        1 => "ICMP",
        2 => "IGMP",
        6 => "TCP",
        17 => "UDP",
        41 => "IPv6",
        47 => "GRE",
        50 => "ESP",
        58 => "ICMPv6",
        89 => "OSPF",
        132 => "SCTP",
        _ => "Unknown",
    }
}

fn ethertype_name(t: u16) -> &'static str {
    match t {
        0x0800 => "IPv4",
        0x86dd => "IPv6",
        0x0806 => "ARP",
        0x8100 => "802.1Q",
        0x88cc => "LLDP",
        0x888e => "EAPOL",
        _ => "Unknown",
    }
}

pub fn linktype_name(l: u32) -> &'static str {
    match l {
        0 => "Null/Loopback",
        1 => "Ethernet",
        101 | 12 | 14 => "Raw IP",
        113 => "Linux cooked",
        228 => "Raw IPv4",
        229 => "Raw IPv6",
        105 => "802.11",
        127 => "802.11 radiotap",
        _ => "Other",
    }
}
