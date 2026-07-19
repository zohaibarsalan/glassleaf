# Glassleaf Sync Protocol

Status: local foundation. No remote provider is enabled yet.

## Purpose

Glassleaf sync must preserve a library across Apple devices without making iCloud, Google Drive, or a future Glassleaf service the data model. Providers transport records; Glassleaf owns identity, revisions, merging, validation, and recovery.

## Record model

- Every entity has a stable `SyncRecordID` made from a record kind and UUID.
- Provider payloads are opaque bytes. A provider must not interpret book metadata or reader data.
- Every mutation creates a `SyncRevision` and records its parent revision.
- Deletion is a versioned tombstone, never an immediate remote hard delete.
- Large EPUB assets are separate `bookAsset` records identified by a content hash.
- Manifests contain descriptors and cursors, not the full library payload.

The first schema covers books, assets, folders, tags, collections, series, smart collections, bookmarks, annotations, reading events, reader preferences, and the library record itself.

## Reading position

Reading progress is append-only. Each change is a `ReadingPositionEvent` with a stable ID, device ID, locator, fraction, and event time. The newest event wins even if its fraction is lower, because rereading an earlier chapter is a valid state. Progress must never be merged by taking the largest fraction.

## Conflict rules

1. Identical revisions are idempotent and produce no conflict.
2. A record whose parent is the other record's revision is its direct descendant and wins.
3. Two records that do not descend from each other are concurrent. Glassleaf keeps a deterministic projected winner and retains a conflict entry for user-visible recovery.
4. Tombstones follow the same ancestry rules as live records. A stale delete cannot erase a newer edit.
5. Reading events use unique identities and merge as an append-only set rather than conflicting with one another.

## Offline and retry guarantees

- Local mutations enter a durable outbox before a provider is contacted.
- Mutation IDs are stable across retries.
- A provider must acknowledge the same mutation ID idempotently.
- Outbox entries are removed only after acknowledgement is durably saved.
- Interrupted pulls and pushes resume from the last saved provider cursor.
- Provider errors never remove local records or queued mutations.

## Provider boundary

The provider interface is limited to availability, fetching changes since a cursor, and applying mutations. iCloud Drive is the first planned adapter. Google Drive can later implement the same interface without changing record identity or merge rules.

## Provider migration

A library has exactly one active sync authority. Migration is an explicit state machine:

1. Record the source provider and its last durable cursor.
2. Create and verify a portable backup fingerprint.
3. Import a compatible manifest into the destination.
4. Verify the destination record set and required assets.
5. Cut over authority only after all earlier gates succeed.

Before cutover, a failure can roll back to the source without changing authority. Glassleaf never operates iCloud and Google Drive as simultaneous writers for one library.

## Safety gates before enabling iCloud

- Deterministic merge, tombstone, conflict, and retry tests pass.
- The outbox and cursor survive a repository reopen.
- A portable library backup can be restored independently of remote state.
- Provider disconnect, stale cursor, quota, and partial-upload failures are surfaced without data loss.
