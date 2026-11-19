//! Wireshark/sharkd-style capture API:
//!   POST   /captures                      load a .pcap/.pcapng (multipart field `file`)
//!   GET    /captures/{id}/frames/{no}     protocol tree + bytes for one frame
//!   GET    /captures/{id}/follow/{stream} reassembled TCP stream payload
//!   DELETE /captures/{id}                 discard the capture
//! Captures are held in memory only (never written to the database) and expire after 1 hour,
//! because packet data can contain personal information.
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use axum::{
    extract::{Multipart, Path, State},
    Json,
};
use base64::Engine;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{AppError, AppResult},
    pcap::{dissect::Dissector, reader, LoadedCapture},
    AppState,
};

const MAX_FILE: usize = 50 * 1024 * 1024;
const MAX_PACKETS: usize = 100_000;
const TTL: Duration = Duration::from_secs(3600);
const PER_USER: usize = 5;

pub async fn load(
    State(st): State<AppState>,
    user: AuthUser,
    mut mp: Multipart,
) -> AppResult<Json<Value>> {
    let mut file: Option<(String, Vec<u8>)> = None;
    while let Some(field) = mp
        .next_field()
        .await
        .map_err(|e| AppError::bad(format!("Upload failed: {e}")))?
    {
        if field.name() == Some("file") {
            let name = field.file_name().unwrap_or("capture.pcap").to_string();
            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::bad(format!("Upload failed: {e}")))?;
            if data.len() > MAX_FILE {
                return Err(AppError::bad("Capture is larger than 50 MB"));
            }
            file = Some((name, data.to_vec()));
        }
    }
    let (name, bytes) =
        file.ok_or_else(|| AppError::bad("Attach a capture file in the `file` field"))?;
    let cap = reader::read(&bytes, MAX_PACKETS)?;
    let first_ts = cap.packets.first().map(|p| p.ts).unwrap_or(0.0);
    let mut dissector = Dissector::default();
    let summaries: Vec<_> = cap
        .packets
        .iter()
        .enumerate()
        .map(|(i, p)| dissector.dissect(i as u32 + 1, p, p.ts - first_ts).0)
        .collect();

    // Statistics (Wireshark: Statistics > Protocol Hierarchy / Conversations / Endpoints).
    let mut protocols: HashMap<String, (u64, u64)> = HashMap::new();
    let mut convs: HashMap<(String, String), (u64, u64)> = HashMap::new();
    let mut endpoints: HashMap<String, (u64, u64)> = HashMap::new();
    let mut total_bytes = 0u64;
    for s in &summaries {
        let len = s.length as u64;
        total_bytes += len;
        let e = protocols.entry(s.protocol.clone()).or_default();
        e.0 += 1;
        e.1 += len;
        if !s.src.is_empty() {
            let key = if s.src <= s.dst {
                (s.src.clone(), s.dst.clone())
            } else {
                (s.dst.clone(), s.src.clone())
            };
            let c = convs.entry(key).or_default();
            c.0 += 1;
            c.1 += len;
            for ep in [&s.src, &s.dst] {
                let x = endpoints.entry(ep.clone()).or_default();
                x.0 += 1;
                x.1 += len;
            }
        }
    }
    let mut proto_v: Vec<Value> = protocols
        .into_iter()
        .map(|(k, (p, b))| json!({ "protocol": k, "packets": p, "bytes": b }))
        .collect();
    proto_v.sort_by(|a, b| b["packets"].as_u64().cmp(&a["packets"].as_u64()));
    let mut conv_v: Vec<Value> = convs
        .into_iter()
        .map(|((a, b), (p, by))| json!({ "a": a, "b": b, "packets": p, "bytes": by }))
        .collect();
    conv_v.sort_by(|a, b| b["bytes"].as_u64().cmp(&a["bytes"].as_u64()));
    conv_v.truncate(200);
    let mut ep_v: Vec<Value> = endpoints
        .into_iter()
        .map(|(k, (p, b))| json!({ "address": k, "packets": p, "bytes": b }))
        .collect();
    ep_v.sort_by(|a, b| b["bytes"].as_u64().cmp(&a["bytes"].as_u64()));
    ep_v.truncate(200);
    let duration = cap.packets.last().map(|p| p.ts - first_ts).unwrap_or(0.0);
    let linktype = cap.packets.first().map(|p| p.linktype).unwrap_or(1);

    let id = Uuid::new_v4();
    let response = json!({
        "id": id, "name": name, "format": cap.format, "count": summaries.len(), "truncated": cap.truncated,
        "linktype": crate::pcap::dissect::linktype_name(linktype), "duration_s": duration, "bytes": total_bytes,
        "first_ts": first_ts, "frames": summaries,
        "stats": { "protocols": proto_v, "conversations": conv_v, "endpoints": ep_v }
    });

    let mut store = st.captures.lock().await;
    store.retain(|_, c| c.loaded_at.elapsed() < TTL);
    let mut mine: Vec<(Uuid, Instant)> = store
        .iter()
        .filter(|(_, c)| c.owner == user.id)
        .map(|(k, c)| (*k, c.loaded_at))
        .collect();
    mine.sort_by_key(|x| x.1);
    while mine.len() >= PER_USER {
        let (old, _) = mine.remove(0);
        store.remove(&old);
    }
    store.insert(
        id,
        LoadedCapture {
            owner: user.id,
            name,
            loaded_at: Instant::now(),
            packets: cap.packets,
            summaries,
            dissector,
            first_ts,
        },
    );
    Ok(Json(response))
}

