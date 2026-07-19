import CloudKit
import Foundation
import GlassleafDomain

actor CloudKitSyncProvider: SyncProvider {
    static let containerIdentifier = "iCloud.app.glassleaf.reader"

    private let container: CKContainer
    private let database: CKDatabase
    private let codec: CloudKitRecordCodec
    private let assetStore: CloudBookAssetStore?
    private var isPrepared = false

    init(
        container: CKContainer = CKContainer(identifier: CloudKitSyncProvider.containerIdentifier),
        codec: CloudKitRecordCodec = CloudKitRecordCodec(),
        assetStore: CloudBookAssetStore? = nil
    ) {
        self.container = container
        database = container.privateCloudDatabase
        self.codec = codec
        self.assetStore = assetStore
    }

    func accountStatus() async throws -> CKAccountStatus {
        try await withCheckedThrowingContinuation { continuation in
            container.accountStatus { status, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: status)
                }
            }
        }
    }

    func prepare() async throws {
        guard !isPrepared else { return }
        switch try await accountStatus() {
        case .available:
            break
        case .restricted:
            throw CloudKitSyncError.restrictedAccount
        case .noAccount, .couldNotDetermine, .temporarilyUnavailable:
            throw CloudKitSyncError.accountUnavailable
        @unknown default:
            throw CloudKitSyncError.accountUnavailable
        }

        let zone = CKRecordZone(zoneID: codec.zoneID)
        let zoneResults = try await database.modifyRecordZones(saving: [zone], deleting: [])
        if let result = zoneResults.saveResults[codec.zoneID] {
            _ = try result.get()
        }

        let subscription = CKRecordZoneSubscription(
            zoneID: codec.zoneID,
            subscriptionID: CloudKitRecordCodec.subscriptionID
        )
        let notificationInfo = CKSubscription.NotificationInfo()
        notificationInfo.shouldSendContentAvailable = true
        subscription.notificationInfo = notificationInfo
        let subscriptionResults = try await database.modifySubscriptions(saving: [subscription], deleting: [])
        if let result = subscriptionResults.saveResults[CloudKitRecordCodec.subscriptionID] {
            _ = try result.get()
        }
        isPrepared = true
    }

    func fetchChanges(since cursor: SyncCursor?) async throws -> SyncChangeBatch {
        try await prepare()
        var token: CKServerChangeToken?
        do {
            token = try codec.decodeCursor(cursor)
        } catch CloudKitSyncError.invalidCursor {
            token = nil
        }

        var records: [SyncRecord] = []
        var latestToken = token
        var moreComing = true
        while moreComing {
            do {
                let batch = try await database.recordZoneChanges(
                    inZoneWith: codec.zoneID,
                    since: latestToken,
                    desiredKeys: nil,
                    resultsLimit: 400
                )
                for result in batch.modificationResultsByID.values {
                    let modification = try result.get()
                    let syncRecord = try codec.decode(modification.record)
                    if let assetStore {
                        try await assetStore.installDownloadedAsset(from: modification.record, syncRecord: syncRecord)
                    }
                    records.append(syncRecord)
                }
                latestToken = batch.changeToken
                moreComing = batch.moreComing
            } catch let error as CKError where error.code == .changeTokenExpired {
                guard latestToken != nil else { throw error }
                latestToken = nil
                records.removeAll(keepingCapacity: true)
            }
        }

        return SyncChangeBatch(
            records: records,
            cursor: try latestToken.map(codec.encodeCursor)
        )
    }

    func apply(_ mutations: [SyncMutation]) async throws -> SyncPushResult {
        guard !mutations.isEmpty else {
            return SyncPushResult(acknowledgedMutationIDs: [])
        }
        try await prepare()

        let recordIDs = mutations.map { codec.recordID(for: $0.record.id) }
        let fetched = try await database.records(for: recordIDs)
        var existingByID: [CKRecord.ID: CKRecord] = [:]
        for (recordID, result) in fetched {
            if case .success(let record) = result { existingByID[recordID] = record }
        }

        var recordsToSave: [CKRecord] = []
        var mutationByRecordID: [CKRecord.ID: SyncMutation] = [:]
        var acknowledged = Set<UUID>()
        var remoteRecords: [SyncRecord] = []

        for mutation in mutations {
            let recordID = codec.recordID(for: mutation.record.id)
            let existing = existingByID[recordID]
            if existing.flatMap(codec.mutationID(from:)) == mutation.id {
                acknowledged.insert(mutation.id)
                continue
            }

            if let existing,
               let remote = try? codec.decode(existing),
               remote != mutation.record,
               remote.revision != mutation.baseRevision {
                remoteRecords.append(remote)
                let merged = SyncMergePolicy.merge(local: mutation.record, remote: remote)
                if merged.record == remote {
                    acknowledged.insert(mutation.id)
                    continue
                }
            }

            let cloudRecord = codec.encode(mutation.record, mutationID: mutation.id, into: existing)
            if let assetStore {
                try await assetStore.attachLocalAsset(to: cloudRecord, syncRecord: mutation.record)
            }
            recordsToSave.append(cloudRecord)
            mutationByRecordID[recordID] = mutation
        }

        if !recordsToSave.isEmpty {
            let result = try await database.modifyRecords(
                saving: recordsToSave,
                deleting: [],
                savePolicy: .ifServerRecordUnchanged,
                atomically: false
            )
            for record in recordsToSave {
                guard let mutation = mutationByRecordID[record.recordID],
                      let saveResult = result.saveResults[record.recordID] else {
                    throw CloudKitSyncError.missingServerResult(record.recordID.recordName)
                }
                switch saveResult {
                case .success:
                    acknowledged.insert(mutation.id)
                case .failure(let error):
                    if let server = Self.serverRecord(from: error),
                       let decoded = try? codec.decode(server) {
                        remoteRecords.append(decoded)
                    } else {
                        throw error
                    }
                }
            }
        }

        return SyncPushResult(
            acknowledgedMutationIDs: acknowledged,
            remoteRecords: remoteRecords
        )
    }

    private static func serverRecord(from error: Error) -> CKRecord? {
        let value = error as NSError
        return value.userInfo[CKRecordChangedErrorServerRecordKey] as? CKRecord
    }
}
