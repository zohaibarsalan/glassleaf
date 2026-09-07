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
    return { id: response.data.user.id, email: response.data.user.email };
  },
  async disconnect() {
    configure();
    await GoogleSignin.signOut();
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
    return (await GoogleSignin.getTokens()).accessToken;
  },
  account() {
    const user = GoogleSignin.getCurrentUser()?.user;
    return user ? { id: user.id, email: user.email } : undefined;
  },
};

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

export function disconnectDrive(repo: LibraryRepository) {
  return engine.disconnect(repo);
}

export function syncDrive(
  repo: LibraryRepository,
  status: (message: string) => void,
) {
  return engine.sync(repo, status);
}
