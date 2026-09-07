use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use keyring::{Entry, Error as KeyringError};
use rand::{distr::Alphanumeric, Rng};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::State;

const DRIVE_SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const ABOUT_ENDPOINT: &str =
    "https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)";
const KEYRING_SERVICE: &str = "app.glassleaf.desktop.google-drive";

#[derive(Default)]
pub struct OAuthState {
    token: Mutex<Option<Token>>,
    cancelled: Arc<AtomicBool>,
    generation: AtomicU64,
    lifecycle: Mutex<()>,
}

#[derive(Clone)]
struct Token {
    access_token: String,
    expires_at: u64,
    client_id: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct DriveSession {
    pub id: String,
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
    refresh_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AboutResponse {
    user: Option<AboutUser>,
}

#[derive(Debug, Deserialize)]
struct AboutUser {
    #[serde(rename = "permissionId")]
    permission_id: Option<String>,
    #[serde(rename = "emailAddress")]
    email_address: Option<String>,
}

#[derive(Debug)]
struct Callback {
    code: String,
}

fn error(message: impl Into<String>) -> String {
    message.into()
}

fn random_string(length: usize) -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect()
}

fn pkce_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn validate_client_id(client_id: &str) -> Result<&str, String> {
    let client_id = client_id.trim();
    if client_id.is_empty() || !client_id.ends_with(".apps.googleusercontent.com") {
        return Err(error("Google Desktop OAuth client ID is invalid."));
    }
    Ok(client_id)
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| error(format!("Could not prepare Google Drive networking: {e}")))
}

fn ensure_active(state: &OAuthState, generation: u64) -> Result<(), String> {
    if state.cancelled.load(Ordering::Acquire)
        || state.generation.load(Ordering::Acquire) != generation
    {
        return Err(error("Google sign-in was cancelled."));
    }
    Ok(())
}

fn cached_token(token: Option<&Token>, client_id: &str) -> Option<String> {
    token
        .filter(|token| token.client_id == client_id && token.expires_at > now().saturating_add(60))
        .map(|token| token.access_token.clone())
}

fn refresh_entry(client_id: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, &format!("refresh-token:{client_id}"))
        .map_err(|e| error(e.to_string()))
}

fn load_refresh_token(client_id: &str) -> Result<Option<String>, String> {
    match refresh_entry(client_id)?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(error(format!("Could not read the desktop keychain: {e}"))),
    }
}

fn save_refresh_token(client_id: &str, token: &str) -> Result<(), String> {
    refresh_entry(client_id)?
        .set_password(token)
        .map_err(|e| error(format!("Could not save the desktop refresh token: {e}")))
}

fn delete_refresh_token(client_id: &str) -> Result<(), String> {
    match refresh_entry(client_id)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(error(format!("Could not clear the desktop keychain: {e}"))),
    }
}

fn open_browser(url: &str) -> Result<(), String> {
    open::that(url).map_err(|e| error(format!("Could not open the system browser: {e}")))
}

fn callback_response(stream: &mut TcpStream, message: &str) {
    let body =
        format!("<html><body><h2>{message}</h2><p>You can return to Glassleaf.</p></body></html>");
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(), body
    );
    let _ = stream.write_all(response.as_bytes());
}

fn validate_callback(
    expected_state: &str,
    code: Option<&str>,
    state: Option<&str>,
    oauth_error: Option<&str>,
) -> Result<String, String> {
    let returned_state = state.ok_or_else(|| error("Google returned no OAuth state."))?;
    if returned_state != expected_state {
        return Err(error("Google OAuth state validation failed."));
    }
    if let Some(message) = oauth_error {
        return Err(error(format!("Google OAuth returned {message}.")));
    }
    code.filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| error("Google returned no authorization code."))
}

