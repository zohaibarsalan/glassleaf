import { importTheme, MAX_THEME_SIZE } from "../ui/themeImport";
import { ZodError } from "zod";
import { randomUUID } from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { Check, Download, Plus, Upload } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { readExternal, writeExport } from "../data/files";
import { Box, Button, Chip, Field, Sheet, Text, usePalette } from "../ui/theme";
import {
  validateTheme,
  type Palette,
  type ThemeDefinition,
} from "../ui/themeDefinition";

export function ThemePanel({
  definitions,
  selected,
  onSelect,
  onSave,
  onRemove,
}: {
  definitions: ThemeDefinition[];
  selected: string;
  onSelect: (id: string) => void;
  onSave: (theme: ThemeDefinition) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const c = usePalette();
  const [draft, setDraft] = useState<ThemeDefinition>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = definitions.find((t) => t.id === selected) ?? definitions[0]!;
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof ZodError
          ? (e.issues[0]?.message ?? "This theme file is invalid.")
          : e instanceof Error
            ? e.message
            : "Theme could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box gap="m">
      <Text variant="heading">Appearance</Text>
      <Text variant="caption">
        Community palettes for your library and reader. Import Base16, Base24,
        or Glassleaf themes as YAML or JSON.
      </Text>
      <Box flexDirection="row" flexWrap="wrap" gap="m">
        {definitions.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            accessibilityLabel={`${t.name} theme`}
            accessibilityState={{ selected: selected === t.id }}
            onPress={() => onSelect(t.id)}
            style={{ width: "47%" }}
          >
            <View
              style={{
                padding: 14,
                borderRadius: 14,
                backgroundColor: t.colors.bg,
                borderWidth: 2,
                borderColor: selected === t.id ? c.accent : c.line,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", gap: 6 }}>
                {[t.colors.accent, t.colors.text, t.colors.muted].map(
                  (color, i) => (
                    <View
                      key={i}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: color,
                      }}
                    />
                  ),
                )}
              </View>
              <Text variant="label" style={{ color: t.colors.text }}>
                {t.name}
              </Text>
              <Text variant="caption" style={{ color: t.colors.secondary }}>
                {t.mode === "dark" ? "Dark" : "Light"}
                {t.id.startsWith("custom-") ? " · Custom" : ""}
              </Text>
              {selected === t.id && (
                <Check
                  size={18}
                  color={t.colors.accent}
                  style={{ position: "absolute", right: 12, top: 12 }}
                />
              )}
            </View>
          </Pressable>
        ))}
      </Box>
      <Box flexDirection="row" gap="s">
        <Box flex={1}>
          <Button
            secondary
            icon={Plus}
            onPress={() => {
              setError("");
              setDraft({
                ...active,
                id: `custom-${randomUUID()}`,
                name: `My ${active.name}`,
              });
            }}
          >
            Create theme
          </Button>
        </Box>
        <Box flex={1}>
          <Button
            secondary
            icon={Download}
            disabled={busy}
            onPress={() =>
              void action(async () => {
                const result = await DocumentPicker.getDocumentAsync({
                  type: "*/*",
                  copyToCacheDirectory: true,
                });
                if (result.canceled) return;
                if ((result.assets[0]!.size ?? 0) > MAX_THEME_SIZE)
                  throw new Error("Theme files must be smaller than 64 KB.");
                const imported = importTheme(
                  await readExternal(result.assets[0]!.uri),
                );
                setDraft({ ...imported, id: `custom-${randomUUID()}` });
              })
            }
          >
            Import
          </Button>
        </Box>
      </Box>
      <Button
        secondary
        icon={Upload}
        onPress={() =>
          void action(async () => {
            await Sharing.shareAsync(
              await writeExport("glassleaf-theme.json", active),
              { mimeType: "application/json" },
            );
          })
        }
      >
        Export {active.name}
      </Button>
      {active.id.startsWith("custom-") && (
        <Box flexDirection="row" gap="s">
          <Button secondary onPress={() => setDraft(active)}>
            Edit theme
          </Button>
          <Button
            secondary
            disabled={busy}
            onPress={() => void action(() => onRemove(active.id))}
          >
            Remove theme
          </Button>
        </Box>
      )}
      {!!error && !draft && <Text color="danger">{error}</Text>}
      {draft && (
        <Sheet
          title="Theme studio"
          onClose={() => setDraft(undefined)}
          footer={
            <Button
              disabled={busy}
              onPress={() =>
                void action(async () => {
                  await onSave(validateTheme(draft));
                  setDraft(undefined);
                })
              }
            >
              Save and apply
            </Button>
          }
        >
          <Field
            label="Theme name"
            value={draft.name}
            onChangeText={(name) => setDraft({ ...draft, name })}
          />
          <Box flexDirection="row" gap="s">
            {(["light", "dark"] as const).map((mode) => (
              <Chip
                key={mode}
                label={mode === "light" ? "Light" : "Dark"}
                active={draft.mode === mode}
                onPress={() => setDraft({ ...draft, mode })}
              />
            ))}
          </Box>
          <Text variant="caption">
            Start from any palette. Colors use #RRGGBB; readable text contrast
            is checked before saving.
          </Text>
          {(Object.keys(draft.colors) as (keyof Palette)[]).map((key) => (
            <Box key={key} flexDirection="row" gap="m" alignItems="center">
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  backgroundColor: /^#[0-9a-f]{6}$/i.test(draft.colors[key])
                    ? draft.colors[key]
                    : c.muted,
                }}
              />
              <Box flex={1}>
                <Field
                  label={
                    {
                      bg: "Background",
                      surface: "Surface",
                      muted: "Controls",
                      line: "Borders",
                      text: "Text",
                      secondary: "Secondary text",
                      accent: "Accent",
                      accentSoft: "Accent background",
                      onAccent: "Text on accent",
                      danger: "Destructive actions",
                      gold: "Reading progress",
                    }[key]
                  }
                  value={draft.colors[key]}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onChangeText={(value) =>
                    setDraft({
                      ...draft,
                      colors: { ...draft.colors, [key]: value },
                    })
                  }
                />
              </Box>
            </Box>
          ))}
          {!!error && <Text color="danger">{error}</Text>}
        </Sheet>
      )}
    </Box>
  );
}
