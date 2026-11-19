//! Network tooling shared helpers: target parsing, DNS resolution, and the target policy.
//! Policy: cloud-metadata/link-local, multicast and unspecified addresses are always blocked.
//! Private/loopback ranges are allowed only when `ALLOW_PRIVATE_TARGETS=true` (default for
//! self-hosted use; set false when the API is exposed to untrusted users, to prevent SSRF).
pub mod audit;
pub mod http_client;
pub mod ping;
pub mod portscan;

use std::net::IpAddr;

use crate::error::{AppError, AppResult};

/// Extracts a bare host from "host", "host:port", "[v6]:port" or a full URL.
pub fn extract_host(input: &str) -> AppResult<String> {
    let s = input.trim();
    if s.is_empty() {
        return Err(AppError::bad("Target is required"));
    }
    let host = if s.contains("://") {
        url::Url::parse(s)
            .map_err(|_| AppError::bad("Invalid URL"))?
            .host_str()
            .ok_or_else(|| AppError::bad("URL has no host"))?
            .to_string()
    } else {
        let first = s.split('/').next().unwrap_or(s);
        if let Some(rest) = first.strip_prefix('[') {
            rest.split(']').next().unwrap_or("").to_string()
        } else if first.matches(':').count() == 1 {
            first.split(':').next().unwrap_or("").to_string()
        } else {
            first.to_string()
        }
    };
    let host = host.trim_matches(|c| c == '[' || c == ']').to_lowercase();
    if host.is_empty()
        || host.len() > 253
        || !host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || ".-:_".contains(c))
    {
        return Err(AppError::bad("Target contains invalid characters"));
    }
    Ok(host)
}

fn is_always_blocked(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_unspecified() || v4.is_multicast() || v4.is_broadcast() || v4.is_link_local()
        }
        IpAddr::V6(v6) => {
            v6.is_unspecified() || v6.is_multicast() || (v6.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

fn is_private(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            v4.is_loopback() || v4.is_private() || (o[0] == 100 && (o[1] & 0xc0) == 64)
        }
        IpAddr::V6(v6) => v6.is_loopback() || (v6.segments()[0] & 0xfe00) == 0xfc00,
    }
}

/// Resolves a host to IP addresses and applies the target policy.
pub async fn resolve(host: &str, allow_private: bool) -> AppResult<Vec<IpAddr>> {
    let addrs: Vec<IpAddr> = if let Ok(ip) = host.parse::<IpAddr>() {
        vec![ip]
    } else {
        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            tokio::net::lookup_host((host, 0)),
        )
        .await
        .map_err(|_| AppError::bad(format!("DNS lookup for {host} timed out")))?
        .map_err(|_| AppError::bad(format!("Could not resolve {host}")))?
        .map(|sa| sa.ip())
        .collect()
    };
    if addrs.is_empty() {
        return Err(AppError::bad(format!("No addresses found for {host}")));
    }
    for ip in &addrs {
        if is_always_blocked(ip) {
            return Err(AppError::Forbidden(format!(
                "{ip} is a link-local/metadata/multicast address and is blocked"
            )));
        }
        if !allow_private && is_private(ip) {
            return Err(AppError::Forbidden(format!(
                "{ip} is a private address; enable ALLOW_PRIVATE_TARGETS to test internal hosts"
            )));
        }
    }
    let mut out = addrs;
    out.dedup();
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn host_extraction() {
        assert_eq!(
            extract_host("https://Example.com/a?b").unwrap(),
            "example.com"
        );
        assert_eq!(extract_host("example.com:8080").unwrap(), "example.com");
        assert_eq!(extract_host("[::1]:22").unwrap(), "::1");
        assert_eq!(extract_host("10.0.0.1").unwrap(), "10.0.0.1");
        assert!(extract_host("bad host;rm").is_err());
    }
    #[tokio::test]
    async fn policy_blocks_metadata() {
        assert!(resolve("169.254.169.254", true).await.is_err());
        assert!(resolve("127.0.0.1", false).await.is_err());
        assert!(resolve("127.0.0.1", true).await.is_ok());
    }
}
