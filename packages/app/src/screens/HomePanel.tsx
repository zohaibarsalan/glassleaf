import type {
  Book,
  LibraryRepository,
  LibraryQuery,
  SavedView,
  Stats,
} from "@glassleaf/library";
import {
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Heart,
  Plus,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image } from "expo-image";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { fileURI } from "../data/files";
import { BookTile, NavRow } from "../ui/LibraryComponents";
import { Box, Button, SectionHeading, Text, usePalette } from "@glassleaf/ui";

export function HomePanel({
  repo,
  revision,
  views,
  stats,
  onOpen,
  onBrowse,
  onImport,
}: {
  repo: LibraryRepository;
  revision: number;
  views: SavedView[];
  stats: Stats;
  onOpen: (book: Book) => void;
  onBrowse: (query: LibraryQuery) => void;
  onImport: () => void;
}) {
  const c = usePalette();
  const { width } = useWindowDimensions();
  const roomy = width >= 1100,
    wide = width >= 700;
  const [reading, setReading] = useState<Book[]>([]),
    [recent, setRecent] = useState<Book[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void Promise.all([
      repo.list({ status: "reading", sort: "last-read", limit: 2 }),
      repo.list({ limit: 8 }),
    ])
      .then(([a, b]) => {
        if (live) {
          setReading(a);
          setRecent(b);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [repo, revision]);
  const featured = reading[0] ?? recent[0];
  const progress = Math.round((featured?.progress ?? 0) * 100);
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        width: "100%",
        maxWidth: 1200,
        alignSelf: "center",
        paddingHorizontal: wide ? 40 : 20,
        paddingTop: wide ? 16 : 12,
        paddingBottom: 40,
        gap: 32,
      }}
    >
      <View className="gap-3">
        <Text variant="eyebrow" color="accent">
          YOUR READING ROOM
        </Text>
        <Box flexDirection="row" alignItems="center" gap="l">
          <Box flex={1} gap="s">
            <Text
              accessibilityRole="header"
              fontFamily="Lora"
              fontSize={wide ? 42 : 34}
              lineHeight={wide ? 53 : 43}
              letterSpacing={-1}
            >
              A little room to escape.
            </Text>
            <Text color="secondary">
              Your books. Your pace. Your next great story.
            </Text>
          </Box>
          {wide && (
            <Button secondary icon={Plus} onPress={onImport}>
              Add books
            </Button>
          )}
        </Box>
      </View>
      {!!error && (
        <Text color="danger" accessibilityRole="alert">
          {error}
        </Text>
      )}
      <View
        className="gap-5"
        style={{ flexDirection: roomy ? "row" : "column" }}
      >
        <View
          className="rounded-3xl border border-line bg-surface"
          style={{
            flex: roomy ? 2 : undefined,
            padding: wide ? 28 : 20,
            gap: 24,
          }}
        >
          <SectionHeading
            title={
              reading.length
                ? "PICK UP WHERE YOU LEFT OFF"
                : "SOMETHING TO GET LOST IN"
            }
          />
          {featured ? (
            <>
              <View className="flex-row items-center gap-5">
                <View
                  style={{
                    width: wide ? 132 : 92,
                    aspectRatio: 0.67,
                    borderRadius: 6,
                    overflow: "hidden",
                    backgroundColor: c.accentSoft,
                    boxShadow: "0px 8px 20px #00000025",
                  }}
                >
                  {featured.asset.cover ? (
                    <Image
                      source={fileURI(featured.asset.cover)}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                      recyclingKey={featured.id}
                    />
                  ) : (
                    <Box flex={1} alignItems="center" justifyContent="center">
                      <BookOpen color={c.accent} size={32} />
                    </Box>
                  )}
                </View>
                <Box flex={1} gap="s">
                  <Text variant="eyebrow" color="accent">
                    {featured.format.toUpperCase()} ·{" "}
                    {reading.length ? "IN PROGRESS" : "READY WHEN YOU ARE"}
                  </Text>
                  <Text
                    fontFamily="Lora"
                    fontSize={wide ? 28 : 23}
                    lineHeight={wide ? 37 : 31}
                    numberOfLines={3}
                  >
                    {featured.title}
                  </Text>
                  <Text color="secondary" numberOfLines={2}>
                    {featured.author}
                  </Text>
                  {progress > 0 && (
                    <View className="mt-3 gap-2">
                      <View className="h-1 overflow-hidden rounded-full bg-muted">
                        <View
                          style={{
                            width: `${progress}%`,
                            height: "100%",
                            backgroundColor: c.accent,
                          }}
                        />
                      </View>
                      <Text variant="caption" color="secondary">
                        {progress}% of the way through
                      </Text>
                    </View>
                  )}
                </Box>
              </View>
              <Button
                icon={BookOpen}
                accessibilityLabel={`${reading.length ? "Continue reading" : "Start reading"} ${featured.title}`}
                onPress={() => onOpen(featured)}
              >
                {reading.length ? "Continue reading" : "Start reading"}
              </Button>
            </>
          ) : (
            <Box gap="m">
              <BookOpen color={c.accent} size={32} />
              <Text fontFamily="Lora" fontSize={28} lineHeight={37}>
                Every shelf starts with a story.
              </Text>
              <Text color="secondary">
                Bring an EPUB, a PDF, or a comic. We'll keep your place, even
                when you're offline.
              </Text>
              <Button icon={Plus} onPress={onImport}>
                Add your first book
              </Button>
            </Box>
          )}
        </View>
        {roomy && (
          <View className="flex-1 gap-4 rounded-3xl border border-line p-6">
            <SectionHeading title="ON YOUR SHELVES" />
            <Text fontFamily="Lora" fontSize={40} lineHeight={50}>
              {stats.total}
              <Text color="secondary" fontSize={15}>
                {" "}
                {stats.total === 1 ? "book" : "books"}, all yours
              </Text>
            </Text>
            {[
              {
                title: "Currently reading",
                count: stats.reading,
                query: { status: "reading", sort: "last-read" } as LibraryQuery,
                icon: BookOpen,
              },
              {
                title: "Finished",
                count: stats.finished,
                query: { status: "finished" } as LibraryQuery,
                icon: Bookmark,
              },
              {
                title: "Favorites",
                count: stats.favorites,
                query: { favorite: true } as LibraryQuery,
                icon: Heart,
              },
            ].map((item) => (
              <NavRow
                key={item.title}
                icon={item.icon}
                title={item.title}
                count={item.count}
                onPress={() => onBrowse(item.query)}
              />
            ))}
          </View>
        )}
      </View>
      <Box gap="l">
        <SectionHeading
          title="FRESH ON YOUR SHELVES"
          action={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Browse all books"
              onPress={() => onBrowse({})}
              className="flex-row items-center gap-2 rounded-xl p-3"
            >
              <Text variant="label" color="secondary">
                View all
              </Text>
              <ArrowUpRight size={17} color={c.secondary} />
            </Pressable>
          }
        />
        {recent.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: wide ? 20 : 12, paddingBottom: 8 }}
          >
            {recent.map((book) => (
              <Box key={book.id} width={wide ? 158 : 142}>
                <BookTile
                  book={book}
                  list={false}
                  onOpen={() => onOpen(book)}
                />
              </Box>
            ))}
          </ScrollView>
        ) : (
          <Text color="secondary">Your collection will feel at home here.</Text>
        )}
      </Box>
      {views.some((v) => v.pinned) && (
        <Box gap="m">
          <SectionHeading title="MADE FOR YOU" />
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
    </ScrollView>
  );
}
