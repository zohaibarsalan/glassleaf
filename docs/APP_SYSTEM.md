# Glassleaf app system

## Direction

The installed PWA is the first personal iPhone distribution. Expo React Native remains the native iOS/Android application. Tauri packages the shared browser application for macOS and Windows. Develop one reading product with explicit platform adapters.

The organization follows useful patterns from [T3 Code](https://github.com/pingdotgg/t3code): small application entry points, shared packages for domain behavior, centrally pinned framework dependencies, generated theme variables and native controls where they improve the platform experience. Glassleaf does not need T3 Code's agent server, tunnel infrastructure, billing or Electron runtime.

## Boundaries

- `apps/web`: browser entry point, PWA shell, manifest and deployment.
- `apps/mobile`: Expo native configuration, icons and registration.
- `apps/desktop`: Tauri packaging and installed-app OAuth bridge.
- `packages/app`: shared screens, reader orchestration, platform adapters and application state.
- `packages/library`: typed catalog, SQLite access, search, organization and revision checks.
- `packages/mcp`: explicit snapshot/plan exchange with external agents.
- `apps/apple` and `packages/domain`: preserved legacy Swift implementation. Do not mix its CloudKit journal with the shared Drive library.

## Local and shared data

Each device owns its SQLite database, search index, downloaded originals and sync state. Google Drive holds original publications and portable shared records. Local mutations commit before upload. Changes are acknowledged only when the uploaded version still matches the pending record. Downloaded originals are checksum-verified.

Browser SQLite runs in a dedicated worker with the official SQLite WASM SAH-pool backend. One worker owns the library; tab locking prevents concurrent owners. The browser file adapter currently stores blobs in IndexedDB. OPFS files and incremental Drive Changes API tracking are subsequent platform increments, not claims about this initial structural refactor.

## Product design

Books and reading lead the interface. Use a restrained, distinctive editorial hierarchy, generous cover presentation, useful reading progress, compact library tools and adaptive phone/desktop navigation. Theme tokens carry semantic roles across platforms; imported themes retain their validation and persistence. Keyboard access, visible focus, touch target size, contrast and reduced motion are acceptance criteria.

## Delivery

Use focused commits and stacked PRs. Preserve unrelated working trees. No hosted CI workflows are added or dispatched; run the complete checks locally before a merge and attach real evidence. Treat browser, native build, native interaction, packaged desktop, provider and installed-phone evidence separately.