pub async fn frame(
    State(st): State<AppState>,
    user: AuthUser,
    Path((id, no)): Path<(Uuid, u32)>,
) -> AppResult<Json<Value>> {
    let mut store = st.captures.lock().await;
    let cap = store
        .get_mut(&id)
        .filter(|c| c.owner == user.id)
        .ok_or(AppError::NotFound)?;
    let idx = no.checked_sub(1).ok_or(AppError::NotFound)? as usize;
    let p = cap.packets.get(idx).ok_or(AppError::NotFound)?.clone();
    let first = cap.first_ts;
    let (summary, tree) = cap.dissector.dissect(no, &p, p.ts - first);
    Ok(Json(
        json!({ "summary": summary, "tree": tree, "bytes": base64::engine::general_purpose::STANDARD.encode(&p.data) }),
    ))
}

pub async fn follow(
    State(st): State<AppState>,
    user: AuthUser,
    Path((id, stream)): Path<(Uuid, u32)>,
) -> AppResult<Json<Value>> {
    let store = st.captures.lock().await;
    let cap = store
        .get(&id)
        .filter(|c| c.owner == user.id)
        .ok_or(AppError::NotFound)?;
    let mut client: Option<(String, u16)> = None;
    let mut segments = vec![];
    let (mut c_bytes, mut s_bytes) = (0usize, 0usize);
    for (s, p) in cap.summaries.iter().zip(cap.packets.iter()) {
        if s.stream != Some(stream) {
            continue;
        }
        let me = (s.src.clone(), s.sport.unwrap_or(0));
        let cl = client.get_or_insert_with(|| me.clone()).clone();
        let payload = tcp_payload(&p.data, p.linktype);
        if payload.is_empty() {
            continue;
        }
        let from_client = me == cl;
        if from_client {
            c_bytes += payload.len()
        } else {
            s_bytes += payload.len()
        }
        segments.push(json!({ "no": s.no, "from_client": from_client, "text": String::from_utf8_lossy(payload) }));
        if segments.len() > 2000 {
            break;
        }
    }
    if client.is_none() {
        return Err(AppError::NotFound);
    }
    let first = cap
        .summaries
        .iter()
        .find(|s| s.stream == Some(stream))
        .cloned()
        .unwrap_or_default();
    Ok(Json(json!({
        "stream": stream,
        "client": format!("{}:{}", first.src, first.sport.unwrap_or(0)),
        "server": format!("{}:{}", first.dst, first.dport.unwrap_or(0)),
        "client_bytes": c_bytes, "server_bytes": s_bytes, "segments": segments
    })))
}

pub async fn discard(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    let mut store = st.captures.lock().await;
    if store.get(&id).is_some_and(|c| c.owner == user.id) {
        store.remove(&id);
    }
    Ok(Json(json!({ "ok": true })))
}

/// Locates the TCP payload inside a frame (Ethernet/SLL/raw, IPv4/IPv6).
fn tcp_payload(d: &[u8], linktype: u32) -> &[u8] {
    let mut off = match linktype {
        1 => 14,
        113 => 16,
        0 => 4,
        _ => 0,
    };
    if linktype == 1 && d.len() > 14 && d[12] == 0x81 && d[13] == 0x00 {
        off += 4;
    }
    let Some(&v) = d.get(off) else { return &[] };
    let (proto, ip_end, l4) = match v >> 4 {
        4 => {
            let ihl = ((v & 0x0f) as usize) * 4;
            let total = d
                .get(off + 2..off + 4)
                .map(|b| u16::from_be_bytes([b[0], b[1]]) as usize)
                .unwrap_or(0);
            (
                d.get(off + 9).copied().unwrap_or(0),
                (off + total).min(d.len()),
                off + ihl,
            )
        }
        6 => {
            let plen = d
                .get(off + 4..off + 6)
                .map(|b| u16::from_be_bytes([b[0], b[1]]) as usize)
                .unwrap_or(0);
            (
                d.get(off + 6).copied().unwrap_or(0),
                (off + 40 + plen).min(d.len()),
                off + 40,
            )
        }
        _ => return &[],
    };
    if proto != 6 {
        return &[];
    }
    let Some(&hlb) = d.get(l4 + 12) else {
        return &[];
    };
    let start = l4 + ((hlb >> 4) as usize) * 4;
    if start >= ip_end {
        return &[];
    }
    &d[start..ip_end]
}
