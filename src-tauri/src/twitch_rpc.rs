// Twitch presence broadcaster — pousse le titre du stream du user
// quand il lance un module dans le launcher (équivalent à Discord RPC
// mais via API REST Helix au lieu d'IPC).
//
// Pas d'OAuth flow auto pour l'instant — le user fournit manuellement
// son Client ID + User Access Token dans Settings. C'est un compromis :
// l'OAuth implicit (response_type=token) renvoie le token dans le hash
// `#access_token=` qui n'est PAS envoyé au serveur loopback HTTP, donc
// faudrait une page HTML qui POST côté JS au loopback. Faisable mais
// pas worth pour l'instant — on documente le flow manuel dans le panel.
//
// Token recommandé : générer via https://twitchtokengenerator.com avec
// scope `channel:manage:broadcast` (suffit pour PATCH /helix/channels).

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::RwLock;

const HELIX_BASE: &str = "https://api.twitch.tv/helix";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TwitchConfig {
    pub client_id: String,
    pub access_token: String,
    /// Broadcaster ID — récupéré via GET /helix/users avec le token au
    /// moment de la validation. Caché pour éviter un round-trip à chaque
    /// set_title.
    pub broadcaster_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchUserInfo {
    pub user_id: String,
    pub login: String,
    pub display_name: String,
}

pub struct TwitchRpc {
    inner: Arc<Inner>,
}

pub struct Inner {
    config: RwLock<Option<TwitchConfig>>,
    client: reqwest::Client,
}

impl TwitchRpc {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                config: RwLock::new(None),
                client: reqwest::Client::builder()
                    .timeout(std::time::Duration::from_secs(10))
                    .build()
                    .unwrap_or_else(|_| reqwest::Client::new()),
            }),
        }
    }

    pub fn arc(&self) -> Arc<Inner> {
        self.inner.clone()
    }
}

impl Inner {
    /// True si une config est en mémoire (le user a connecté Twitch).
    pub async fn is_connected(&self) -> bool {
        self.config.read().await.is_some()
    }

    /// Met à jour le titre du stream Twitch du user. No-op silencieux
    /// si pas de config (pas connecté) ou si la PATCH échoue (token
    /// expiré, network down — on log et continue, on ne bloque pas
    /// le launch d'un module pour autant).
    pub async fn set_title(&self, title: &str) {
        let cfg = match self.config.read().await.clone() {
            Some(c) => c,
            None => return,
        };
        if cfg.broadcaster_id.is_empty() {
            return;
        }
        let url = format!(
            "{}/channels?broadcaster_id={}",
            HELIX_BASE, cfg.broadcaster_id
        );
        let body = serde_json::json!({ "title": title });
        let resp = self
            .client
            .patch(&url)
            .header("Authorization", format!("Bearer {}", cfg.access_token))
            .header("Client-Id", &cfg.client_id)
            .json(&body)
            .send()
            .await;
        match resp {
            Ok(r) if r.status().is_success() => {}
            Ok(r) => {
                eprintln!("[twitch] set_title HTTP {} : {:?}", r.status(), r.text().await.ok());
            }
            Err(e) => eprintln!("[twitch] set_title network error: {}", e),
        }
    }
}

// ─── Helpers REST ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct HelixUsersResponse {
    data: Vec<HelixUser>,
}

#[derive(Debug, Deserialize)]
struct HelixUser {
    id: String,
    login: String,
    display_name: String,
}

/// GET /helix/users avec un token donné. Sert à la fois de validation
/// du token (si HTTP 200, le token est valide + on récupère le
/// broadcaster_id à cacher) et d'affichage côté UI (login / avatar).
async fn fetch_user(client_id: &str, token: &str) -> Result<HelixUser, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/users", HELIX_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .header("Client-Id", client_id)
        .send()
        .await
        .map_err(|e| format!("network: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Twitch API HTTP {} — {}", status, body));
    }
    let parsed: HelixUsersResponse =
        resp.json().await.map_err(|e| format!("parse: {}", e))?;
    parsed
        .data
        .into_iter()
        .next()
        .ok_or_else(|| "Twitch n'a renvoyé aucun utilisateur — token invalide ?".into())
}

// ─── Tauri commands ──────────────────────────────────────────────────

/// Valide un Client ID + token en appelant /helix/users. Renvoie les
/// infos du user (id, login, display name) si OK ; erreur sinon. Le
/// frontend utilise ça pour confirmer la connexion + cacher le
/// broadcaster_id.
#[tauri::command]
pub async fn twitch_validate_token(
    client_id: String,
    access_token: String,
) -> Result<TwitchUserInfo, String> {
    let user = fetch_user(&client_id, &access_token).await?;
    Ok(TwitchUserInfo {
        user_id: user.id,
        login: user.login,
        display_name: user.display_name,
    })
}

/// Persiste la config en mémoire côté Rust. Appelé par le frontend
/// après une validation réussie. Si `cfg` est None, on déconnecte.
#[tauri::command]
pub async fn twitch_set_config(
    state: State<'_, TwitchRpc>,
    config: Option<TwitchConfig>,
) -> Result<(), String> {
    let mut guard = state.inner.config.write().await;
    *guard = config;
    Ok(())
}

/// Pousse un titre custom de stream (utilisé pour test depuis le
/// Settings panel ; en prod, set_title est appelé auto au lancement
/// d'un module via le hook dans modules.rs).
#[tauri::command]
pub async fn twitch_set_title(
    state: State<'_, TwitchRpc>,
    title: String,
) -> Result<(), String> {
    if !state.inner.is_connected().await {
        return Err("Twitch pas connecté.".into());
    }
    state.inner.set_title(&title).await;
    Ok(())
}

/// Renvoie l'état actuel : connecté ou non, + la config si oui.
/// Permet au frontend de hydrater le panel au boot sans re-prompt.
#[tauri::command]
pub async fn twitch_get_config(
    state: State<'_, TwitchRpc>,
) -> Result<Option<TwitchConfig>, String> {
    Ok(state.inner.config.read().await.clone())
}
