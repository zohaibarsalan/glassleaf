import type { Book, LibraryRepository, Stats } from "@glassleaf/library";
import {
  Bookmark,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  Layers,
  NotebookPen,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { DriveSettings } from "../sync/DriveSettings";
import {
  Box,
  Button,
  Chip,
  Text,
  themes,
  usePalette,
  type ThemeName,
} from "../ui/theme";
export function CollectionsPanel({
  wide,
  stats,
  onCollection,
  onTag,
}: {
  wide: boolean;
  stats: Stats;
  onCollection: (name: string) => void;
  onTag: (tag: string) => void;
}) {
  const c = usePalette();
  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: wide ? 40 : 20,
        paddingBottom: 30,
        gap: 14,
      }}
    >
      <Box padding="l" backgroundColor="accentSoft" borderRadius="l" gap="s">
        <Layers size={26} color={c.accent} />
        <Text variant="heading">Stories don’t fit in one box.</Text>
        <Text color="secondary">
          Connect a manga to its light novel. Build a reading list across
          formats. Add collection names from any book’s edit menu.
        </Text>
      </Box>
      {stats.collections.map((name, index) => (
        <Pressable key={name} onPress={() => onCollection(name)}>
          <Box
            padding="l"
            backgroundColor="surface"
            borderRadius="m"
            flexDirection="row"
            gap="l"
            alignItems="center"
          >
            <Text variant="title" color="secondary">
              {String(index + 1).padStart(2, "0")}
            </Text>
            <Text variant="heading" flex={1}>
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
        <Box
          key={book.id}
          backgroundColor="surface"
          borderRadius="m"
          padding="l"
          gap="m"
        >
          <Pressable onPress={() => onOpen(book)}>
            <Text variant="heading">{book.title}</Text>
          </Pressable>
          {book.notes.map((note) => (
            <Pressable
              key={note.id}
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
              onPress={() => onOpen({ ...book, locator: mark.locator })}
            >
              <Box flexDirection="row" gap="s">
                <Bookmark size={16} color={c.accent} />
                <Text variant="label">{mark.label}</Text>
              </Box>
            </Pressable>
          ))}
        </Box>
      ))}
    </ScrollView>
  );
}
export function SettingsPanel({
  wide,
  theme,
  changeTheme,
  repo,
  onSynced,
  onExport,
  onPlan,
  onUndo,
  onSamples,
  onTrash,
}: {
  wide: boolean;
  theme: ThemeName;
  changeTheme: (theme: ThemeName) => void;
  repo: LibraryRepository;
  onSynced: () => void;
  onExport: () => void;
  onPlan: () => void;
  onUndo: () => void;
  onSamples: () => void;
  onTrash: () => void;
}) {
  const c = usePalette();
  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: wide ? 40 : 20,
        gap: 28,
        paddingBottom: 36,
      }}
    >
      <Box gap="m">
        <Text variant="eyebrow">APPEARANCE</Text>
        <Box flexDirection="row" gap="m">
          {(["paper", "midnight", "forest"] as const).map((name) => (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityLabel={`${name} theme`}
              accessibilityState={{ selected: theme === name }}
              onPress={() => changeTheme(name)}
              style={{ flex: 1 }}
            >
              <View
                style={{
                  height: 82,
                  borderRadius: 16,
                  padding: 14,
                  backgroundColor: themes[name].colors.bg,
                  borderWidth: theme === name ? 2 : 1,
                  borderColor: theme === name ? c.accent : c.line,
                }}
              >
                <View
                  style={{
                    height: 9,
                    width: 32,
                    borderRadius: 3,
                    backgroundColor: themes[name].colors.accent,
                    marginBottom: 9,
                  }}
                />
                <View
                  style={{
                    height: 4,
                    width: "70%",
                    backgroundColor: themes[name].colors.secondary,
                    opacity: 0.5,
                  }}
                />
                {theme === name && (
                  <Check
                    size={18}
                    color={themes[name].colors.accent}
                    style={{
                      position: "absolute",
                      bottom: 12,
                      right: 12,
                    }}
                  />
                )}
              </View>
              <Text variant="label" textAlign="center" marginTop="s">
                {name.charAt(0).toUpperCase() + name.slice(1)}
              </Text>
            </Pressable>
          ))}
        </Box>
      </Box>
      <DriveSettings repo={repo} onSynced={onSynced} />
      <Box gap="m">
        <Text variant="eyebrow">AGENT ORGANIZATION</Text>
        <Text variant="heading">A helping hand for a big library.</Text>
        <Text color="secondary">
          Use your own AI agent through MCP. Export a metadata snapshot, then
          import its organization plan. Review every batch before applying it.
        </Text>
        <Button secondary icon={Upload} onPress={onExport}>
          Export library for your agent
        </Button>
        <Button secondary icon={Download} onPress={onPlan}>
          Review an organization plan
        </Button>
        <Button secondary icon={Undo2} onPress={onUndo}>
          Undo last organization batch
        </Button>
      </Box>
      <Box gap="m">
        <Text variant="eyebrow">YOUR LIBRARY</Text>
        <Button secondary icon={BookOpen} onPress={onSamples}>
          Add original sample books
        </Button>
        <Button secondary icon={Trash2} onPress={onTrash}>
          Open Trash
        </Button>
        <Text variant="caption">
          Glassleaf 0.1 · Local first. No account needed to read.\nEPUB, PDF,
          and CBZ · CBR support is still to come.
        </Text>
      </Box>
    </ScrollView>
  );
}
