# React Native branch validation — 2026-09-06

Branch: `feat/react-native-app`. This is the new mobile implementation, not a certification of complete feature parity with the Swift app.

## Passed

- Strict TypeScript checks for mobile, shared catalog, and MCP packages.
- Prettier checks across the TypeScript implementation.
- Four focused catalog tests: atomic stale-plan rollback and undo; remote replay and conditional outbox acknowledgement; duplicate content/destructive patch rejection; bounded indexed queries against 10,000 records.
- An actual stdio MCP client/server exchange covering discovery, search, plan generation, revision validation, and unchanged original snapshot.
- iOS Simulator native build with Xcode 26.6; installed/launched on iPhone 17 Pro Max, iOS 26.5.
- Android ARM64 debug and release native compilation with JDK 17. The release APK bundles JavaScript for use without Metro; it uses the generated development signing key.
- Native simulator rendering inspected for the empty/populated library, EPUB chapter, PDF page, and RTL comic cover. These checks caught and fixed duplicated EPUB title content and reader safe-area contrast. Fixtures are original generated content, not personal books.

## Explicit limits

- No physical iOS/Android device session or Android emulator rendering was performed. Native compilation is not gesture, accessibility, or frame-time validation. Simulator UI automation was unavailable, so screenshots establish rendering only, not completion of interactive reader workflows.
- The 10,000-record test exercises host SQLite queries; it does not establish scrolling or import speed on a phone.
- No Google project/client IDs were supplied. Google sign-in, actual uploads/downloads, account recovery, and signed two-device sync remain unverified. Follow `apps/mobile/README.md` to configure and exercise them.
- CBR/RAR, vertical Japanese typesetting, full EPUB publisher/navigation fidelity, full-book text search/highlight rendering, nested/smart collections, full backup/restore, and a conflict-resolution UI remain outside this implementation.
- Existing Swift working-tree changes were preserved separately. The React Native app starts its own database and does not migrate existing Swift libraries automatically.

Local screenshots and the evaluation APK are under `outputs/react-native/`; generated binaries are deliberately not committed. The implementation, original fixtures, and setup documentation are committed.
