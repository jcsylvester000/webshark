//! Capture file reader for classic libpcap (.pcap) and pcapng (.pcapng) files.
//! Mirrors the role of Wireshark's `wiretap/` library: turn a file into a list of
//! (timestamp, link type, captured bytes, original length) records.
use crate::error::{AppError, AppResult};

#[derive(Clone)]
pub struct RawPacket {
    pub ts: f64,
    pub linktype: u32,
    pub orig_len: u32,
    pub data: Vec<u8>,
}

pub struct CaptureFile {
    pub format: &'static str,
    pub packets: Vec<RawPacket>,
    pub truncated: bool,
}

fn u16_at(b: &[u8], o: usize, le: bool) -> u16 {
    let a = [b[o], b[o + 1]];
    if le {
        u16::from_le_bytes(a)
    } else {
        u16::from_be_bytes(a)
    }
}
fn u32_at(b: &[u8], o: usize, le: bool) -> u32 {
    let a = [b[o], b[o + 1], b[o + 2], b[o + 3]];
    if le {
        u32::from_le_bytes(a)
    } else {
        u32::from_be_bytes(a)
    }
}

pub fn read(bytes: &[u8], max_packets: usize) -> AppResult<CaptureFile> {
    if bytes.len() < 24 {
        return Err(AppError::bad("File is too small to be a capture"));
    }
    match &bytes[0..4] {
        [0x0a, 0x0d, 0x0d, 0x0a] => read_pcapng(bytes, max_packets),
        _ => read_pcap(bytes, max_packets),
    }
}

fn read_pcap(b: &[u8], max: usize) -> AppResult<CaptureFile> {
    let (le, nanos) = match &b[0..4] {
        [0xd4, 0xc3, 0xb2, 0xa1] => (true, false),
        [0xa1, 0xb2, 0xc3, 0xd4] => (false, false),
        [0x4d, 0x3c, 0xb2, 0xa1] => (true, true),
        [0xa1, 0xb2, 0x3c, 0x4d] => (false, true),
        _ => {
            return Err(AppError::bad(
                "Not a pcap or pcapng file (unknown magic number)",
            ))
        }
    };
    let linktype = u32_at(b, 20, le) & 0x0fff_ffff;
    let mut off = 24;
    let mut packets = Vec::new();
    let mut truncated = false;
    while off + 16 <= b.len() {
        if packets.len() >= max {
            truncated = true;
            break;
        }
        let sec = u32_at(b, off, le) as f64;
        let frac = u32_at(b, off + 4, le) as f64;
        let incl = u32_at(b, off + 8, le) as usize;
        let orig = u32_at(b, off + 12, le);
        off += 16;
        if incl > 262_144 || off + incl > b.len() {
            truncated = true;
            break;
        }
        let ts = sec + if nanos { frac / 1e9 } else { frac / 1e6 };
        packets.push(RawPacket {
            ts,
            linktype,
            orig_len: orig,
            data: b[off..off + incl].to_vec(),
        });
        off += incl;
    }
    Ok(CaptureFile {
        format: "pcap",
        packets,
        truncated,
    })
}

struct Iface {
    linktype: u32,
    tsdiv: f64,
}

fn read_pcapng(b: &[u8], max: usize) -> AppResult<CaptureFile> {
    let mut off = 0;
    let mut le = true;
    let mut ifaces: Vec<Iface> = Vec::new();
    let mut packets = Vec::new();
    let mut truncated = false;
    while off + 12 <= b.len() {
        let btype_raw = &b[off..off + 4];
        if btype_raw == [0x0a, 0x0d, 0x0d, 0x0a] {
            if off + 12 > b.len() {
                break;
            }
            le = match &b[off + 8..off + 12] {
                [0x4d, 0x3c, 0x2b, 0x1a] => true,
                [0x1a, 0x2b, 0x3c, 0x4d] => false,
                _ => return Err(AppError::bad("Corrupt pcapng section header")),
            };
            ifaces.clear();
        }
        let btype = u32_at(b, off, le);
        let blen = u32_at(b, off + 4, le) as usize;
        if blen < 12 || off + blen > b.len() {
            truncated = true;
            break;
        }
        let body = &b[off + 8..off + blen - 4];
        match btype {
            1 if body.len() >= 8 => {
                let linktype = u16_at(body, 0, le) as u32;
                let mut tsdiv = 1e6;
                let mut o = 8;
                while o + 4 <= body.len() {
                    let code = u16_at(body, o, le);
                    let len = u16_at(body, o + 2, le) as usize;
                    if code == 0 {
                        break;
                    }
                    if code == 9 && len >= 1 && o + 4 < body.len() {
                        let r = body[o + 4];
                        tsdiv = if r & 0x80 != 0 {
                            2f64.powi((r & 0x7f) as i32)
                        } else {
                            10f64.powi(r as i32)
                        };
                    }
                    o += 4 + len.div_ceil(4) * 4;
                }
                ifaces.push(Iface { linktype, tsdiv });
            }
            6 if body.len() >= 20 => {
                if packets.len() >= max {
                    truncated = true;
                    break;
                }
                let ifid = u32_at(body, 0, le) as usize;
                let ts_raw = ((u32_at(body, 4, le) as u64) << 32) | u32_at(body, 8, le) as u64;
                let cap = (u32_at(body, 12, le) as usize).min(body.len() - 20);
                let orig = u32_at(body, 16, le);
                let (lt, div) = ifaces
                    .get(ifid)
                    .map(|i| (i.linktype, i.tsdiv))
                    .unwrap_or((1, 1e6));
                packets.push(RawPacket {
                    ts: ts_raw as f64 / div,
                    linktype: lt,
                    orig_len: orig,
                    data: body[20..20 + cap].to_vec(),
                });
            }
            3 if body.len() >= 4 => {
                if packets.len() >= max {
                    truncated = true;
                    break;
                }
                let orig = u32_at(body, 0, le);
                let cap = (orig as usize).min(body.len() - 4);
                let lt = ifaces.first().map(|i| i.linktype).unwrap_or(1);
                packets.push(RawPacket {
                    ts: 0.0,
                    linktype: lt,
                    orig_len: orig,
                    data: body[4..4 + cap].to_vec(),
                });
            }
            _ => {}
        }
        off += blen;
    }
    Ok(CaptureFile {
        format: "pcapng",
        packets,
        truncated,
    })
}
