export type FileRecord =
  | { path: string; blob: Blob }
  | { path: string; opfsFile: string; mime: string; size: number };
export interface FileMetadata {
  get(path: string): Promise<FileRecord | undefined>;
  put(record: FileRecord): Promise<void>;
  remove(path: string): Promise<void>;
}
export interface FileDisk {
  read(name: string): Promise<Blob | undefined>;
  write(name: string, blob: Blob): Promise<void>;
  remove(name: string): Promise<void>;
}
/** The metadata transaction publishes a file only after its bytes have flushed. */
export class BrowserFileStore {
  private readonly jobs = new Map<string, Promise<unknown>>();
  constructor(
    private readonly metadata: FileMetadata,
    private readonly disk?: FileDisk,
    private readonly unique = () => crypto.randomUUID(),
  ) {}
  private serialize<T>(path: string, action: () => Promise<T>): Promise<T> {
    const job = (this.jobs.get(path) ?? Promise.resolve())
      .catch(() => {})
      .then(action);
    this.jobs.set(path, job);
    const finish = () => {
      if (this.jobs.get(path) === job) this.jobs.delete(path);
    };
    void job.then(finish, finish);
    return job;
  }
  private async publish(
    path: string,
    blob: Blob,
    previous: FileRecord | undefined,
  ) {
    if (!this.disk) {
      await this.metadata.put({ path, blob });
      return;
    }
    const name = this.unique();
    try {
      await this.disk.write(name, blob);
      await this.metadata.put({
        path,
        opfsFile: name,
        mime: blob.type,
        size: blob.size,
      });
    } catch (error) {
      await this.disk.remove(name).catch(() => {});
      throw error;
    }
    if (previous && "opfsFile" in previous)
      await this.disk.remove(previous.opfsFile).catch(() => {});
  }
  get(path: string) {
    return this.serialize(path, async () => {
      const record = await this.metadata.get(path);
      if (!record) return undefined;
      if ("blob" in record) {
        // Migration is an enhancement: low disk space must not prevent reading an existing book.
        if (this.disk)
          await this.publish(path, record.blob, record).catch(() => {});
        return record.blob;
      }
      const blob = await this.disk?.read(record.opfsFile);
      if (!blob) return undefined;
      if (blob.size !== record.size)
        throw new Error(
          "The downloaded file is incomplete. Download it again.",
        );
      return blob.slice(0, blob.size, record.mime);
    });
  }
  set(path: string, blob: Blob) {
    return this.serialize(path, async () =>
      this.publish(path, blob, await this.metadata.get(path)),
    );
  }
  remove(path: string) {
    return this.serialize(path, async () => {
      const previous = await this.metadata.get(path);
      await this.metadata.remove(path);
      if (previous && "opfsFile" in previous)
        await this.disk?.remove(previous.opfsFile).catch(() => {});
    });
  }
}
