//! TCP connect port scanner with optional light banner grab on open ports.
//! Connect scans need no special privileges and are the same technique as `nmap -sT`.
use std::{
    net::{IpAddr, SocketAddr},
    time::{Duration, Instant},
};

use futures::{stream, StreamExt};
use serde::Serialize;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    time::timeout,
};

use crate::error::{AppError, AppResult};

pub const COMMON: &[u16] = &[
    20, 21, 22, 23, 25, 53, 67, 69, 80, 110, 111, 123, 135, 137, 139, 143, 161, 389, 443, 445, 465,
    587, 636, 993, 995, 1433, 1521, 2049, 2375, 2376, 3000, 3306, 3389, 5000, 5173, 5432, 5672,
    5900, 6379, 6443, 8000, 8080, 8081, 8443, 8888, 9000, 9090, 9200, 9443, 11211, 15672, 27017,
];
const WEB: &[u16] = &[
    80, 443, 3000, 4200, 5000, 5173, 8000, 8080, 8443, 8888, 9000,
];
const DB: &[u16] = &[
    1433, 1521, 3306, 5432, 6379, 9042, 9200, 11211, 27017, 28015,
];
const HTTP_PROBE: &[u16] = &[80, 3000, 5000, 8000, 8080, 8081, 8888, 9000];

pub fn service_name(port: u16) -> &'static str {
    match port {
        20 | 21 => "ftp",
        22 => "ssh",
        23 => "telnet",
        25 | 465 | 587 => "smtp",
        53 => "dns",
        67 => "dhcp",
        69 => "tftp",
        80 => "http",
        110 => "pop3",
        111 => "rpcbind",
        123 => "ntp",
        135 => "msrpc",
        137 | 139 => "netbios",
        143 => "imap",
        161 => "snmp",
        389 => "ldap",
        443 => "https",
        445 => "smb",
        636 => "ldaps",
        993 => "imaps",
        995 => "pop3s",
        1433 => "mssql",
        1521 => "oracle",
        2049 => "nfs",
        2375 | 2376 => "docker",
        3000 => "dev-http (node/next)",
        3306 => "mysql",
        3389 => "rdp",
        4200 => "dev-http (angular)",
        5000 => "http-alt",
        5173 => "dev-http (vite)",
        5432 => "postgresql",
        5672 => "amqp",
        5900 => "vnc",
        6379 => "redis",
        6443 => "kubernetes-api",
        8000 | 8080 | 8081 | 8888 => "http-alt",
        8443 | 9443 => "https-alt",
        9000 => "http-alt/php-fpm",
        9042 => "cassandra",
        9090 => "prometheus",
        9200 => "elasticsearch",
        11211 => "memcached",
        15672 => "rabbitmq-mgmt",
        27017 => "mongodb",
        28015 => "rethinkdb",
        _ => "unknown",
    }
}

/// Risk hint for exposed services (documentation aid, not a vulnerability verdict).
pub fn risk_note(port: u16) -> Option<&'static str> {
    match port {
        21 | 23 => Some("Plain-text protocol; prefer SFTP/SSH"),
        2375 => Some("Unauthenticated Docker API exposes full host control"),
        3306 | 5432 | 1433 | 1521 | 27017 | 6379 | 9200 | 11211 | 9042 => {
            Some("Database/cache should not be publicly reachable; restrict with firewall/VPC")
        }
        3389 | 5900 => Some("Remote desktop exposed; put behind VPN and enforce MFA"),
        445 | 137 | 139 | 135 => Some("Windows file-sharing/RPC should never face the internet"),
        161 => Some("SNMP may leak device info; use SNMPv3"),
        _ => None,
    }
}

