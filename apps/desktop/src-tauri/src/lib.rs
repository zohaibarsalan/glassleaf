mod oauth;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(oauth::OAuthState::default())
        .invoke_handler(tauri::generate_handler![
            oauth::desktop_drive_access_token,
            oauth::desktop_drive_cancel,
            oauth::desktop_drive_connect,
            oauth::desktop_drive_disconnect
        ])
        .run(tauri::generate_context!())
        .expect("error while running Glassleaf desktop");
}
