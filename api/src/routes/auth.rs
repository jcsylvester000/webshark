//! Registration, login, logout, current user, and per-user settings.
use axum::{extract::State, http::HeaderMap, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    auth::{hash_password, hash_token, new_token, verify_password, AuthUser},
    error::{AppError, AppResult},
    AppState,
};

#[derive(Deserialize)]
pub struct RegisterBody {
    pub username: String,
    pub email: String,
    pub password: String,
    pub display_name: Option<String>,
}

#[derive(Deserialize)]
pub struct LoginBody {
    /// Username or email.
    pub identifier: String,
    pub password: String,
}

fn valid_username(u: &str) -> bool {
    (3..=32).contains(&u.len())
        && u.chars()
            .all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c))
}

fn valid_email(e: &str) -> bool {
    let parts: Vec<&str> = e.split('@').collect();
    parts.len() == 2 && !parts[0].is_empty() && parts[1].contains('.') && e.len() <= 254
}

pub async fn register(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(b): Json<RegisterBody>,
) -> AppResult<Json<Value>> {
    let username = b.username.trim().to_lowercase();
    let email = b.email.trim().to_lowercase();
    if !valid_username(&username) {
        return Err(AppError::bad(
            "Username must be 3-32 characters: letters, numbers, _ . -",
        ));
    }
    if !valid_email(&email) {
        return Err(AppError::bad("Enter a valid email address"));
    }
    if b.password.len() < 8 {
        return Err(AppError::bad("Password must be at least 8 characters"));
    }
    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM users WHERE username = $1 OR email = $2")
            .bind(&username)
            .bind(&email)
            .fetch_optional(&st.db)
            .await?;
    if exists.is_some() {
        return Err(AppError::Conflict(
            "That username or email is already registered".into(),
        ));
    }
    let hash = hash_password(&b.password)?;
    let (id,): (Uuid,) = sqlx::query_as(
        "INSERT INTO users (username, email, display_name, password_hash) VALUES ($1,$2,$3,$4) RETURNING id",
    )
    .bind(&username).bind(&email).bind(b.display_name.filter(|d| !d.trim().is_empty())).bind(hash)
    .fetch_one(&st.db).await?;
    issue_session(&st, id, &headers).await
}

pub async fn login(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(b): Json<LoginBody>,
) -> AppResult<Json<Value>> {
    let ident = b.identifier.trim().to_lowercase();
    let row: Option<(Uuid, String)> =
        sqlx::query_as("SELECT id, password_hash FROM users WHERE username = $1 OR email = $1")
            .bind(&ident)
            .fetch_optional(&st.db)
            .await?;
    // Same error for unknown user and wrong password to avoid account enumeration.
    let (id, hash) = row.ok_or_else(|| AppError::bad("Invalid username/email or password"))?;
    if !verify_password(&b.password, &hash) {
        return Err(AppError::bad("Invalid username/email or password"));
    }
    sqlx::query("UPDATE users SET last_login_at = now() WHERE id = $1")
        .bind(id)
        .execute(&st.db)
        .await?;
    issue_session(&st, id, &headers).await
}

async fn issue_session(
    st: &AppState,
    user_id: Uuid,
    headers: &HeaderMap,
) -> AppResult<Json<Value>> {
    let token = new_token();
    let ua = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.chars().take(255).collect::<String>());
    let ttl = st.config.session_ttl_hours;
    sqlx::query(
        "INSERT INTO sessions (user_id, token_hash, user_agent, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(hours => $4::int))",
    )
    .bind(user_id)
    .bind(hash_token(&token))
    .bind(ua)
    .bind(ttl as i32)
    .execute(&st.db)
    .await?;
    // Housekeeping: drop this user's expired sessions.
    sqlx::query("DELETE FROM sessions WHERE user_id = $1 AND expires_at < now()")
        .bind(user_id)
        .execute(&st.db)
        .await?;
    let user = user_json(st, user_id).await?;
    Ok(Json(
        json!({ "token": token, "expires_in_hours": ttl, "user": user }),
    ))
}

async fn user_json(st: &AppState, id: Uuid) -> AppResult<Value> {
    let (username, email, display_name, role, created_at): (
        String,
        String,
        Option<String>,
        String,
        chrono::DateTime<chrono::Utc>,
    ) = sqlx::query_as(
        "SELECT username, email, display_name, role, created_at FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&st.db)
    .await?;
    Ok(
        json!({ "id": id, "username": username, "email": email, "display_name": display_name, "role": role, "created_at": created_at }),
    )
}

pub async fn logout(State(st): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    if let Some(token) = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
    {
        sqlx::query("DELETE FROM sessions WHERE token_hash = $1")
            .bind(hash_token(token.trim()))
            .execute(&st.db)
            .await?;
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn me(State(st): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    Ok(Json(user_json(&st, user.id).await?))
}

pub async fn get_settings(State(st): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let row: Option<(Value,)> =
        sqlx::query_as("SELECT settings FROM user_settings WHERE user_id = $1")
            .bind(user.id)
            .fetch_optional(&st.db)
            .await?;
    Ok(Json(row.map(|r| r.0).unwrap_or_else(|| json!({}))))
}

pub async fn put_settings(
    State(st): State<AppState>,
    user: AuthUser,
    Json(settings): Json<Value>,
) -> AppResult<Json<Value>> {
    if !settings.is_object() {
        return Err(AppError::bad("Settings must be a JSON object"));
    }
    sqlx::query(
        "INSERT INTO user_settings (user_id, settings, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()",
    )
    .bind(user.id)
    .bind(&settings)
    .execute(&st.db)
    .await?;
    Ok(Json(settings))
}

/// Creates or resets the development account `testuser` / `password123`.
/// Enabled only when `SEED_TEST_USER=true`; turn it off in production.
pub async fn seed_test_user(db: &sqlx::PgPool) -> anyhow::Result<()> {
    let hash = hash_password("password123")?;
    sqlx::query(
        "INSERT INTO users (username, email, display_name, password_hash, role)
         VALUES ('testuser', 'testuser@slyshark.local', 'Test User', $1, 'admin')
         ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash",
    )
    .bind(hash)
    .execute(db)
    .await?;
    tracing::warn!(
        "SEED_TEST_USER is on: account testuser / password123 is active (development only)"
    );
    Ok(())
}
