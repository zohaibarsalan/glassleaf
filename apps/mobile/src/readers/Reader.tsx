import type { Book, LibraryRepository } from "@glassleaf/library";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { randomUUID } from "expo-crypto";
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  List,
  Minus,
  NotebookPen,
  Plus,
  Settings2,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  Pressable,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fileURI, hasFile } from "../data/files";
import {
  Box,
  Button,
  Chip,
  Field,
  IconButton,
  Sheet,
  Text,
  usePalette,
} from "../ui/theme";
import { ComicCanvas, ComicStripPage } from "./ComicCanvas";
import { EPUBPage } from "./EPUBPage";
import { PDFPages } from "./PDFPages";
export function Reader({
  book: initialBook,
  repo,
  onClose,
}: {
  book: Book;
  repo: LibraryRepository;
  onClose: () => void;
}) {
  const [book, setBook] = useState(initialBook);
  const c = usePalette();
  const { width } = useWindowDimensions();
  const start = parseLocator(book.locator);
  const [page, setPage] = useState(start.page);
  const [fraction, setFraction] = useState(start.fraction);
  const [count, setCount] = useState(
    book.format === "epub"
      ? book.asset.chapters.length
      : book.asset.pages.length || 1,
  );
  const [controls, setControls] = useState(true);
  const [settings, setSettings] = useState(false);
  const [contents, setContents] = useState(false);
  const [note, setNote] = useState<string>();
  const [size, setSize] = useState(20);
  const [command, setCommand] = useState<{
    id: number;
    delta?: number;
    fraction?: number;
  }>();
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [selection, setSelection] = useState("");
  const [jump, setJump] = useState("");
  const scrollList = useRef<FlashListRef<string>>(null);
  const current = useRef({ page, fraction });
  current.current = { page, fraction };
  const saved = useRef("");
  const initialSizeLoaded = useRef(false);
  const save = useCallback(async () => {
    const position = current.current;
    const locator = `${position.page}:${position.fraction}`;
    if (locator === saved.current || !hasFile(initialBook.asset.path)) return;
    await repo.update(initialBook.id, {
      locator,
      progress: Math.min(
        (position.page + position.fraction) / Math.max(count, 1),
        1,
      ),
      status:
        position.page >= count - 1 && position.fraction >= 0.98
          ? "finished"
          : "reading",
    });
    saved.current = locator;
  }, [repo, initialBook.id, initialBook.asset.path, count]);
  const close = useCallback(() => {
    void save()
      .then(onClose)
      .catch((e) => setError(String(e)));
  }, [save, onClose]);
  useEffect(() => {
    void repo.setting("reader-size").then((value) => {
      if (value) setSize(Math.min(Math.max(Number(value) || 20, 14), 34));
      initialSizeLoaded.current = true;
    });
  }, [repo]);
  useEffect(() => {
    if (initialSizeLoaded.current)
      void repo
        .setSetting("reader-size", String(size))
        .catch((e) => setError(String(e)));
  }, [size, repo]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void save().catch((e) => setError(String(e)));
    }, 500);
    return () => clearTimeout(timer);
  }, [page, fraction, save]);
  useEffect(() => {
    const app = AppState.addEventListener("change", (state) => {
      if (state !== "active") void save().catch((e) => setError(String(e)));
    });
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => {
      app.remove();
      back.remove();
    };
  }, [save, close]);
  async function update(
    patch: Partial<Pick<Book, "direction" | "layout" | "notes" | "bookmarks">>,
  ) {
    try {
      setBook(await repo.update(book.id, patch));
    } catch (e) {
      setError(String(e));
    }
  }
  function turn(delta: number) {
    setPage((p) => Math.min(Math.max(p + delta, 0), count - 1));
    setFraction(0);
    setZoom(1);
  }
  const locator = `${page}:${fraction}`;
  const bookmarked = book.bookmarks.some(
    (mark) => parseLocator(mark.locator).page === page,
  );
  const pageLabel =
    book.format === "epub" ? `Chapter ${page + 1}` : `Page ${page + 1}`;
  const rightToLeft = book.direction === "rtl";
  const previousIcon = rightToLeft ? ChevronRight : ChevronLeft;
  const nextIcon = rightToLeft ? ChevronLeft : ChevronRight;
  const visiblePages =
    book.layout === "spread" && page > 0
      ? [page, page + 1].filter((i) => i < count)
      : [page];
  const orderedPages = rightToLeft ? [...visiblePages].reverse() : visiblePages;
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: book.format === "epub" ? c.bg : "#171D1A",
      }}
      edges={["top", "bottom"]}
    >
      {controls && (
        <Box
          flexDirection="row"
          alignItems="center"
          paddingHorizontal="s"
          paddingVertical="s"
          backgroundColor="bg"
          gap="s"
        >
          <IconButton
            icon={ArrowLeft}
            label="Back to library"
            onPress={close}
          />
          <Box flex={1}>
            <Text variant="label" numberOfLines={1}>
              {book.title}
            </Text>
            <Text variant="caption">
              {pageLabel} of {count}
            </Text>
          </Box>
          <IconButton
            icon={List}
            label="Contents and bookmarks"
            onPress={() => setContents(true)}
          />
          <IconButton
            icon={Settings2}
            label="Reading settings"
            onPress={() => setSettings(true)}
          />
        </Box>
      )}
      <Box flex={1}>
        {!hasFile(book.asset.path) ? (
          <Box
            flex={1}
            padding="xl"
            gap="l"
            justifyContent="center"
            backgroundColor="bg"
          >
            <Text variant="heading">This book isn’t on this device yet.</Text>
            <Text color="secondary">
              Connect Google Drive and sync to download its file, then open it
              again.
            </Text>
            <Button onPress={close}>Back to library</Button>
          </Box>
        ) : book.format === "epub" ? (
          <EPUBPage
            book={book}
            chapter={page}
            size={size}
            initial={fraction}
            onProgress={setFraction}
            onSelection={setSelection}
            onTap={() => setControls((v) => !v)}
            command={command}
            onEdge={turn}
            onChapter={(index) => {
              setPage(index);
              setFraction(0);
            }}
          />
        ) : book.format === "pdf" ? (
          <PDFPages
            book={book}
            page={page}
            onPage={(p, total) => {
              setPage(p);
              setCount(total);
              setFraction(p === total - 1 ? 1 : 0);
            }}
            onError={setError}
          />
        ) : book.layout === "scroll" ? (
          <FlashList
            ref={scrollList}
            data={book.asset.pages}
            initialScrollIndex={Math.min(start.page, count - 1)}
            keyExtractor={(path) => path}
            onViewableItemsChanged={({ viewableItems }) => {
              const item = viewableItems.find((v) => v.isViewable);
              if (item?.index !== undefined && item.index !== null) {
                setPage(item.index);
                setFraction(item.index === count - 1 ? 1 : 0);
              }
            }}
            renderItem={({ item }) => (
              <ComicStripPage
                uri={fileURI(`${book.id}/content/${item}`)}
                width={width}
              />
            )}
          />
        ) : (
          <ComicCanvas
            uris={orderedPages.map((index) =>
              fileURI(`${book.id}/content/${book.asset.pages[index]}`),
            )}
            zoom={zoom}
            onTap={() => setControls((v) => !v)}
            onError={() =>
              setError(
                "This page image could not be decoded. You can continue to another page.",
              )
            }
          />
        )}
        {!controls && book.format !== "epub" && (
          <Box
            position="absolute"
            top={8}
            right={8}
            backgroundColor="bg"
            borderRadius="pill"
          >
            <IconButton
              icon={Settings2}
              label="Show reader controls"
              onPress={() => setControls(true)}
            />
          </Box>
        )}
      </Box>
      {controls && (
        <Box
          backgroundColor="bg"
          paddingHorizontal="m"
          paddingTop="s"
          paddingBottom="s"
        >
          <Box
            flexDirection="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <IconButton
              icon={previousIcon}
              label={
                book.format === "epub" ? "Previous chapter" : "Previous page"
              }
              onPress={() =>
                book.format === "epub"
                  ? setCommand({ id: Date.now(), delta: -1 })
                  : turn(book.layout === "spread" && page > 1 ? -2 : -1)
              }
              disabled={page <= 0 && (book.format !== "epub" || fraction <= 0)}
            />
            <Pressable onPress={() => setContents(true)}>
              <Text variant="caption">
                {pageLabel} / {count}
              </Text>
            </Pressable>
            <IconButton
              icon={Bookmark}
              label={bookmarked ? "Remove bookmark" : "Bookmark page"}
              active={bookmarked}
              onPress={() =>
                void update({
                  bookmarks: bookmarked
                    ? book.bookmarks.filter(
                        (mark) => parseLocator(mark.locator).page !== page,
                      )
                    : [
                        ...book.bookmarks,
                        { id: randomUUID(), locator, label: pageLabel },
                      ],
                })
              }
            />
            <IconButton
              icon={NotebookPen}
              label="Add a note"
              onPress={() => setNote(selection)}
            />
            <IconButton
              icon={nextIcon}
              label="Next page"
              onPress={() => {
                if (book.format === "epub") {
                  setCommand({ id: Date.now(), delta: 1 });
                  return;
                }
                turn(book.layout === "spread" && page > 0 ? 2 : 1);
                if (page + 1 >= count - 1 && book.format === "cbz")
                  setFraction(1);
              }}
              disabled={
                page >= count - 1 &&
                (book.format !== "epub" || fraction >= 0.999)
              }
            />
          </Box>
          <View
            style={{ height: 2, backgroundColor: c.line, marginHorizontal: 12 }}
          >
            <View
              style={{
                height: 2,
                backgroundColor: c.accent,
                width: `${Math.min(((page + 1) / count) * 100, 100)}%`,
              }}
            />
          </View>
        </Box>
      )}
      {settings && (
        <Sheet title="Settle into the story" onClose={() => setSettings(false)}>
          {book.format === "epub" && (
            <Box
              flexDirection="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Text>Text size</Text>
              <IconButton
                icon={Minus}
                label="Smaller text"
                onPress={() => setSize((s) => Math.max(14, s - 2))}
              />
              <Text>{size}</Text>
              <IconButton
                icon={Plus}
                label="Larger text"
                onPress={() => setSize((s) => Math.min(34, s + 2))}
              />
            </Box>
          )}
          <Text variant="label">Reading direction</Text>
          <Box flexDirection="row" gap="s">
            <Chip
              label="Left to right"
              active={!rightToLeft}
              onPress={() => void update({ direction: "ltr" })}
            />
            <Chip
              label="Right to left"
              active={rightToLeft}
              onPress={() => void update({ direction: "rtl" })}
            />
          </Box>
          {
            <>
              <Text variant="label">Page layout</Text>
              <Box flexDirection="row" gap="s">
                <Chip
                  label="Single page"
                  active={book.layout === "pages"}
                  onPress={() => void update({ layout: "pages" })}
                />
                <Chip
                  label="Scroll"
                  active={book.layout === "scroll"}
                  onPress={() => void update({ layout: "scroll" })}
                />
                {book.format === "cbz" && (
                  <Chip
                    label="Spreads"
                    active={book.layout === "spread"}
                    onPress={() => void update({ layout: "spread" })}
                  />
                )}
              </Box>
              {book.format === "cbz" && (
                <Box
                  flexDirection="row"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Text>Zoom</Text>
                  <IconButton
                    icon={Minus}
                    label="Zoom out"
                    onPress={() => setZoom((z) => Math.max(1, z - 0.5))}
                  />
                  <Text>{zoom}×</Text>
                  <IconButton
                    icon={Plus}
                    label="Zoom in"
                    onPress={() => setZoom((z) => Math.min(4, z + 0.5))}
                  />
                </Box>
              )}
            </>
          }
          <Text variant="caption">
            Direction changes navigation and spread order, never the artwork
            itself. Reading settings are saved with this book.
          </Text>
        </Sheet>
      )}
      {contents && (
        <Sheet
          title={
            book.format === "epub"
              ? "Contents & bookmarks"
              : "Pages & bookmarks"
          }
          onClose={() => setContents(false)}
        >
          <Field
            label={book.format === "epub" ? "Go to chapter" : "Go to page"}
            value={jump}
            onChangeText={setJump}
            keyboardType="number-pad"
            placeholder={`1–${count}`}
          />
          <Button
            disabled={
              !Number.isInteger(Number(jump)) ||
              Number(jump) < 1 ||
              Number(jump) > count
            }
            onPress={() => {
              const n = Number(jump) - 1;
              setPage(n);
              setFraction(0);
              scrollList.current?.scrollToIndex({ index: n, animated: false });
              setContents(false);
            }}
          >
            Go
          </Button>
          {book.format === "epub" &&
            book.asset.chapters.map((chapter, index) => (
              <Chip
                key={chapter.path}
                label={chapter.title}
                active={page === index}
                onPress={() => {
                  setPage(index);
                  setFraction(0);
                  setContents(false);
                }}
              />
            ))}
          <Text variant="eyebrow">BOOKMARKS</Text>
          {book.bookmarks.length ? (
            book.bookmarks.map((mark) => (
              <Button
                key={mark.id}
                secondary
                onPress={() => {
                  const p = parseLocator(mark.locator);
                  setPage(p.page);
                  setFraction(p.fraction);
                  setCommand({ id: Date.now(), fraction: p.fraction });
                  setContents(false);
                }}
              >
                {mark.label}
              </Button>
            ))
          ) : (
            <Text color="secondary">No bookmarks yet.</Text>
          )}
        </Sheet>
      )}
      {note !== undefined && (
        <Sheet title="Keep a thought" onClose={() => setNote(undefined)}>
          <Field
            label="Your note"
            value={note}
            onChangeText={setNote}
            multiline
            style={{ minHeight: 140, textAlignVertical: "top" }}
            placeholder="What stood out to you?"
          />
          <Button
            disabled={!note.trim()}
            onPress={() => {
              void update({
                notes: [
                  ...book.notes,
                  {
                    id: randomUUID(),
                    locator,
                    text: note.trim(),
                    createdAt: new Date().toISOString(),
                  },
                ],
              });
              setNote(undefined);
            }}
          >
            Save note
          </Button>
        </Sheet>
      )}
      {!!error && (
        <Sheet title="Reader needs attention" onClose={() => setError("")}>
          <Text>{error}</Text>
          <Button onPress={() => setError("")}>Continue</Button>
          <Button secondary onPress={close}>
            Back to library
          </Button>
        </Sheet>
      )}
    </SafeAreaView>
  );
}
function parseLocator(locator: string) {
  const [page, fraction] = locator.split(":").map(Number);
  return {
    page: Number.isFinite(page) ? Math.max(page ?? 0, 0) : 0,
    fraction: Number.isFinite(fraction)
      ? Math.min(Math.max(fraction ?? 0, 0), 1)
      : 0,
  };
}
