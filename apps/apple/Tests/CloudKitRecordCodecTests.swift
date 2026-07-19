import CloudKit
import GlassleafDomain
import Testing
@testable import Glassleaf

struct CloudKitRecordCodecTests {
    @Test func roundTripsProviderNeutralRecord() throws {
        let codec = CloudKitRecordCodec()
        let entityID = UUID()
        let parent = SyncRevision(
            generation: 6,
            updatedAt: Date(timeIntervalSinceReferenceDate: 50),
            deviceID: "phone"
        )
        let value = SyncRecord(
            id: SyncRecordID(kind: .annotation, entityID: entityID),
            revision: SyncRevision(
                generation: 7,
                updatedAt: Date(timeIntervalSinceReferenceDate: 75),
                deviceID: "mac"
            ),
            parentRevision: parent,
            payload: Data("note".utf8),
            contentHash: "hash",
            isTombstone: true
        )
        let mutationID = UUID()

        let encoded = codec.encode(value, mutationID: mutationID)

        #expect(try codec.decode(encoded) == value)
        #expect(codec.mutationID(from: encoded) == mutationID)
        #expect(codec.recordID(from: encoded.recordID) == value.id)
    }

    @Test func usesStableRecordNamesInsidePrivateZone() {
        let codec = CloudKitRecordCodec()
        let id = SyncRecordID(
            kind: .book,
            entityID: UUID(uuidString: "D1A96AC4-7498-4D05-B68B-1EE520A1C64C")!
        )

        let recordID = codec.recordID(for: id)

        #expect(recordID.recordName == "book.d1a96ac4-7498-4d05-b68b-1ee520a1c64c")
        #expect(recordID.zoneID.zoneName == CloudKitRecordCodec.zoneName)
        #expect(codec.recordID(from: CKRecord.ID(recordName: "invalid", zoneID: codec.zoneID)) == nil)
    }
}
