//! Source RCON protocol client — used by the admin console viewer to
//! control a Minecraft server remotely.
//!
//! The Source RCON protocol is a simple TCP packet format:
//!   ```
//!   [4 bytes: size] [4 bytes: id] [4 bytes: type] [body bytes] [0x00 0x00]
//!   ```
//! where `size` covers the id + type + body + the two trailing nulls
//! (i.e. total packet length minus the size field itself).
//!
//! Packet types:
//!   - SERVERDATA_AUTH                = 3 (request from client)
//!   - SERVERDATA_AUTH_RESPONSE       = 2 (response from server)
//!   - SERVERDATA_EXECCOMMAND         = 2 (request from client)
//!   - SERVERDATA_RESPONSE_VALUE      = 0 (response from server)
//!
//! See: https://developer.valvesoftware.com/wiki/Source_RCON_Protocol
//!
//! Tauri commands exposed:
//!   - `rcon_connect` : open TCP, authenticate, return a session id
//!   - `rcon_send`    : send a command on an active session, return response
//!   - `rcon_close`   : close a session
//!
//! Sessions are tracked in a process-wide HashMap keyed by id; we reuse a
//! single TcpStream per session so subsequent commands re-use the auth.

use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use tauri::State;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex as TokioMutex;
use tokio::time::{timeout, Duration};

const PACKET_AUTH: i32 = 3;
const PACKET_EXEC: i32 = 2;
const PACKET_RESPONSE_VALUE: i32 = 0;
const READ_TIMEOUT_MS: u64 = 8_000;

/// Represents one active RCON connection. Wrapped in a Mutex so we can
/// have multiple concurrent calls await on the lock instead of stepping on
/// each other's bytes (RCON streams are fragile to interleaved sends).
struct RconSession {
    stream: TokioMutex<TcpStream>,
    /// Auto-incrementing packet id — server echoes it back so we can match
    /// requests with responses.
    next_id: TokioMutex<i32>,
}

/// Process-wide registry of open sessions. We never expose the raw socket
/// to the frontend — only the opaque session id (a UUID-ish string).
pub struct RconRegistry {
    sessions: TokioMutex<HashMap<String, Arc<RconSession>>>,
}

