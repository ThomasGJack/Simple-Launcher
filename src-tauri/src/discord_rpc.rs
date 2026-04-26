use std::sync::Arc;

use discord_rich_presence::{
    activity::{Activity, Assets, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use tokio::sync::Mutex;

const DISCORD_APP_ID: &str = "1498029528461869277";
const LARGE_IMAGE_KEY: &str = "logo";
const LARGE_IMAGE_TEXT: &str = "Simple Launcher";

pub struct DiscordRpc {
    inner: Arc<Inner>,
}

pub struct Inner {
    client: Mutex<Option<DiscordIpcClient>>,
    started_at: Mutex<Option<i64>>,
}

impl DiscordRpc {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                client: Mutex::new(None),
                started_at: Mutex::new(None),
            }),
        }
    }

    pub fn arc(&self) -> Arc<Inner> {
        self.inner.clone()
    }
}

impl Inner {
    pub async fn ensure_connected(&self) -> bool {
        let mut guard = self.client.lock().await;
        if guard.is_some() {
            return true;
        }
        let mut client = DiscordIpcClient::new(DISCORD_APP_ID);
        if client.connect().is_err() {
            return false;
        }
        *guard = Some(client);

        let mut started = self.started_at.lock().await;
        if started.is_none() {
            *started = Some(now_secs());
        }
        true
    }

    pub async fn set_idle(&self) {
        if !self.ensure_connected().await {
            return;
        }
        let started = *self.started_at.lock().await;
        let mut guard = self.client.lock().await;
        if let Some(client) = guard.as_mut() {
            let assets = Assets::new()
                .large_image(LARGE_IMAGE_KEY)
                .large_text(LARGE_IMAGE_TEXT);
            let mut activity = Activity::new()
                .details("Dans le menu")
                .state("Simple Launcher")
                .assets(assets);
            if let Some(s) = started {
                activity = activity.timestamps(Timestamps::new().start(s));
            }
            let _ = client.set_activity(activity);
        }
    }

    pub async fn set_playing(&self, module_name: &str) {
        if !self.ensure_connected().await {
            return;
        }
        let started = now_secs();
        let details = format!("Joue à {}", module_name);
        let mut guard = self.client.lock().await;
        if let Some(client) = guard.as_mut() {
            let assets = Assets::new()
                .large_image(LARGE_IMAGE_KEY)
                .large_text(LARGE_IMAGE_TEXT);
            let activity = Activity::new()
                .details(&details)
                .state("via Simple Launcher")
                .assets(assets)
                .timestamps(Timestamps::new().start(started));
            let _ = client.set_activity(activity);
        }
    }

    pub async fn clear(&self) {
        let mut guard = self.client.lock().await;
        if let Some(client) = guard.as_mut() {
            let _ = client.clear_activity();
        }
    }
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
