use std::collections::HashMap;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const RESPONSE_HTML: &str = r#"<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Simple Launcher — Authentifié</title>
<style>
  html,body{height:100%;margin:0;background:#07090d;color:#f5f7fa;font-family:system-ui,sans-serif;display:grid;place-items:center}
  .card{padding:32px 40px;border-radius:18px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);text-align:center;backdrop-filter:blur(20px)}
  .dot{width:10px;height:10px;border-radius:999px;background:#00d4ff;display:inline-block;box-shadow:0 0 16px #00d4ff;margin-right:8px;animation:p 1.4s ease-in-out infinite}
  @keyframes p{0%,100%{opacity:.5}50%{opacity:1}}
  h1{font-size:18px;margin:0 0 6px;font-weight:500}
  p{color:#97a3b6;font-size:13px;margin:0}
</style>
</head>
<body>
  <div class="card">
    <h1><span class="dot"></span>Authentifié</h1>
    <p>Tu peux fermer cet onglet et retourner dans Simple Launcher.</p>
  </div>
  <script>setTimeout(()=>window.close(),1500)</script>
</body>
</html>"#;

const OAUTH_PORT: u16 = 52837;

#[tauri::command]
pub async fn start_oauth_listener(app: AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", OAUTH_PORT))
        .await
        .map_err(|e| format!("bind failed on port {}: {} — autre instance lancée ?", OAUTH_PORT, e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("local_addr failed: {}", e))?
        .port();

    let app_handle = app.clone();

    tokio::spawn(async move {
        let accept_result = tokio::time::timeout(Duration::from_secs(300), listener.accept()).await;
        let (mut socket, _) = match accept_result {
            Ok(Ok(s)) => s,
            Ok(Err(e)) => {
                let _ = app_handle.emit("oauth-error", format!("accept failed: {}", e));
                return;
            }
            Err(_) => {
                let _ = app_handle.emit("oauth-error", "OAuth timeout (5 min)".to_string());
                return;
            }
        };

        let mut buf = [0u8; 4096];
        let n = match socket.read(&mut buf).await {
            Ok(n) => n,
            Err(e) => {
                let _ = app_handle.emit("oauth-error", format!("read failed: {}", e));
                return;
            }
        };

        let request = String::from_utf8_lossy(&buf[..n]);
        let first_line = request.lines().next().unwrap_or("");
        let path = first_line
            .split_whitespace()
            .nth(1)
            .unwrap_or("")
            .to_string();

        let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");
        let params: HashMap<String, String> = query
            .split('&')
            .filter(|s| !s.is_empty())
            .filter_map(|kv| {
                let mut it = kv.splitn(2, '=');
                Some((
                    urlencoding_decode(it.next()?),
                    urlencoding_decode(it.next().unwrap_or("")),
                ))
            })
            .collect();

        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            RESPONSE_HTML.len(),
            RESPONSE_HTML
        );
        let _ = socket.write_all(response.as_bytes()).await;
        let _ = socket.shutdown().await;

        let _ = app_handle.emit("oauth-callback", &params);
    });

    Ok(port)
}

fn urlencoding_decode(s: &str) -> String {
    let mut out = Vec::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                if let Ok(byte) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(byte);
                    i += 2;
                } else {
                    out.push(bytes[i]);
                }
            }
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