impl RconRegistry {
    pub fn new() -> Self {
        Self {
            sessions: TokioMutex::new(HashMap::new()),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct RconResponse {
    pub body: String,
}

#[tauri::command]
pub async fn rcon_connect(
    registry: State<'_, RconRegistry>,
    host: String,
    port: u16,
    password: String,
) -> Result<String, String> {
    if host.trim().is_empty() {
        return Err("Adresse RCON manquante.".into());
    }
    if password.is_empty() {
        return Err("Mot de passe RCON manquant.".into());
    }
    let addr = format!("{}:{}", host, port);
    let mut stream = timeout(Duration::from_millis(READ_TIMEOUT_MS), TcpStream::connect(&addr))
        .await
        .map_err(|_| format!("Timeout connexion RCON vers {}", addr))?
        .map_err(|e| format!("Connexion RCON vers {} : {}", addr, e))?;
    // disable Nagle so command/response round-trips don't accumulate
    let _ = stream.set_nodelay(true);

    // Authentification
    let auth_id = 1;
    write_packet(&mut stream, auth_id, PACKET_AUTH, password.as_bytes())
        .await
        .map_err(|e| format!("write auth: {}", e))?;
    // The server replies with two packets: a RESPONSE_VALUE (often empty)
    // then an AUTH_RESPONSE. Some servers send only the AUTH_RESPONSE — we
    // accept either by looping until we see the AUTH_RESPONSE id.
    let mut auth_ok = false;
    for _ in 0..3 {
        let (id, _packet_type, _body) = read_packet(&mut stream)
            .await
            .map_err(|e| format!("read auth: {}", e))?;
        if id == -1 {
            return Err("RCON : mot de passe refusé.".into());
        }
        if id == auth_id {
            auth_ok = true;
            break;
        }
    }
    if !auth_ok {
        return Err("RCON : authentification incomplète, aucun ack reçu.".into());
    }

    let session_id = format!("rcon-{}", crate::rcon::now_ms());
    let session = Arc::new(RconSession {
        stream: TokioMutex::new(stream),
        next_id: TokioMutex::new(2),
    });
    registry.sessions.lock().await.insert(session_id.clone(), session);
    Ok(session_id)
}

#[tauri::command]
pub async fn rcon_send(
    registry: State<'_, RconRegistry>,
    session_id: String,
    command: String,
) -> Result<RconResponse, String> {
    let session = {
        let sessions = registry.sessions.lock().await;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| "Session RCON introuvable. Reconnecte-toi.".to_string())?
    };

    let packet_id = {
        let mut id = session.next_id.lock().await;
        let v = *id;
        *id = id.wrapping_add(1);
        v
    };

    let mut stream = session.stream.lock().await;
    write_packet(&mut stream, packet_id, PACKET_EXEC, command.as_bytes())
        .await
        .map_err(|e| format!("write exec: {}", e))?;

    // Some long responses are split across multiple RESPONSE_VALUE packets.
    // The reliable trick: send a sentinel empty exec packet right after,
    // and read packets until we see the sentinel echoed back. The server
    // returns responses in order, so anything before the sentinel is our
    // command's output.
    let sentinel_id = packet_id.wrapping_add(10_000);
    write_packet(&mut stream, sentinel_id, PACKET_EXEC, b"")
        .await
        .map_err(|e| format!("write sentinel: {}", e))?;

    let mut combined = String::new();
    loop {
        let (id, ptype, body) = timeout(Duration::from_millis(READ_TIMEOUT_MS), read_packet(&mut stream))
            .await
            .map_err(|_| "Timeout lecture réponse RCON".to_string())?
            .map_err(|e| format!("read response: {}", e))?;
        if ptype != PACKET_RESPONSE_VALUE {
            // Unexpected packet — log + skip
            continue;
        }
        if id == sentinel_id {
            break;
        }
        combined.push_str(&String::from_utf8_lossy(&body));
    }
    Ok(RconResponse { body: combined })
}

#[tauri::command]
pub async fn rcon_close(
    registry: State<'_, RconRegistry>,
    session_id: String,
) -> Result<(), String> {
    let session = registry.sessions.lock().await.remove(&session_id);
    if let Some(s) = session {
        let mut stream = s.stream.lock().await;
        let _ = stream.shutdown().await;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
//                              PACKET I/O
// ---------------------------------------------------------------------------

async fn write_packet(
    stream: &mut TcpStream,
    id: i32,
    packet_type: i32,
    body: &[u8],
) -> std::io::Result<()> {
    // size = 4 (id) + 4 (type) + body.len() + 2 (two trailing nulls)
    let size = (4 + 4 + body.len() + 2) as i32;
    let mut buf = Vec::with_capacity(4 + size as usize);
    buf.extend_from_slice(&size.to_le_bytes());
    buf.extend_from_slice(&id.to_le_bytes());
    buf.extend_from_slice(&packet_type.to_le_bytes());
    buf.extend_from_slice(body);
    buf.push(0); // null after body
    buf.push(0); // packet terminator
    stream.write_all(&buf).await?;
    stream.flush().await
}

async fn read_packet(stream: &mut TcpStream) -> std::io::Result<(i32, i32, Vec<u8>)> {
    // Read the size header first
    let mut size_buf = [0u8; 4];
    stream.read_exact(&mut size_buf).await?;
    let size = i32::from_le_bytes(size_buf);
    if !(10..=4096 + 14).contains(&size) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("RCON packet size out of range: {}", size),
        ));
    }
    // Then `size` bytes of payload
    let mut payload = vec![0u8; size as usize];
    stream.read_exact(&mut payload).await?;
    if payload.len() < 10 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "RCON packet too short",
        ));
    }
    let id = i32::from_le_bytes([payload[0], payload[1], payload[2], payload[3]]);
    let ptype = i32::from_le_bytes([payload[4], payload[5], payload[6], payload[7]]);
    // Body is everything between offset 8 and the trailing two nulls
    let body_end = if payload.len() >= 2 { payload.len() - 2 } else { 8 };
    let body = payload[8..body_end].to_vec();
    Ok((id, ptype, body))
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
