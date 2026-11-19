//! Ping: ICMP via the system `ping` binary (no shell, validated host argument),
//! with a TCP-connect "ping" fallback that works without raw-socket privileges.
use std::{
    net::{IpAddr, SocketAddr},
    time::{Duration, Instant},
};

use serde::Serialize;
use tokio::{net::TcpStream, process::Command, time::timeout};

#[derive(Serialize)]
pub struct Attempt {
    pub seq: u32,
    pub ok: bool,
    pub rtt_ms: Option<f64>,
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct PingResult {
    pub host: String,
    pub address: String,
    pub mode: String,
    pub port: Option<u16>,
    pub attempts: Vec<Attempt>,
    pub sent: u32,
    pub received: u32,
    pub loss_pct: f64,
    pub min_ms: Option<f64>,
    pub avg_ms: Option<f64>,
    pub max_ms: Option<f64>,
    pub raw: Vec<String>,
}

pub async fn tcp_ping(ip: IpAddr, port: u16, count: u32, timeout_ms: u64) -> Vec<Attempt> {
    let mut out = Vec::new();
    for seq in 1..=count {
        let start = Instant::now();
        let res = timeout(
            Duration::from_millis(timeout_ms),
            TcpStream::connect(SocketAddr::new(ip, port)),
        )
        .await;
        let attempt = match res {
            Ok(Ok(_)) => Attempt {
                seq,
                ok: true,
                rtt_ms: Some(ms(start)),
                error: None,
            },
            Ok(Err(e)) if e.kind() == std::io::ErrorKind::ConnectionRefused => {
                // A RST still proves the host is up and reachable.
                Attempt {
                    seq,
                    ok: true,
                    rtt_ms: Some(ms(start)),
                    error: Some("port closed (RST) - host reachable".into()),
                }
            }
            Ok(Err(e)) => Attempt {
                seq,
                ok: false,
                rtt_ms: None,
                error: Some(e.to_string()),
            },
            Err(_) => Attempt {
                seq,
                ok: false,
                rtt_ms: None,
                error: Some("timeout".into()),
            },
        };
        out.push(attempt);
        if seq < count {
            tokio::time::sleep(Duration::from_millis(300)).await;
        }
    }
    out
}

/// Runs the OS ping binary. Returns None if it is unavailable or produced no replies.
pub async fn icmp_ping(ip: IpAddr, count: u32) -> Option<(Vec<Attempt>, Vec<String>)> {
    let ip_s = ip.to_string();
    let mut cmd = Command::new("ping");
    if cfg!(windows) {
        cmd.args(["-n", &count.to_string(), "-w", "2000", &ip_s]);
    } else {
        cmd.args(["-c", &count.to_string(), "-W", "2", &ip_s]);
    }
    let output = timeout(Duration::from_secs(count as u64 * 3 + 5), cmd.output())
        .await
        .ok()?
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout).to_string();
    let raw: Vec<String> = text
        .lines()
        .map(|l| l.to_string())
        .filter(|l| !l.trim().is_empty())
        .collect();
    let mut attempts = Vec::new();
    for line in &raw {
        let lower = line.to_lowercase();
        if let Some(idx) = lower.find("time=").or_else(|| lower.find("time<")) {
            let num: String = lower[idx + 5..]
                .chars()
                .take_while(|c| c.is_ascii_digit() || *c == '.')
                .collect();
            attempts.push(Attempt {
                seq: attempts.len() as u32 + 1,
                ok: true,
                rtt_ms: num.parse().ok().or(Some(0.5)),
                error: None,
            });
        }
    }
    if attempts.is_empty() {
        return None;
    }
    while (attempts.len() as u32) < count {
        attempts.push(Attempt {
            seq: attempts.len() as u32 + 1,
            ok: false,
            rtt_ms: None,
            error: Some("no reply".into()),
        });
    }
    Some((attempts, raw))
}

pub fn summarize(
    host: String,
    ip: IpAddr,
    mode: &str,
    port: Option<u16>,
    attempts: Vec<Attempt>,
    raw: Vec<String>,
) -> PingResult {
    let sent = attempts.len() as u32;
    let rtts: Vec<f64> = attempts.iter().filter_map(|a| a.rtt_ms).collect();
    let received = attempts.iter().filter(|a| a.ok).count() as u32;
    let avg = if rtts.is_empty() {
        None
    } else {
        Some(round(rtts.iter().sum::<f64>() / rtts.len() as f64))
    };
    PingResult {
        host,
        address: ip.to_string(),
        mode: mode.to_string(),
        port,
        sent,
        received,
        loss_pct: if sent == 0 {
            100.0
        } else {
            round(100.0 * (sent - received) as f64 / sent as f64)
        },
        min_ms: rtts.iter().cloned().reduce(f64::min),
        max_ms: rtts.iter().cloned().reduce(f64::max),
        avg_ms: avg,
        attempts,
        raw,
    }
}

fn ms(start: Instant) -> f64 {
    round(start.elapsed().as_secs_f64() * 1000.0)
}

fn round(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}
