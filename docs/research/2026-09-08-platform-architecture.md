# Glassleaf platform architecture (2026-09-08)

## Decision

Keep `packages/library` and the current local-first model as the shared core. Use the Expo/React Native app for iOS and Android, export the same React Native Web UI for the browser/PWA, and package that web export in Tauri for macOS, Windows, and Linux. Do not grow a second Swift desktop/mobile product for this work.

For the MVP, use Google directly:

1. Google identity (`openid profile email`) identifies the user and provides the account binding shown in the existing Drive settings.
2. A separate, explicit Google Drive authorization requests `drive.file` for Glassleaf-created/opened files. The Google web guidance intentionally separates sign-in (who the user is) from authorization (what data the app may access). Keep those consent moments and token lifetimes separate.
3. Drive remains the user’s storage. Glassleaf stores metadata, reading progress, organization records, immutable batches, and original book assets in the user’s Drive folder; there is no Glassleaf file-storage bill in this design.
4. Automatic sync means a bounded foreground sync on launch, app resume, browser visibility/online events, and after a local mutation. A timer may retry while the app is active and a valid token is already available. It must never open a consent dialog in the background. Native OS background work and PWA background sync are later enhancements.

This meets the free/local-first requirement without adding a hosted identity database or backend proxy. Add a hosted auth service only when Glassleaf needs an independent account, non-Google sign-in, server-owned entitlements, or a server API.

## Current repository fit

- `apps/mobile` is Expo SDK 57 / React Native 0.86 with `expo-sqlite`; the SQLite database is the local source of truth.
- `packages/library` exposes a small `SQL` interface and the repository already owns revisions, tombstones, outbox, conflicts, organization records, and FTS5 search.
- `apps/mobile/src/sync/drive.ts` already has Google Sign-In, `drive.file`, per-account binding, immutable book/organization batches, checksums, and resumable-upload negotiation. `drive.web.ts` deliberately fails today.
- The current readers are native-only at the asset boundary: EPUB uses `react-native-webview` plus `file://` HTML, PDF uses `react-native-pdf`, and import/search use native file APIs and native ZIP extraction. The current web build is therefore not a functional reader/PWA yet.
- `apps/apple` has a separate Swift/CloudKit implementation. Treat it as an existing product/compatibility surface while the new cross-platform path is validated; do not share CloudKit and Drive cursors or run two writers against one library.

## Platform shape

### Shared core

Keep the domain schemas, repository, merge rules, conflict retention, and sync record protocol in `packages/library`. Extract the provider-neutral Drive engine from `drive.ts` so platform files only supply these adapters:

- `LibraryDatabase`: native `expo-sqlite`; web SQLite/WASM or an IndexedDB-backed implementation of the existing SQL contract.
- `LibraryAssetStore`: native app documents plus ZIP extraction; browser IndexedDB/OPFS plus Blob URLs and browser ZIP extraction.
- `DriveAuth`: platform OAuth and secure token lifetime. Return short-lived access tokens to the transport; never persist access tokens in `localStorage`.
- `DriveTransport`: list, upload, download, checksum, retry/backoff, and immutable-batch operations shared by native, web, and Tauri.

The browser adapter must not pretend that a native path exists. A book is readable only after its original bytes and extracted/indexed browser representation are present. Keep the same content hash and stable relative asset identity across adapters so native and web batches interoperate.

### Native iOS and Android

Continue with Expo development builds and native modules for import, file storage, ZIP handling, EPUB WebView, and PDF rendering. Keep Google credentials public client identifiers only. Use the installed-app OAuth/Google Sign-In flow with PKCE/system browser semantics; no client secret belongs in the binary. The local repository stays usable with no account or network.

### Browser and iPhone PWA

Export the Expo web bundle, add a manifest (`display: standalone`, stable `id`, 192/512 icons), and add a carefully scoped Workbox service worker. Expo recommends native apps for the strongest offline behavior and warns that an aggressive service worker can make updates difficult. Cache the shell and reader code; let the asset store own book bytes and version them explicitly.

Use browser storage for both metadata and assets. `expo-sqlite` web support is currently documented as alpha and requires WASM plus `Cross-Origin-Embedder-Policy`/`Cross-Origin-Opener-Policy` headers. It is a viable first adapter if deployment can guarantee those headers; otherwise implement the same SQL contract over IndexedDB and keep FTS/search as a browser-specific adapter. Do not use `localStorage` for books, tokens, or the SQLite database.

The PWA needs browser-native readers:

- EPUB: unzip in JavaScript, sanitize chapter HTML, resolve images/styles to Blob URLs, and render in a same-origin iframe/DOM reader with the existing locator, anchor, selection, note, direction, and pagination protocol.
- PDF: use a browser PDF renderer (PDF.js or equivalent) with page/outline/night-mode adapters matching `PDFPages`.
- CBZ: unzip pages to Blob URLs and reuse the existing page order, spread, RTL, zoom, and progress semantics.

On iPhone, installation is a user action in Safari’s Share menu → Add to Home Screen → Open as Web App. It is a Home Screen web app with browser storage and WebKit lifecycle limits, not an App Store binary. Test storage pressure/eviction, large-book import, file picker, OAuth return, viewport/orientation, and resume behavior on physical iPhones. Never promise reliable OS-level background sync from the PWA; foreground sync is the contract.

Google Identity Services for web should use its authentication flow for identity and its authorization flow for Drive. Keep the web access token in memory; on expiry/401, mark Drive disconnected and ask the user to reconnect. A service worker or visibility timer must not trigger consent.

### Desktop

