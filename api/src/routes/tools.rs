//! HTTP handlers for network/security tools. Every run is written to `scan_logs`.
use std::time::Instant;

use axum::{extract::State, Json};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    auth::AuthUser,
    error::{AppError, AppResult},
    tools::{self, audit, http_client, ping, portscan},
    AppState,
};

async fn log(st: &AppState, user: &AuthUser, kind: &str, target: &str, summary: Value) {
    let r =
        sqlx::query("INSERT INTO scan_logs (user_id, kind, target, summary) VALUES ($1,$2,$3,$4)")
            .bind(user.id)
            .bind(kind)
            .bind(target)
            .bind(summary)
            .execute(&st.db)
            .await;
    if let Err(e) = r {
        tracing::warn!(error = %e, "failed to write scan log");
    }
}

#[derive(Deserialize)]
pub struct PingBody {
    host: String,
    #[serde(default)]
    mode: Option<String>,
    port: Option<u16>,
    count: Option<u32>,
}

pub async fn ping(
    State(st): State<AppState>,
    user: AuthUser,
    Json(b): Json<PingBody>,
) -> AppResult<Json<ping::PingResult>> {
    let host = tools::extract_host(&b.host)?;
    let ip = tools::resolve(&host, st.config.allow_private_targets).await?[0];
    let count = b.count.unwrap_or(4).clamp(1, 10);
    let mode = b.mode.unwrap_or_else(|| "auto".into());
    let result = if mode != "tcp" {
        match ping::icmp_ping(ip, count).await {
            Some((attempts, raw)) => ping::summarize(host.clone(), ip, "icmp", None, attempts, raw),
            None if mode == "icmp" => {
                return Err(AppError::bad(
                    "ICMP ping unavailable or no reply; try mode=tcp",
                ))
            }
            None => {
                let port = b.port.unwrap_or(443);
                ping::summarize(
                    host.clone(),
                    ip,
                    "tcp",
                    Some(port),
                    ping::tcp_ping(ip, port, count, 2000).await,
                    vec![],
                )
            }
        }
    } else {
        let port = b.port.unwrap_or(443);
        ping::summarize(
            host.clone(),
            ip,
            "tcp",
            Some(port),
            ping::tcp_ping(ip, port, count, 2000).await,
            vec![],
        )
    };
    log(
        &st,
        &user,
        "ping",
        &host,
        json!({ "mode": result.mode, "received": result.received, "sent": result.sent }),
    )
    .await;
    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct DnsBody {
    host: String,
}

pub async fn dns(
    State(st): State<AppState>,
    _user: AuthUser,
    Json(b): Json<DnsBody>,
) -> AppResult<Json<Value>> {
    let host = tools::extract_host(&b.host)?;
    let start = Instant::now();
    // DNS lookups are informational, so the private-address policy is not applied here.
    let addrs: Vec<String> = match tokio::net::lookup_host((host.as_str(), 0)).await {
        Ok(it) => {
            let mut v: Vec<String> = it.map(|a| a.ip().to_string()).collect();
            v.dedup();
            v
        }
        Err(e) => return Err(AppError::bad(format!("Could not resolve {host}: {e}"))),
    };
    let _ = &st;
    Ok(Json(json!({
        "host": host,
        "a": addrs.iter().filter(|a| !a.contains(':')).collect::<Vec<_>>(),
        "aaaa": addrs.iter().filter(|a| a.contains(':')).collect::<Vec<_>>(),
        "time_ms": (start.elapsed().as_secs_f64() * 1000.0 * 100.0).round() / 100.0
    })))
}

#[derive(Deserialize)]
pub struct ScanBody {
    target: String,
    #[serde(default)]
    ports: String,
    timeout_ms: Option<u64>,
    #[serde(default = "yes")]
    banners: bool,
    /// The caller confirms they own the target or have permission to scan it.
    #[serde(default)]
    authorized: bool,
}
fn yes() -> bool {
    true
}

pub async fn portscan(
    State(st): State<AppState>,
    user: AuthUser,
    Json(b): Json<ScanBody>,
) -> AppResult<Json<Value>> {
    if !b.authorized {
        return Err(AppError::bad(
            "Confirm you own this target or have written permission to scan it",
        ));
    }
    let host = tools::extract_host(&b.target)?;
    let ip = tools::resolve(&host, st.config.allow_private_targets).await?[0];
    let ports = portscan::parse_ports(&b.ports, st.config.max_scan_ports)?;
    let start = Instant::now();
    let results = portscan::scan(
        ip,
        ports.clone(),
        b.timeout_ms.unwrap_or(900).clamp(200, 5000),
        200,
        b.banners,
    )
    .await;
    let open: Vec<_> = results
        .iter()
        .filter(|r| r.state == "open")
        .cloned()
        .collect();
    let closed = results.iter().filter(|r| r.state == "closed").count();
    let filtered = results.iter().filter(|r| r.state == "filtered").count();
    let elapsed = start.elapsed().as_millis() as u64;
    log(&st, &user, "portscan", &host, json!({ "ip": ip.to_string(), "scanned": ports.len(), "open": open.iter().map(|o| o.port).collect::<Vec<_>>() })).await;
    Ok(Json(json!({
        "target": host, "address": ip.to_string(), "scanned": ports.len(),
        "open": open, "closed_count": closed, "filtered_count": filtered,
        "duration_ms": elapsed, "results": results
    })))
}

pub async fn http(
    State(st): State<AppState>,
    user: AuthUser,
    Json(spec): Json<http_client::HttpRequestSpec>,
) -> AppResult<Json<http_client::HttpResponseOut>> {
    let target = spec.url.clone();
    let method = spec.method.clone();
    let out = http_client::execute(spec, st.config.allow_private_targets).await?;
    log(
        &st,
        &user,
        "http",
        &target,
        json!({ "method": method, "status": out.status, "ms": out.time_ms }),
    )
    .await;
    Ok(Json(out))
}

#[derive(Deserialize)]
pub struct AuditBody {
    url: String,
    #[serde(default = "yes")]
    check_files: bool,
    #[serde(default)]
    authorized: bool,
}

pub async fn audit(
    State(st): State<AppState>,
    user: AuthUser,
    Json(b): Json<AuditBody>,
) -> AppResult<Json<audit::AuditReport>> {
    if !b.authorized {
        return Err(AppError::bad(
            "Confirm you own this site or have written permission to test it",
        ));
    }
    let report = audit::run(&b.url, st.config.allow_private_targets, b.check_files).await?;
    log(
        &st,
        &user,
        "audit",
        &b.url,
        json!({ "score": report.score, "findings": report.findings.len() }),
    )
    .await;
    Ok(Json(report))
}

#[derive(sqlx::FromRow, serde::Serialize)]
pub struct LogRow {
    id: i64,
    kind: String,
    target: String,
    summary: Value,
    created_at: DateTime<Utc>,
}

pub async fn logs(State(st): State<AppState>, user: AuthUser) -> AppResult<Json<Vec<LogRow>>> {
    let rows = sqlx::query_as::<_, LogRow>(
        "SELECT id, kind, target, summary, created_at FROM scan_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200",
    )
    .bind(user.id).fetch_all(&st.db).await?;
    Ok(Json(rows))
}
