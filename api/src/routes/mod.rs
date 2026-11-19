//! Route table. Read endpoints use GET; write endpoints use POST/PUT/DELETE (CQRS split).
pub mod auth;
pub mod captures;
pub mod environments;
pub mod requests;
pub mod tools;

use axum::{
    routing::{get, post, put},
    Json, Router,
};
use serde_json::json;

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/health",
            get(|| async { Json(json!({ "status": "ok", "service": "slyshark-api" })) }),
        )
        // Auth
        .route("/auth/register", post(auth::register))
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/auth/me", get(auth::me))
        .route("/settings", get(auth::get_settings).put(auth::put_settings))
        // Environments (canvas designs)
        .route(
            "/environments",
            get(environments::list).post(environments::create),
        )
        .route(
            "/environments/{id}",
            get(environments::get_one)
                .put(environments::update)
                .delete(environments::delete),
        )
        // Postman-style saved requests
        .route("/requests", get(requests::list).post(requests::create))
        .route(
            "/requests/{id}",
            put(requests::update).delete(requests::delete),
        )
        // Network / security tools
        .route("/tools/ping", post(tools::ping))
        .route("/tools/dns", post(tools::dns))
        .route("/tools/portscan", post(tools::portscan))
        .route("/tools/http", post(tools::http))
        .route("/tools/audit", post(tools::audit))
        .route("/tools/logs", get(tools::logs))
        // Capture analysis (Wireshark-style)
        .route("/captures", post(captures::load))
        .route("/captures/{id}", axum::routing::delete(captures::discard))
        .route("/captures/{id}/frames/{no}", get(captures::frame))
        .route("/captures/{id}/follow/{stream}", get(captures::follow))
}
