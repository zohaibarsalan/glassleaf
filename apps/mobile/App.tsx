import { AppState } from "react-native";
import { syncDrive } from "./src/sync/drive";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { Lora_400Regular } from "@expo-google-fonts/lora";
import {
  kindLabels,
  kinds,
  planSchema,
  type Book,
  type LibraryQuery,
  type LibraryRepository,
  type OrganizationPlan,
  type Sort,
  type Stats,
} from "@glassleaf/library";
import { FlashList } from "@shopify/flash-list";
import { ThemeProvider } from "@shopify/restyle";
import * as DocumentPicker from "expo-document-picker";
import { useFonts } from "expo-font";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import {
  BookOpen,
  Folder,
  Heart,
  Layers,
  LayoutGrid,
  Leaf,
  Library,
  List,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
} from "react-native";
import "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { openLibrary } from "./src/data/database";
import { importBook, readExternal, writeExport } from "./src/data/files";
import { loadSamples } from "./src/data/samples";
import { Reader } from "./src/readers/Reader";
import { BookEditor } from "./src/screens/BookEditor";
import {
  CollectionsPanel,
  NotesPanel,
  SettingsPanel,
} from "./src/screens/LibraryPanels";
import { PlanReview } from "./src/screens/PlanReview";
import { BookTile, Brand, NavRow } from "./src/ui/LibraryComponents";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Sheet,
  Text,
  themes,
  usePalette,
  type ThemeName,
} from "./src/ui/theme";

