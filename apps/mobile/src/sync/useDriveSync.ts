import type { LibraryRepository } from "@glassleaf/library";
import { AppState } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { syncDrive } from "./drive";
import {
  createDriveSyncScheduler,
  type DriveSyncScheduler,
} from "./drive-scheduler";

function browserOnline() {
  return typeof navigator === "undefined" || navigator.onLine;
}

export function useDriveSync(
  repo: LibraryRepository,
  revision: number,
  onSynced: () => void,
) {
  const [syncMessage, setSyncMessage] = useState("");
  const scheduler = useRef<DriveSyncScheduler | null>(null);
  const synced = useCallback(() => {
    setSyncMessage("");
    onSynced();
  }, [onSynced]);
  const sync = useCallback(async () => {
    if (!(await repo.setting("drive-account"))) return false;
    setSyncMessage("Syncing your library…");
    await syncDrive(repo, setSyncMessage);
    return true;
  }, [repo]);

  useEffect(() => {
    const next = createDriveSyncScheduler({
      hasPending: async () =>
        (await repo.pending()).length > 0 ||
        (await repo.pendingOrganization()).length > 0,
      isOnline: browserOnline,
      sync,
      onError: (error) =>
        setSyncMessage(
          error instanceof Error
            ? error.message
            : "Sync paused. Your changes are saved locally.",
        ),
      onSynced: synced,
      delayMs: 750,
    });
    scheduler.current = next;
    next.request("startup");
    let active = true;
    const appState = AppState.addEventListener("change", (state) => {
      active = state === "active";
      if (active) next.request("foreground");
    });
    const pendingPoll = setInterval(() => {
      if (
        active &&
        (typeof document === "undefined" ||
          document.visibilityState === "visible")
      )
        next.request("mutation");
    }, 15_000);
    const browserWindow = typeof window === "undefined" ? undefined : window;
    const online = () => next.request("online");
    const visible = () => {
      if (document.visibilityState === "visible") next.request("foreground");
    };
    browserWindow?.addEventListener("online", online);
    browserWindow?.addEventListener("visibilitychange", visible);
    return () => {
      appState.remove();
      clearInterval(pendingPoll);
      browserWindow?.removeEventListener("online", online);
      browserWindow?.removeEventListener("visibilitychange", visible);
      next.dispose();
      scheduler.current = null;
    };
  }, [repo, sync, synced]);

  useEffect(() => {
    scheduler.current?.request("mutation");
  }, [revision]);

  return { syncMessage };
}
