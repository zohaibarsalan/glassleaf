# Glassleaf

An offline-first personal library and reader for EPUBs, PDFs, comics and manga.

## Applications

| Surface | Entry point | Distribution |
| --- | --- | --- |
| Web / PWA | `apps/web` | HTTPS, install to the iPhone Home Screen |
| Native mobile | `apps/mobile` | Expo development builds, iOS and Android |
| Desktop | `apps/desktop` | Tauri, macOS and Windows |

All three use `packages/app` for the shared experience and `packages/library` for SQLite-backed catalog, search and organization. Platform-specific readers, files and authentication resolve through `.web.ts(x)` and native adapters. `packages/mcp` provides external organization with review and undo. The original `apps/apple` SwiftUI app is a preserved legacy implementation, not a fourth active product.

## Develop

Use Node 24 (Node 22.13+ is supported) and pnpm 10.14.0.

```sh
pnpm install
pnpm web             # PWA on port 8081
pnpm ios             # Xcode / CocoaPods
pnpm android         # JDK 17 / Android SDK
pnpm desktop         # Rust / platform build tools
pnpm web:build       # installable static PWA in apps/web/dist
pnpm desktop:build   # package on the target OS
```

Native modules require an Expo development build. Local reading requires no cloud account. See [PWA installation and deployment](apps/web/README.md) and [Google Drive setup](apps/mobile/README.md#google-drive-setup).

## Verification and pull requests

Run checks locally before merging. This repository does not schedule hosted CI workflows for this work. Keep PRs focused and stacked: each branch targets the preceding branch so its diff contains one increment. Run `pnpm verify` for the complete shared/PWA gate; it records the commit, dirty state and individual results in `outputs/app-system/local-verification.json`. Use `pnpm verify:native` for iOS/Android JavaScript exports and `pnpm verify:desktop` for Rust checks/tests. Native development builds and desktop packaging remain separate platform checks. Record exact commands and results in each PR.

Live OAuth, actual multi-device sync, installed iPhone PWA behavior and Windows packaging require separate validation; a source build does not certify them.

See [the app architecture](docs/APP_SYSTEM.md), [current validation and PR stack](docs/APP_SYSTEM_VALIDATION.md), and [the earlier reader validation](docs/REACT_NATIVE_VALIDATION.md).
