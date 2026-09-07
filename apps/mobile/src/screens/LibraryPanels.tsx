import type { Book, LibraryRepository, Stats } from "@glassleaf/library";
import {
  Bookmark,
  BookOpen,
  ChevronRight,
  Download,
  Layers,
  NotebookPen,
  Palette,
  RefreshCw,
  Settings2,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react-native";
import { useState } from "react";
import type { ReactNode } from "react";
import { Pressable, ScrollView } from "react-native";
import { DriveSettings } from "../sync/DriveSettings";
import {
  Box,
  Button,
  Chip,
  Sheet,
  Surface,
  Text,
  usePalette,
} from "../ui/theme";
export function CollectionsPanel({
  wide,
  stats,
  onCollection,
  onTag,
  onOrganize,
}: {
  wide: boolean;
  stats: Stats;
  onCollection: (name: string) => void;
  onTag: (tag: string) => void;
  onOrganize: () => void;
}) {
  const c = usePalette();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: wide ? 40 : 20,
        paddingBottom: 30,
        gap: 14,
      }}
    >
      <Box gap="m" marginBottom="m">
        <Text variant="caption">
          Group books across formats. Tags and collections can overlap.
        </Text>
        <Button secondary icon={Layers} onPress={onOrganize}>
          Tag or collect books
        </Button>
      </Box>
      <Text variant="eyebrow">COLLECTIONS</Text>
      {stats.collections.map((name) => (
        <Pressable
          key={name}
          accessibilityRole="button"
          accessibilityLabel={name}
          onPress={() => onCollection(name)}
        >
          <Box
            padding="l"
            backgroundColor="surface"
            borderRadius="m"
            flexDirection="row"
            gap="l"
            alignItems="center"
          >
            <Layers size={22} color={c.secondary} />
            <Text variant="label" fontSize={16} flex={1}>
              {name}
            </Text>
            <ChevronRight size={20} color={c.secondary} />
          </Box>
        </Pressable>
      ))}
      <Text variant="eyebrow" marginTop="l">
        EXPLORE BY TAG
      </Text>
      <Box flexDirection="row" flexWrap="wrap" gap="s">
        {stats.tags.map((tag) => (
          <Chip
            key={tag}
            label={`# ${tag}`}
            onPress={() => {
              onTag(tag);
            }}
          />
        ))}
        {!stats.tags.length && (
          <Text variant="caption">
            Tags you add to your books will appear here.
          </Text>
        )}
      </Box>
    </ScrollView>
  );
}
export function NotesPanel({
  wide,
  books,
  onOpen,
}: {
  wide: boolean;
  books: Book[];
  onOpen: (book: Book) => void;
}) {
  const c = usePalette();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: wide ? 40 : 20,
        gap: 20,
        paddingBottom: 30,
      }}
    >
      {!books.length && (
        <Box padding="xl" alignItems="center" gap="l">
          <NotebookPen size={38} strokeWidth={1.3} color={c.secondary} />
          <Text variant="heading">Keep a thought. Save a page.</Text>
          <Text color="secondary" textAlign="center">
            Add notes and bookmarks while reading. They’ll be waiting here.
          </Text>
        </Box>
      )}
      {books.map((book) => (
        <Surface key={book.id} style={{ padding: 20, gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${book.title}`}
            onPress={() => onOpen(book)}
          >
            <Text variant="heading">{book.title}</Text>
          </Pressable>
          {book.notes.map((note) => (
            <Pressable
              key={note.id}
              accessibilityRole="button"
              accessibilityLabel={`Open note in ${book.title}`}
              onPress={() => onOpen({ ...book, locator: note.locator })}
            >
              <Text>{note.text}</Text>
              <Text variant="caption" marginTop="xs">
                Open saved position →
              </Text>
            </Pressable>
          ))}
          {book.bookmarks.map((mark) => (
            <Pressable
              key={mark.id}
              accessibilityRole="button"
              accessibilityLabel={`Open bookmark ${mark.label} in ${book.title}`}
              onPress={() => onOpen({ ...book, locator: mark.locator })}
            >
              <Box flexDirection="row" gap="s">
                <Bookmark size={16} color={c.accent} />
                <Text variant="label">{mark.label}</Text>
              </Box>
            </Pressable>
          ))}
        </Surface>
      ))}
    </ScrollView>
  );
}
export function SettingsPanel({
  wide,
  appearance,
  repo,
  onSynced,
  onExport,
  onPlan,
  onUndo,
  onSamples,
  onTrash,
}: {
  wide: boolean;
  appearance: ReactNode;
  repo: LibraryRepository;
  onSynced: () => void;
  onExport: () => void;
  onPlan: () => void;
  onUndo: () => void;
  onSamples: () => void;
  onTrash: () => void;
}) {
  const [section, setSection] = useState<string>();
  const [error, setError] = useState("");
  const c = usePalette();
  const sections = [
    {
      id: "appearance",
      label: "Appearance",
      description: "Choose the colors that carry into your library and reader.",
      icon: Palette,
    },
    {
      id: "sync",
      label: "Sync & backups",
      description: "Keep originals, notes, and progress in your own Drive.",
      icon: RefreshCw,
    },
    {
      id: "agent",
      label: "Agent organization",
      description:
        "Review every suggested change before it reaches your library.",
      icon: Settings2,
    },
    {
      id: "library",
      label: "Library tools",
      description: "Samples, trash, and local-library maintenance.",
      icon: BookOpen,
    },
  ] as const;
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: wide ? 40 : 20,
        gap: 28,
        paddingBottom: 36,
      }}
    >
      <Text variant="caption">
        Keep the daily reading experience quiet. Library maintenance is here
        when you need it.
      </Text>
      {sections.map(({ id, label, description, icon: Icon }) => (
        <Pressable
          key={id}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => setSection(id)}
          style={({ pressed }) => ({
            borderRadius: 16,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
        >
          <Surface style={{ padding: 16 }}>
            <Box flexDirection="row" alignItems="center" gap="m">
              <Box
                width={40}
                height={40}
                borderRadius="m"
                backgroundColor="accentSoft"
                alignItems="center"
                justifyContent="center"
              >
                <Icon size={20} color={c.accent} strokeWidth={1.7} />
              </Box>
              <Box flex={1} gap="xs">
                <Text variant="label">{label}</Text>
                <Text variant="caption">{description}</Text>
              </Box>
              <ChevronRight size={20} color={c.secondary} />
            </Box>
          </Surface>
        </Pressable>
      ))}
      {section === "appearance" && (
        <Sheet title="Appearance" onClose={() => setSection(undefined)}>
          {appearance}
        </Sheet>
      )}
      {section === "sync" && (
        <Sheet title="Sync & backups" onClose={() => setSection(undefined)}>
          <DriveSettings repo={repo} onSynced={onSynced} />
        </Sheet>
      )}
      {section === "agent" && (
        <Sheet title="Agent organization" onClose={() => setSection(undefined)}>
          <Box gap="m">
            <Text variant="eyebrow">AGENT ORGANIZATION</Text>
            <Text variant="heading">A helping hand for a big library.</Text>
            <Text color="secondary">
              Use your own AI agent through MCP. Export a metadata snapshot,
              then import its organization plan. Review every batch before
              applying it.
            </Text>
            <Button secondary icon={Upload} onPress={onExport}>
              Export library for your agent
            </Button>
            <Button secondary icon={Download} onPress={onPlan}>
              Review an organization plan
            </Button>
            <Button
              secondary
              icon={Undo2}
              onPress={() =>
                void repo
                  .undoStructure()
                  .then(onSynced)
                  .catch((e) => setError(String(e)))
              }
            >
              Undo view, list or group edit
            </Button>
            {!!error && <Text color="danger">{error}</Text>}
            <Button secondary icon={Undo2} onPress={onUndo}>
              Undo last organization batch
            </Button>
          </Box>
        </Sheet>
      )}
      {section === "library" && (
        <Sheet title="Library tools" onClose={() => setSection(undefined)}>
          <Box gap="m">
            <Text variant="eyebrow">YOUR LIBRARY</Text>
            <Button secondary icon={BookOpen} onPress={onSamples}>
              Add original sample books
            </Button>
            <Button secondary icon={Trash2} onPress={onTrash}>
              Open Trash
            </Button>
            <Text variant="caption">
              Glassleaf 0.1 · Local first. No account needed to read.\nEPUB,
              PDF, and CBZ · CBR support is still to come.
            </Text>
          </Box>
        </Sheet>
      )}
    </ScrollView>
  );
}
