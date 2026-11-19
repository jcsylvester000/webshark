"""Generates samples/slyshark-demo.pcap: a tiny synthetic capture (ARP, ICMP, DNS,
TCP handshake + HTTP, TLS ClientHello with SNI) for testing the Captures page.
Run: python samples/make_demo_pcap.py"""
import os, struct

def csum(b):
    if len(b) % 2: b += b"\0"
    s = sum(struct.unpack("!%dH" % (len(b) // 2), b))
    while s >> 16: s = (s & 0xFFFF) + (s >> 16)
    return (~s) & 0xFFFF

ip = lambda s: bytes(int(x) for x in s.split("."))
MAC_C, MAC_S = bytes.fromhex("02aabbccdd01"), bytes.fromhex("02aabbccdd02")
C, S, DNS = "192.168.1.10", "93.184.216.34", "1.1.1.1"

def eth(dst, src, t, p): return dst + src + struct.pack("!H", t) + p
def ipv4(src, dst, proto, p):
    h = struct.pack("!BBHHHBBH4s4s", 0x45, 0, 20 + len(p), 1, 0x4000, 64, proto, 0, ip(src), ip(dst))
    return h[:10] + struct.pack("!H", csum(h)) + h[12:] + p
def tcp(sp, dp, seq, ack, flags, p=b""):
    return struct.pack("!HHIIBBHHH", sp, dp, seq, ack, 5 << 4, flags, 64240, 0, 0) + p
def udp(sp, dp, p): return struct.pack("!HHHH", sp, dp, 8 + len(p), 0) + p
def qname(n): return b"".join(bytes([len(x)]) + x.encode() for x in n.split(".")) + b"\0"

frames = []
add = lambda f: frames.append(f)
add(eth(b"\xff" * 6, MAC_C, 0x0806, struct.pack("!HHBBH6s4s6s4s", 1, 0x0800, 6, 4, 1, MAC_C, ip(C), b"\0" * 6, ip("192.168.1.1"))))
add(eth(MAC_S, MAC_C, 0x0800, ipv4(C, DNS, 1, b"\x08\x00\x00\x00\x12\x34\x00\x01" + b"slyshark")))
add(eth(MAC_C, MAC_S, 0x0800, ipv4(DNS, C, 1, b"\x00\x00\x00\x00\x12\x34\x00\x01" + b"slyshark")))
q = struct.pack("!HHHHHH", 0xBEEF, 0x0100, 1, 0, 0, 0) + qname("example.com") + struct.pack("!HH", 1, 1)
add(eth(MAC_S, MAC_C, 0x0800, ipv4(C, DNS, 17, udp(53000, 53, q))))
r = struct.pack("!HHHHHH", 0xBEEF, 0x8180, 1, 1, 0, 0) + qname("example.com") + struct.pack("!HH", 1, 1) \
    + b"\xc0\x0c" + struct.pack("!HHIH", 1, 1, 300, 4) + ip(S)
add(eth(MAC_C, MAC_S, 0x0800, ipv4(DNS, C, 17, udp(53, 53000, r))))
add(eth(MAC_S, MAC_C, 0x0800, ipv4(C, S, 6, tcp(51000, 80, 1000, 0, 0x02))))
add(eth(MAC_C, MAC_S, 0x0800, ipv4(S, C, 6, tcp(80, 51000, 5000, 1001, 0x12))))
add(eth(MAC_S, MAC_C, 0x0800, ipv4(C, S, 6, tcp(51000, 80, 1001, 5001, 0x10))))
req = b"GET /index.html HTTP/1.1\r\nHost: example.com\r\nUser-Agent: Slyshark-Demo\r\nAccept: */*\r\n\r\n"
add(eth(MAC_S, MAC_C, 0x0800, ipv4(C, S, 6, tcp(51000, 80, 1001, 5001, 0x18, req))))
body = b"<html><body>Hello from Slyshark</body></html>"
resp = b"HTTP/1.1 200 OK\r\nServer: nginx/1.25.3\r\nContent-Type: text/html\r\nContent-Length: %d\r\n\r\n" % len(body) + body
add(eth(MAC_C, MAC_S, 0x0800, ipv4(S, C, 6, tcp(80, 51000, 5001, 1001 + len(req), 0x18, resp))))
add(eth(MAC_S, MAC_C, 0x0800, ipv4(C, S, 6, tcp(51000, 80, 1001 + len(req), 5001 + len(resp), 0x11))))
sni = b"example.com"
ext = struct.pack("!HHHBH", 0, len(sni) + 5, len(sni) + 3, 0, len(sni)) + sni
hello = b"\x03\x03" + os.urandom(32) + b"\x00" + struct.pack("!H", 2) + b"\x13\x01" + b"\x01\x00" + struct.pack("!H", len(ext)) + ext
hs = b"\x01" + struct.pack("!I", len(hello))[1:] + hello
rec = b"\x16\x03\x01" + struct.pack("!H", len(hs)) + hs
add(eth(MAC_S, MAC_C, 0x0800, ipv4(C, S, 6, tcp(51001, 443, 9000, 0, 0x02))))
add(eth(MAC_S, MAC_C, 0x0800, ipv4(C, S, 6, tcp(51001, 443, 9001, 7001, 0x18, rec))))

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "slyshark-demo.pcap")
with open(out, "wb") as f:
    f.write(struct.pack("<IHHiIII", 0xA1B2C3D4, 2, 4, 0, 0, 65535, 1))
    for i, fr in enumerate(frames):
        f.write(struct.pack("<IIII", 1763600000 + i // 4, (i * 125000) % 1000000, len(fr), len(fr)) + fr)
print("wrote", out, len(frames), "frames")
