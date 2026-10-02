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
  FlatList,
  Linking,
  BackHandler,
  Pressable,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import { fileURI, hasFile, writeExport } from "../data/files";
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
import { chapterTitles } from "../data/epubNavigation";
import { EPUBPage } from "./EPUBPage";
import { parseLocator, encodeLocator, type TextAnchor } from "./location";
import { ReadingAppearance } from "./ReadingAppearance";
import { readingPreferencesSchema } from "./preferences";
import type { OutlineEntry } from "./pdfOutline";
import { PDFPages } from "./PDFPages";
export function Reader({
  book: initialBook,
  repo,
  onClose,
  onSearch,
  onOpen,
}: {
  book: Book;
  repo: LibraryRepository;
  onClose: () => void;
  onSearch: (book: Book) => void;
  onOpen: (book: Book) => void;
}) {
  const [book, setBook] = useState(initialBook);
  useEffect(() => {
    if (initialBook.format !== "epub") return;
    let cancelled = false;
    void chapterTitles(initialBook)
      .then((chapters) => {
        if (!cancelled)
          setBook((current) => ({
            ...current,
            asset: { ...current.asset, chapters },
          }));
      })
      .catch(() => {
        /* A missing navigation document does not prevent reading. */
      });
    return () => {
      cancelled = true;
    };
  }, [initialBook]);
  const c = usePalette();
  const { width } = useWindowDimensions();
  const start = parseLocator(book.locator);
  const [page, setPage] = useState(start.page);
  const [fraction, setFraction] = useState(start.fraction);
  const anchor = useRef<{ page: number; value?: TextAnchor }>({
    page: start.page,
    value: start.anchor,
  });
  const [count, setCount] = useState(
    book.format === "epub"
      ? book.asset.chapters.length
      : book.asset.pages.length || 1,
  );
  const [controls, setControls] = useState(true);
  const [settings, setSettings] = useState(false);
  const [contents, setContents] = useState(false);
  const [note, setNote] = useState<string>();
  const [preferences, setPreferences] = useState(() =>
    readingPreferencesSchema.parse({}),
  );
  const [appearance, setAppearance] = useState(false);
  const size = preferences.size;
  const [command, setCommand] = useState<{
    id: number;
    delta?: number;
    fraction?: number;
    anchor?: TextAnchor;
  }>();
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [selection, setSelection] = useState("");
  const selectionRange = useRef<{ start?: TextAnchor; end?: TextAnchor }>({});
  const [footnote, setFootnote] = useState<string>();
  const [annotations, setAnnotations] = useState(false);
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const [nextVolume, setNextVolume] = useState<Book>();
  useEffect(() => {
    let cancelled = false;
    void repo
      .nextVolume(initialBook)
      .then((next) => {
        if (!cancelled) setNextVolume(next);
      })
      .catch((error) => setError(String(error)));
    return () => {
      cancelled = true;
    };
  }, [repo, initialBook]);
  const [jump, setJump] = useState("");
  const scrollList = useRef<FlashListRef<string>>(null);
  const current = useRef({ page, fraction });
  current.current = { page, fraction };
  const saved = useRef("");

  const save = useCallback(async () => {
    const position = current.current;
    const locator = encodeLocator(
      position.page,
      position.fraction,
      initialBook.asset.chapters[position.page]?.path,
      anchor.current.page === position.page ? anchor.current.value : undefined,
    );
    if (locator === saved.current || !hasFile(initialBook.asset.path)) return;
    await repo.update(initialBook.id, {
      locator,
      lastReadAt: new Date().toISOString(),
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
    let cancelled = false;
    void Promise.all([
      repo.setting("reading-preferences"),
      repo.setting("reader-size"),
    ])
      .then(([stored, legacy]) => {
        const parsed = readingPreferencesSchema.safeParse(
          stored ? JSON.parse(stored) : { size: Number(legacy) || 20 },
        );
        if (!cancelled && parsed.success) setPreferences(parsed.data);
      })
      .catch((error) => setError(String(error)));
    return () => {
      cancelled = true;
    };
  }, [repo]);
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
    patch: Partial<
      Pick<
        Book,
        "direction" | "layout" | "notes" | "bookmarks" | "pdfNightMode"
      >
    >,
  ) {
    try {
      const updated = await repo.update(book.id, patch);
      setBook((current) => ({ ...updated, asset: current.asset }));
      if (patch.layout === "spread")
        setPage((p) => (p > 0 ? 1 + Math.floor((p - 1) / 2) * 2 : 0));
    } catch (e) {
      setError(String(e));
    }
  }
  function turn(delta: number) {
    setPage((p) => Math.min(Math.max(p + delta, 0), count - 1));
    setFraction(book.format === "epub" && delta < 0 ? 1 : 0);
    setZoom(1);
  }
  const locator = encodeLocator(
    page,
    fraction,
    book.asset.chapters[page]?.path,
    anchor.current.page === page ? anchor.current.value : undefined,
  );
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
        backgroundColor: c.bg,
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
            preferences={preferences}
            initial={fraction}
            initialAnchor={
              anchor.current.page === page ? anchor.current.value : undefined
            }
            onAnchor={(value) => {
              anchor.current = { page, value };
            }}
            onProgress={setFraction}
            onSelection={(text, start, end) => {
              setSelection(text);
              selectionRange.current = { start, end };
            }}
            onFootnote={setFootnote}
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
            onOutline={setOutline}
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
            onTurn={(swipe) => {
              const delta = rightToLeft ? -swipe : swipe;
              const step =
                book.layout === "spread" && (delta > 0 ? page > 0 : page > 1)
                  ? 2
                  : 1;
              turn(delta * step);
            }}
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
              label="Previous page"
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
      {controls &&
        nextVolume &&
        page >= count - 1 &&
        (book.format !== "epub" || fraction >= 0.98) && (
          <Box padding="s">
            <Button
              onPress={() => {
                void save()
                  .then(() => onOpen(nextVolume))
                  .catch((error) => setError(String(error)));
              }}
            >
              Continue · {nextVolume.title}
            </Button>
          </Box>
        )}
      {!!selection && (
        <Box padding="s" gap="s" flexDirection="row" flexWrap="wrap">
          <Button
            disabled={
              !selectionRange.current.start || !selectionRange.current.end
            }
            onPress={() => {
              const selected = selectionRange.current;
              void update({
                notes: [
                  ...book.notes,
                  {
                    id: randomUUID(),
                    locator: encodeLocator(
                      page,
                      fraction,
                      book.asset.chapters[page]?.path,
                      selected.start,
                    ),
                    text: selection,
                    quote: selection,
                    endAnchor: selected.end,
                    createdAt: new Date().toISOString(),
                  },
                ],
              });
              setSelection("");
            }}
          >
            Highlight
          </Button>
          <Button
            secondary
            disabled={selection.trim().length > 80}
            onPress={() => {
              void Linking.openURL(
                `https://en.wiktionary.org/wiki/${encodeURIComponent(selection.trim())}`,
              ).catch((error) => setError(String(error)));
            }}
          >
            Look up online
          </Button>
          <Button
            secondary
            onPress={() => {
              setSelection("");
              setCommand({ id: Date.now() });
            }}
          >
            Dismiss
          </Button>
        </Box>
      )}
      {footnote !== undefined && (
        <Sheet title="Footnote" onClose={() => setFootnote(undefined)}>
          <Text>{footnote}</Text>
        </Sheet>
      )}
      {annotations && (
        <Sheet title="Highlights & notes" onClose={() => setAnnotations(false)}>
          {book.notes.length ? (
            <>
              <Button
                secondary
                onPress={() => {
                  void writeExport(`glassleaf-${book.id}-annotations.json`, {
                    version: 1,
                    title: book.title,
                    author: book.author,
                    bookId: book.id,
                    annotations: book.notes,
                  })
                    .then((uri) =>
                      Sharing.shareAsync(uri, {
                        mimeType: "application/json",
                        dialogTitle: "Export annotations",
                      }),
                    )
                    .catch((error) => setError(String(error)));
                }}
              >
                Export annotations
              </Button>
              {book.notes.map((entry) => (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open annotation: ${entry.text}`}
                  onPress={() => {
                    const location = parseLocator(entry.locator);
                    anchor.current = {
                      page: location.page,
                      value: location.anchor,
                    };
                    setPage(location.page);
                    setFraction(location.fraction);
                    setCommand({
                      id: Date.now(),
                      fraction: location.fraction,
                      anchor: location.anchor,
                    });
                    setAnnotations(false);
                  }}
                >
                  <Box padding="m" gap="s" backgroundColor="surface">
                    <Text variant="caption">
                      {entry.quote ? "HIGHLIGHT" : "NOTE"} ·{" "}
                      {book.asset.chapters[parseLocator(entry.locator).page]
                        ?.title ??
                        `Page ${parseLocator(entry.locator).page + 1}`}
                    </Text>
                    <Text numberOfLines={4}>{entry.text}</Text>
                  </Box>
                </Pressable>
              ))}
            </>
          ) : (
            <Text color="secondary">
              Select a passage to highlight it, or keep a note while you read.
            </Text>
          )}
        </Sheet>
      )}
      {appearance && (
        <Sheet title="Reading appearance" onClose={() => setAppearance(false)}>
          <ReadingAppearance
            value={preferences}
            onChange={(next) => {
              setPreferences(next);
              void repo
                .setSetting("reading-preferences", JSON.stringify(next))
                .catch((error) => setError(String(error)));
            }}
          />
        </Sheet>
      )}
      {settings && (
        <Sheet title="Settle into the story" onClose={() => setSettings(false)}>
          <Button
            secondary
            onPress={() => {
              void save()
                .then(() => onSearch(book))
                .catch((e) => setError(String(e)));
            }}
          >
            Find in this book
          </Button>
          {book.format === "epub" && (
            <Button
              secondary
              onPress={() => {
                setSettings(false);
                setAppearance(true);
              }}
            >
              Reading appearance
            </Button>
          )}
          {book.format === "pdf" && (
            <>
              <Text variant="label">Page appearance</Text>
              <Box flexDirection="row" gap="s">
                <Chip
                  label="Original colors"
                  active={!book.pdfNightMode}
                  onPress={() => void update({ pdfNightMode: false })}
                />
                <Chip
                  label="Night reading"
                  active={book.pdfNightMode}
                  onPress={() => void update({ pdfNightMode: true })}
                />
              </Box>
              <Text variant="caption">
                Dark paper and light text. Illustrations also change color; use
                original colors for artwork.
              </Text>
            </>
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
          <Button
            secondary
            onPress={() => {
              setContents(false);
              setAnnotations(true);
            }}
          >
            Highlights & notes ({book.notes.length})
          </Button>
          {book.format === "cbz" && (
            <Box height={160}>
              <FlatList
                horizontal
                data={book.asset.pages}
                initialScrollIndex={page}
                getItemLayout={(_, index) => ({
                  length: 104,
                  offset: 104 * index,
                  index,
                })}
                keyExtractor={(path) => path}
                renderItem={({ item, index }) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open page ${index + 1}`}
                    onPress={() => {
                      setPage(index);
                      setFraction(0);
                      setContents(false);
                      scrollList.current?.scrollToIndex({
                        index,
                        animated: false,
                      });
                    }}
                    style={{ width: 104, padding: 6 }}
                  >
                    <Image
                      source={fileURI(`${book.id}/content/${item}`)}
                      style={{
                        width: 92,
                        height: 122,
                        borderRadius: 6,
                        borderWidth: index === page ? 2 : 0,
                        borderColor: c.accent,
                      }}
                      contentFit="contain"
                      recyclingKey={item}
                    />
                    <Text variant="caption" textAlign="center">
                      {index + 1}
                    </Text>
                  </Pressable>
                )}
              />
            </Box>
          )}
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
              setCommand({ id: Date.now(), fraction: 0 });
              setJump("");
              scrollList.current?.scrollToIndex({ index: n, animated: false });
              setContents(false);
            }}
          >
            Go
          </Button>
          {book.format === "pdf" &&
            outline.map((entry, index) => (
              <Pressable
                key={`${entry.page}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${entry.title}, page ${entry.page + 1}`}
                onPress={() => {
                  setPage(entry.page);
                  setContents(false);
                }}
              >
                <Box
                  paddingVertical="s"
                  style={{ paddingLeft: Math.min(entry.depth, 3) * 12 }}
                >
                  <Text>{entry.title}</Text>
                  <Text variant="caption">Page {entry.page + 1}</Text>
                </Box>
              </Pressable>
            ))}
          {book.format === "epub" &&
            book.asset.chapters.map((chapter, index) => (
              <Chip
                key={chapter.path}
                label={chapter.title}
                active={page === index}
                onPress={() => {
                  setPage(index);
                  setFraction(0);
                  setCommand({ id: Date.now(), fraction: 0 });
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
                  anchor.current = { page: p.page, value: p.anchor };
                  setFraction(p.fraction);
                  setCommand({
                    id: Date.now(),
                    fraction: p.fraction,
                    anchor: p.anchor,
                  });
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
