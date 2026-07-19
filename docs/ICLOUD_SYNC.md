# iCloud Sync

Status: implemented behind an explicit user opt-in; signed multi-device CloudKit validation remains a release gate.

## User behavior

- The library remains fully local and readable while offline.
- iCloud sync is off by default and is enabled from the iCloud settings sheet.
- Enabling sync checks the current iCloud account before publishing anything.
- An empty second device pulls the existing cloud library before it publishes its defaults.
- Local edits enter the durable SQLite outbox and retry without blocking the UI.
- Sync runs after launch, after local changes settle, when the app becomes active, when the user chooses **Sync Now**, and after a silent CloudKit notification.
- Turning sync off keeps every downloaded book on the device and leaves the private iCloud copy untouched.

The UI distinguishes synced, syncing, offline, account unavailable, quota exceeded, and unexpected failure states. CloudKit operations are created lazily, so local-only launches do not initialize a cloud container or perform network work.

## CloudKit layout

- Container: `iCloud.app.glassleaf.reader`
- Database: the signed-in user's private database
- Custom zone: `GlassleafLibrary`
- Record type: `GlassleafRecord`
- Subscription: `glassleaf-library-changes-v1`
- Record name: `<record-kind>.<stable-uuid>`

Glassleaf owns the record schema, revisions, merge policy, and durable cursor. CloudKit only transports the provider-neutral records described in [SYNC_PROTOCOL.md](./SYNC_PROTOCOL.md). The saved `CKServerChangeToken` is persisted in the same SQLite journal as the outbox.

## Synchronized data

- Books and original DRM-free EPUB files
- Folders, tags, collections, ordered series, and smart collections
- Reading positions and reading states
- Bookmarks, highlights, and notes
- Reader preferences
- Tombstones and conflict records

EPUBs use `CKAsset`. Downloaded assets are staged, SHA-256 verified, safely extracted, and installed into the local library before their records are materialized. Cloud payloads only keep the small asset descriptor and content hash in the SQLite journal.

## Consistency and recovery

- Every mutation has a stable mutation ID for idempotent retry.
- Server change tags protect updates with `ifServerRecordUnchanged` saves.
- Concurrent records use the deterministic domain merge policy and preserve conflicts.
- Reading positions remain append-only events; the newest valid event wins even when it moves backward.
- Deletions synchronize as tombstones instead of immediate hard deletes.
- Expired server tokens trigger a full zone refresh.
- Fetches and saves are batched for large libraries.

## Project configuration

The universal app target uses [Glassleaf.entitlements](../apps/apple/Support/Glassleaf.entitlements), which declares CloudKit, the private container, and development push notifications. `Info.plist` enables background remote notifications. Production archives must use a provisioning profile that contains the same CloudKit container and production push entitlement.

Apple treats the private database as user-owned storage and requires an available signed-in iCloud account. Zone subscriptions are notification hints, so Glassleaf always fetches changes from its durable token instead of treating a notification as the data itself. See Apple's [private database](https://developer.apple.com/documentation/cloudkit/ckcontainer/privateclouddatabase) and [record-zone subscription](https://developer.apple.com/documentation/cloudkit/ckrecordzonesubscription) documentation.

## Verification

Repeatable local checks:

```sh
xcodebuild -project apps/apple/Glassleaf.xcodeproj \
  -scheme Glassleaf \
  -destination 'platform=macOS' \
  CODE_SIGNING_ALLOWED=NO test

xcodebuild -project apps/apple/Glassleaf.xcodeproj \
  -scheme Glassleaf \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  test
```

The codec tests verify stable CloudKit IDs and lossless round-tripping of provider-neutral records on macOS and iOS. Before release, a signed two-device matrix must additionally cover first sync, concurrent edits, offline replay, process interruption, expired tokens, account switching, quota exhaustion, deleted assets, and a stale client.
