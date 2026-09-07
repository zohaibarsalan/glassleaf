import {
  type LibraryQuery,
  type Book,
  type LibraryRepository,
  type SearchHit,
} from "@glassleaf/library";
import { FlashList } from "@shopify/flash-list";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable } from "react-native";
import { Box, Chip, Field, Text, usePalette } from "../ui/theme";
const scopes = [
  { label: "All", kind: undefined },
  { label: "Books", kind: "book" },
  { label: "Notes", kind: "note" },
  { label: "Chapters", kind: "passage" },
  { label: "Bookmarks", kind: "bookmark" },
] as const;
export function SearchPanel({
  repo,
  onOpen,
  indexStatus,
  scope,
  scopeName,
  onEverywhere,
  onRetryIndex,
}: {
  repo: LibraryRepository;
  onOpen: (book: Book) => void;
  indexStatus: string;
  scope: LibraryQuery;
  scopeName: string;
  onEverywhere: () => void;
  onRetryIndex: () => void;
}) {
  const c = usePalette();
  const [term, setTerm] = useState(""),
    [kind, setKind] = useState<SearchHit["kind"]>(),
    [rows, setRows] = useState<SearchHit[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    paging = useRef(false);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const run = ++generation.current;
    setBusy(true);
    setRows([]);
    setError("");
    const timer = setTimeout(() => {
      void repo
        .discover(term, kind, 0, scope)
        .then((hits) => {
          if (run === generation.current) {
            setRows(hits);
            setMore(hits.length === 40);
          }
        })
        .catch((e) => {
          if (run === generation.current) setError(String(e));
        })
        .finally(() => {
          if (run === generation.current) setBusy(false);
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [term, kind, repo, scope]);
  async function next() {
    if (!more || busy || paging.current) return;
    paging.current = true;
    const run = generation.current;
    try {
      const hits = await repo.discover(term, kind, rows.length, scope);
      if (run === generation.current) {
        setRows((old) => [...old, ...hits]);
        setMore(hits.length === 40);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      paging.current = false;
    }
  }
  async function open(hit: SearchHit) {
    try {
      const book = await repo.get(hit.bookId);
      if (book && !book.deletedAt)
        onOpen(hit.kind === "book" ? book : { ...book, locator: hit.locator });
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <Box flex={1}>
      <Box paddingHorizontal="l" gap="m" paddingBottom="m">
        <Box flexDirection="row" gap="s" alignItems="center">
          <Text variant="caption" flex={1}>
            Searching {scopeName}
          </Text>
          {scopeName !== "everywhere" && (
            <Chip label="Everywhere" onPress={onEverywhere} />
          )}
        </Box>
        <Field
          label={
            scope.bookId
              ? "Search this book"
              : scopeName === "everywhere"
                ? "Search everything"
                : "Search this view"
          }
          testID="field-Search everything"
          value={term}
          onChangeText={setTerm}
          placeholder="A title, a thought, a line you remember…"
          autoCorrect={false}
        />
        <Box flexDirection="row" flexWrap="wrap" gap="s">
          {scopes.map((s) => (
            <Chip
              key={s.label}
              label={s.label}
              active={kind === s.kind}
              onPress={() => setKind(s.kind)}
            />
          ))}
        </Box>
        {!!indexStatus && <Text variant="caption">{indexStatus}</Text>}
        {indexStatus.includes("unavailable") && (
          <Chip label="Retry chapter indexing" onPress={onRetryIndex} />
        )}
        {!!error && <Text color="danger">{error}</Text>}
      </Box>
      {busy ? (
        <ActivityIndicator color={c.accent} />
      ) : (
        <FlashList
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          data={rows}
          keyExtractor={(r, i) => `${r.bookId}-${r.kind}-${r.locator}-${i}`}
          onEndReached={() => void next()}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.kind}: ${item.title}`}
              onPress={() => void open(item)}
              style={{
                paddingVertical: 18,
                borderBottomWidth: 1,
                borderColor: c.line,
                gap: 6,
              }}
            >
              <Text variant="eyebrow" color="accent">
                {item.kind === "passage"
                  ? "CHAPTER TEXT"
                  : item.kind.toUpperCase()}
              </Text>
              <Text variant="label">{item.title}</Text>
              {item.kind !== "book" && (
                <Text variant="caption">{item.bookTitle}</Text>
              )}
              {!!item.excerpt && (
                <Text color="secondary" numberOfLines={3}>
                  {item.excerpt}
                </Text>
              )}
            </Pressable>
          )}
          ListEmptyComponent={
            <Box paddingVertical="xxl" gap="m">
              <Text variant="heading">
                {term ? "Nothing here yet." : "Find your way back."}
              </Text>
              <Text color="secondary">
                {term
                  ? "Try fewer words or another result type."
                  : "Search book details, notes, bookmarks and the text of local EPUB chapters."}
              </Text>
              <Text variant="caption">
                PDF and comic page text is not indexed. Chapter results open the
                chapter; notes open their saved position.
              </Text>
            </Box>
          }
        />
      )}
    </Box>
  );
}
