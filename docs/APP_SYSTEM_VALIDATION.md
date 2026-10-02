# App system validation — 2 October 2026

The new app system has three active distribution surfaces: the installable PWA, Expo native mobile, and Tauri desktop. Shared source is in `packages/app`, `packages/ui`, `packages/library` and `packages/mcp`. The legacy Swift app and its uncommitted work remain separate.

## Review stack

The work was created in the isolated `glassleaf-next` worktree. Each branch targets the preceding branch; the first targets the existing desktop OAuth baseline rather than including the earlier 64 commits in its diff. All seven PRs are drafts; none has been merged. No hosted CI workflows were added or dispatched.

| PR | Branch | Increment |
| --- | --- | --- |
| [#9](https://github.com/zohaibarsalan/glassleaf/pull/9) | `feat/app-workspace` | Thin app entries and shared packages |
| [#10](https://github.com/zohaibarsalan/glassleaf/pull/10) | `feat/uniwind-design-system` | Uniwind and shared generated themes |
| [#11](https://github.com/zohaibarsalan/glassleaf/pull/11) | `feat/native-actions` | Expo UI SwiftUI/Material actions |
| [#12](https://github.com/zohaibarsalan/glassleaf/pull/12) | `feat/reading-room` | Reading room and cover-first shelves |
| [#13](https://github.com/zohaibarsalan/glassleaf/pull/13) | `feat/drive-incremental-sync` | Incremental Drive catalog and replay tests |
| [#14](https://github.com/zohaibarsalan/glassleaf/pull/14) | `feat/opfs-book-storage` | File worker, safe migration and storage UX |
| [#15](https://github.com/zohaibarsalan/glassleaf/pull/15) | `feat/local-platform-delivery` | Install assets, packaging, accessibility and local gates |

## Local source and build evidence

Code commit `886bd1f` passed `pnpm verify` from a clean worktree on macOS, Node 24.4.1, pnpm 10.14.0. The later documentation commit changes setup/validation guides and the public OAuth environment example only.

| Check | Result and scope |
| --- | --- |
| `pnpm verify` | Generated theme consistency, all workspace type checks, tests, formatting, production web export and three PWA shell tests passed |
| Library tests | 12 passed, including 10,000-book search/paging, atomic plans, revisions, conflict/replay and durable chapter indexing behavior |
| Sync tests | 13 passed across scheduling, account binding, checksum failure, paginated changes, removed files, cursor expiry, failed merges and replay |
| Storage tests | Six passed: legacy migration, failed migration/metadata writes, per-path serialization, missing files and failed removal |
| Other shared checks | Actual MCP protocol exchange, theme import/contrast validation and reader-location checks passed |
| `pnpm verify:native` | Both iOS and Android JavaScript/asset exports passed; no compiled native app or native-control interaction claim |
| `pnpm verify:desktop` | Rust checks and four OAuth callback tests passed with the scoped Rust 1.99.0 toolchain |
| `pnpm --filter @glassleaf/desktop tauri:build --bundles app` | macOS release app packaged successfully; Windows installer configuration exists but was not built here |

The local gate writes its commit, dirty state, timings and results to `outputs/app-system/local-verification.json`. Native and desktop logs are in the same ignored evidence directory. Run the complete local gate before merging each stack increment; run native/desktop checks whenever that increment affects those platforms.

## Runtime evidence

The local production PWA was exercised through the T3 Code preview at a 390 × 844 phone viewport. The reading room fits without horizontal overflow. Eight original sample publications were imported; 91 OPFS files were observed in the fresh production library, and the service worker controlled the page with the 19-asset offline shell cached. EPUB chapters rendered, next-chapter navigation advanced from 1 to 2, and saved progress survived reload. The CBZ reader rendered the first of 12 pages with RTL controls; the PDF reader rendered the first of eight pages to a real canvas.

The final browser dialog check moved initial focus to Close, Tab moved to the next action inside the dialog, and Escape closed the dialog and restored the Library tools trigger. RN Web dialogs activate immediately instead of waiting for a fade animation event; native dialogs retain their fade transition.

The packaged Mac app was opened through native app automation. Its fonts, shared Forest palette and desktop layout rendered correctly. Importing all eight sample books completed, and an EPUB chapter opened inside the packaged WebView. Tauri runtime styles require retaining the explicit inline style policy; automatic style nonce injection is disabled only for `style-src`, with script and other directives still enforced.

Preview snapshot capture failed in the client. Phone recordings were captured and inspected instead; no successful still-screenshot capture is claimed. Browser viewport checks and macOS WebView checks do not certify physical iPhone Safari, VoiceOver or Expo native UI.

## Release gates still open

- Deploy to HTTPS and validate actual iPhone Home Screen installation, relaunch, airplane-mode reading, storage retention, keyboard/safe-area behavior and app updates.
- Configure public Google OAuth client IDs and validate real sign-in, reconnect, cursor recovery and two-device sync with the same account. No live Google sync proof exists yet.
- Compile and exercise Expo development builds on iOS and Android, including SwiftUI/Material buttons, native readers and authentication.
- Build and run the NSIS installer on Windows; sign/notarize desktop distribution when publishing it.
- Complete legacy Swift database migration and remaining reader parity only as separately scoped work. CBR/RAR and DRM remain unsupported.

OPFS writes are published only after bytes flush and metadata commits. A crash between those steps can leave an unreferenced file; orphan cleanup remains future work. Browser data clearing still removes local records. Large original uploads use one resumable-session PUT without checkpointed chunk retries. Sync runs while the app is open, not as an OS background service.
