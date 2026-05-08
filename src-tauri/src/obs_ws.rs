// OBS WebSocket bridge — connecte au plugin obs-websocket v5 d'OBS
// Studio (port 4455 par défaut, optionnel password). Permet de pousser
// des "events overlay" depuis le launcher vers une browser source OBS
// chez le streamer (qui affiche les achievements, friend online,
// crew activity dans son stream).
//
// Le browser source (page statique servie par Firebase Hosting :
// `/obs-overlay.html`) écoute lui-même la connexion WebSocket sortante
// du launcher — quand on POST un event Tauri, on broadcast aux clients
// connectés à un channel custom OBS-WebSocket "CustomEvent".
//
// Auth handshake OBS-WebSocket v5 :
//   1. Le serveur envoie Hello { challenge, salt, rpcVersion }
//   2. Si password set : auth = base64( SHA256( base64( SHA256(
//      password + salt ) ) + challenge ) )
//   3. Client renvoie Identify { rpcVersion, authentication: auth }
//   4. Serveur confirme Identified

use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::State;
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::Message;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ObsConfig {
    /// URL WebSocket complète, ex `ws://localhost:4455`. Si vide,
    /// l'OBS bridge est désactivé.
    pub url: String,
    /// Mot de passe optionnel — laisser vide si obs-websocket n'a
    /// pas d'auth configurée (default).
    pub password: String,
}

pub struct ObsWs {
    inner: Arc<Inner>,
}

pub struct Inner {
    /// Sender pour pusher des messages dans le pipeline d'envoi.
    /// `None` quand pas connecté ; `Some(tx)` quand la task d'écriture
    /// tourne.
    sender: Mutex<Option<mpsc::UnboundedSender<Message>>>,
    config: Mutex<Option<ObsConfig>>,
}

impl ObsWs {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                sender: Mutex::new(None),
                config: Mutex::new(None),
            }),
        }
    }

    pub fn arc(&self) -> Arc<Inner> {
        self.inner.clone()
    }
}

impl Inner {
    pub async fn is_connected(&self) -> bool {
        self.sender.lock().await.is_some()
    }
}

// ─── Tauri commands ──────────────────────────────────────────────────

