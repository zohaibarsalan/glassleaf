import {
  type Book,
  type LibraryRepository,
  type LibraryQuery,
  type SavedView,
} from "@glassleaf/library";
import { ArrowRight, BookOpen } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { BookTile, NavRow } from "../ui/LibraryComponents";
import { Box, Button, Text, usePalette } from "../ui/theme";
export function HomePanel({
  repo,
  revision,
  views,
  onOpen,
  onBrowse,
  onImport,
}: {
  repo: LibraryRepository;
  revision: number;
  views: SavedView[];
  onOpen: (book: Book) => void;
  onBrowse: (query: LibraryQuery) => void;
  onImport: () => void;
}) {
  const c = usePalette();
  const [reading, setReading] = useState<Book[]>([]),
    [recent, setRecent] = useState<Book[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void Promise.all([
      repo.list({ status: "reading", sort: "last-read", limit: 2 }),
      repo.list({ limit: 6 }),
    ])
      .then(([a, b]) => {
        if (live) {
          setReading(a);
          setRecent(b);
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [repo, revision]);
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, gap: 28, paddingBottom: 40 }}
    >
      <Box gap="s">
        <Text fontFamily="Lora" fontSize={32} lineHeight={40}>
          A good place to pause.
        </Text>
        <Text color="secondary">
          Pick up a story. Leave the rest for later.
        </Text>
      </Box>
      {!!error && <Text color="danger">{error}</Text>}
      <Box gap="m">
        <Box
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Text variant="eyebrow">CONTINUE READING</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Browse currently reading"
            style={{ padding: 12 }}
            onPress={() => onBrowse({ status: "reading", sort: "last-read" })}
          >
            <ArrowRight size={20} color={c.accent} />
          </Pressable>
        </Box>
        {reading.map((book) => (
          <BookTile
            key={book.id}
            book={book}
            list
            onOpen={() => onOpen(book)}
          />
        ))}
        {!reading.length && (
          <Box backgroundColor="surface" padding="l" borderRadius="l" gap="m">
            <BookOpen color={c.accent} size={28} />
            <Text variant="heading">Your next chapter is waiting.</Text>
            <Text color="secondary">
              Open a book and your place will be kept here.
            </Text>
            <Button secondary onPress={() => onBrowse({})}>
              Browse your library
            </Button>
          </Box>
        )}
      </Box>
      {views.some((v) => v.pinned) && (
        <Box gap="s">
          <Text variant="eyebrow">YOUR VIEWS</Text>
          {views
            .filter((v) => v.pinned)
            .map((v) => (
              <NavRow
                key={v.id}
                icon={BookOpen}
                title={v.name}
                onPress={() =>
                  onBrowse({ ...v.scope, rules: v.rules, sort: v.sort })
                }
              />
            ))}
        </Box>
      )}
      <Box gap="m">
        <Box
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Text variant="eyebrow">RECENTLY ADDED</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Browse all books"
            onPress={() => onBrowse({})}
            style={{ padding: 12 }}
          >
            <ArrowRight size={20} color={c.accent} />
          </Pressable>
        </Box>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {recent.map((book) => (
            <Box key={book.id} width={150}>
              <BookTile book={book} list={false} onOpen={() => onOpen(book)} />
            </Box>
          ))}
        </ScrollView>
        {!recent.length && (
          <Button onPress={onImport}>Bring your first books</Button>
        )}
      </Box>
    </ScrollView>
  );
}