type Tab = "library" | "collections" | "notes" | "settings";
const tabs = [
  { id: "library", title: "Library", icon: Library },
  { id: "collections", title: "Collections", icon: Layers },
  { id: "notes", title: "Notes", icon: NotebookPen },
  { id: "settings", title: "Settings", icon: Settings },
] as const;
const initialStats: Stats = {
  total: 0,
  reading: 0,
  finished: 0,
  favorites: 0,
  kinds: { novel: 0, "light-novel": 0, manga: 0, comic: 0, document: 0 },
  collections: [],
  tags: [],
};
export default function App() {
  const [repo, setRepo] = useState<LibraryRepository>();
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<ThemeName>("paper");
  const [fonts, fontError] = useFonts({
    DM: DMSans_400Regular,
    DMMedium: DMSans_500Medium,
    DMBold: DMSans_700Bold,
    Lora: Lora_400Regular,
  });
  useEffect(() => {
    void openLibrary()
      .then(async (r) => {
        const value = await r.setting("theme");
        if (value && value in themes) setTheme(value as ThemeName);
        if (__DEV__ && process.env.EXPO_PUBLIC_SAMPLE_LIBRARY === "1")
          await loadSamples(r);
        setRepo(r);
      })
      .catch((e) => setError(String(e)));
  }, []);
  const changeTheme = (value: ThemeName) => {
    setTheme(value);
    void repo?.setSetting("theme", value).catch((e) => setError(String(e)));
  };
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider theme={themes[theme]}>
          <StatusBar style={theme === "paper" ? "dark" : "light"} />
          {error ? (
            <Box
              flex={1}
              backgroundColor="bg"
              justifyContent="center"
              padding="xl"
              gap="l"
            >
              <Text variant="heading">
                Glassleaf couldn’t open your library
              </Text>
              <Text>{error}</Text>
            </Box>
          ) : repo && (fonts || fontError) ? (
            <LibraryApp repo={repo} theme={theme} changeTheme={changeTheme} />
          ) : (
            <Box
              flex={1}
              backgroundColor="bg"
              alignItems="center"
              justifyContent="center"
            >
              <ActivityIndicator color="#285B43" />
            </Box>
          )}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
function LibraryApp({
  repo,
  theme,
  changeTheme,
}: {
  repo: LibraryRepository;
  theme: ThemeName;
  changeTheme: (t: ThemeName) => void;
}) {
  const c = usePalette();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [tab, setTab] = useState<Tab>("library");
  const [query, setQuery] = useState<LibraryQuery>({});
  const [search, setSearch] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [stats, setStats] = useState<Stats>(initialStats);
  const [revision, refresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const paging = useRef(false);
  const generation = useRef(0);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [reader, setReader] = useState<Book>();
  const [editor, setEditor] = useState<Book>();
  const [menu, setMenu] = useState<Book>();
  const [sortSheet, setSortSheet] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [plan, setPlan] = useState<OrganizationPlan>();
  const [noteBooks, setNoteBooks] = useState<Book[]>([]);
  useEffect(() => {
    if (!__DEV__) return;
    const preview = process.env.EXPO_PUBLIC_READER_PREVIEW;
    if (preview)
      void repo.list().then((rows) => {
        const sample = rows.find((book) => book.format === preview);
        if (sample) setReader(sample);
      });
  }, [repo]);
  const reload = useCallback(() => refresh((n) => n + 1), []);
  const syncedOnLaunch = useRef(false);
  const [syncMessage, setSyncMessage] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        if (!(await repo.setting("drive-account"))) return;
        if (syncedOnLaunch.current && !(await repo.pending()).length) return;
        syncedOnLaunch.current = true;
        try {
          await syncDrive(repo, setSyncMessage);
          setSyncMessage("");
          reload();
        } catch (error) {
          setSyncMessage(
            error instanceof Error
              ? error.message
              : "Sync paused. Your changes are saved locally.",
          );
        }
      })().catch((error) => setSyncMessage(String(error)));
    }, 1800);
    return () => clearTimeout(timer);
  }, [repo, revision, reload]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncedOnLaunch.current = false;
        reload();
      }
    });
    return () => subscription.remove();
  }, [reload]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery((q) => ({ ...q, search })), 180);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    paging.current = false;
    void Promise.all([repo.list({ ...query, limit: 60 }), repo.stats()])
      .then(([rows, counts]) => {
        if (current !== generation.current) return;
        setBooks(rows);
        setMore(rows.length === 60);
        setStats(counts);
      })
      .catch((e) => setNotice(String(e)))
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
  }, [query, revision, repo]);
  useEffect(() => {
    if (tab === "notes")
      void repo
        .readingNotes()
        .then(setNoteBooks)
        .catch((e) => setNotice(String(e)));
  }, [tab, revision, repo]);
  async function nextPage() {
    if (!more || loading || paging.current) return;
    paging.current = true;
    const current = generation.current;
    try {
      const rows = await repo.list({
        ...query,
        offset: books.length,
        limit: 60,
      });
      if (current === generation.current) {
        setBooks((old) => [...old, ...rows]);
        setMore(rows.length === 60);
      }
    } catch (e) {
      setNotice(String(e));
    } finally {
      paging.current = false;
    }
  }
  async function run(label: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    try {
      await action();
      reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  async function pickBooks() {
    const picked = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: "*/*",
    });
    if (picked.canceled) return;
    await run("Importing books…", async () => {
      const failures: string[] = [];
      for (const [index, asset] of picked.assets.entries()) {
        setBusy(`Importing ${index + 1} of ${picked.assets.length}…`);
        try {
          await importBook(asset.uri, asset.name, repo);
        } catch (e) {
          failures.push(
            `${asset.name}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      if (failures.length) setNotice(failures.join("\n"));
      setTab("library");
    });
  }
  async function shareSnapshot() {
    await run("Preparing library snapshot…", async () => {
      const uri = await writeExport(
        "glassleaf-library.json",
        await repo.snapshot(),
      );
      if (Platform.OS === "web") {
        setNotice(`Snapshot downloaded.`);
      } else await Sharing.shareAsync(uri, { mimeType: "application/json" });
    });
  }
  async function pickPlan() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/json", "text/plain", "*/*"],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    await run("Reading organization plan…", async () => {
      setPlan(
        planSchema.parse(JSON.parse(await readExternal(result.assets[0]!.uri))),
      );
    });
  }
  const selectCollection = (name: string) => {
    setQuery({ collection: name });
    setSearch("");
    setTab("library");
  };
  const contentWidth = width - (wide ? 244 : 0) - (wide ? 72 : 40);
  const columns = Math.max(2, Math.min(6, Math.floor(contentWidth / 145)));
  const title = query.trash
    ? "Trash"
    : (query.collection ??
      (query.kind
        ? kindLabels[query.kind]
        : query.favorite
          ? "Your favorites"
          : query.status === "reading"
            ? "Currently reading"
            : "Your library"));
  if (reader)
    return (
      <Reader
        book={reader}
        repo={repo}
        onClose={() => {
          setReader(undefined);
          reload();
        }}
      />
    );
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={["top", "left", "right"]}
    >
      <Box flex={1} flexDirection="row">
        {wide && (
          <Box
            width={244}
            borderRightWidth={1}
            borderRightColor="line"
            padding="l"
            gap="xl"
          >
            <Brand />
            <Box gap="xs">
              {tabs.slice(0, 3).map((t) => (
                <NavRow
                  key={t.id}
                  icon={t.icon}
                  title={t.title}
                  active={tab === t.id}
                  onPress={() => {
                    setTab(t.id);
                    setQuery({});
                    setSearch("");
                  }}
                />
              ))}
            </Box>
            <Box gap="s">
              <Text variant="eyebrow" marginBottom="s">
                YOUR SHELVES
              </Text>
              {kinds.map((kind) => (
                <NavRow
                  key={kind}
                  icon={BookOpen}
                  title={kindLabels[kind]}
                  count={stats.kinds[kind]}
                  active={tab === "library" && query.kind === kind}
                  onPress={() => {
                    setTab("library");
                    setQuery({ kind });
                  }}
                />
              ))}
            </Box>
            <Box gap="s">
              <Text variant="eyebrow">COLLECTIONS</Text>
              {stats.collections.slice(0, 6).map((name) => (
                <NavRow
                  key={name}
                  icon={Folder}
                  title={name}
                  onPress={() => selectCollection(name)}
                />
              ))}
              {!stats.collections.length && (
                <Text variant="caption">Your collections will live here.</Text>
              )}
            </Box>
            <Box flex={1} />
            <NavRow
              icon={Settings}
              title="Settings"
              active={tab === "settings"}
              onPress={() => setTab("settings")}
            />
            <Box
              flexDirection="row"
              gap="s"
              alignItems="center"
              padding="m"
              backgroundColor="accentSoft"
              borderRadius="m"
            >
              <Leaf size={16} color={c.accent} />
              <Text variant="caption" color="accent">
                A little space for your stories.
              </Text>
            </Box>
          </Box>
        )}
        <Box flex={1}>
          <Box
            paddingHorizontal={wide ? "xxl" : "l"}
            paddingTop={wide ? "xl" : "m"}
            paddingBottom="l"
          >
            {!wide && (
              <Box
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                marginBottom="xl"
              >
                <Brand />
                <IconButton
                  icon={Plus}
                  label="Import books"
                  onPress={() => void pickBooks()}
                />
              </Box>
            )}
            <Box
              flexDirection="row"
              alignItems="center"
              justifyContent="space-between"
              gap="m"
            >
              <Box flex={1}>
                <Text variant="eyebrow" marginBottom="s">
                  {tab === "library"
                    ? "ALL YOUR WORLDS, TOGETHER"
                    : "MAKE ROOM FOR WHAT YOU LOVE"}
                </Text>
                <Text variant="title">
                  {tab === "library"
                    ? title
                    : tab === "collections"
                      ? "Made for your mind"
                      : tab === "notes"
                        ? "Between the lines"
                        : "Make it yours"}
                </Text>
                <Text variant="caption" marginTop="s">
                  {tab === "library"
                    ? `${stats.total} ${stats.total === 1 ? "story" : "stories"} · ${stats.reading} in progress`
                    : tab === "collections"
                      ? "Different shelves. Endless connections."
                      : tab === "notes"
                        ? "The thoughts and pages you want to keep."
                        : "Your library, your way."}
                </Text>
              </Box>
              {wide && tab === "library" && (
                <Button icon={Plus} onPress={() => void pickBooks()}>
                  Import books
                </Button>
              )}
            </Box>
          </Box>
          {tab === "library" && (
            <>
              <Box
                paddingHorizontal={wide ? "xxl" : "l"}
                gap="l"
                paddingBottom="l"
              >
                <Box flexDirection="row" alignItems="center" gap="s">
                  <Box
                    flex={1}
                    flexDirection="row"
                    alignItems="center"
                    gap="s"
                    backgroundColor="muted"
                    borderRadius="m"
                    paddingHorizontal="m"
                  >
                    <Search size={18} color={c.secondary} />
                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Find a title, author, or tag…"
                      placeholderTextColor={c.secondary}
                      accessibilityLabel="Search library"
                      style={{
                        flex: 1,
                        minHeight: 46,
                        fontFamily: "DM",
                        color: c.text,
                        fontSize: 14,
                      }}
                    />
                    {!!search && (
                      <IconButton
                        icon={X}
                        label="Clear search"
                        onPress={() => setSearch("")}
                      />
                    )}
                  </Box>
                  <IconButton
                    icon={SlidersHorizontal}
                    label="Sort and filter"
                    active={!!query.status || !!query.favorite || !!query.trash}
                    onPress={() => setSortSheet(true)}
                  />
                  <IconButton
                    icon={layout === "grid" ? List : LayoutGrid}
                    label={layout === "grid" ? "List view" : "Grid view"}
                    onPress={() =>
                      setLayout((v) => (v === "grid" ? "list" : "grid"))
                    }
                  />
                </Box>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  <Chip
                    label="Everything"
                    active={!query.kind && !query.collection}
                    onPress={() =>
                      setQuery((q) => ({
                        ...q,
                        kind: undefined,
                        collection: undefined,
                      }))
                    }
                  />
                  {kinds.map((kind) => (
                    <Chip
                      key={kind}
                      label={kindLabels[kind]}
                      active={query.kind === kind}
                      onPress={() =>
                        setQuery((q) => ({ ...q, kind, collection: undefined }))
                      }
                    />
                  ))}
                </ScrollView>
                {!!query.collection && (
                  <Pressable
                    onPress={() =>
                      setQuery((q) => ({ ...q, collection: undefined }))
                    }
                  >
                    <Text variant="label" color="accent">
                      {query.collection} ×
                    </Text>
                  </Pressable>
                )}
              </Box>
              {loading ? (
                <Box flex={1} justifyContent="center">
                  <ActivityIndicator color={c.accent} />
                </Box>
              ) : (
                <FlashList
                  key={`${layout}-${columns}`}
                  data={books}
                  numColumns={layout === "grid" ? columns : 1}
                  keyExtractor={(b) => b.id}
                  onEndReached={() => void nextPage()}
                  onEndReachedThreshold={0.5}
                  contentContainerStyle={{
                    paddingHorizontal: wide ? 34 : 14,
                    paddingBottom: 24,
                  }}
                  renderItem={({ item }) => (
                    <BookTile
                      book={item}
                      list={layout === "list"}
                      onOpen={() => setReader(item)}
                      onMenu={() => setMenu(item)}
                    />
                  )}
                  ListEmptyComponent={
                    <Box
                      padding="xl"
                      gap="l"
                      alignItems="center"
                      paddingTop="xxl"
                    >
                      <Box
                        width={84}
                        height={84}
                        borderRadius="l"
                        backgroundColor="accentSoft"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <BookOpen
                          size={34}
                          strokeWidth={1.3}
                          color={c.accent}
                        />
                      </Box>
                      <Text variant="heading">
                        {stats.total
                          ? "No stories found"
                          : "Your next chapter starts here"}
                      </Text>
                      <Text
                        variant="body"
                        color="secondary"
                        textAlign="center"
                        maxWidth={330}
                      >
                        {stats.total
                          ? "Try a different search or shelf."
                          : "Bring your EPUBs, PDFs, and comics. Keep every world close, even offline."}
                      </Text>
                      <Button icon={Plus} onPress={() => void pickBooks()}>
                        Import your first books
                      </Button>
                      {!stats.total && (
                        <Button
                          secondary
                          onPress={() =>
                            void run("Adding original sample books…", () =>
                              loadSamples(repo),
                            )
                          }
                        >
                          Explore the sample library
                        </Button>
                      )}
                    </Box>
                  }
                />
              )}
            </>
          )}
          {tab === "collections" && (
            <CollectionsPanel
              wide={wide}
              stats={stats}
              onCollection={selectCollection}
              onTag={(tag) => {
                setQuery({ tag });
                setTab("library");
              }}
            />
          )}
          {tab === "notes" && (
            <NotesPanel wide={wide} books={noteBooks} onOpen={setReader} />
          )}
          {tab === "settings" && (
            <SettingsPanel
              wide={wide}
              theme={theme}
              changeTheme={changeTheme}
              repo={repo}
              onSynced={reload}
              onExport={() => void shareSnapshot()}
              onPlan={() => void pickPlan()}
              onUndo={() =>
                void run("Undoing organization…", () => repo.undoLatest())
              }
              onSamples={() =>
                void run("Adding sample books…", () => loadSamples(repo))
              }
              onTrash={() => {
                setQuery({ trash: true });
                setTab("library");
              }}
            />
          )}
          {!!syncMessage && (
            <Box paddingHorizontal="l" paddingVertical="s">
              <Text variant="caption" numberOfLines={2}>
                {syncMessage}
              </Text>
            </Box>
          )}
          {!!busy && (
            <Box
              padding="m"
              backgroundColor="accentSoft"
              flexDirection="row"
              gap="m"
              alignItems="center"
            >
              <ActivityIndicator color={c.accent} />
              <Text variant="label" color="accent">
                {busy}
              </Text>
            </Box>
          )}
          {!wide && (
            <SafeAreaView
              edges={["bottom"]}
              style={{
                borderTopWidth: 1,
                borderColor: c.line,
                backgroundColor: c.bg,
              }}
            >
              <Box flexDirection="row" paddingTop="s" paddingBottom="xs">
                {tabs.map((t) => (
                  <Pressable
                    key={t.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === t.id }}
                    onPress={() => setTab(t.id)}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      gap: 4,
                      paddingVertical: 8,
                    }}
                  >
                    <t.icon
                      size={22}
                      strokeWidth={tab === t.id ? 2 : 1.6}
                      color={tab === t.id ? c.accent : c.secondary}
                    />
                    <Text
                      variant="caption"
                      color={tab === t.id ? "accent" : "secondary"}
                    >
                      {t.title}
                    </Text>
                  </Pressable>
                ))}
              </Box>
            </SafeAreaView>
          )}
        </Box>
      </Box>
      {!!notice && (
        <Sheet title="Library update" onClose={() => setNotice("")}>
          <Text>{notice}</Text>
          <Button onPress={() => setNotice("")}>Got it</Button>
        </Sheet>
      )}
      {menu && (
        <Sheet title={menu.title} onClose={() => setMenu(undefined)}>
          <Button
            icon={BookOpen}
            onPress={() => {
              setReader(menu);
              setMenu(undefined);
            }}
          >
            Continue reading
          </Button>
          <Button
            secondary
            icon={Pencil}
            onPress={() => {
              setEditor(menu);
              setMenu(undefined);
            }}
          >
            Edit details & organization
          </Button>
          <Button
            secondary
            icon={Heart}
            onPress={() => {
              void run("Updating favorite…", async () => {
                await repo.update(menu.id, { favorite: !menu.favorite });
              });
              setMenu(undefined);
            }}
          >
            {menu.favorite ? "Remove from favorites" : "Add to favorites"}
          </Button>
          <Button
            secondary
            icon={Trash2}
            onPress={() => {
              void run("Updating library…", async () => {
                await repo.update(menu.id, {
                  deletedAt: menu.deletedAt ? null : new Date().toISOString(),
                });
              });
              setMenu(undefined);
            }}
          >
            {menu.deletedAt ? "Restore to library" : "Move to Trash"}
          </Button>
        </Sheet>
      )}
      {editor && (
        <BookEditor
          book={editor}
          onClose={() => setEditor(undefined)}
          onSave={async (patch) => {
            await repo.update(editor.id, patch);
            reload();
          }}
        />
      )}
      {sortSheet && (
        <Sheet title="Find your next read" onClose={() => setSortSheet(false)}>
          <Text variant="eyebrow">SORT BY</Text>
          {(["added", "title", "author", "series", "progress"] as Sort[]).map(
            (sort) => (
              <Chip
                key={sort}
                label={
                  {
                    added: "Recently added",
                    title: "Title A–Z",
                    author: "Author",
                    series: "Series & volume",
                    progress: "Reading progress",
                  }[sort]
                }
                active={(query.sort ?? "added") === sort}
                onPress={() => setQuery((q) => ({ ...q, sort }))}
              />
            ),
          )}
          <Text variant="eyebrow">READING STATUS</Text>
          <Box flexDirection="row" flexWrap="wrap" gap="s">
            {(["unread", "reading", "finished"] as const).map((status) => (
              <Chip
                key={status}
                label={status.charAt(0).toUpperCase() + status.slice(1)}
                active={query.status === status}
                onPress={() =>
                  setQuery((q) => ({
                    ...q,
                    status: q.status === status ? undefined : status,
                  }))
                }
              />
            ))}
            <Chip
              label="Favorites"
              active={query.favorite}
              onPress={() => setQuery((q) => ({ ...q, favorite: !q.favorite }))}
            />
          </Box>
          <Button onPress={() => setSortSheet(false)}>Show books</Button>
          <Button
            secondary
            onPress={() => {
              setQuery({});
              setSearch("");
              setSortSheet(false);
            }}
          >
            Reset filters
          </Button>
        </Sheet>
      )}
      {plan && (
        <PlanReview
          plan={plan}
          repo={repo}
          onClose={() => setPlan(undefined)}
          onApply={() =>
            void run("Applying organization…", async () => {
              await repo.applyPlan(plan);
              setPlan(undefined);
            })
          }
        />
      )}
    </SafeAreaView>
  );
}