#[tauri::command]
pub async fn obs_connect(
    state: State<'_, ObsWs>,
    url: String,
    password: String,
) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("URL OBS WebSocket vide.".into());
    }

    // Si déjà connecté, déconnecter d'abord (le sender est dropped → la
    // task d'écriture sort de sa boucle).
    {
        let mut s = state.inner.sender.lock().await;
        *s = None;
    }

    let parsed_url = url::Url::parse(&url).map_err(|e| format!("URL invalide : {}", e))?;
    let (ws, _) = tokio_tungstenite::connect_async(parsed_url)
        .await
        .map_err(|e| format!("Impossible de se connecter à OBS : {}", e))?;

    let (mut write, mut read) = ws.split();

    // Handshake : on attend le message Hello, on calcule l'auth si
    // password set, puis on envoie Identify.
    let hello_raw = read
        .next()
        .await
        .ok_or("OBS a fermé la connexion avant Hello")?
        .map_err(|e| format!("read Hello: {}", e))?;
    let hello_text = hello_raw
        .into_text()
        .map_err(|e| format!("Hello pas du texte: {}", e))?;
    let hello: ObsMessage = serde_json::from_str(&hello_text)
        .map_err(|e| format!("Hello pas du JSON: {} (raw: {})", e, hello_text))?;

    if hello.op != 0 {
        return Err(format!(
            "Premier message OBS pas Hello (op={}). Plugin obs-websocket à jour ?",
            hello.op
        ));
    }

    let challenge_data = hello.d.get("authentication");
    let auth_string = if let Some(auth_obj) = challenge_data {
        if password.is_empty() {
            return Err("OBS demande un mot de passe mais aucun n'est fourni.".into());
        }
        let salt = auth_obj
            .get("salt")
            .and_then(Value::as_str)
            .ok_or("Hello.authentication.salt manquant")?;
        let challenge = auth_obj
            .get("challenge")
            .and_then(Value::as_str)
            .ok_or("Hello.authentication.challenge manquant")?;
        Some(compute_obs_auth(&password, salt, challenge))
    } else {
        None
    };

    let identify_payload = if let Some(auth) = auth_string {
        serde_json::json!({
            "op": 1,
            "d": {
                "rpcVersion": 1,
                "authentication": auth,
                "eventSubscriptions": 0,
            }
        })
    } else {
        serde_json::json!({
            "op": 1,
            "d": {
                "rpcVersion": 1,
                "eventSubscriptions": 0,
            }
        })
    };

    write
        .send(Message::Text(identify_payload.to_string()))
        .await
        .map_err(|e| format!("send Identify: {}", e))?;

    // Wait for Identified (op == 2) ou Error
    let identified_raw = read
        .next()
        .await
        .ok_or("OBS a fermé la connexion avant Identified")?
        .map_err(|e| format!("read Identified: {}", e))?;
    let identified_text = identified_raw
        .into_text()
        .map_err(|e| format!("Identified pas du texte: {}", e))?;
    let identified: ObsMessage = serde_json::from_str(&identified_text)
        .map_err(|e| format!("Identified pas du JSON: {} (raw: {})", e, identified_text))?;

    if identified.op != 2 {
        return Err(format!(
            "Auth OBS rejetée (op={}, d={})",
            identified.op, identified.d
        ));
    }

    // Set up le pipeline d'envoi via mpsc — chaque appel à
    // `obs_send_overlay_event` push un message dans tx, la task
    // ci-dessous consomme tx et écrit sur ws.
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    {
        let mut s = state.inner.sender.lock().await;
        *s = Some(tx);
    }
    {
        let mut c = state.inner.config.lock().await;
        *c = Some(ObsConfig { url: url.clone(), password });
    }

    // Task d'écriture : consume tx jusqu'à ce que tous les senders
    // soient drop (= déconnexion).
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if let Err(e) = write.send(msg).await {
                eprintln!("[obs] write failed: {}", e);
                break;
            }
        }
    });

    // Task de lecture : juste pour drainer les messages serveur (events
    // OBS qu'on n'écoute pas) et détecter une déconnexion. Elle se
    // termine quand le serveur ferme le socket.
    tokio::spawn(async move {
        while let Some(msg) = read.next().await {
            if msg.is_err() {
                break;
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn obs_disconnect(state: State<'_, ObsWs>) -> Result<(), String> {
    let mut s = state.inner.sender.lock().await;
    *s = None;
    let mut c = state.inner.config.lock().await;
    *c = None;
    Ok(())
}

/// Push un événement overlay vers OBS. Utilise le request OBS-WebSocket
/// `BroadcastCustomEvent` qui broadcast à tous les clients connectés à
/// la même session OBS-WebSocket — incluant le browser source overlay
/// chez le streamer.
#[tauri::command]
pub async fn obs_send_overlay_event(
    state: State<'_, ObsWs>,
    payload: Value,
) -> Result<(), String> {
    let sender = state.inner.sender.lock().await.clone();
    let tx = sender.ok_or("OBS pas connecté.")?;

    let request_id = format!("sl-{}", chrono_now_ms());
    let envelope = serde_json::json!({
        "op": 6,                             // Op 6 = Request
        "d": {
            "requestType": "BroadcastCustomEvent",
            "requestId": request_id,
            "requestData": {
                "eventData": payload
            }
        }
    });
    tx.send(Message::Text(envelope.to_string()))
        .map_err(|e| format!("send overlay event: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn obs_get_config(state: State<'_, ObsWs>) -> Result<Option<ObsConfig>, String> {
    Ok(state.inner.config.lock().await.clone())
}

// ─── Helpers ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ObsMessage {
    op: u8,
    #[serde(default)]
    d: Value,
}

/// SHA256(password + salt) → base64 → concat challenge → SHA256 → base64.
/// Spec : https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md#authentication
fn compute_obs_auth(password: &str, salt: &str, challenge: &str) -> String {
    let mut h1 = Sha256::new();
    h1.update(password.as_bytes());
    h1.update(salt.as_bytes());
    let secret_b64 = B64.encode(h1.finalize());

    let mut h2 = Sha256::new();
    h2.update(secret_b64.as_bytes());
    h2.update(challenge.as_bytes());
    B64.encode(h2.finalize())
}

fn chrono_now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
