//! Lightweight, non-destructive web security audit (misconfiguration checks only):
//! security headers, cookie flags, HTTPS redirect, CORS policy, risky HTTP methods,
//! server version disclosure, and well-known sensitive file exposure. No exploit payloads.
use serde::Serialize;

use crate::{
    error::AppResult,
    tools::http_client::{execute, Auth, Body, HttpRequestSpec, HttpResponseOut, KeyValue},
};

#[derive(Serialize)]
pub struct Finding {
    pub id: &'static str,
    pub title: String,
    /// pass | info | low | medium | high
    pub severity: &'static str,
    pub detail: String,
    pub recommendation: &'static str,
}

#[derive(Serialize)]
pub struct AuditReport {
    pub url: String,
    pub final_url: String,
    pub status: u16,
    pub score: u8,
    pub findings: Vec<Finding>,
}

/// (path, severity, content matcher, recommendation)
type Probe = (&'static str, &'static str, fn(&str) -> bool, &'static str);

fn spec(method: &str, url: &str, headers: Vec<KeyValue>, follow: bool) -> HttpRequestSpec {
    HttpRequestSpec {
        method: method.into(),
        url: url.into(),
        headers,
        params: vec![],
        auth: Auth::None,
        body: Body::default(),
        timeout_ms: 15_000,
        follow_redirects: follow,
    }
}

fn header<'a>(r: &'a HttpResponseOut, name: &str) -> Option<&'a str> {
    r.headers
        .iter()
        .find(|h| h.key.eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str())
}

fn all_headers<'a>(r: &'a HttpResponseOut, name: &str) -> Vec<&'a str> {
    r.headers
        .iter()
        .filter(|h| h.key.eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str())
        .collect()
}

