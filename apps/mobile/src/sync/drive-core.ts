import {
  bookSchema,
  organizationRecordSchema,
  type Book,
  type LibraryRepository,
} from "@glassleaf/library";
import { z } from "zod";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export type DriveAccount = { id: string; email?: string };

export interface DriveAuth {
  readonly configured: boolean;
  connect(): Promise<DriveAccount>;
  disconnect(): Promise<void>;
  accessToken(interactive: boolean): Promise<string>;
  account(): DriveAccount | undefined;
}

export interface DriveAssets {
  hasFile(path: string): Promise<boolean> | boolean;
  hashFile(path: string): Promise<string>;
  uploadBody(path: string): Promise<BodyInit>;
  installDownload(
    path: string,
    url: string,
    headers: Record<string, string>,
  ): Promise<void>;
  removeFile(path: string): Promise<void> | void;
  bookFileReady(book: Book): Promise<boolean> | boolean;
  unpack(book: Book): Promise<void>;
}

export type DriveFetch = typeof fetch;

const driveFileSchema = z.object({
  id: z.string(),
  appProperties: z.record(z.string(), z.string()).optional(),
});
const fileListSchema = z.object({
  files: z.array(driveFileSchema),
  nextPageToken: z.string().optional(),
});
type DriveFile = z.infer<typeof driveFileSchema>;

function isValidHash(value: string) {
  return /^[a-f0-9]{32}$/i.test(value);
}

function safeBookAsset(book: Book) {
  return (
    book.asset.path === `${book.id}/original.${book.format}` &&
    (!book.asset.cover || book.asset.cover.startsWith(`${book.id}/content/`))
  );
}

function safeDownloadedBook(book: Book) {
  return safeBookAsset(book) && /^[a-zA-Z0-9_-]+$/.test(book.id);
}

export class DriveSyncEngine {
  private readonly folderIDs = new Map<string, string>();
  private readonly active = new WeakMap<LibraryRepository, Promise<void>>();

  constructor(
    private readonly auth: DriveAuth,
    private readonly assets: DriveAssets,
    private readonly fetcher: DriveFetch = fetch,
  ) {}

  async connect(repo: LibraryRepository) {
    const account = await this.auth.connect();
    const previous = await repo.setting("drive-account-binding");
    if (previous && previous !== account.id) {
      await this.auth.disconnect();
      throw new Error(
        "This library is linked to a different Google account. Use that account to keep its sync history separate.",
      );
    }
    await repo.setSetting("drive-account-binding", account.id);
    await repo.setSetting("drive-account", account.id);
  }

  async disconnect(repo: LibraryRepository) {
    await this.auth.disconnect();
    const account = await repo.setting("drive-account");
    if (account) this.folderIDs.delete(account);
    await repo.setSetting("drive-account", "");
  }

  sync(repo: LibraryRepository, status: (message: string) => void) {
    const current = this.active.get(repo);
    if (current) return current;
    const run = this.performSync(repo, status).finally(() => {
      this.active.delete(repo);
    });
    this.active.set(repo, run);
    return run;
  }

