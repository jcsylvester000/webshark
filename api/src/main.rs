//! Slyshark API entry point.
//! Boots config, connects to Neon Postgres, runs migrations, optionally seeds the
//! test user, and serves the REST API consumed by the Next.js web app.
mod auth;
mod config;
mod error;
mod pcap;
mod routes;
mod tools;

use std::sync::Arc;

use axum::{extract::DefaultBodyLimit, http::HeaderValue, Router};
use sqlx::postgres::PgPoolOptions;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub config: Arc<config::Config>,
    pub captures: pcap::CaptureStore,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "slyshark_api=info,tower_http=info".into()),
        )
        .init();

    let config = config::Config::from_env()?;
    let db = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(std::time::Duration::from_secs(15))
        .connect(&config.database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&db).await?;

    if config.seed_test_user {
        routes::auth::seed_test_user(&db).await?;
    }

    let state = AppState {
        db,
        config: Arc::new(config.clone()),
        captures: Default::default(),
    };

    let cors = CorsLayer::new()
        .allow_origin(config.web_origin.parse::<HeaderValue>()?)
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    let app = Router::new()
        .merge(routes::router())
        .layer(DefaultBodyLimit::max(60 * 1024 * 1024))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
    tracing::info!("Slyshark API listening on http://{}", config.bind_addr);
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;
    Ok(())
}
