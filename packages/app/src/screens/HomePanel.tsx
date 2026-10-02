import {
  type Book,
  type LibraryRepository,
  type LibraryQuery,
  type SavedView,
} from "@glassleaf/library";
import { ArrowRight, BookOpen, Play } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions } from "react-native";
import { BookTile, NavRow } from "../ui/LibraryComponents";
import {
  Box,
  Button,
  SectionHeading,
  Surface,
  Text,
  usePalette,
} from "../ui/theme";
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
  const { width } = useWindowDimensions();
  const wide = width >= 700;
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
      contentContainerStyle={{
        width: "100%",
        maxWidth: 1180,
        alignSelf: "center",
        paddingHorizontal: wide ? 40 : 20,
        paddingTop: wide ? 8 : 0,
        gap: 28,
        paddingBottom: 48,
      }}
    >
      <Box gap="s">
        <Text
          accessibilityRole="header"
          fontFamily="Lora"
          fontSize={wide ? 38 : 32}
          lineHeight={wide ? 47 : 40}
          letterSpacing={-0.7}
        >
          A good place to pause.
        </Text>
        <Text color="secondary">
          Pick up a story. Leave the rest for later.
        </Text>
      </Box>
      {!!error && <Text color="danger">{error}</Text>}
      <Surface subtle style={{ padding: wide ? 24 : 20, gap: 18 }}>
        <SectionHeading
          title="CONTINUE READING"
          action={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Browse currently reading"
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                backgroundColor: pressed ? c.surface : "transparent",
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
              onPress={() => onBrowse({ status: "reading", sort: "last-read" })}
            >
              <ArrowRight size={20} color={c.accent} />
            </Pressable>
          }
        />
        {reading.length ? (
          <>
            <BookTile
              book={reading[0]!}
              list
              onOpen={() => onOpen(reading[0]!)}
            />
            <Box flexDirection={wide ? "row" : "column"} gap="s">
              <Box flex={1}>
                <Button
                  icon={Play}
                  accessibilityLabel={`Continue reading ${reading[0]!.title}`}
                  onPress={() => onOpen(reading[0]!)}
                >
                  Continue reading
                </Button>
              </Box>
              {reading[1] && (
                <Box flex={1}>
                  <Button secondary onPress={() => onOpen(reading[1]!)}>
                    Switch book
                  </Button>
                </Box>
              )}
            </Box>
          </>
        ) : (
          <Box gap="m">
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
      </Surface>
      {views.some((v) => v.pinned) && (
        <Box gap="m">
          <SectionHeading title="YOUR VIEWS" />
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
        <SectionHeading
          title="RECENTLY ADDED"
          action={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Browse all books"
              onPress={() => onBrowse({})}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                backgroundColor: pressed ? c.muted : "transparent",
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <ArrowRight size={20} color={c.accent} />
            </Pressable>
          }
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingRight: 12 }}
        >
          {recent.map((book) => (
            <Box key={book.id} width={wide ? 172 : 150}>
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
