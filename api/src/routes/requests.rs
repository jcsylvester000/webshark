//! Saved HTTP requests (Postman-style collections).
use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{AppError, AppResult},
    AppState,
};

#[derive(Serialize, sqlx::FromRow)]
pub struct SavedRequest {
    id: Uuid,
    collection: String,
    name: String,
    request: Value,
    updated_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct SavedInput {
    collection: Option<String>,
    name: Option<String>,
    request: Option<Value>,
}

pub async fn list(
    State(st): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<SavedRequest>>> {
    let rows = sqlx::query_as::<_, SavedRequest>(
        "SELECT id, collection, name, request, updated_at FROM saved_requests WHERE owner_id = $1 ORDER BY collection, name",
    )
    .bind(user.id).fetch_all(&st.db).await?;
    Ok(Json(rows))
}

pub async fn create(
    State(st): State<AppState>,
    user: AuthUser,
    Json(b): Json<SavedInput>,
) -> AppResult<Json<SavedRequest>> {
    let name = b.name.unwrap_or_default().trim().to_string();
    let request = b
        .request
        .ok_or_else(|| AppError::bad("request is required"))?;
    if name.is_empty() {
        return Err(AppError::bad("name is required"));
    }
    let row = sqlx::query_as::<_, SavedRequest>(
        "INSERT INTO saved_requests (owner_id, collection, name, request) VALUES ($1,$2,$3,$4)
         RETURNING id, collection, name, request, updated_at",
    )
    .bind(user.id)
    .bind(b.collection.unwrap_or_else(|| "Default".into()))
    .bind(name)
    .bind(request)
    .fetch_one(&st.db)
    .await?;
    Ok(Json(row))
}

pub async fn update(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(b): Json<SavedInput>,
) -> AppResult<Json<SavedRequest>> {
    sqlx::query_as::<_, SavedRequest>(
        "UPDATE saved_requests SET collection = COALESCE($3, collection), name = COALESCE($4, name),
            request = COALESCE($5, request), updated_at = now()
         WHERE id = $1 AND owner_id = $2 RETURNING id, collection, name, request, updated_at",
    )
    .bind(id).bind(user.id).bind(b.collection).bind(b.name).bind(b.request)
    .fetch_optional(&st.db).await?
    .map(Json).ok_or(AppError::NotFound)
}

pub async fn delete(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    let r = sqlx::query("DELETE FROM saved_requests WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(user.id)
        .execute(&st.db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(json!({ "ok": true })))
}
