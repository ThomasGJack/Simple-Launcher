//! Steam Web API wrapper — récupère les infos riches d'un jeu Steam
//! depuis les endpoints publics Valve (pas d'API key requise pour ces 4) :
//!
//!   - `store.steampowered.com/api/appdetails` : metadata complètes
//!     (titre, description, screenshots, trailers, prix, dev, etc.)
//!   - `api.steampowered.com/.../GetNumberOfCurrentPlayers` : joueurs en
//!     ligne live
//!   - `store.steampowered.com/appreviews/{id}` : rating "Très positif"
//!     etc. + counters total positive / total negative
//!   - `api.steampowered.com/.../GetGlobalAchievementPercentagesForApp` :
//!     % unlock global par achievement (rareté)
//!
//! Pourquoi côté Rust et pas frontend direct : éviter les surprises CORS
//! sur certains endpoints Steam (variable selon les regions / les jours)
//! + on bénéficie du connection pooling reqwest.
//!
//! Le caching est géré par le frontend dans Firestore `/steamApps/{appId}`
//! avec TTL 24h. Cette fn fait juste les 4 fetches en parallèle et
//! renvoie les données brutes.

use serde::{Deserialize, Serialize};
use tokio::time::{timeout, Duration};

const FETCH_TIMEOUT_SECS: u64 = 8;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct SteamGameInfo {
    pub app_id: String,

    // From appdetails
    pub name: Option<String>,
    pub r#type: Option<String>,
    pub is_free: Option<bool>,
    pub short_description: Option<String>,
    pub detailed_description: Option<String>,
    pub about_the_game: Option<String>,
    pub supported_languages: Option<String>,
    pub header_image: Option<String>,
    pub capsule_image: Option<String>,
    pub background: Option<String>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub price_overview: Option<PriceOverview>,
    pub platforms: Option<Platforms>,
    pub categories: Vec<NamedItem>,
    pub genres: Vec<NamedItem>,
    pub screenshots: Vec<Screenshot>,
    pub movies: Vec<Movie>,
    pub recommendations_total: Option<u32>,
    pub release_date: Option<ReleaseDate>,
    pub metacritic_score: Option<u32>,
    pub metacritic_url: Option<String>,
    pub controller_support: Option<String>,
    pub dlc: Vec<u32>,
    pub pc_requirements_minimum: Option<String>,
    pub pc_requirements_recommended: Option<String>,

    // From currentplayers
    pub current_players: Option<u64>,

    // From appreviews
    pub review_score: Option<u8>,
    pub review_score_desc: Option<String>,
    pub total_positive: Option<u32>,
    pub total_negative: Option<u32>,
    pub total_reviews: Option<u32>,

    // From global achievement %
    pub achievement_percents: Vec<AchievementPercent>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct PriceOverview {
    pub currency: String,
    pub initial: u64,
    pub r#final: u64,
    pub discount_percent: u32,
    pub initial_formatted: String,
    pub final_formatted: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Platforms {
    pub windows: bool,
    pub mac: bool,
    pub linux: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NamedItem {
    pub id: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Screenshot {
    pub id: u64,
    pub path_thumbnail: String,
    pub path_full: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Movie {
    pub id: u64,
    pub name: String,
    pub thumbnail: String,
    pub webm_max: Option<String>,
    pub mp4_max: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReleaseDate {
    pub coming_soon: bool,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AchievementPercent {
    pub name: String,
    pub percent: f64,
}

/// Fetch les 4 endpoints Steam en parallèle, agrège dans `SteamGameInfo`.
/// Aucun endpoint n'est bloquant : si l'un échoue, les champs correspondants
/// restent à leur valeur default. Le frontend décide quoi afficher.
#[tauri::command]
pub async fn steam_api_get_game_info(app_id: String) -> Result<SteamGameInfo, String> {
    if app_id.trim().is_empty() {
        return Err("appId requis".to_string());
    }
    let app_id = app_id.trim().to_string();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(FETCH_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("client init: {}", e))?;

    let (details, players, reviews, achievements) = tokio::join!(
        fetch_app_details(&client, &app_id),
        fetch_current_players(&client, &app_id),
        fetch_app_reviews(&client, &app_id),
        fetch_global_achievements(&client, &app_id),
    );

    let mut info = SteamGameInfo {
        app_id: app_id.clone(),
        ..Default::default()
    };

    if let Ok(d) = details {
        merge_details(&mut info, d);
    }
    if let Ok(Some(p)) = players {
        info.current_players = Some(p);
    }
    if let Ok(r) = reviews {
        info.review_score = r.score;
        info.review_score_desc = r.score_desc;
        info.total_positive = r.total_positive;
        info.total_negative = r.total_negative;
        info.total_reviews = r.total_reviews;
    }
    if let Ok(a) = achievements {
        info.achievement_percents = a;
    }

    Ok(info)
}

// ─── App Details ────────────────────────────────────────────────────────

async fn fetch_app_details(
    client: &reqwest::Client,
    app_id: &str,
) -> Result<serde_json::Value, String> {
    // Lang français pour les descriptions ; fallback à l'anglais si pas de
    // localisation.
    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={}&l=french",
        app_id
    );
    let res = timeout(Duration::from_secs(FETCH_TIMEOUT_SECS), client.get(&url).send())
        .await
        .map_err(|_| "appdetails timeout".to_string())?
        .map_err(|e| format!("appdetails: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("appdetails HTTP {}", res.status()));
    }
    let json: serde_json::Value = res.json().await.map_err(|e| format!("appdetails parse: {}", e))?;
    let entry = json
        .get(app_id)
        .ok_or_else(|| format!("appdetails missing entry for {}", app_id))?;
    let success = entry.get("success").and_then(|s| s.as_bool()).unwrap_or(false);
    if !success {
        return Err("appdetails returned success=false".to_string());
    }
    let data = entry
        .get("data")
        .cloned()
        .ok_or_else(|| "appdetails missing data".to_string())?;
    Ok(data)
}

fn merge_details(info: &mut SteamGameInfo, data: serde_json::Value) {
    info.name = data.get("name").and_then(|v| v.as_str()).map(String::from);
    info.r#type = data.get("type").and_then(|v| v.as_str()).map(String::from);
    info.is_free = data.get("is_free").and_then(|v| v.as_bool());
    info.short_description = data
        .get("short_description")
        .and_then(|v| v.as_str())
        .map(String::from);
    info.detailed_description = data
        .get("detailed_description")
        .and_then(|v| v.as_str())
        .map(String::from);
    info.about_the_game = data
        .get("about_the_game")
        .and_then(|v| v.as_str())
        .map(String::from);
    info.supported_languages = data
        .get("supported_languages")
        .and_then(|v| v.as_str())
        .map(String::from);
    info.header_image = data
        .get("header_image")
        .and_then(|v| v.as_str())
        .map(String::from);
    info.capsule_image = data
        .get("capsule_image")
        .and_then(|v| v.as_str())
        .map(String::from);
    info.background = data
        .get("background_raw")
        .and_then(|v| v.as_str())
        .or_else(|| data.get("background").and_then(|v| v.as_str()))
        .map(String::from);

    if let Some(arr) = data.get("developers").and_then(|v| v.as_array()) {
        info.developers = arr.iter().filter_map(|v| v.as_str().map(String::from)).collect();
    }
    if let Some(arr) = data.get("publishers").and_then(|v| v.as_array()) {
        info.publishers = arr.iter().filter_map(|v| v.as_str().map(String::from)).collect();
    }

    if let Some(price) = data.get("price_overview") {
        info.price_overview = Some(PriceOverview {
            currency: price
                .get("currency")
                .and_then(|v| v.as_str())
                .unwrap_or("EUR")
                .to_string(),
            initial: price.get("initial").and_then(|v| v.as_u64()).unwrap_or(0),
            r#final: price.get("final").and_then(|v| v.as_u64()).unwrap_or(0),
            discount_percent: price
                .get("discount_percent")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32,
            initial_formatted: price
                .get("initial_formatted")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            final_formatted: price
                .get("final_formatted")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        });
    }

    if let Some(p) = data.get("platforms") {
        info.platforms = Some(Platforms {
            windows: p.get("windows").and_then(|v| v.as_bool()).unwrap_or(false),
            mac: p.get("mac").and_then(|v| v.as_bool()).unwrap_or(false),
            linux: p.get("linux").and_then(|v| v.as_bool()).unwrap_or(false),
        });
    }

    if let Some(cats) = data.get("categories").and_then(|v| v.as_array()) {
        info.categories = cats
            .iter()
            .filter_map(|c| {
                let id = c.get("id").map(|v| v.to_string())?;
                let desc = c.get("description").and_then(|v| v.as_str())?.to_string();
                Some(NamedItem {
                    id,
                    description: desc,
                })
            })
            .collect();
    }
    if let Some(genres) = data.get("genres").and_then(|v| v.as_array()) {
        info.genres = genres
            .iter()
            .filter_map(|g| {
                let id = g.get("id").and_then(|v| v.as_str())?.to_string();
                let desc = g.get("description").and_then(|v| v.as_str())?.to_string();
                Some(NamedItem {
                    id,
                    description: desc,
                })
            })
            .collect();
    }

    if let Some(shots) = data.get("screenshots").and_then(|v| v.as_array()) {
        info.screenshots = shots
            .iter()
            .filter_map(|s| {
                Some(Screenshot {
                    id: s.get("id").and_then(|v| v.as_u64())?,
                    path_thumbnail: s
                        .get("path_thumbnail")
                        .and_then(|v| v.as_str())?
                        .to_string(),
                    path_full: s.get("path_full").and_then(|v| v.as_str())?.to_string(),
                })
            })
            .collect();
    }

    if let Some(movies) = data.get("movies").and_then(|v| v.as_array()) {
        info.movies = movies
            .iter()
            .filter_map(|m| {
                Some(Movie {
                    id: m.get("id").and_then(|v| v.as_u64())?,
                    name: m.get("name").and_then(|v| v.as_str())?.to_string(),
                    thumbnail: m.get("thumbnail").and_then(|v| v.as_str())?.to_string(),
                    webm_max: m
                        .get("webm")
                        .and_then(|v| v.get("max"))
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    mp4_max: m
                        .get("mp4")
                        .and_then(|v| v.get("max"))
                        .and_then(|v| v.as_str())
                        .map(String::from),
                })
            })
            .collect();
    }

    info.recommendations_total = data
        .get("recommendations")
        .and_then(|r| r.get("total"))
        .and_then(|v| v.as_u64())
        .map(|n| n as u32);

    if let Some(rd) = data.get("release_date") {
        info.release_date = Some(ReleaseDate {
            coming_soon: rd.get("coming_soon").and_then(|v| v.as_bool()).unwrap_or(false),
            date: rd
                .get("date")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        });
    }

    if let Some(meta) = data.get("metacritic") {
        info.metacritic_score = meta.get("score").and_then(|v| v.as_u64()).map(|n| n as u32);
        info.metacritic_url = meta.get("url").and_then(|v| v.as_str()).map(String::from);
    }

    info.controller_support = data
        .get("controller_support")
        .and_then(|v| v.as_str())
        .map(String::from);

    if let Some(dlc) = data.get("dlc").and_then(|v| v.as_array()) {
        info.dlc = dlc.iter().filter_map(|v| v.as_u64().map(|n| n as u32)).collect();
    }

    info.pc_requirements_minimum = data
        .get("pc_requirements")
        .and_then(|v| v.get("minimum"))
        .and_then(|v| v.as_str())
        .map(String::from);
    info.pc_requirements_recommended = data
        .get("pc_requirements")
        .and_then(|v| v.get("recommended"))
        .and_then(|v| v.as_str())
        .map(String::from);
}

// ─── Current Players ────────────────────────────────────────────────────

async fn fetch_current_players(
    client: &reqwest::Client,
    app_id: &str,
) -> Result<Option<u64>, String> {
    let url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid={}",
        app_id
    );
    let res = timeout(Duration::from_secs(FETCH_TIMEOUT_SECS), client.get(&url).send())
        .await
        .map_err(|_| "currentplayers timeout".to_string())?
        .map_err(|e| format!("currentplayers: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("currentplayers HTTP {}", res.status()));
    }
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("currentplayers parse: {}", e))?;
    Ok(json
        .get("response")
        .and_then(|r| r.get("player_count"))
        .and_then(|v| v.as_u64()))
}

// ─── App Reviews ────────────────────────────────────────────────────────

#[derive(Debug, Default)]
struct ReviewsSummary {
    score: Option<u8>,
    score_desc: Option<String>,
    total_positive: Option<u32>,
    total_negative: Option<u32>,
    total_reviews: Option<u32>,
}

async fn fetch_app_reviews(
    client: &reqwest::Client,
    app_id: &str,
) -> Result<ReviewsSummary, String> {
    let url = format!(
        "https://store.steampowered.com/appreviews/{}?json=1&num_per_page=0&purchase_type=all&language=all",
        app_id
    );
    let res = timeout(Duration::from_secs(FETCH_TIMEOUT_SECS), client.get(&url).send())
        .await
        .map_err(|_| "appreviews timeout".to_string())?
        .map_err(|e| format!("appreviews: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("appreviews HTTP {}", res.status()));
    }
    let json: serde_json::Value = res.json().await.map_err(|e| format!("appreviews parse: {}", e))?;
    let qs = json.get("query_summary");
    Ok(ReviewsSummary {
        score: qs
            .and_then(|q| q.get("review_score"))
            .and_then(|v| v.as_u64())
            .map(|n| n as u8),
        score_desc: qs
            .and_then(|q| q.get("review_score_desc"))
            .and_then(|v| v.as_str())
            .map(String::from),
        total_positive: qs
            .and_then(|q| q.get("total_positive"))
            .and_then(|v| v.as_u64())
            .map(|n| n as u32),
        total_negative: qs
            .and_then(|q| q.get("total_negative"))
            .and_then(|v| v.as_u64())
            .map(|n| n as u32),
        total_reviews: qs
            .and_then(|q| q.get("total_reviews"))
            .and_then(|v| v.as_u64())
            .map(|n| n as u32),
    })
}

// ─── Global Achievement Percentages ─────────────────────────────────────

async fn fetch_global_achievements(
    client: &reqwest::Client,
    app_id: &str,
) -> Result<Vec<AchievementPercent>, String> {
    let url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid={}&format=json",
        app_id
    );
    let res = timeout(Duration::from_secs(FETCH_TIMEOUT_SECS), client.get(&url).send())
        .await
        .map_err(|_| "achievements timeout".to_string())?
        .map_err(|e| format!("achievements: {}", e))?;
    if !res.status().is_success() {
        // Pas critique — beaucoup de jeux n'ont pas d'achievements ou pas
        // d'API stats publique. Renvoie liste vide silencieusement.
        return Ok(Vec::new());
    }
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("achievements parse: {}", e))?;
    let arr = json
        .get("achievementpercentages")
        .and_then(|a| a.get("achievements"))
        .and_then(|v| v.as_array());
    Ok(arr
        .map(|a| {
            a.iter()
                .filter_map(|x| {
                    Some(AchievementPercent {
                        name: x.get("name").and_then(|v| v.as_str())?.to_string(),
                        percent: x.get("percent").and_then(|v| v.as_f64())?,
                    })
                })
                .collect()
        })
        .unwrap_or_default())
}
