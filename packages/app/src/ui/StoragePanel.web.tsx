import { useEffect, useState } from "react";
import { Box, Button, Text } from "@glassleaf/ui";
function size(bytes: number) {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.ceil(bytes / 1024 ** 2)} MB`;
}
export function StoragePanel() {
  const [persisted, setPersisted] = useState<boolean>(),
    [usage, setUsage] = useState<number>(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.all([
      navigator.storage?.persisted?.(),
      navigator.storage?.estimate?.(),
    ])
      .then(([retained, estimate]) => {
        if (live) {
          setPersisted(retained);
          setUsage(estimate?.usage);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  async function retain() {
    setBusy(true);
    try {
      const granted = await navigator.storage.persist();
      setPersisted(granted);
      setMessage(
        granted
          ? "Your browser has protected this library from automatic storage cleanup."
          : "Your browser decides whether to protect downloads. Installing Glassleaf on your Home Screen can help.",
      );
    } catch {
      setMessage("Storage protection is unavailable in this browser.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box gap="m">
      <Text variant="eyebrow">OFFLINE LIBRARY</Text>
      <Text variant="heading">Take your stories with you.</Text>
      {usage !== undefined && (
        <Text variant="caption" color="secondary">
          {size(usage)} used by Glassleaf on this device
        </Text>
      )}
      <Text color="secondary">
        Downloaded books work offline. Keep a copy in Drive so your library,
        notes, and progress can be restored if you clear this browser's data.
      </Text>
      {persisted ? (
        <Text color="accent">
          Downloads are protected from automatic cleanup.
        </Text>
      ) : (
        typeof navigator.storage?.persist === "function" && (
          <Button secondary disabled={busy} onPress={() => void retain()}>
            {busy ? "Checking storage…" : "Protect downloaded books"}
          </Button>
        )
      )}
      {!!message && (
        <Text variant="caption" accessibilityRole="alert">
          {message}
        </Text>
      )}
      {!matchMedia("(display-mode: standalone)").matches && (
        <Text variant="caption" color="secondary">
          On iPhone, use Share → Add to Home Screen to install Glassleaf.
        </Text>
      )}
    </Box>
  );
}
