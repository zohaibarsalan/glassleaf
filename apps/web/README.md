# Glassleaf PWA

The browser application shares `packages/app` and `packages/ui` with Expo mobile and Tauri desktop. It reads EPUB, PDF and CBZ locally without an account. Google Drive is optional.

## Run and build

From the repository root:

```sh
pnpm install
pnpm web
pnpm verify
```

`pnpm web` serves the app on port 8081. `pnpm web:build` produces `apps/web/dist`, including the SQLite, OPFS file and PDF workers and a versioned service worker. The service worker precaches the app shell, styles, fonts and workers; books are stored separately in OPFS.

Copy this directory's `.env.example` to `.env.local` before configuring [Google Drive](../mobile/README.md#google-drive-setup). Rebuild after changing public OAuth client IDs. An expired browser token requires the explicit Reconnect Google Drive button; foreground sync never opens a sign-in popup.

## Install on iPhone

Deploy the contents of `dist` at the root of an HTTPS origin, preserving the worker and WASM paths. Serve WASM as `application/wasm`, JavaScript with a JavaScript MIME type, and allow `sw.js` to revalidate so updates arrive. This backend does not require COOP/COEP isolation headers.

Open the deployed HTTPS URL in Safari, then choose Share → Add to Home Screen. Open Glassleaf from that icon and import a book. This installation does not require Apple development signing. The phone cannot use your Mac's `localhost` URL.

Use Settings → Library tools → Protect downloaded books to request persistent storage when the browser supports it. Browser cleanup and clearing site data can still remove the local library; keep original books and shared records in Drive before relying on recovery. Sync runs while Glassleaf is open and is not a background service.

## Acceptance checks

On the actual installed iPhone PWA, import each supported format, open and navigate it, close/reopen at the saved position, and repeat after relaunch in airplane mode. Validate Home Screen icons, safe areas, keyboard/dialog behavior, updates, storage retention and real Google sign-in on the deployed origin. Local Chromium viewport checks do not certify Safari or installed-phone behavior. See [current validation](../../docs/APP_SYSTEM_VALIDATION.md).
