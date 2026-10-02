import { Box, Text } from "@glassleaf/ui";
export function StoragePanel() {
  return (
    <Box gap="s">
      <Text variant="eyebrow">OFFLINE LIBRARY</Text>
      <Text color="secondary">
        Your downloaded books stay on this device. Connect Drive to keep a copy
        of your library, notes, and reading progress.
      </Text>
    </Box>
  );
}
