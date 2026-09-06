import { ReadingListEditor } from "./src/screens/ReadingListEditor";
import { type OrganizationRecord } from "@glassleaf/library";
import { StructurePlanReview } from "./src/screens/StructurePlanReview";
import { structurePlanSchema, type StructurePlan } from "@glassleaf/library";
import { HomePanel } from "./src/screens/HomePanel";
import { SearchPanel } from "./src/screens/SearchPanel";
import { SpacesPanel } from "./src/screens/SpacesPanel";
import { ViewEditor } from "./src/screens/ViewEditor";
import { indexLocalChapters } from "./src/data/searchIndex";
import { type SavedView } from "@glassleaf/library";
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
  Home,
  MoreHorizontal,
  ListPlus,
  Layers,
  Leaf,
  Library,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
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
import { BulkOrganize } from "./src/screens/BulkOrganize";
import { NotesPanel, SettingsPanel } from "./src/screens/LibraryPanels";
import { PlanReview } from "./src/screens/PlanReview";
import { ThemePanel } from "./src/screens/ThemePanel";
import { syncDrive } from "./src/sync/drive";
import { BookTile, Brand, NavRow } from "./src/ui/LibraryComponents";
import {
  base,
  Box,
  Button,
  IconButton,
  Field,
  Sheet,
  Text,
  usePalette,
  type ThemeName,
} from "./src/ui/theme";
import {
  builtinThemes,
  themeDefinitionSchema,
  type ThemeDefinition,
} from "./src/ui/themeDefinition";