fn wait_for_callback(
    listener: TcpListener,
    expected_state: String,
    cancelled: Arc<AtomicBool>,
) -> Result<Callback, String> {
    listener
        .set_nonblocking(true)
        .map_err(|e| error(format!("Could not prepare the OAuth callback: {e}")))?;
    let deadline = SystemTime::now() + Duration::from_secs(180);
    loop {
        if cancelled.load(Ordering::Acquire) {
            return Err(error("Google sign-in was cancelled."));
        }
        if SystemTime::now() >= deadline {
            return Err(error("Google sign-in timed out. Try again."));
        }
        match listener.accept() {
            Ok((mut stream, address)) => {
                if !address.ip().is_loopback() {
                    continue;
                }
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .map_err(|e| error(format!("Could not prepare the OAuth callback: {e}")))?;
                let mut request = [0_u8; 8192];
                let length = match stream.read(&mut request) {
                    Ok(length) if length > 0 => length,
                    Ok(_) => continue,
                    Err(e)
                        if matches!(
                            e.kind(),
                            std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                        ) =>
                    {
                        continue
                    }
                    Err(e) => return Err(error(format!("Could not read the OAuth callback: {e}"))),
                };
                let first_line = String::from_utf8_lossy(&request[..length]);
                let Some((method, target)) = first_line.lines().next().and_then(|line| {
                    let mut parts = line.split_whitespace();
                    Some((parts.next()?, parts.next()?))
                }) else {
                    continue;
                };
                if method != "GET" || !target.starts_with('/') {
                    continue;
                }
                let url = url::Url::parse(&format!("http://127.0.0.1{target}"))
                    .map_err(|_| error("Google returned an invalid OAuth callback."))?;
                if url.path() != "/callback" {
                    continue;
                }
                let code = url
                    .query_pairs()
                    .find(|(key, _)| key == "code")
                    .map(|(_, value)| value.into_owned());
                let state = url
                    .query_pairs()
                    .find(|(key, _)| key == "state")
                    .map(|(_, value)| value.into_owned());
                let oauth_error = url
                    .query_pairs()
                    .find(|(key, _)| key == "error")
                    .map(|(_, value)| value.into_owned());
                if state.as_deref() != Some(expected_state.as_str()) {
                    callback_response(&mut stream, "Google sign-in could not be completed.");
                    continue;
                }
                match validate_callback(
                    &expected_state,
                    code.as_deref(),
                    state.as_deref(),
                    oauth_error.as_deref(),
                ) {
                    Ok(code) => {
                        callback_response(&mut stream, "Google sign-in complete.");
                        return Ok(Callback { code });
                    }
                    Err(message) => {
                        callback_response(&mut stream, "Google sign-in could not be completed.");
                        return Err(message);
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(error(format!("OAuth callback listener failed: {e}"))),
        }
    }
}

async fn account_for(client: &Client, access_token: &str) -> Result<DriveSession, String> {
    let response = client
        .get(ABOUT_ENDPOINT)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| error(format!("Could not read the Google Drive account: {e}")))?;
    if !response.status().is_success() {
        return Err(error("Google Drive did not return an account."));
    }
    let data = response
        .json::<AboutResponse>()
        .await
        .map_err(|_| error("Google Drive returned an invalid account."))?;
    let user = data
        .user
        .ok_or_else(|| error("Google Drive returned no account."))?;
    let id = user
        .permission_id
        .ok_or_else(|| error("Google Drive returned no account identifier."))?;
    Ok(DriveSession {
        id,
        email: user.email_address,
    })
}

async fn refresh_access_token(
    refresh_token: &str,
    client_id: &str,
) -> Result<TokenResponse, String> {
    http_client()?
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("client_id", client_id.to_owned()),
            ("refresh_token", refresh_token.to_owned()),
            ("grant_type", "refresh_token".to_owned()),
        ])
        .send()
        .await
        .map_err(|e| error(format!("Google token refresh failed: {e}")))?
        .error_for_status()
        .map_err(|_| error("Google token refresh was rejected. Reconnect Google Drive."))?
        .json::<TokenResponse>()
        .await
        .map_err(|_| error("Google returned an invalid token refresh response."))
}

