//! Password hashing (Argon2id), opaque session tokens, and the `AuthUser` extractor.
//! Tokens are random 32-byte values; only their SHA-256 hash is stored in `sessions`.
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{extract::FromRequestParts, http::request::Parts};
use rand::RngCore;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{error::AppError, AppState};

pub fn hash_password(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| anyhow::anyhow!("hash failed: {e}"))
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or(false)
}

pub fn new_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

pub fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

/// The authenticated caller, resolved from `Authorization: Bearer <token>`.
#[derive(Clone, Debug)]
#[allow(dead_code)] // username/role are available to handlers for future role checks
pub struct AuthUser {
    pub id: Uuid,
    pub username: String,
    pub role: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Unauthorized)?;
        let token = header
            .strip_prefix("Bearer ")
            .ok_or(AppError::Unauthorized)?
            .trim();
        if token.is_empty() {
            return Err(AppError::Unauthorized);
        }
        let row: Option<(Uuid, String, String)> = sqlx::query_as(
            "SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = $1 AND s.expires_at > now()",
        )
        .bind(hash_token(token))
        .fetch_optional(&state.db)
        .await?;
        let (id, username, role) = row.ok_or(AppError::Unauthorized)?;
        Ok(AuthUser { id, username, role })
    }
}
