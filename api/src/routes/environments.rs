//! Environment (canvas) CRUD. Reads come from the `environment_summaries` view;
//! writes go to the `environments` table. Every query is scoped to the owner.
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
pub struct EnvSummary {
    id: Uuid,
    name: String,
    description: String,
    template: Option<String>,
    node_count: Option<i32>,
    edge_count: Option<i32>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct EnvFull {
    id: Uuid,
    name: String,
    description: String,
    template: Option<String>,
    canvas: Value,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct EnvInput {
    name: Option<String>,
    description: Option<String>,
    template: Option<String>,
    canvas: Option<Value>,
}

fn check_canvas(c: &Value) -> AppResult<()> {
    if !c.get("nodes").map(|n| n.is_array()).unwrap_or(false)
        || !c.get("edges").map(|e| e.is_array()).unwrap_or(false)
    {
        return Err(AppError::bad(
            "canvas must contain 'nodes' and 'edges' arrays",
        ));
    }
    if c.to_string().len() > 5 * 1024 * 1024 {
        return Err(AppError::bad("canvas is larger than 5 MB"));
    }
    Ok(())
}

pub async fn list(State(st): State<AppState>, user: AuthUser) -> AppResult<Json<Vec<EnvSummary>>> {
    let rows = sqlx::query_as::<_, EnvSummary>(
        "SELECT id, name, description, template, node_count, edge_count, created_at, updated_at
         FROM environment_summaries WHERE owner_id = $1 ORDER BY updated_at DESC",
    )
    .bind(user.id)
    .fetch_all(&st.db)
    .await?;
    Ok(Json(rows))
}

pub async fn get_one(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<EnvFull>> {
    sqlx::query_as::<_, EnvFull>(
        "SELECT id, name, description, template, canvas, created_at, updated_at FROM environments WHERE id = $1 AND owner_id = $2",
    )
    .bind(id).bind(user.id).fetch_optional(&st.db).await?
    .map(Json).ok_or(AppError::NotFound)
}

pub async fn create(
    State(st): State<AppState>,
    user: AuthUser,
    Json(b): Json<EnvInput>,
) -> AppResult<Json<EnvFull>> {
    let name = b.name.unwrap_or_default().trim().to_string();
    if name.is_empty() || name.len() > 120 {
        return Err(AppError::bad("Name is required (max 120 characters)"));
    }
    let canvas = b
        .canvas
        .unwrap_or_else(|| json!({ "nodes": [], "edges": [] }));
    check_canvas(&canvas)?;
    let row = sqlx::query_as::<_, EnvFull>(
        "INSERT INTO environments (owner_id, name, description, template, canvas) VALUES ($1,$2,$3,$4,$5)
         RETURNING id, name, description, template, canvas, created_at, updated_at",
    )
    .bind(user.id).bind(name).bind(b.description.unwrap_or_default()).bind(b.template).bind(canvas)
    .fetch_one(&st.db).await?;
    Ok(Json(row))
}

pub async fn update(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(b): Json<EnvInput>,
) -> AppResult<Json<EnvFull>> {
    if let Some(c) = &b.canvas {
        check_canvas(c)?;
    }
    sqlx::query_as::<_, EnvFull>(
        "UPDATE environments SET
            name = COALESCE($3, name), description = COALESCE($4, description),
            template = COALESCE($5, template), canvas = COALESCE($6, canvas), updated_at = now()
         WHERE id = $1 AND owner_id = $2
         RETURNING id, name, description, template, canvas, created_at, updated_at",
    )
    .bind(id)
    .bind(user.id)
    .bind(b.name.map(|n| n.trim().to_string()))
    .bind(b.description)
    .bind(b.template)
    .bind(b.canvas)
    .fetch_optional(&st.db)
    .await?
    .map(Json)
    .ok_or(AppError::NotFound)
}

pub async fn delete(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    let r = sqlx::query("DELETE FROM environments WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(user.id)
        .execute(&st.db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(json!({ "ok": true })))
}
