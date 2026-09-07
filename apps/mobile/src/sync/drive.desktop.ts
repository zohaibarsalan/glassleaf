import { isTauri, invoke } from "@tauri-apps/api/core";
import type { LibraryRepository } from "@glassleaf/library";
import {
  bookFileReady,
  hasFile,
  hashFile,
  installDownload,
  readFile,
  removeFile,
  unpack,
} from "../data/files.web";
import {
  DriveSyncEngine,
  DRIVE_SCOPE,
  type DriveAccount,
  type DriveAuth,
} from "./drive-core";

type DesktopSession = { id: string; email?: string };
const clientId = process.env.EXPO_PUBLIC_GOOGLE_DESKTOP_CLIENT_ID;
export const isDesktop = isTauri();
export const driveConfigured = isDesktop && !!clientId;
let accountState: DriveAccount | undefined;

function configuredClientId() {
  if (
    !driveConfigured ||
    !clientId ||
    !clientId.endsWith(".apps.googleusercontent.com")
  )
    throw new Error(
      "Google Desktop OAuth is not configured in this build. Set EXPO_PUBLIC_GOOGLE_DESKTOP_CLIENT_ID and rebuild.",
    );
  return clientId;
}

async function accountFor(accessToken: string): Promise<DriveAccount> {
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok)
    throw new Error("Google sign-in did not return a Drive account.");
  const data = (await response.json()) as {
    user?: { permissionId?: string; emailAddress?: string };
  };
  if (!data.user?.permissionId)
    throw new Error("Google did not return a valid Drive account.");
  return {
    id: data.user.permissionId,
    email: data.user.emailAddress,
  };
}

const auth: DriveAuth = {
  configured: driveConfigured,
  async connect() {
    const session = await invoke<DesktopSession>("desktop_drive_connect", {
      clientId: configuredClientId(),
    });
    accountState = session;
    return session;
  },
  async disconnect() {
    await invoke("desktop_drive_disconnect", {
      clientId: configuredClientId(),
    });
    accountState = undefined;
  },
  async accessToken(interactive) {
    if (interactive)
      throw new Error("Connect Google Drive from Settings to authorize it.");
    const accessToken = await invoke<string>("desktop_drive_access_token", {
      clientId: configuredClientId(),
    });
    if (!accountState) accountState = await accountFor(accessToken);
    return accessToken;
  },
  account() {
    return accountState;
  },
};

const assets = {
  hasFile,
  hashFile,
  async uploadBody(path: string) {
    const file = await readFile(path);
    if (!file) throw new Error("This book is not stored on this desktop.");
    return file as BodyInit;
  },
  installDownload,
  removeFile,
  bookFileReady,
  unpack,
};

const engine = new DriveSyncEngine(auth, assets);

export function prepareDriveAuth() {
  configuredClientId();
  return Promise.resolve();
}

export function connectDrive(repo: LibraryRepository) {
  return engine.connect(repo);
}

export function disconnectDrive(repo: LibraryRepository) {
  return engine.disconnect(repo);
}

export function syncDrive(
  repo: LibraryRepository,
  status: (message: string) => void,
) {
  return engine.sync(repo, status);
}

export { DRIVE_SCOPE };