  private async request(
    url: string,
    init: RequestInit = {},
    interactive = false,
  ): Promise<Response> {
    const access = await this.auth.accessToken(interactive);
    for (let attempt = 0; ; attempt++) {
      const response = await this.fetcher(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${access}` },
      });
      if (response.ok) return response;
      if (response.status === 401)
        throw new Error("Google sign-in expired. Reconnect your account.");
      if (response.status === 403)
        throw new Error(
          "Google Drive denied access. Check available storage and the app’s Drive permission.",
        );
      if ((response.status !== 429 && response.status < 500) || attempt >= 2)
        throw new Error(`Google Drive request failed (${response.status}).`);
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(2 ** attempt * 500, 2_000)),
      );
    }
  }

  private async listFiles(type: string, extra = ""): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `trashed=false and appProperties has { key='glassleaf' and value='v1' } and appProperties has { key='type' and value='${type}' }${extra}`,
        fields: "files(id,appProperties),nextPageToken",
        pageSize: "1000",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const result = fileListSchema.parse(
        await (await this.request(`${DRIVE_API}/files?${params}`)).json(),
      );
      files.push(...result.files);
      pageToken = result.nextPageToken;
    } while (pageToken);
    return files;
  }

  private async folder(repo: LibraryRepository, account: string) {
    const cached = this.folderIDs.get(account);
    if (cached) return cached;
    const stored = await repo.setting(`drive-folder:${account}`);
    if (stored) {
      this.folderIDs.set(account, stored);
      return stored;
    }
    const existing = await this.listFiles("folder");
    if (existing[0]) {
      this.folderIDs.set(account, existing[0].id);
      await repo.setSetting(`drive-folder:${account}`, existing[0].id);
      return existing[0].id;
    }
    const created = driveFileSchema.parse(
      await (
        await this.request(`${DRIVE_API}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Glassleaf",
            mimeType: "application/vnd.google-apps.folder",
            appProperties: { glassleaf: "v1", type: "folder" },
          }),
        })
      ).json(),
    );
    this.folderIDs.set(account, created.id);
    await repo.setSetting(`drive-folder:${account}`, created.id);
    return created.id;
  }

  private async upload(
    repo: LibraryRepository,
    account: string,
    name: string,
    properties: Record<string, string>,
    body: BodyInit,
    mime: string,
  ) {
    const response = await this.request(
      `${DRIVE_UPLOAD_API}/files?uploadType=resumable`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Upload-Content-Type": mime,
        },
        body: JSON.stringify({
          name,
          parents: [await this.folder(repo, account)],
          appProperties: { glassleaf: "v1", ...properties },
        }),
      },
    );
    const location = response.headers.get("location");
    if (!location?.startsWith("https://www.googleapis.com/"))
      throw new Error("Google returned an invalid upload URL.");
    await this.request(location, {
      method: "PUT",
      headers: { "Content-Type": mime },
      body,
    });
  }

  private async downloadJSON<T>(id: string, schema: z.ZodType<T>) {
    return schema.parse(
      await (
        await this.request(
          `${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`,
        )
      ).json(),
    );
  }

  private async performSync(
    repo: LibraryRepository,
    status: (message: string) => void,
  ) {
    const account = await repo.setting("drive-account");
    if (!account) throw new Error("Connect Google Drive first.");
    const current = this.auth.account();
    if (current && current.id !== account)
      throw new Error(
        "Google account changed. Reconnect the library’s original account.",
      );
    await this.auth.accessToken(false);

    const batches = await this.listFiles("batch");
    for (const [index, batch] of batches.entries()) {
      if (await repo.setting(`drive-batch:${account}:${batch.id}`)) continue;
      status(`Reading library changes ${index + 1} of ${batches.length}…`);
      const records = await this.downloadJSON(
        batch.id,
        z.array(bookSchema).max(100),
      );
      for (const book of records)
        if (!safeBookAsset(book))
          throw new Error("Remote book has an invalid asset path.");
      await repo.mergeRemote(records);
      await repo.setSetting(`drive-batch:${account}:${batch.id}`, "1");
    }

    const structures = await this.listFiles("organization-batch");
    for (const batch of structures) {
      const key = `drive-organization:${account}:${batch.id}`;
      if (await repo.setting(key)) continue;
      status("Syncing collections, reading lists and views…");
      const records = await this.downloadJSON(
        batch.id,
        z.array(organizationRecordSchema).max(100),
      );
      await repo.mergeOrganization(records);
      await repo.setSetting(key, "1");
    }

    const pending = await repo.pending();
    for (const [index, book] of pending.entries()) {
      if (book.deletedAt) continue;
      status(`Uploading book ${index + 1} of ${pending.length}…`);
      if (!isValidHash(book.asset.hash))
        throw new Error("Book has an invalid content checksum.");
      const assets = await this.listFiles(
        "asset",
        ` and appProperties has { key='hash' and value='${book.asset.hash}' }`,
      );
      if (!assets.length) {
        if (!(await this.assets.hasFile(book.asset.path)))
          throw new Error(
            `The original file for “${book.title}” is missing. Download or reimport it before syncing.`,
          );
        await this.upload(
          repo,
          account,
          `Glassleaf-${book.asset.hash}.${book.format}`,
          { type: "asset", hash: book.asset.hash },
          await this.assets.uploadBody(book.asset.path),
          "application/octet-stream",
        );
      }
    }

    for (let offset = 0; offset < pending.length; offset += 100) {
      const batch = pending.slice(offset, offset + 100);
      await this.upload(
        repo,
        account,
        `Glassleaf-changes-${Date.now()}-${offset}.json`,
        { type: "batch" },
        JSON.stringify(batch),
        "application/json",
      );
      await repo.acknowledge(batch);
    }

    const organization = await repo.pendingOrganization();
    for (let offset = 0; offset < organization.length; offset += 100) {
      const batch = organization.slice(offset, offset + 100);
      await this.upload(
        repo,
        account,
        `Glassleaf-organization-${Date.now()}-${offset}.json`,
        { type: "organization-batch" },
        JSON.stringify(batch),
        "application/json",
      );
      await repo.acknowledgeOrganization(batch);
    }

    const snapshot = await repo.snapshot();
    const assetFiles = await this.listFiles("asset");
    const assetsByHash = new Map(
      assetFiles
        .map((file) => [file.appProperties?.hash, file.id] as const)
        .filter((entry): entry is [string, string] => !!entry[0]),
    );
    for (const book of snapshot.books) {
      if (book.deletedAt || (await this.assets.bookFileReady(book))) continue;
      if (
        (await this.assets.hasFile(book.asset.path)) &&
        (await this.assets.hashFile(book.asset.path)) === book.asset.hash
      ) {
        await this.assets.unpack(book);
        continue;
      }
      status(`Downloading “${book.title}”…`);
      if (!isValidHash(book.asset.hash) || !safeDownloadedBook(book))
        throw new Error("Remote book has an unsafe file path or checksum.");
      const assetID = assetsByHash.get(book.asset.hash);
      if (!assetID)
        throw new Error(`The cloud file for “${book.title}” is missing.`);
      await this.assets.installDownload(
        book.asset.path,
        `${DRIVE_API}/files/${encodeURIComponent(assetID)}?alt=media`,
        { Authorization: `Bearer ${await this.auth.accessToken(false)}` },
      );
      if ((await this.assets.hashFile(book.asset.path)) !== book.asset.hash) {
        await this.assets.removeFile(book.asset.path);
        throw new Error(
          "Downloaded file failed its checksum. Sync again to retry.",
        );
      }
      await this.assets.unpack(book);
    }
  }
}
