import CloudKit
import Foundation
import GlassleafDomain

/// Converts provider-neutral sync records to the single CloudKit record type used by Glassleaf.
struct CloudKitRecordCodec: Sendable {
    static let recordType = "GlassleafRecord"
    static let zoneName = "GlassleafLibrary"
    static let subscriptionID = "glassleaf-library-changes-v1"

    let zoneID = CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)

    func recordID(for id: SyncRecordID) -> CKRecord.ID {
        CKRecord.ID(recordName: "\(id.kind.rawValue).\(id.entityID.uuidString.lowercased())", zoneID: zoneID)
    }

    func recordID(from cloudID: CKRecord.ID) -> SyncRecordID? {
        let components = cloudID.recordName.split(separator: ".", maxSplits: 1).map(String.init)
        guard components.count == 2,
              let kind = SyncRecordKind(rawValue: components[0]),
              let entityID = UUID(uuidString: components[1]) else { return nil }
        return SyncRecordID(kind: kind, entityID: entityID)
    }

    func encode(_ value: SyncRecord, mutationID: UUID, into existing: CKRecord? = nil) -> CKRecord {
        let record = existing ?? CKRecord(recordType: Self.recordType, recordID: recordID(for: value.id))
        record["kind"] = value.id.kind.rawValue as CKRecordValue
        record["entityID"] = value.id.entityID.uuidString.lowercased() as CKRecordValue
        record["generation"] = Int64(clamping: value.revision.generation) as CKRecordValue
        record["updatedAt"] = value.revision.updatedAt as CKRecordValue
        record["deviceID"] = value.revision.deviceID as CKRecordValue
        record["payload"] = value.payload as CKRecordValue
        record["isTombstone"] = NSNumber(value: value.isTombstone)
        record["mutationID"] = mutationID.uuidString.lowercased() as CKRecordValue
        record["contentHash"] = value.contentHash as CKRecordValue?
        record["parentGeneration"] = value.parentRevision.map { Int64(clamping: $0.generation) } as CKRecordValue?
        record["parentUpdatedAt"] = value.parentRevision?.updatedAt as CKRecordValue?
        record["parentDeviceID"] = value.parentRevision?.deviceID as CKRecordValue?
        return record
    }

    func decode(_ record: CKRecord) throws -> SyncRecord {
        guard let kindValue = record["kind"] as? String,
              let kind = SyncRecordKind(rawValue: kindValue),
              let entityValue = record["entityID"] as? String,
              let entityID = UUID(uuidString: entityValue),
              let generation = record["generation"] as? Int64,
              generation >= 0,
              let updatedAt = record["updatedAt"] as? Date,
              let deviceID = record["deviceID"] as? String,
              let payload = record["payload"] as? Data else {
            throw CloudKitSyncError.invalidRecord(record.recordID.recordName)
        }

        let parent: SyncRevision?
        if let parentGeneration = record["parentGeneration"] as? Int64,
           parentGeneration >= 0,
           let parentUpdatedAt = record["parentUpdatedAt"] as? Date,
           let parentDeviceID = record["parentDeviceID"] as? String {
            parent = SyncRevision(
                generation: UInt64(parentGeneration),
                updatedAt: parentUpdatedAt,
                deviceID: parentDeviceID
            )
        } else {
            parent = nil
        }

        return SyncRecord(
            id: SyncRecordID(kind: kind, entityID: entityID),
            revision: SyncRevision(
                generation: UInt64(generation),
                updatedAt: updatedAt,
                deviceID: deviceID
            ),
            parentRevision: parent,
            payload: payload,
            contentHash: record["contentHash"] as? String,
            isTombstone: (record["isTombstone"] as? NSNumber)?.boolValue ?? false
        )
    }

    func mutationID(from record: CKRecord) -> UUID? {
        (record["mutationID"] as? String).flatMap(UUID.init(uuidString:))
    }

    func encodeCursor(_ token: CKServerChangeToken) throws -> SyncCursor {
        let data = try NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true)
        return SyncCursor(rawValue: data.base64EncodedString())
    }

    func decodeCursor(_ cursor: SyncCursor?) throws -> CKServerChangeToken? {
        guard let cursor else { return nil }
        guard let data = Data(base64Encoded: cursor.rawValue),
              let token = try NSKeyedUnarchiver.unarchivedObject(ofClass: CKServerChangeToken.self, from: data) else {
            throw CloudKitSyncError.invalidCursor
        }
        return token
    }
}

enum CloudKitSyncError: LocalizedError, Sendable {
    case accountUnavailable
    case restrictedAccount
    case invalidRecord(String)
    case invalidCursor
    case missingServerResult(String)

    var errorDescription: String? {
        switch self {
        case .accountUnavailable:
            "Sign in to iCloud in System Settings before enabling Glassleaf sync."
        case .restrictedAccount:
            "This iCloud account can’t use CloudKit on this device."
        case .invalidRecord(let name):
            "iCloud returned a Glassleaf record that couldn’t be read (\(name))."
        case .invalidCursor:
            "Glassleaf’s saved iCloud change token is invalid. A full refresh is required."
        case .missingServerResult(let name):
            "iCloud didn’t return a result for \(name)."
        }
    }
}