pub async fn run(url: &str, allow_private: bool, check_files: bool) -> AppResult<AuditReport> {
    let url = if url.contains("://") {
        url.to_string()
    } else {
        format!("https://{url}")
    };
    let main = execute(spec("GET", &url, vec![], true), allow_private).await?;
    let mut f: Vec<Finding> = Vec::new();
    let https = main.url.starts_with("https://");

    let mut check =
        |id, name: &str, sev: &'static str, rec: &'static str, present: Option<&str>| match present
        {
            Some(v) => f.push(Finding {
                id,
                title: format!("{name} present"),
                severity: "pass",
                detail: v.chars().take(200).collect(),
                recommendation: rec,
            }),
            None => f.push(Finding {
                id,
                title: format!("{name} missing"),
                severity: sev,
                detail: format!("Response has no {name} header"),
                recommendation: rec,
            }),
        };
    if https {
        check(
            "hsts",
            "Strict-Transport-Security",
            "medium",
            "Add `Strict-Transport-Security: max-age=31536000; includeSubDomains`",
            header(&main, "strict-transport-security"),
        );
    }
    check(
        "csp",
        "Content-Security-Policy",
        "medium",
        "Define a Content-Security-Policy to limit script sources (mitigates XSS)",
        header(&main, "content-security-policy"),
    );
    let frame = header(&main, "x-frame-options").or_else(|| {
        header(&main, "content-security-policy").filter(|c| c.contains("frame-ancestors"))
    });
    check(
        "clickjacking",
        "X-Frame-Options / frame-ancestors",
        "low",
        "Send `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`",
        frame,
    );
    check(
        "nosniff",
        "X-Content-Type-Options",
        "low",
        "Send `X-Content-Type-Options: nosniff`",
        header(&main, "x-content-type-options"),
    );
    check(
        "referrer",
        "Referrer-Policy",
        "low",
        "Send `Referrer-Policy: strict-origin-when-cross-origin`",
        header(&main, "referrer-policy"),
    );
    check(
        "permissions",
        "Permissions-Policy",
        "info",
        "Restrict browser features with Permissions-Policy",
        header(&main, "permissions-policy"),
    );

    if !https {
        f.push(Finding {
            id: "tls",
            title: "Site served over plain HTTP".into(),
            severity: "high",
            detail: format!("Final URL {} is not HTTPS", main.url),
            recommendation: "Serve all traffic over HTTPS and redirect HTTP to HTTPS",
        });
    } else if let Some(host) = url::Url::parse(&main.url)
        .ok()
        .and_then(|u| u.host_str().map(String::from))
    {
        if let Ok(r) = execute(
            spec("GET", &format!("http://{host}/"), vec![], false),
            allow_private,
        )
        .await
        {
            let loc = header(&r, "location").unwrap_or("");
            if r.status >= 300 && r.status < 400 && loc.starts_with("https://") {
                f.push(Finding {
                    id: "https-redirect",
                    title: "HTTP redirects to HTTPS".into(),
                    severity: "pass",
                    detail: format!("{} -> {loc}", r.status),
                    recommendation: "Keep the redirect (301/308)",
                });
            } else {
                f.push(Finding {
                    id: "https-redirect",
                    title: "HTTP does not redirect to HTTPS".into(),
                    severity: "medium",
                    detail: format!("http://{host}/ returned {}", r.status),
                    recommendation: "Redirect all HTTP requests to HTTPS with 301/308",
                });
            }
        }
    }

    for (name, id) in [
        ("server", "server-banner"),
        ("x-powered-by", "powered-by"),
        ("x-aspnet-version", "aspnet-version"),
    ] {
        if let Some(v) = header(&main, name) {
            let versioned = v.chars().any(|c| c.is_ascii_digit());
            f.push(Finding {
                id,
                title: format!("{name} header discloses technology"),
                severity: if versioned { "low" } else { "info" },
                detail: v.to_string(),
                recommendation: "Remove or genericize technology/version headers",
            });
        }
    }

    for c in all_headers(&main, "set-cookie") {
        let lc = c.to_lowercase();
        let name = c.split('=').next().unwrap_or("cookie").to_string();
        let mut missing = vec![];
        if https && !lc.contains("secure") {
            missing.push("Secure");
        }
        if !lc.contains("httponly") {
            missing.push("HttpOnly");
        }
        if !lc.contains("samesite") {
            missing.push("SameSite");
        }
        if missing.is_empty() {
            f.push(Finding {
                id: "cookie",
                title: format!("Cookie `{name}` has secure flags"),
                severity: "pass",
                detail: String::new(),
                recommendation: "",
            });
        } else {
            f.push(Finding {
                id: "cookie",
                title: format!("Cookie `{name}` missing {}", missing.join(", ")),
                severity: "low",
                detail: c.chars().take(160).collect(),
                recommendation: "Set Secure, HttpOnly and SameSite on session cookies",
            });
        }
    }

    let origin = vec![KeyValue {
        key: "Origin".into(),
        value: "https://slyshark-cors-probe.example".into(),
        enabled: true,
    }];
    if let Ok(r) = execute(spec("GET", &main.url, origin, false), allow_private).await {
        let acao = header(&r, "access-control-allow-origin").unwrap_or("");
        let creds = header(&r, "access-control-allow-credentials").unwrap_or("") == "true";
        if acao.contains("slyshark-cors-probe") {
            f.push(Finding {
                id: "cors",
                title: "CORS reflects arbitrary Origin".into(),
                severity: if creds { "high" } else { "medium" },
                detail: format!("ACAO: {acao}, credentials: {creds}"),
                recommendation:
                    "Allow-list trusted origins only; never reflect Origin with credentials",
            });
        } else if acao == "*" {
            f.push(Finding {
                id: "cors",
                title: "CORS allows any origin (*)".into(),
                severity: "info",
                detail: "Fine for public, unauthenticated content".into(),
                recommendation: "Restrict origins if the endpoint returns user data",
            });
        }
    }

    if let Ok(r) = execute(spec("OPTIONS", &main.url, vec![], false), allow_private).await {
        let allow = header(&r, "allow")
            .or_else(|| header(&r, "access-control-allow-methods"))
            .unwrap_or("")
            .to_uppercase();
        let risky: Vec<&str> = ["TRACE", "PUT", "DELETE", "CONNECT"]
            .into_iter()
            .filter(|m| allow.contains(m))
            .collect();
        if !risky.is_empty() {
            f.push(Finding {
                id: "methods",
                title: format!("Risky methods advertised: {}", risky.join(", ")),
                severity: if risky.contains(&"TRACE") {
                    "medium"
                } else {
                    "low"
                },
                detail: format!("Allow: {allow}"),
                recommendation:
                    "Disable TRACE and expose write methods only on authenticated API routes",
            });
        }
    }

    if check_files {
        let base = url::Url::parse(&main.url)
            .map(|u| format!("{}://{}", u.scheme(), u.host_str().unwrap_or("")))
            .unwrap_or_default();
        let base = match url::Url::parse(&main.url).ok().and_then(|u| u.port()) {
            Some(p) => format!("{base}:{p}"),
            None => base,
        };
        let probes: [Probe; 6] = [
            (
                "/.git/HEAD",
                "high",
                |b| b.trim_start().starts_with("ref:"),
                "Block access to /.git; it exposes your source code",
            ),
            (
                "/.env",
                "high",
                |b| {
                    b.lines().any(|l| {
                        l.contains('=') && l.chars().next().is_some_and(|c| c.is_ascii_uppercase())
                    }) && !b.contains("<html")
                },
                "Move .env outside the web root and block dotfiles",
            ),
            (
                "/server-status",
                "medium",
                |b| b.contains("Apache Server Status"),
                "Restrict mod_status to localhost",
            ),
            (
                "/phpinfo.php",
                "medium",
                |b| b.contains("phpinfo()") || b.contains("PHP Version"),
                "Delete phpinfo files from production",
            ),
            (
                "/.DS_Store",
                "low",
                |b| b.contains("Bud1"),
                "Remove .DS_Store files from deployments",
            ),
            (
                "/.well-known/security.txt",
                "pass",
                |b| b.to_lowercase().contains("contact:"),
                "Publish a security.txt so researchers can reach you",
            ),
        ];
        for (path, sev, matcher, rec) in probes {
            if let Ok(r) = execute(
                spec("GET", &format!("{base}{path}"), vec![], false),
                allow_private,
            )
            .await
            {
                let hit = r.status == 200 && matcher(&r.body);
                if path.contains("security.txt") {
                    f.push(Finding {
                        id: "security-txt",
                        title: if hit {
                            "security.txt published".into()
                        } else {
                            "No security.txt".into()
                        },
                        severity: if hit { "pass" } else { "info" },
                        detail: path.into(),
                        recommendation: rec,
                    });
                } else if hit {
                    f.push(Finding {
                        id: "exposed-file",
                        title: format!("Sensitive file exposed: {path}"),
                        severity: sev,
                        detail: format!("{base}{path} returned 200 with matching content"),
                        recommendation: rec,
                    });
                }
            }
        }
    }

    let penalty: u32 = f
        .iter()
        .map(|x| match x.severity {
            "high" => 25,
            "medium" => 10,
            "low" => 4,
            _ => 0,
        })
        .sum();
    Ok(AuditReport {
        url,
        final_url: main.url.clone(),
        status: main.status,
        score: 100u32.saturating_sub(penalty) as u8,
        findings: f,
    })
}
