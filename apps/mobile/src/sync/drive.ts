import { bookSchema, type LibraryRepository } from "@glassleaf/library";
import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";
import { z } from "zod";
import {
  hasFile,
  bookFileReady,
  hashFile,
  installDownload,
  nativeFile,
  unpack,
} from "../data/files";
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
export const driveConfigured =
  Platform.OS !== "web" &&
  !!webClientId &&
  (Platform.OS !== "ios" || !!iosClientId);
let configured = false;
function configure() {
  if (!driveConfigured)
    throw new Error(
      "Google OAuth client IDs are not configured in this build.",
    );
  if (!configured) {
    GoogleSignin.configure({
      iosClientId,
      webClientId,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });
    configured = true;
  }
}
async function token() {
  configure();
  if (!GoogleSignin.getCurrentUser()) await GoogleSignin.signInSilently();
  return (await GoogleSignin.getTokens()).accessToken;
}
export async function connectDrive(repo: LibraryRepository) {
  configure();
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) throw new Error("Sign-in was cancelled.");
  const account = response.data.user.id;
  const previous = await repo.setting("drive-account-binding");
  if (previous && previous !== account) {
    await GoogleSignin.signOut();
    throw new Error(
      "This library is linked to a different Google account. Use that account to keep its sync history separate.",
    );
  }
  await repo.setSetting("drive-account-binding", account);
  await repo.setSetting("drive-account", account);
}
export async function disconnectDrive(repo: LibraryRepository) {
  configure();
  await GoogleSignin.signOut();
  await repo.setSetting("drive-account", "");
}
const driveFileSchema = z.object({
  id: z.string(),
  appProperties: z.record(z.string(), z.string()).optional(),
});
const fileListSchema = z.object({
  files: z.array(driveFileSchema),
  nextPageToken: z.string().optional(),
});
async function request(url: string, init: RequestInit = {}): Promise<Response> {
  const access = await token();
  const response = await expoFetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${access}` },
  });
  if (!response.ok) {
    if (response.status === 401)
      throw new Error("Google sign-in expired. Reconnect your account.");
    if (response.status === 403)
      throw new Error(
        "Google Drive denied access. Check available storage and the app’s Drive permission.",
      );
    if (response.status === 429 || response.status >= 500)
      throw new Error(
        "Google Drive is busy. Your local changes are safe; try syncing again shortly.",
      );
    throw new Error(`Google Drive request failed (${response.status}).`);
  }
  return response;
}
async function listFiles(type: string, extra = "") {
  const files: z.infer<typeof driveFileSchema>[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `trashed=false and appProperties has { key='glassleaf' and value='v1' } and appProperties has { key='type' and value='${type}' }${extra}`,
      fields: "files(id,appProperties),nextPageToken",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const result = fileListSchema.parse(
      await (
        await request(`https://www.googleapis.com/drive/v3/files?${params}`)
      ).json(),
    );
    files.push(...result.files);
    pageToken = result.nextPageToken;
  } while (pageToken);
  return files;
}
let folderID: string | undefined;
async function folder() {
  if (folderID) return folderID;
  const existing = await listFiles("folder");
  if (existing[0]) {
    folderID = existing[0].id;
    return folderID;
  }
  const created = driveFileSchema.parse(
    await (
      await request("https://www.googleapis.com/drive/v3/files", {
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
  folderID = created.id;
  return folderID;
}
async function upload(
  name: string,
  properties: Record<string, string>,
  bytes: Uint8Array | Blob,
  mime: string,
) {
  const response = await request(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Upload-Content-Type": mime,
      },
      body: JSON.stringify({
        name,
        parents: [await folder()],
        appProperties: { glassleaf: "v1", ...properties },
      }),
    },
  );
  const location = response.headers.get("location");
  if (!location?.startsWith("https://www.googleapis.com/"))
    throw new Error("Google returned an invalid upload URL.");
  // File implements Blob natively, so large books do not become base64 strings in JS.
  await request(location, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: bytes as BodyInit,
  });
}
let active: Promise<void> | undefined;
export function syncDrive(
  repo: LibraryRepository,
  status: (message: string) => void,
): Promise<void> {
  return (active ??= performSync(repo, status).finally(() => {
    active = undefined;
  }));
}
async function performSync(
  repo: LibraryRepository,
  status: (message: string) => void,
) {
  const account = await repo.setting("drive-account");
  if (!account) throw new Error("Connect Google Drive first.");
  await token();
  if (GoogleSignin.getCurrentUser()?.user.id !== account)
    throw new Error(
      "Google account changed. Reconnect the library’s original account.",
    );
  // Immutable batches prevent concurrent devices from overwriting one shared manifest.
  // Batch IDs are cached after merging; retries can replay records safely.
  const batches = await listFiles("batch");
  for (const [index, batch] of batches.entries()) {
    if (await repo.setting(`drive-batch:${account}:${batch.id}`)) continue;
    status(`Reading library changes ${index + 1} of ${batches.length}…`);
    const records = z
      .array(bookSchema)
      .max(100)
      .parse(
        await (
          await request(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(batch.id)}?alt=media`,
          )
        ).json(),
      );
    for (const book of records) {
      if (
        book.asset.path !== `${book.id}/original.${book.format}` ||
        (book.asset.cover &&
          !book.asset.cover.startsWith(`${book.id}/content/`))
      )
        throw new Error("Remote book has an invalid asset path.");
    }
    await repo.mergeRemote(records);
    await repo.setSetting(`drive-batch:${account}:${batch.id}`, "1");
  }
  const pending = await repo.pending();
  for (const [index, book] of pending.entries()) {
    status(`Uploading book ${index + 1} of ${pending.length}…`);
    if (!/^[a-f0-9]{32}$/i.test(book.asset.hash))
      throw new Error("Book has an invalid content checksum.");
    const assets = await listFiles(
      "asset",
      ` and appProperties has { key='hash' and value='${book.asset.hash}' }`,
    );
    if (!assets.length) {
      if (!hasFile(book.asset.path))
        throw new Error(
          `The original file for “${book.title}” is missing. Download or reimport it before syncing.`,
        );
      await upload(
        `Glassleaf-${book.asset.hash}.${book.format}`,
        { type: "asset", hash: book.asset.hash },
        nativeFile(book.asset.path),
        "application/octet-stream",
      );
    }
  }
  for (let offset = 0; offset < pending.length; offset += 100) {
    const batch = pending.slice(offset, offset + 100);
    await upload(
      `Glassleaf-changes-${Date.now()}-${offset}.json`,
      { type: "batch" },
      new TextEncoder().encode(JSON.stringify(batch)),
      "application/json",
    );
    await repo.acknowledge(batch);
  }
  const snapshot = await repo.snapshot();
  for (const book of snapshot.books) {
    if (book.deletedAt || bookFileReady(book)) continue;
    if (
      hasFile(book.asset.path) &&
      (await hashFile(book.asset.path)) === book.asset.hash
    ) {
      await unpack(book);
      continue;
    }
    status(`Downloading “${book.title}”…`);
    if (!/^[a-f0-9]{32}$/i.test(book.asset.hash))
      throw new Error("Remote book has an invalid content checksum.");
    // Never trust cloud-provided filesystem paths.
    if (
      book.asset.path !== `${book.id}/original.${book.format}` ||
      !/^[a-f0-9-]+$/i.test(book.id)
    )
      throw new Error("Remote book has an unsafe file path.");
    const assets = await listFiles(
      "asset",
      ` and appProperties has { key='hash' and value='${book.asset.hash}' }`,
    );
    const asset = assets[0];
    if (!asset)
      throw new Error(`The cloud file for “${book.title}” is missing.`);
    await installDownload(
      book.asset.path,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(asset.id)}?alt=media`,
      { Authorization: `Bearer ${await token()}` },
    );
    if ((await hashFile(book.asset.path)) !== book.asset.hash) {
      nativeFile(book.asset.path).delete();
      throw new Error(
        "Downloaded file failed its checksum. Sync again to retry.",
      );
    }
    await unpack(book);
  }
}
