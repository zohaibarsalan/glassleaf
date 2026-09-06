import {
  kinds,
  kindLabels,
  type LibraryQuery,
  type SavedView,
  type Stats,
} from "@glassleaf/library";
import { BookOpen, Folder, Plus, Tag, X } from "lucide-react-native";
import { useState } from "react";
import { FlatList } from "react-native";
import { NavRow } from "../ui/LibraryComponents";
import { Box, Button, Chip, Field, IconButton, Text } from "../ui/theme";
export function SpacesPanel({
  stats,
  views,
  onBrowse,
  onCreate,
  onRemove,
}: {
  stats: Stats;
  views: SavedView[];
  onBrowse: (q: LibraryQuery) => void;
  onCreate: () => void;
  onRemove: (id: string) => void;
}) {
  const [section, setSection] = useState<"views" | "collections" | "tags">(
      "views",
    ),
    [term, setTerm] = useState("");
  const rows =
    section === "views"
      ? views.map((v) => ({
          id: v.id,
          name: v.name,
          query: { rules: v.rules, sort: v.sort } as LibraryQuery,
        }))
      : (section === "collections" ? stats.collections : stats.tags).map(
          (v) => ({
            id: v,
            name: v,
            query: section === "collections" ? { collection: v } : { tag: v },
          }),
        );
  return (
    <Box flex={1} paddingHorizontal="l" gap="m">
      <Box gap="xs">
        {kinds.map((kind) => (
          <NavRow
            key={kind}
            icon={BookOpen}
            title={kindLabels[kind]}
            count={stats.kinds[kind]}
            onPress={() => onBrowse({ kind })}
          />
        ))}
      </Box>
      <Box flexDirection="row" gap="s">
        {(["views", "collections", "tags"] as const).map((s) => (
          <Chip
            key={s}
            label={
              s === "views"
                ? "Saved views"
                : s === "collections"
                  ? "Collections"
                  : "Tags"
            }
            active={section === s}
            onPress={() => {
              setSection(s);
              setTerm("");
            }}
          />
        ))}
      </Box>
      <Field label="Find a group" value={term} onChangeText={setTerm} />
      <FlatList
        data={rows.filter((r) =>
          r.name.toLowerCase().includes(term.toLowerCase()),
        )}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <Box flexDirection="row" alignItems="center">
            <Box flex={1}>
              <NavRow
                icon={section === "tags" ? Tag : Folder}
                title={item.name}
                onPress={() => onBrowse(item.query)}
              />
            </Box>
            {section === "views" && (
              <IconButton
                icon={X}
                label={`Remove view ${item.name}`}
                onPress={() => onRemove(item.id)}
              />
            )}
          </Box>
        )}
        ListEmptyComponent={
          <Text color="secondary" paddingVertical="l">
            {term
              ? "No matching groups."
              : section === "views"
                ? "Save a set of rules. Matching books appear automatically."
                : "Organize books from their details or select a batch in the library."}
          </Text>
        }
      />
      <Box paddingBottom="l">
        <Button secondary icon={Plus} onPress={onCreate}>
          Create a view
        </Button>
      </Box>
    </Box>
  );
}