pub fn parse_ports(spec: &str, max: usize) -> AppResult<Vec<u16>> {
    let spec = spec.trim().to_lowercase();
    let mut ports: Vec<u16> = match spec.as_str() {
        "" | "common" => COMMON.to_vec(),
        "web" => WEB.to_vec(),
        "db" | "database" => DB.to_vec(),
        "top1000" | "1-1024" | "well-known" => (1..=1024).collect(),
        _ => {
            let mut v = Vec::new();
            for part in spec.split(',').map(str::trim).filter(|p| !p.is_empty()) {
                if let Some((a, b)) = part.split_once('-') {
                    let a: u16 = a
                        .trim()
                        .parse()
                        .map_err(|_| AppError::bad(format!("Bad port range: {part}")))?;
                    let b: u16 = b
                        .trim()
                        .parse()
                        .map_err(|_| AppError::bad(format!("Bad port range: {part}")))?;
                    if a == 0 || a > b {
                        return Err(AppError::bad(format!("Bad port range: {part}")));
                    }
                    v.extend(a..=b);
                } else {
                    let p: u16 = part
                        .parse()
                        .map_err(|_| AppError::bad(format!("Bad port: {part}")))?;
                    if p == 0 {
                        return Err(AppError::bad("Port 0 is not valid"));
                    }
                    v.push(p);
                }
                if v.len() > max {
                    break;
                }
            }
            v
        }
    };
    ports.sort_unstable();
    ports.dedup();
    if ports.len() > max {
        return Err(AppError::bad(format!(
            "Too many ports ({}); the limit is {max}",
            ports.len()
        )));
    }
    Ok(ports)
}

#[derive(Serialize, Clone)]
pub struct PortResult {
    pub port: u16,
    pub state: &'static str,
    pub service: &'static str,
    pub rtt_ms: Option<f64>,
    pub banner: Option<String>,
    pub note: Option<&'static str>,
}

async fn probe(ip: IpAddr, port: u16, timeout_ms: u64, grab: bool) -> PortResult {
    let start = Instant::now();
    let base = |state, rtt, banner| PortResult {
        port,
        state,
        service: service_name(port),
        rtt_ms: rtt,
        banner,
        note: risk_note(port),
    };
    match timeout(
        Duration::from_millis(timeout_ms),
        TcpStream::connect(SocketAddr::new(ip, port)),
    )
    .await
    {
        Ok(Ok(mut stream)) => {
            let rtt = Some((start.elapsed().as_secs_f64() * 100_000.0).round() / 100.0);
            let banner = if grab {
                grab_banner(&mut stream, port).await
            } else {
                None
            };
            base("open", rtt, banner)
        }
        Ok(Err(e)) if e.kind() == std::io::ErrorKind::ConnectionRefused => {
            base("closed", None, None)
        }
        _ => base("filtered", None, None),
    }
}

async fn grab_banner(stream: &mut TcpStream, port: u16) -> Option<String> {
    let mut buf = [0u8; 256];
    // Many services (ssh, ftp, smtp, redis errors) speak first.
    if let Ok(Ok(n)) = timeout(Duration::from_millis(600), stream.read(&mut buf)).await {
        if n > 0 {
            return Some(clean(&buf[..n]));
        }
    }
    if HTTP_PROBE.contains(&port) {
        let _ = stream
            .write_all(b"HEAD / HTTP/1.0\r\nUser-Agent: Slyshark\r\n\r\n")
            .await;
        if let Ok(Ok(n)) = timeout(Duration::from_millis(800), stream.read(&mut buf)).await {
            if n > 0 {
                let text = clean(&buf[..n]);
                let server = text
                    .split(" | ")
                    .find(|l| l.to_lowercase().starts_with("server:"));
                return Some(
                    server
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| text.split(" | ").next().unwrap_or("").to_string()),
                );
            }
        }
    }
    None
}

fn clean(bytes: &[u8]) -> String {
    let s: String = String::from_utf8_lossy(bytes)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .take(4)
        .collect::<Vec<_>>()
        .join(" | ");
    s.chars().filter(|c| !c.is_control()).take(160).collect()
}

pub async fn scan(
    ip: IpAddr,
    ports: Vec<u16>,
    timeout_ms: u64,
    concurrency: usize,
    grab: bool,
) -> Vec<PortResult> {
    let mut results: Vec<PortResult> = stream::iter(ports)
        .map(|p| probe(ip, p, timeout_ms, grab))
        .buffer_unordered(concurrency)
        .collect()
        .await;
    results.sort_by_key(|r| r.port);
    results
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_specs() {
        assert_eq!(parse_ports("22,80,443", 100).unwrap(), vec![22, 80, 443]);
        assert_eq!(parse_ports("1-5,3", 100).unwrap().len(), 5);
        assert!(parse_ports("1-5000", 2048).is_err());
        assert!(parse_ports("abc", 10).is_err());
    }
}
