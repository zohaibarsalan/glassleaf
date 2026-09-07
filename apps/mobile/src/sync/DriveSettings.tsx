import type { LibraryRepository } from "@glassleaf/library";
import { Cloud, LogOut, RefreshCw } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Box, Button, Text } from "../ui/theme";
import {
  connectDrive,
  disconnectDrive,
  driveConfigured,
  syncDrive,
} from "./drive";
export function DriveSettings({
  repo,
  onSynced,
}: {
  repo: LibraryRepository;
  onSynced: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    void repo.setting("drive-account").then((value) => setConnected(!!value));
  }, [repo]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      onSynced();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box gap="m">
      <Text variant="eyebrow">GOOGLE DRIVE</Text>
      <Text variant="heading">Pick up where you left off.</Text>
      <Text color="secondary">
        Sync through your own Google Drive. Your downloaded books stay available
        offline.
      </Text>
      {driveConfigured ? (
        <>
          <Button
            icon={connected ? RefreshCw : Cloud}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                if (!connected) {
                  await connectDrive(repo);
                  setConnected(true);
                }
                setStatus("Syncing your library…");
                await syncDrive(repo, setStatus);
                setStatus("Library is up to date.");
              })
            }
          >
            {busy
              ? "Working…"
              : connected
                ? "Sync now"
                : "Connect Google Drive"}
          </Button>
          {connected && (
            <Button
              secondary
              icon={LogOut}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await disconnectDrive(repo);
                  setConnected(false);
                  setStatus(
                    "Disconnected. Your downloaded books are still here.",
                  );
                })
              }
            >
              Disconnect
            </Button>
          )}
        </>
      ) : (
        <Box backgroundColor="muted" borderRadius="m" padding="l" gap="s">
          <Text variant="label">Google Drive setup is needed</Text>
          <Text variant="caption">
            This build needs its Google sign-in configuration before you can
            connect. Local reading works without it.
          </Text>
        </Box>
      )}
      {!!status && <Text variant="caption">{status}</Text>}
    </Box>
  );
}