#[tauri::command]
pub async fn desktop_drive_connect(
    state: State<'_, OAuthState>,
    client_id: String,
) -> Result<DriveSession, String> {
    let client_id = validate_client_id(&client_id)?.to_owned();
    let generation = state.generation.fetch_add(1, Ordering::AcqRel) + 1;
    state.cancelled.store(false, Ordering::Release);
    let verifier = random_string(64);
    let oauth_state = random_string(48);
    let challenge = pkce_challenge(&verifier);
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| error(format!("Could not reserve an OAuth callback port: {e}")))?;
    let port = listener
        .local_addr()
        .map_err(|e| error(format!("Could not read the OAuth callback port: {e}")))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let mut authorization = url::Url::parse("https://accounts.google.com/o/oauth2/v2/auth")
        .map_err(|_| error("Could not construct the Google authorization URL."))?;
    authorization.query_pairs_mut().extend_pairs([
        ("client_id", client_id.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("response_type", "code"),
        ("scope", DRIVE_SCOPE),
        ("code_challenge", challenge.as_str()),
        ("code_challenge_method", "S256"),
        ("state", oauth_state.as_str()),
        ("access_type", "offline"),
        ("prompt", "consent"),
    ]);
    open_browser(authorization.as_str())?;
    let callback = tauri::async_runtime::spawn_blocking({
        let cancelled = state.cancelled.clone();
        move || wait_for_callback(listener, oauth_state, cancelled)
    })
    .await
    .map_err(|e| error(format!("OAuth callback task failed: {e}")))??;
    ensure_active(&state, generation)?;
    let response = http_client()?
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("client_id", client_id.as_str()),
            ("code", callback.code.as_str()),
            ("code_verifier", verifier.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .await
        .map_err(|e| error(format!("Google token exchange failed: {e}")))?
        .error_for_status()
        .map_err(|_| error("Google rejected the authorization code."))?
        .json::<TokenResponse>()
        .await
        .map_err(|_| error("Google returned an invalid token response."))?;
    ensure_active(&state, generation)?;
    let refresh_token = response.refresh_token;
    let access_token = response.access_token;
    let expires_in = response.expires_in;
    let client = http_client()?;
    let session = account_for(&client, &access_token).await?;
    let _lifecycle = state
        .lifecycle
        .lock()
        .map_err(|_| error("Desktop OAuth state was unavailable."))?;
    ensure_active(&state, generation)?;
    match refresh_token {
        Some(token) => {
            save_refresh_token(&client_id, &token)?;
        }
        None => {
            load_refresh_token(&client_id)?.ok_or_else(|| {
                error("Google did not issue a refresh token. Reconnect with Drive consent.")
            })?;
        }
    };
    *state
        .token
        .lock()
        .map_err(|_| error("Desktop OAuth state was unavailable."))? = Some(Token {
        access_token,
        expires_at: now().saturating_add(expires_in),
        client_id,
    });
    Ok(session)
}

#[tauri::command]
pub async fn desktop_drive_access_token(
    state: State<'_, OAuthState>,
    client_id: String,
) -> Result<String, String> {
    let client_id = validate_client_id(&client_id)?.to_owned();
    let generation = state.generation.load(Ordering::Acquire);
    if let Some(token) = state
        .token
        .lock()
        .map_err(|_| error("Desktop OAuth state was unavailable."))?
        .as_ref()
        .and_then(|token| cached_token(Some(token), &client_id))
    {
        return Ok(token);
    }
    let refresh_token = load_refresh_token(&client_id)?
        .ok_or_else(|| error("Google Drive is disconnected. Connect again."))?;
    let response = refresh_access_token(&refresh_token, &client_id).await?;
    let _lifecycle = state
        .lifecycle
        .lock()
        .map_err(|_| error("Desktop OAuth state was unavailable."))?;
    ensure_active(&state, generation)?;
    *state
        .token
        .lock()
        .map_err(|_| error("Desktop OAuth state was unavailable."))? = Some(Token {
        access_token: response.access_token.clone(),
        expires_at: now().saturating_add(response.expires_in),
        client_id: client_id.clone(),
    });
    if let Some(token) = response.refresh_token {
        save_refresh_token(&client_id, &token)?;
    }
    Ok(response.access_token)
}

#[tauri::command]
pub fn desktop_drive_cancel(state: State<'_, OAuthState>) {
    let _lifecycle = state
        .lifecycle
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    state.generation.fetch_add(1, Ordering::AcqRel);
    state.cancelled.store(true, Ordering::Release);
}

#[tauri::command]
pub fn desktop_drive_disconnect(
    state: State<'_, OAuthState>,
    client_id: String,
) -> Result<(), String> {
    state.generation.fetch_add(1, Ordering::AcqRel);
    state.cancelled.store(true, Ordering::Release);
    let client_id = validate_client_id(&client_id)?;
    let _lifecycle = state
        .lifecycle
        .lock()
        .map_err(|_| error("Desktop OAuth state was unavailable."))?;
    *state
        .token
        .lock()
        .map_err(|_| error("Desktop OAuth state was unavailable."))? = None;
    delete_refresh_token(client_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_is_url_safe_and_stable() {
        let challenge = pkce_challenge("a-secure-verifier-with-enough-entropy");
        assert!(!challenge.contains('='));
        assert!(!challenge.contains('+'));
        assert!(!challenge.contains('/'));
        assert_eq!(
            challenge,
            pkce_challenge("a-secure-verifier-with-enough-entropy")
        );
    }

    #[test]
    fn callback_requires_matching_state_before_code_or_error() {
        assert_eq!(
            validate_callback("expected", Some("code"), Some("expected"), None)
                .expect("valid callback"),
            "code"
        );
        assert!(
            validate_callback("expected", Some("code"), Some("wrong"), None)
                .unwrap_err()
                .contains("state")
        );
        assert!(
            validate_callback("expected", None, None, Some("access_denied"))
                .unwrap_err()
                .contains("state")
        );
        assert!(
            validate_callback("expected", None, Some("expected"), Some("access_denied"))
                .unwrap_err()
                .contains("access_denied")
        );
    }

    #[test]
    fn cached_access_tokens_are_bound_to_the_requested_client() {
        let token = Token {
            access_token: "access".to_owned(),
            expires_at: now() + 3_600,
            client_id: "desktop.apps.googleusercontent.com".to_owned(),
        };
        assert_eq!(
            cached_token(Some(&token), "desktop.apps.googleusercontent.com"),
            Some("access".to_owned())
        );
        assert_eq!(
            cached_token(Some(&token), "other.apps.googleusercontent.com"),
            None
        );
    }

    #[test]
    fn cancellation_invalidates_an_in_flight_generation() {
        let state = OAuthState::default();
        let generation = state.generation.load(Ordering::Acquire);
        ensure_active(&state, generation).expect("generation starts active");
        state.generation.fetch_add(1, Ordering::AcqRel);
        assert!(ensure_active(&state, generation).is_err());
    }
}
