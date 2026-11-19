//! Postman-style HTTP client. Supports any method, headers, query params, JSON/text/form
//! bodies, Bearer/Basic/API-key auth, and a redirect chain that is followed manually so
//! every hop is checked against the target policy and pinned to its resolved IP.
use std::{
    net::SocketAddr,
    time::{Duration, Instant},
};

use base64::Engine;
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Method,
};
use serde::{Deserialize, Serialize};

use crate::{
    error::{AppError, AppResult},
    tools::{extract_host, resolve},
};

const MAX_BODY: usize = 2 * 1024 * 1024;

#[derive(Deserialize, Serialize, Clone, Default)]
pub struct KeyValue {
    pub key: String,
    pub value: String,
    #[serde(default = "yes")]
    pub enabled: bool,
}
fn yes() -> bool {
    true
}

#[derive(Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "lowercase", tag = "type")]
pub enum Auth {
    #[default]
    None,
    Bearer {
        token: String,
    },
    Basic {
        username: String,
        password: String,
    },
    Apikey {
        key: String,
        value: String,
        #[serde(default)]
        in_query: bool,
    },
}

#[derive(Deserialize, Serialize, Clone, Default)]
pub struct Body {
    /// none | json | text | xml | urlencoded | form
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub raw: String,
    #[serde(default)]
    pub fields: Vec<KeyValue>,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct HttpRequestSpec {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<KeyValue>,
    #[serde(default)]
    pub params: Vec<KeyValue>,
    #[serde(default)]
    pub auth: Auth,
    #[serde(default)]
    pub body: Body,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
    #[serde(default = "yes")]
    pub follow_redirects: bool,
}
fn default_timeout() -> u64 {
    30_000
}

#[derive(Serialize)]
pub struct Hop {
    pub url: String,
    pub status: u16,
    pub location: Option<String>,
}

#[derive(Serialize)]
pub struct HttpResponseOut {
    pub status: u16,
    pub status_text: String,
    pub http_version: String,
    pub url: String,
    pub remote_addr: String,
    pub headers: Vec<KeyValue>,
    pub body: String,
    pub body_base64: Option<String>,
    pub is_binary: bool,
    pub truncated: bool,
    pub size_bytes: usize,
    pub time_ms: f64,
    pub redirects: Vec<Hop>,
}

pub async fn execute(spec: HttpRequestSpec, allow_private: bool) -> AppResult<HttpResponseOut> {
    let method = Method::from_bytes(spec.method.trim().to_uppercase().as_bytes())
        .map_err(|_| AppError::bad("Invalid HTTP method"))?;
    let mut url = url::Url::parse(spec.url.trim())
        .map_err(|_| AppError::bad("Invalid URL (include http:// or https://)"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(AppError::bad("Only http and https URLs are supported"));
    }
    {
        let mut q = url.query_pairs_mut();
        for p in spec
            .params
            .iter()
            .filter(|p| p.enabled && !p.key.is_empty())
        {
            q.append_pair(&p.key, &p.value);
        }
        if let Auth::Apikey {
            key,
            value,
            in_query: true,
        } = &spec.auth
        {
            q.append_pair(key, value);
        }
    }
    if url.query() == Some("") {
        url.set_query(None);
    }

    let mut headers = HeaderMap::new();
    headers.insert(
        "user-agent",
        HeaderValue::from_static("Slyshark/0.1 (+api-client)"),
    );
    for h in spec
        .headers
        .iter()
        .filter(|h| h.enabled && !h.key.trim().is_empty())
    {
        let name = HeaderName::from_bytes(h.key.trim().as_bytes())
            .map_err(|_| AppError::bad(format!("Invalid header name: {}", h.key)))?;
        let val = HeaderValue::from_str(&h.value)
            .map_err(|_| AppError::bad(format!("Invalid header value for {}", h.key)))?;
        headers.insert(name, val);
    }
    match &spec.auth {
        Auth::Bearer { token } if !token.is_empty() => {
            headers.insert(
                "authorization",
                HeaderValue::from_str(&format!("Bearer {}", token.trim()))
                    .map_err(|_| AppError::bad("Invalid token"))?,
            );
        }
        Auth::Basic { username, password } => {
            let enc =
                base64::engine::general_purpose::STANDARD.encode(format!("{username}:{password}"));
            headers.insert(
                "authorization",
                HeaderValue::from_str(&format!("Basic {enc}"))
                    .map_err(|_| AppError::bad("Invalid credentials"))?,
            );
        }
        Auth::Apikey {
            key,
            value,
            in_query: false,
        } if !key.is_empty() => {
            let name = HeaderName::from_bytes(key.as_bytes())
                .map_err(|_| AppError::bad("Invalid API key header name"))?;
            headers.insert(
                name,
                HeaderValue::from_str(value).map_err(|_| AppError::bad("Invalid API key value"))?,
            );
        }
        _ => {}
    }

    let timeout = Duration::from_millis(spec.timeout_ms.clamp(1_000, 120_000));
    let started = Instant::now();
    let mut redirects = Vec::new();
    let mut current = url;
    let mut method_now = method;
    let mut send_body = true;

    for _ in 0..10 {
        let host = extract_host(current.as_str())?;
        let ips = resolve(&host, allow_private).await?;
        let port = current.port_or_known_default().unwrap_or(80);
        let pinned = SocketAddr::new(ips[0], port);
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .resolve(&host, pinned)
            .timeout(timeout)
            .build()
            .map_err(|e| anyhow::anyhow!(e))?;
        let mut rb = client
            .request(method_now.clone(), current.clone())
            .headers(headers.clone());
        if send_body {
            rb = apply_body(rb, &spec.body);
        }
        let resp = rb
            .send()
            .await
            .map_err(|e| AppError::bad(format!("Request failed: {}", describe(&e))))?;
        let status = resp.status();
        let location = resp
            .headers()
            .get("location")
            .and_then(|v| v.to_str().ok())
            .map(String::from);
        if spec.follow_redirects && status.is_redirection() {
            if let Some(loc) = &location {
                redirects.push(Hop {
                    url: current.to_string(),
                    status: status.as_u16(),
                    location: Some(loc.clone()),
                });
                current = current
                    .join(loc)
                    .map_err(|_| AppError::bad("Invalid redirect Location"))?;
                if matches!(status.as_u16(), 301..=303)
                    && method_now != Method::GET
                    && method_now != Method::HEAD
                {
                    method_now = Method::GET;
                    send_body = false;
                }
                continue;
            }
        }
        return read_response(resp, pinned, started, redirects).await;
    }
    Err(AppError::bad("Too many redirects (10)"))
}

fn apply_body(rb: reqwest::RequestBuilder, body: &Body) -> reqwest::RequestBuilder {
    let enabled = || {
        body.fields
            .iter()
            .filter(|f| f.enabled && !f.key.is_empty())
            .map(|f| (f.key.clone(), f.value.clone()))
    };
    match body.mode.as_str() {
        "json" => rb
            .header("content-type", "application/json")
            .body(body.raw.clone()),
        "xml" => rb
            .header("content-type", "application/xml")
            .body(body.raw.clone()),
        "text" => rb
            .header("content-type", "text/plain")
            .body(body.raw.clone()),
        "urlencoded" => rb.form(&enabled().collect::<Vec<_>>()),
        "form" => {
            let mut form = reqwest::multipart::Form::new();
            for (k, v) in enabled() {
                form = form.text(k, v);
            }
            rb.multipart(form)
        }
        _ => rb,
    }
}

async fn read_response(
    resp: reqwest::Response,
    addr: SocketAddr,
    started: Instant,
    redirects: Vec<Hop>,
) -> AppResult<HttpResponseOut> {
    let status = resp.status();
    let version = format!("{:?}", resp.version());
    let final_url = resp.url().to_string();
    let headers: Vec<KeyValue> = resp
        .headers()
        .iter()
        .map(|(k, v)| KeyValue {
            key: k.to_string(),
            value: String::from_utf8_lossy(v.as_bytes()).to_string(),
            enabled: true,
        })
        .collect();
    let ctype = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::bad(format!("Reading body failed: {e}")))?;
    let elapsed = (started.elapsed().as_secs_f64() * 100_000.0).round() / 100.0;
    let size = bytes.len();
    let truncated = size > MAX_BODY;
    let slice = &bytes[..size.min(MAX_BODY)];
    let textual = ctype.is_empty()
        || [
            "text",
            "json",
            "xml",
            "javascript",
            "html",
            "csv",
            "x-www-form-urlencoded",
            "graphql",
        ]
        .iter()
        .any(|t| ctype.contains(t));
    let is_binary = !textual && std::str::from_utf8(slice).is_err();
    Ok(HttpResponseOut {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        http_version: version,
        url: final_url,
        remote_addr: addr.to_string(),
        headers,
        body: if is_binary {
            String::new()
        } else {
            String::from_utf8_lossy(slice).to_string()
        },
        body_base64: if is_binary {
            Some(
                base64::engine::general_purpose::STANDARD
                    .encode(&slice[..slice.len().min(256 * 1024)]),
            )
        } else {
            None
        },
        is_binary,
        truncated,
        size_bytes: size,
        time_ms: elapsed,
        redirects,
    })
}

fn describe(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        return "timed out".into();
    }
    if e.is_connect() {
        return format!("could not connect ({e})");
    }
    e.to_string()
}
