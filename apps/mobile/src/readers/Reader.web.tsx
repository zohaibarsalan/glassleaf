import type { Book, LibraryRepository } from "@glassleaf/library";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  List,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { readFile } from "../data/files.web";
import { readText, writeExport } from "../data/files";
import { encodeLocator, parseLocator } from "./location";
import { Box, Button, IconButton, Text, usePalette } from "../ui/theme";

type ReaderProps = {
  book: Book;
  repo: LibraryRepository;
  onClose: () => void;
  onSearch: (book: Book) => void;
  onOpen: (book: Book) => void;
};

function resolveResource(base: string, target: string) {
  const url = new URL(target, `https://publication/${base}`);
  return decodeURIComponent(url.pathname.slice(1));
}

async function epubDocument(book: Book, chapter: number, size: number) {
  const item = book.asset.chapters[chapter];
  if (!item) throw new Error("This chapter is unavailable.");
  const raw = await readText(`${book.id}/content/${item.path}`);
  const document = new DOMParser().parseFromString(raw, "text/html");
  document
    .querySelectorAll("script, iframe, object, embed, form, base")
    .forEach((node) => node.remove());
  document.querySelectorAll<HTMLElement>("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.name.toLowerCase().startsWith("on"))
        node.removeAttribute(attribute.name);
    }
  });
  const urls: string[] = [];
  for (const image of Array.from(document.images)) {
    const source = image.getAttribute("src");
    if (!source || /^(data:|https?:)/i.test(source)) continue;
    const resource = await readFile(
      `${book.id}/content/${resolveResource(item.path, source)}`,
    );
    if (!resource) continue;
    const url = URL.createObjectURL(resource);
    urls.push(url);
    image.src = url;
  }
  const styles: string[] = [];
  for (const link of Array.from(
    document.querySelectorAll('link[rel~="stylesheet"]'),
  )) {
    const href = link.getAttribute("href");
    link.remove();
    if (!href || /^(https?:|data:)/i.test(href)) continue;
    try {
      const css = await readText(
        `${book.id}/content/${resolveResource(item.path, href)}`,
      );
      styles.push(css.replace(/@import[^;]+;/gi, ""));
    } catch {
      // An absent publisher stylesheet should not block a readable chapter.
    }
  }
  const direction = book.direction === "rtl" ? "rtl" : "ltr";
  return {
    urls,
    html: `<!doctype html><html dir="${direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
      :root { color-scheme: light dark; } body { max-width: 48rem; margin: 0 auto; padding: 2.5rem clamp(1.25rem, 6vw, 4rem) 6rem; color: #202720; background: #f8f7f1; font-family: Georgia, serif; font-size: ${size}px; line-height: 1.75; overflow-wrap: break-word; } img, svg, video { max-width: 100%; height: auto; } a { color: #285b43; } pre { overflow: auto; } ${styles.join("\n")}
    </style></head><body>${document.body.innerHTML}</body></html>`,
  };
}

function HTMLFrame({
  source,
  initialFraction,
  onProgress,
}: {
  source: string;
  initialFraction: number;
  onProgress: (value: number) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  return (
    <iframe
      ref={ref}
      title="Book chapter"
      sandbox="allow-same-origin"
      srcDoc={source}
      onLoad={() => {
        const frame = ref.current;
        const body = frame?.contentDocument?.documentElement;
        const window = frame?.contentWindow;
        if (!body || !window) return;
        const update = () =>
          onProgress(
            Math.min(
              window.scrollY /
                Math.max(body.scrollHeight - window.innerHeight, 1),
              1,
            ),
          );
        window.scrollTo({
          top:
            Math.max(body.scrollHeight - window.innerHeight, 0) *
            initialFraction,
        });
        window.addEventListener("scroll", update, { passive: true });
      }}
      style={{
        border: 0,
        width: "100%",
        height: "100%",
        background: "#f8f7f1",
      }}
    />
  );
}

function EpubReader({
  book,
  page,
  size,
  fraction,
  onProgress,
  onError,
}: {
  book: Book;
  page: number;
  size: number;
  fraction: number;
  onProgress: (value: number) => void;
  onError: (message: string) => void;
}) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let active = true;
    let urls: string[] = [];
    void epubDocument(book, page, size)
      .then((value) => {
        urls = value.urls;
        if (active) setSource(value.html);
      })
      .catch(
        (error) =>
          active &&
          onError(error instanceof Error ? error.message : String(error)),
      );
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [book, page, size, onError]);
  return source ? (
    <HTMLFrame
      source={source}
      initialFraction={fraction}
      onProgress={onProgress}
    />
  ) : (
    <Box flex={1} alignItems="center" justifyContent="center">
      <Text>Opening chapter…</Text>
    </Box>
  );
}

