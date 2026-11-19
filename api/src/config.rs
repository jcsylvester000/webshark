//! Runtime configuration loaded from environment variables (see `.env.example`).
use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub bind_addr: String,
    pub web_origin: String,
    pub session_ttl_hours: i64,
    pub seed_test_user: bool,
    pub allow_private_targets: bool,
    pub max_scan_ports: usize,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let flag = |k: &str, d: bool| {
            env::var(k)
                .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"))
                .unwrap_or(d)
        };
        Ok(Self {
            database_url: env::var("DATABASE_URL").map_err(|_| {
                anyhow::anyhow!("DATABASE_URL is not set (use your Neon connection string)")
            })?,
            bind_addr: env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into()),
            web_origin: env::var("WEB_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".into()),
            session_ttl_hours: env::var("SESSION_TTL_HOURS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(168),
            seed_test_user: flag("SEED_TEST_USER", false),
            allow_private_targets: flag("ALLOW_PRIVATE_TARGETS", true),
            max_scan_ports: env::var("MAX_SCAN_PORTS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(2048),
        })
    }
}