Package the browser export in Tauri. Tauri supplies platform installers and signing paths for macOS, Windows, and Linux, while the UI remains the same React Native Web UI. Give Tauri a narrow bridge for native file import, large asset storage, secure credential storage, and optional system file associations. If the bridge is unavailable, the desktop build can use the browser adapter. Desktop Google OAuth should use the installed-app PKCE flow with a loopback/custom redirect and an OS secure store; do not put a client secret in the package.

This is a packaging decision, not a promise of identical native capabilities: the Tauri WebView and browser still require the browser reader adapters. Code signing/notarization and WebView2/WebKit prerequisites are release work.

## Clerk versus WorkOS

Neither product is Google Drive storage, a book CDN, or a replacement for Drive OAuth. Both can manage app identity/session data; Drive still owns the files and its own quota.

| Option | Current official offer | Fit for Glassleaf |
| --- | --- | --- |
| Direct Google | No extra Glassleaf auth service; Google identity and Drive consent are separate | Recommended MVP. Keeps the local-first app usable without a hosted account and matches the user-owned Drive model. |
| Clerk | Expo SDK supports native/web flows and Google sign-in; Hobby is free up to 50,000 monthly retained users, with a fixed seven-day session lifetime and free-tier feature limits | Best hosted-auth fallback if Glassleaf needs polished cross-platform account UI, non-Google login, or future billing. It still needs a separate Drive authorization and token strategy. |
| WorkOS AuthKit | AuthKit is free up to 1 million MAUs, but production requires billing information; its public OAuth applications require PKCE and its strongest value is organization/enterprise identity | Strong enterprise/B2B choice, but unnecessary surface area for a consumer/local-first reader and no Expo-first advantage over direct Google/Clerk. |

If an independent Glassleaf account becomes necessary, choose Clerk first for this Expo product. Revisit WorkOS only when enterprise SSO, SCIM, or organization administration is a real requirement. Do not add either service merely to make Google Drive sync work.

## Cost and data boundaries

- Google says standard Drive API use is currently available at no additional cost, subject to per-project/per-user quotas and the user’s Drive storage capacity. Google documents possible billing for usage beyond new quota thresholds later in 2026; implement backoff and bounded sync rather than treating “free” as unlimited.
- The free Clerk/WorkOS auth tiers cover identity service usage only. They do not provide book bytes or Drive capacity.
- Native app documents, browser IndexedDB/OPFS, and a Tauri local directory are local device storage with platform quota/eviction/backup behavior. They are not a cloud backup until Drive upload is acknowledged.
- Do not put book content, Drive refresh tokens, or long-lived credentials in the Glassleaf app database or browser `localStorage`. Native long-lived credentials belong in OS secure storage/SDK-managed sessions; browser Drive authorization must be re-acquirable in a user gesture unless a future backend securely owns refresh tokens.

## Implementation boundaries and acceptance gates

1. First extract shared Drive transport and define the database/asset/auth adapters. Preserve `drive.file`, account binding, checksums, immutable batches, conditional acknowledgement, conflict retention, and safe-path checks.
2. Fix provider state before web work: scope folder IDs by account and reset on disconnect/account change; do not upload a tombstone that requires a missing original; avoid downloading every missing book during each sync; add bounded pagination/cursors and exponential backoff.
3. Add browser metadata/assets and the three browser reader adapters. A PWA milestone is not complete while EPUB still relies on `react-native-webview`, PDF on `react-native-pdf`, or `drive.web.ts` throws by design.
4. Add foreground automatic sync and explicit reconnect states. Sync failures must leave local reading and pending outbox records intact.
5. Verify with real Google OAuth credentials on iOS, Android, web/PWA, and Tauri; then run a two-device same-account test for import, progress, notes, offline edits, reconnect, conflict, trash/restore, and a large asset. No live auth/sync claim is valid before this gate.

## Unresolved credentials and product choices

- Google Cloud project and Drive API enablement.
- OAuth consent screen, publishing/testing users, and verification status.
- iOS client for bundle `app.glassleaf.mobile`.
- Android client for package `app.glassleaf.mobile` and every debug/release signing SHA-1.
- Web client and authorized JavaScript origins/redirect behavior.
- Desktop client/redirect choice for Tauri (loopback versus custom scheme).
- Whether Glassleaf needs only `drive.file` (current visible Glassleaf folder/batches) or an app-private `drive.appdata` record in addition. Do not broaden to `drive`/`drive.readonly` without a product requirement and verification plan.
- Hosting that can supply HTTPS, PWA manifest/service worker, and the cross-origin isolation headers if the web SQLite/WASM adapter is selected.
- No Clerk or WorkOS instance/keys are configured. Keep them out of the initial implementation until the independent-account requirement is explicit.

## Official sources

- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/)
- [Expo Progressive Web Apps](https://docs.expo.dev/guides/progressive-web-apps/)
- [Expo SQLite web setup and limitations](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/)
- [Google Identity Services: web authentication and authorization](https://developers.google.com/identity/oauth2/web/guides/overview)
- [Google OAuth 2.0 for iOS and desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Google Drive scopes, `drive.file`, and refresh-token guidance](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google Drive usage limits and current pricing note](https://developers.google.com/workspace/drive/api/guides/limits)
- [Apple: add a website as an iPhone web app](https://support.apple.com/en-euro/guide/iphone/iphea86e5236/ios)
- [WebKit: Web Push and Home Screen web-app behavior](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Tauri distribution and installers](https://tauri.app/distribute/)
- [Clerk pricing](https://clerk.com/pricing) and [Clerk Expo Google sign-in](https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-google)
- [WorkOS AuthKit pricing](https://workos.com/pricing), [production/staging requirements](https://workos.com/docs/authkit/environments), and [public OAuth/PKCE](https://workos.com/docs/authkit/connect/oauth)
