import type { LibraryRepository } from "@glassleaf/library";
import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";
import {
  bookFileReady,
  hasFile,
  hashFile,
  installDownload,
  nativeFile,
  unpack,
} from "../data/files";
import {
  DriveSyncEngine,
  DRIVE_SCOPE,
  type DriveAccount,
  type DriveAuth,
} from "./drive-core";

const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
export const driveConfigured =
  Platform.OS !== "web" &&
  !!webClientId &&
  (Platform.OS !== "ios" || !!iosClientId);

let configured = false;
let accountState: DriveAccount | undefined;
function configure() {
  if (!driveConfigured)
    throw new Error(
      "Google OAuth client IDs are not configured in this build.",
    );
  if (configured) return;
  GoogleSignin.configure({
    iosClientId,
    webClientId,
    scopes: [DRIVE_SCOPE],
  });
  configured = true;
}

const auth: DriveAuth = {
  configured: driveConfigured,
  async connect(): Promise<DriveAccount> {
    configure();
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) throw new Error("Sign-in was cancelled.");
    const account = await accountFor(await GoogleSignin.getTokens());
    accountState = account;
    return account;
  },
  async disconnect() {
    configure();
    await GoogleSignin.signOut();
    accountState = undefined;
  },
  async accessToken(interactive) {
    configure();
    if (!GoogleSignin.getCurrentUser()) {
      if (!interactive)
        throw new Error("Google sign-in expired. Reconnect your account.");
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response))
        throw new Error("Sign-in was cancelled.");
    } else if (!interactive) {
      try {
        await GoogleSignin.signInSilently();
      } catch {
        throw new Error("Google sign-in expired. Reconnect your account.");
      }
    }
    const tokens = await GoogleSignin.getTokens();
    if (!accountState) accountState = await accountFor(tokens);
    return tokens.accessToken;
  },
  account() {
    return accountState;
  },
};

async function accountFor(tokens: { accessToken: string }) {
  const response = await expoFetch(
    "https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)",
    { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
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

const assets = {
  hasFile,
  hashFile,
  async uploadBody(path: string) {
    return nativeFile(path) as unknown as BodyInit;
  },
  installDownload,
  async removeFile(path: string) {
    nativeFile(path).delete();
  },
  bookFileReady,
  unpack,
};

const engine = new DriveSyncEngine(auth, assets, expoFetch);

export function connectDrive(repo: LibraryRepository) {
  return engine.connect(repo);
}

export function prepareDriveAuth() {
  return Promise.resolve();
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