function PDFReader({ book }: { book: Book }) {
  const [url, setURL] = useState("");
  useEffect(() => {
    let active = true;
    let objectURL = "";
    void readFile(book.asset.path).then((file) => {
      if (!file) throw new Error("This PDF is not stored in this browser.");
      objectURL = URL.createObjectURL(file);
      if (active) setURL(objectURL);
    });
    return () => {
      active = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [book.asset.path]);
  return url ? (
    <iframe
      title={book.title}
      src={url}
      style={{ border: 0, width: "100%", height: "100%", background: "white" }}
    />
  ) : (
    <Box flex={1} alignItems="center" justifyContent="center">
      <Text>Opening PDF…</Text>
    </Box>
  );
}

function ComicReader({ book, page }: { book: Book; page: number }) {
  const [url, setURL] = useState("");
  const path = book.asset.pages[page];
  useEffect(() => {
    let active = true;
    let objectURL = "";
    if (!path) return;
    void readFile(`${book.id}/content/${path}`).then((file) => {
      if (!file)
        throw new Error("This comic page is not stored in this browser.");
      objectURL = URL.createObjectURL(file);
      if (active) setURL(objectURL);
    });
    return () => {
      active = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [book.id, path]);
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#111",
      }}
    >
      {url ? (
        <img
          alt={`Page ${page + 1}`}
          src={url}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      ) : (
        <Text style={{ color: "white" }}>Opening page…</Text>
      )}
    </View>
  );
}

export function Reader({ book: initialBook, repo, onClose }: ReaderProps) {
  const c = usePalette();
  const start = parseLocator(initialBook.locator);
  const [book, setBook] = useState(initialBook);
  const [page, setPage] = useState(
    Math.min(
      start.page,
      Math.max(
        (initialBook.format === "epub"
          ? initialBook.asset.chapters.length
          : initialBook.asset.pages.length) - 1,
        0,
      ),
    ),
  );
  const [fraction, setFraction] = useState(start.fraction);
  const [size, setSize] = useState(20);
  const [contents, setContents] = useState(false);
  const [error, setError] = useState("");
  const count =
    book.format === "epub"
      ? book.asset.chapters.length
      : book.asset.pages.length || 1;
  const save = useCallback(
    async (nextPage = page, nextFraction = fraction) => {
      const next = await repo.update(book.id, {
        locator: encodeLocator(
          nextPage,
          nextFraction,
          book.asset.chapters[nextPage]?.path,
        ),
        progress: Math.min((nextPage + nextFraction) / Math.max(count, 1), 1),
        status:
          nextPage >= count - 1 && nextFraction >= 0.98
            ? "finished"
            : "reading",
        lastReadAt: new Date().toISOString(),
      });
      setBook(next);
    },
    [book, count, fraction, page, repo],
  );
  const turn = useCallback(
    (delta: number) => {
      const next = Math.min(Math.max(page + delta, 0), count - 1);
      if (next === page) return;
      setPage(next);
      setFraction(0);
      void save(next, 0).catch((value) => setError(String(value)));
    },
    [count, page, save],
  );
  const direction = book.direction === "rtl" ? -1 : 1;
  const addBookmark = () => {
    void repo
      .update(book.id, {
        bookmarks: [
          ...book.bookmarks,
          {
            id: crypto.randomUUID(),
            locator: encodeLocator(
              page,
              fraction,
              book.asset.chapters[page]?.path,
            ),
            label: `Page ${page + 1}`,
          },
        ],
      })
      .then(setBook)
      .catch((value) => setError(String(value)));
  };
  return (
    <Box flex={1} backgroundColor="bg">
      <Box
        flexDirection="row"
        alignItems="center"
        padding="m"
        gap="s"
        borderBottomWidth={1}
        borderBottomColor="line"
      >
        <IconButton
          icon={X}
          label="Close reader"
          onPress={() =>
            void save()
              .then(onClose)
              .catch((value) => setError(String(value)))
          }
        />
        <Box flex={1}>
          <Text variant="label" numberOfLines={1}>
            {book.title}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {book.author}
          </Text>
        </Box>
        {book.format === "epub" && (
          <Box flexDirection="row" alignItems="center">
            <IconButton
              icon={ChevronLeft}
              label="Smaller text"
              onPress={() => setSize((value) => Math.max(14, value - 2))}
            />
            <Text variant="caption">{size}</Text>
            <IconButton
              icon={ChevronRight}
              label="Larger text"
              onPress={() => setSize((value) => Math.min(34, value + 2))}
            />
          </Box>
        )}
        <IconButton
          icon={List}
          label="Contents"
          onPress={() => setContents(true)}
        />
      </Box>
      {error ? (
        <Box padding="s" backgroundColor="accentSoft">
          <Text color="accent">{error}</Text>
        </Box>
      ) : null}
      <Box flex={1}>
        {book.format === "epub" ? (
          <EpubReader
            book={book}
            page={page}
            size={size}
            fraction={fraction}
            onProgress={setFraction}
            onError={setError}
          />
        ) : book.format === "pdf" ? (
          <PDFReader book={book} />
        ) : (
          <ComicReader book={book} page={page} />
        )}
      </Box>
      <Box padding="s" borderTopWidth={1} borderTopColor="line" gap="s">
        <Box
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Button disabled={page <= 0} onPress={() => turn(-direction)}>
            {book.direction === "rtl" ? "Next" : "Previous"}
          </Button>
          <Pressable
            onPress={() => setContents(true)}
            accessibilityRole="button"
          >
            <Text variant="caption">
              {page + 1} of {count}
            </Text>
          </Pressable>
          <Button disabled={page >= count - 1} onPress={() => turn(direction)}>
            {book.direction === "rtl" ? "Previous" : "Next"}
          </Button>
        </Box>
        <Box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Button onPress={addBookmark}>Bookmark</Button>
          <Button
            icon={Download}
            onPress={() =>
              void writeExport(`glassleaf-${book.id}-annotations.json`, {
                title: book.title,
                bookmarks: book.bookmarks,
                notes: book.notes,
              })
            }
          >
            Export notes
          </Button>
        </Box>
        <View style={{ height: 3, backgroundColor: c.line }}>
          <View
            style={{
              height: 3,
              backgroundColor: c.accent,
              width: `${Math.min(((page + fraction + 1) / count) * 100, 100)}%`,
            }}
          />
        </View>
      </Box>
      {contents && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: c.bg }}>
          <Box flex={1} padding="l" gap="m">
            <Box
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Text variant="heading">Contents</Text>
              <IconButton
                icon={X}
                label="Close contents"
                onPress={() => setContents(false)}
              />
            </Box>
            <ScrollView>
              {book.format === "epub"
                ? book.asset.chapters.map((chapter, index) => (
                    <Pressable
                      key={chapter.path}
                      onPress={() => {
                        setPage(index);
                        setFraction(0);
                        setContents(false);
                        void save(index, 0);
                      }}
                      style={{ paddingVertical: 14 }}
                    >
                      <Text color={index === page ? "accent" : undefined}>
                        {chapter.title}
                      </Text>
                    </Pressable>
                  ))
                : book.asset.pages.map((_, index) => (
                    <Pressable
                      key={index}
                      onPress={() => {
                        setPage(index);
                        setFraction(0);
                        setContents(false);
                      }}
                      style={{ paddingVertical: 14 }}
                    >
                      <Text color={index === page ? "accent" : undefined}>
                        Page {index + 1}
                      </Text>
                    </Pressable>
                  ))}
            </ScrollView>
          </Box>
        </View>
      )}
    </Box>
  );
}
