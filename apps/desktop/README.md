# Glassleaf desktop

Glassleaf desktop is a Tauri 2 application shell around the same Expo React
Native Web export used by the PWA. The WebView keeps imported books and reader
state in the web adapter's local SQLite/OPFS and IndexedDB stores, so the shell
does not add a second filesystem or reader implementation.

The Rust side intentionally registers no commands and no plugins. The only
capability attached to the main window has an empty permission list, which
keeps filesystem, shell, HTTP, and remote command APIs unavailable to the
frontend. This follows Tauri's capability model, where permissions are granted
per window and scopes are explicit:

- [Tauri capabilities](https://v2.tauri.app/security/capabilities/)
- [Tauri permissions](https://v2.tauri.app/security/permissions/)
- [Tauri project setup](https://v2.tauri.app/start/create-project/)

## Build

Build the web export and desktop bundle from this directory:

```sh
pnpm web:build
pnpm tauri:build
```

`build-web.mjs` removes `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` before exporting.
Google Identity Services does not support the installed Tauri origin, so Drive
sync is deliberately disabled in the installed desktop app. A future desktop
sync implementation should use a Google **Desktop application** OAuth client,
a random-port loopback redirect (`http://127.0.0.1:<port>`), PKCE S256, and state
validation. Exchange the code at Google’s token endpoint and keep the refresh
token in Tauri Stronghold or the platform keychain. Do not use the browser web
client ID, register `tauri://` as a JavaScript origin, or put tokens in the web
database/localStorage. Until that Rust bridge and Google Desktop client are
registered, this wrapper does not claim Drive support.

References: [Google installed-app OAuth](https://developers.google.com/identity/protocols/oauth2/native-app),
[Google loopback guidance](https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration),
and [Tauri Stronghold](https://v2.tauri.app/reference/javascript/stronghold/).

For local development:

```sh
pnpm tauri:dev
```

The development script starts Expo Web on port 8081 with the same Drive
environment guard. Local book import, SQLite/OPFS persistence, IndexedDB
assets, EPUB/PDF/CBZ readers, and the shared desktop-width RN Web shell are the
desktop surface to validate.

Build on the target operating system. macOS app/DMG distribution requires
Apple signing and notarization for a trusted downloaded app; see the official
[macOS signing guide](https://tauri.app/distribute/sign/macos/) and
[macOS application bundle guide](https://v2.tauri.app/distribute/macos-application-bundle/).
