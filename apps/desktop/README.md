# Glassleaf desktop

Glassleaf desktop is a Tauri 2 application shell around the same Expo React
Native Web export used by the PWA. The WebView keeps imported books and reader
state in the web adapter's local SQLite/OPFS and IndexedDB stores, so the shell
does not add a second filesystem or reader implementation.

The Rust side registers only the narrow Google Drive OAuth commands needed by
the desktop adapter. The only capability attached to the main window still has
an empty permission list, which keeps filesystem, shell, HTTP, and unrelated
remote command APIs unavailable to the frontend. This follows Tauri's
capability model, where permissions are granted per window and scopes are
explicit:

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
Google Identity Services does not support the installed Tauri origin, so the
desktop adapter uses a separate Google **Desktop application** OAuth client,
random-port loopback redirect (`http://127.0.0.1:<port>/callback`), PKCE S256, and state
validation. Rust exchanges the code at Google’s token endpoint, keeps the
short-lived access token in memory, and stores the refresh token in the
platform keychain. Set the public
`EXPO_PUBLIC_GOOGLE_DESKTOP_CLIENT_ID` when exporting the web bundle; no client
secret belongs in the app. The bridge and callback tests are build-validated,
but no live Drive claim is made until a Google project/client is registered and
tested. Do not use the browser web client ID, register `tauri://` as a
JavaScript origin, or put tokens in the web database/localStorage.

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
