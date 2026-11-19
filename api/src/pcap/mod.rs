//! Capture analysis: file reading (`reader`), protocol dissection (`dissect`), and the
//! in-memory capture store that backs the sharkd-style load/frames/frame/follow API.
pub mod dissect;
pub mod reader;

use std::{collections::HashMap, sync::Arc, time::Instant};

use tokio::sync::Mutex;
use uuid::Uuid;

pub struct LoadedCapture {
    pub owner: Uuid,
    pub name: String,
    pub loaded_at: Instant,
    pub packets: Vec<reader::RawPacket>,
    pub summaries: Vec<dissect::Summary>,
    pub dissector: dissect::Dissector,
    pub first_ts: f64,
}

pub type CaptureStore = Arc<Mutex<HashMap<Uuid, LoadedCapture>>>;