type Tab = "home" | "library" | "collections" | "search" | "notes" | "settings";
const tabs = [
  { id: "home", title: "Home", icon: Home },
  { id: "library", title: "Library", icon: Library },
  { id: "collections", title: "Organize", icon: Layers },
  { id: "search", title: "Search", icon: Search },
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
  const [customThemes, setCustomThemes] = useState<ThemeDefinition[]>([]);
  const definitions: ThemeDefinition[] = [...builtinThemes, ...customThemes];
  const activeTheme =
    definitions.find((t) => t.id === theme) ?? definitions[0]!;
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
        if (value) setTheme(value);
        const saved = await r.setting("custom-themes");
        if (saved) {
          try {
            setCustomThemes(
              themeDefinitionSchema.array().max(100).parse(JSON.parse(saved)),
            );
          } catch {
            /* Invalid preferences must not prevent opening books. */
          }
        }
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
        <ThemeProvider theme={{ ...base, colors: activeTheme.colors }}>
          <StatusBar style={activeTheme.mode === "light" ? "dark" : "light"} />
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
            <LibraryApp
              repo={repo}
              appearance={
                <ThemePanel
                  definitions={definitions}
                  selected={activeTheme.id}
                  onSelect={changeTheme}
                  onSave={async (definition) => {
                    const next = [
                      ...customThemes.filter((t) => t.id !== definition.id),
                      definition,
                    ];
                    if (next.length > 100)
                      throw new Error(
                        "Remove a custom theme before adding another; the limit is 100.",
                      );
                    await repo.setSetting(
                      "custom-themes",
                      JSON.stringify(next),
                    );
                    setCustomThemes(next);
                    changeTheme(definition.id);
                  }}
                  onRemove={async (id) => {
                    const next = customThemes.filter((t) => t.id !== id);
                    await repo.setSetting(
                      "custom-themes",
                      JSON.stringify(next),
                    );
                    setCustomThemes(next);
                    if (theme === id) changeTheme("paper");
                  }}
                />
              }
            />
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
  appearance,
}: {
  repo: LibraryRepository;
  appearance: ReactNode;
}) {
  const c = usePalette();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [tab, setTab] = useState<Tab>("home");
  const [searchScope, setSearchScope] = useState<{
    query: LibraryQuery;
    name: string;
  }>({ query: {}, name: "everywhere" });
  const [listEditor, setListEditor] = useState<{
    record?: OrganizationRecord;
    selected?: string[];
  }>();
  const [facetEditor, setFacetEditor] = useState<{
    field: "tag" | "collection";
    value: string;
  }>();
  const [facetName, setFacetName] = useState("");
  const [organization, setOrganization] = useState<OrganizationRecord[]>([]);
  const [contextFacets, setContextFacets] = useState<
    { field: string; value: string; count: number }[]
  >([]);
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
  const [libraryMenu, setLibraryMenu] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [indexStatus, setIndexStatus] = useState("");
  useEffect(() => {
    void repo
      .organization()
      .then(setOrganization)
      .catch((e) => setNotice(String(e)));
  }, [repo, revision, views]);
  useEffect(() => {
    if (sortSheet)
      void repo
        .facets(query)
        .then(setContextFacets)
        .catch((e) => setNotice(String(e)));
  }, [repo, query, sortSheet]);
  useEffect(() => {
    void repo
      .savedViews()
      .then(setViews)
      .catch((e) => setNotice(String(e)));
  }, [repo, revision]);
  useEffect(() => {
    if (reader) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void indexLocalChapters(repo, controller.signal, setIndexStatus).catch(
        (e) => setIndexStatus(`Chapter indexing paused: ${String(e)}`),
      );
    }, 1200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [repo, revision, reader]);
  const browse = (q: LibraryQuery) => {
    setQuery(q);
    setSearch(q.search ?? "");
    setTab("library");
    setSelecting(false);
    setSelection(new Map());
  };

  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<Map<string, Book>>(new Map());
  const [bulk, setBulk] = useState(false);
  function toggleBook(book: Book) {
    setSelection((current) => {
      const next = new Map(current);
      if (next.has(book.id)) next.delete(book.id);
      else next.set(book.id, book);
      return next;
    });
  }
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [plan, setPlan] = useState<OrganizationPlan | StructurePlan>();
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
        if (
          syncedOnLaunch.current &&
          !(await repo.pending()).length &&
          !(await repo.pendingOrganization()).length
        )
          return;
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
        planSchema
          .or(structurePlanSchema)
          .parse(JSON.parse(await readExternal(result.assets[0]!.uri))),
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
  const hasFilters = !!(
    query.series ||
    query.collectionId ||
    query.readingListId ||
    query.unfiled ||
    query.rules?.conditions.length ||
    query.search?.trim() ||
    query.kind ||
    query.format ||
    query.tag ||
    query.collection ||
    query.status ||
    query.favorite ||
    query.trash
  );
  const activeView = query.rules
    ? views.find(
        (view) =>
          JSON.stringify(view.rules) === JSON.stringify(query.rules) &&
          view.sort === query.sort &&
          view.scope?.series === query.series &&
          view.scope?.collectionId === query.collectionId &&
          view.scope?.readingListId === query.readingListId &&
          Boolean(view.scope?.unfiled) === Boolean(query.unfiled),
      )
    : undefined;
  const activeGroup = organization.find(
    (r) => r.id === (query.readingListId ?? query.collectionId),
  );
  const title = query.trash
    ? "Trash"
    : (query.series ??
      (activeGroup?.value.kind !== "view"
        ? activeGroup?.value.name
        : undefined) ??
      activeView?.name ??
      query.collection ??
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
        onSearch={(book) => {
          setSearchScope({ query: { bookId: book.id }, name: book.title });
          setReader(undefined);
          setTab("search");
        }}
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
              {tabs.map((t) => (
                <NavRow
                  key={t.id}
                  icon={t.icon}
                  title={t.title}
                  active={tab === t.id}
                  onPress={() => {
                    if (t.id === "search")
                      setSearchScope({ query: {}, name: "everywhere" });
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
            paddingBottom="m"
          >
            {!wide && (
              <Box
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                marginBottom="s"
              >
                <Brand />
                <Box flexDirection="row">
                  <IconButton
                    icon={Settings}
                    label="Settings"
                    onPress={() => setTab("settings")}
                  />
                  <IconButton
                    icon={Plus}
                    label="Import books"
                    onPress={() => void pickBooks()}
                  />
                </Box>
              </Box>
            )}
            <Box
              style={{ display: tab === "home" ? "none" : "flex" }}
              flexDirection="row"
              alignItems="center"
              justifyContent="space-between"
              gap="m"
            >
              <Box flex={1}>
                <Text variant="heading" fontSize={24} lineHeight={32}>
                  {tab === "home"
                    ? "Home"
                    : tab === "search"
                      ? "Search"
                      : tab === "library"
                        ? title
                        : tab === "collections"
                          ? "Organize"
                          : tab === "notes"
                            ? "Notes & bookmarks"
                            : "Settings"}
                </Text>
                <Text variant="caption" marginTop="s">
                  {tab === "home"
                    ? "Your reading space."
                    : tab === "search"
                      ? "Across your whole library."
                      : tab === "library"
                        ? hasFilters
                          ? `${books.length}${more ? "+" : ""} matching ${books.length === 1 ? "story" : "stories"}`
                          : `${stats.total} ${stats.total === 1 ? "story" : "stories"} · ${stats.reading} in progress`
                        : tab === "collections"
                          ? "Your stories, connected your way."
                          : tab === "notes"
                            ? "The thoughts and pages you want to keep."
                            : "Appearance, sync, and library tools."}
                </Text>
              </Box>
              {wide && tab === "library" && (
                <Button icon={Plus} onPress={() => void pickBooks()}>
                  Import books
                </Button>
              )}
            </Box>
          </Box>
          {tab === "home" && (
            <HomePanel
              repo={repo}
              revision={revision}
              views={views}
              onOpen={setReader}
              onBrowse={browse}
              onImport={() => void pickBooks()}
            />
          )}
          {tab === "search" && (
            <SearchPanel
              repo={repo}
              onOpen={setReader}
              indexStatus={indexStatus}
              onRetryIndex={() =>
                void run("Retrying chapter indexing…", () =>
                  repo.retryChapters(),
                )
              }
              scope={searchScope.query}
              scopeName={searchScope.name}
              onEverywhere={() =>
                setSearchScope({ query: {}, name: "everywhere" })
              }
            />
          )}
          {tab === "library" && (
            <>
              <Box paddingHorizontal="l" paddingBottom="m" gap="s">
                <Box
                  flexDirection="row"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Text variant="caption" flex={1}>
                    {query.rules?.conditions.length
                      ? `${query.rules.match === "all" ? "All" : "Any"} of ${query.rules.conditions.length} conditions`
                      : hasFilters
                        ? "Filtered library"
                        : "All stories"}
                  </Text>
                  <IconButton
                    icon={SlidersHorizontal}
                    label="View options"
                    onPress={() => setSortSheet(true)}
                  />
                  <IconButton
                    icon={MoreHorizontal}
                    label="Library actions"
                    onPress={() => setLibraryMenu(true)}
                  />
                </Box>
                {hasFilters && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear library filters"
                    onPress={() => browse({})}
                    style={{ paddingVertical: 8 }}
                  >
                    <Text color="accent">Clear filters</Text>
                  </Pressable>
                )}
                {selecting && (
                  <Box flexDirection="row" alignItems="center" gap="s">
                    <Text flex={1}>{selection.size} selected</Text>
                    <Button
                      secondary
                      onPress={() => {
                        setSelecting(false);
                        setSelection(new Map());
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={!selection.size}
                      onPress={() => setBulk(true)}
                    >
                      Organize selected
                    </Button>
                    <IconButton
                      icon={ListPlus}
                      label="Make reading list from selection"
                      onPress={() =>
                        setListEditor({ selected: [...selection.keys()] })
                      }
                    />
                  </Box>
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
                  extraData={{ selecting, selection }}
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
                      onOpen={() =>
                        selecting ? toggleBook(item) : setReader(item)
                      }
                      selected={selecting ? selection.has(item.id) : undefined}
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
            <SpacesPanel
              stats={stats}
              views={views}
              onBrowse={browse}
              repo={repo}
              revision={revision}
              onChanged={reload}
              onEditList={(record) => setListEditor({ record })}
              onManageFacet={(field, value) => {
                setFacetEditor({ field, value });
                setFacetName(value);
              }}
              onCreate={() => {
                setQuery({});
                setSortSheet(true);
              }}
              onRemove={(id) =>
                void run("Removing view…", () => repo.removeView(id))
              }
            />
          )}
          {tab === "notes" && (
            <NotesPanel wide={wide} books={noteBooks} onOpen={setReader} />
          )}
          {tab === "settings" && (
            <SettingsPanel
              wide={wide}
              appearance={appearance}
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
                    onPress={() => {
                      if (t.id === "search")
                        setSearchScope({ query: {}, name: "everywhere" });
                      setTab(t.id);
                    }}
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
      {bulk && (
        <BulkOrganize
          books={[...selection.values()]}
          repo={repo}
          onClose={() => setBulk(false)}
          onSaved={() => {
            setBulk(false);
            setSelecting(false);
            setSelection(new Map());
            reload();
          }}
        />
      )}
      {libraryMenu && (
        <Sheet title="Library actions" onClose={() => setLibraryMenu(false)}>
          <Button
            secondary
            onPress={() => {
              setSearchScope({ query, name: title });
              setTab("search");
              setLibraryMenu(false);
            }}
          >
            Search this view
          </Button>
          {query.readingListId && (
            <Button
              secondary
              onPress={() => {
                setListEditor({ record: activeGroup });
                setLibraryMenu(false);
              }}
            >
              Edit reading order
            </Button>
          )}
          <Button
            secondary
            onPress={() => {
              setLayout((v) => (v === "grid" ? "list" : "grid"));
              setLibraryMenu(false);
            }}
          >
            {layout === "grid" ? "List view" : "Grid view"}
          </Button>
          <Button
            secondary
            onPress={() => {
              setSelecting(true);
              setSelection(new Map());
              setLibraryMenu(false);
            }}
          >
            Select books
          </Button>
          <Button
            secondary
            onPress={() => {
              setTab("notes");
              setLibraryMenu(false);
            }}
          >
            Notes & bookmarks
          </Button>
          <Button
            secondary
            onPress={() => {
              setLibraryMenu(false);
              void pickBooks();
            }}
          >
            Import books
          </Button>
        </Sheet>
      )}
      {facetEditor && (
        <Sheet
          title={`Manage ${facetEditor.field}`}
          onClose={() => setFacetEditor(undefined)}
        >
          <Text>
            Rename this group, or merge it into an existing name. All matching
            books and saved rules are updated together.
          </Text>
          <Field
            label="Group name"
            value={facetName}
            onChangeText={setFacetName}
          />
          <Button
            disabled={!facetName.trim()}
            onPress={() =>
              void run("Updating group…", async () => {
                await repo.renameFacet(
                  facetEditor.field,
                  facetEditor.value,
                  facetName,
                );
                setFacetEditor(undefined);
              })
            }
          >
            Rename or merge
          </Button>
          <Button
            secondary
            onPress={() =>
              void run("Removing group…", async () => {
                await repo.renameFacet(
                  facetEditor.field,
                  facetEditor.value,
                  "",
                );
                setFacetEditor(undefined);
              })
            }
          >
            Remove group, keep books
          </Button>
        </Sheet>
      )}
      {listEditor && (
        <ReadingListEditor
          repo={repo}
          {...listEditor}
          onClose={() => setListEditor(undefined)}
          onSaved={() => {
            setListEditor(undefined);
            reload();
          }}
        />
      )}
      {sortSheet && (
        <ViewEditor
          initial={{
            id: activeView?.id,
            name: activeView?.name,
            pinned: activeView?.pinned,
            scope: {
              series: query.series,
              collectionId: query.collectionId,
              readingListId: query.readingListId,
              unfiled: query.unfiled,
            },
            rules: query.rules ?? {
              match: "all",
              conditions: [
                ...(
                  ["kind", "format", "status", "tag", "collection"] as const
                ).flatMap((field) =>
                  query[field]
                    ? [{ field, operator: "is" as const, value: query[field]! }]
                    : [],
                ),
                ...(query.favorite
                  ? [
                      {
                        field: "favorite" as const,
                        operator: "is" as const,
                        value: "true",
                      },
                    ]
                  : []),
              ],
            },
            sort: query.sort ?? "added",
          }}
          stats={{
            ...stats,
            tags: contextFacets
              .filter((f) => f.field === "tag")
              .map((f) => f.value),
            collections: contextFacets
              .filter((f) => f.field === "collection")
              .map((f) => f.value),
          }}
          onClose={() => setSortSheet(false)}
          onApply={(rules, sort) => {
            browse({
              rules,
              sort,
              trash: query.trash,
              series: query.series,
              readingListId: query.readingListId,
              collectionId: query.collectionId,
              unfiled: query.unfiled,
            });
            setSortSheet(false);
          }}
          onSave={async (view) => {
            await repo.saveView(
              view,
              organization.find((r) => r.id === view.id)?.revision ?? null,
            );
            setViews(await repo.savedViews());
          }}
        />
      )}
      {plan?.version === 2 && (
        <StructurePlanReview
          repo={repo}
          plan={plan}
          onClose={() => setPlan(undefined)}
          onApply={() =>
            void run("Applying organization…", async () => {
              await repo.applyStructurePlan(plan);
              setPlan(undefined);
            })
          }
        />
      )}
      {plan?.version === 1 && (
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
