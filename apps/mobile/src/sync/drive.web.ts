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

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const userInfoSchema = {
  parse(value: unknown): DriveAccount {
    if (
      !value ||
      typeof value !== "object" ||
      typeof (value as { sub?: unknown }).sub !== "string"
    )
      throw new Error("Google did not return a valid account.");
    const data = value as { sub: string; email?: unknown };
    return {
      id: data.sub,
      email: typeof data.email === "string" ? data.email : undefined,
    };
  },
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};
type TokenClient = { requestAccessToken(options?: { prompt?: string }): void };
type GoogleIdentity = {
  accounts?: {
    oauth2?: {
      initTokenClient(options: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
      }): TokenClient;
      revoke?(token: string, callback?: () => void): void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let identity: Promise<GoogleIdentity> | undefined;
let tokenState:
  { accessToken: string; expiresAt: number; account: DriveAccount } | undefined;

function loadGoogleIdentity() {
  if (identity) return identity;
  identity = new Promise<GoogleIdentity>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve(window.google);
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new Error("Google Identity Services did not load."));
    };
    script.onerror = () =>
      reject(new Error("Could not load Google Identity Services."));
    document.head.appendChild(script);
  });
  return identity;
}

async function accountFor(accessToken: string) {
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok)
    throw new Error("Google sign-in did not return an account.");
  const data = (await response.json()) as {
    user?: { permissionId?: string; emailAddress?: string };
  };
  return userInfoSchema.parse({
    sub: data.user?.permissionId,
    email: data.user?.emailAddress,
  });
}

async function requestToken(interactive: boolean) {
  if (!webClientId)
    throw new Error(
      "Google OAuth client IDs are not configured in this build.",
    );
  if (!interactive && tokenState && tokenState.expiresAt > Date.now() + 60_000)
    return tokenState;
  if (!interactive)
    throw new Error("Google sign-in expired. Reconnect your account.");
  const google = await loadGoogleIdentity();
  const response = await new Promise<TokenResponse>((resolve, reject) => {
    try {
      const client = google.accounts?.oauth2?.initTokenClient({
        client_id: webClientId,
        scope: DRIVE_SCOPE,
        callback: resolve,
      });
      if (!client) throw new Error("Google Identity Services is unavailable.");
      client.requestAccessToken({ prompt: "consent" });
    } catch (error) {
      reject(error);
    }
  });
  if (response.error || !response.access_token)
    throw new Error(response.error ?? "Google sign-in was cancelled.");
  const account = await accountFor(response.access_token);
  tokenState = {
    accessToken: response.access_token,
    expiresAt: Date.now() + Math.max(response.expires_in ?? 3600, 60) * 1000,
    account,
  };
  return tokenState;
}

const auth: DriveAuth = {
  configured: !!webClientId,
  async connect() {
    return (await requestToken(true)).account;
  },
  async disconnect() {
    if (tokenState) {
      const google = await loadGoogleIdentity().catch(() => undefined);
      google?.accounts?.oauth2?.revoke?.(tokenState.accessToken);
    }
    tokenState = undefined;
  },
  async accessToken(interactive) {
    return (await requestToken(interactive)).accessToken;
  },
  account() {
    return tokenState?.account;
  },
};

const assets = {
  hasFile,
  hashFile,
  async uploadBody(path: string) {
    const file = await readFile(path);
    if (!file) throw new Error("This book is not stored in this browser.");
    return file as BodyInit;
  },
  installDownload,
  removeFile,
  bookFileReady,
  unpack,
};

const engine = new DriveSyncEngine(auth, assets);

export const driveConfigured = auth.configured;

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
