import type { Book, LibraryRepository } from "@glassleaf/library";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  List,
  Settings2,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFile } from "../data/files.web";
import { readText, writeExport } from "../data/files";
import { encodeLocator, parseLocator } from "./location";
import { ReadingAppearance } from "./ReadingAppearance";
import {
  readingPreferencesSchema,
  type ReadingPreferences,
} from "./preferences";
import { Box, Button, IconButton, Sheet, Text, usePalette } from "../ui/theme";

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

function cleanCSS(value: string) {
  return value
    .replace(/@import[^;]+;/gi, "")
    .replace(/-epub-writing-mode/g, "writing-mode")
    .replace(/-epub-text-emphasis/g, "text-emphasis")
    .replace(/url\(\s*([^)]+?)\s*\)/gi, (_, source: string) => {
      const url = source.trim().replace(/^['"]|['"]$/g, "");
      return /^(blob:|data:)/i.test(url) ? `url(${source})` : "url()";
    });
}

function readerPaper(
  preferences: ReadingPreferences,
  palette: ReturnType<typeof usePalette>,
) {
  if (preferences.paper === "white")
    return { bg: "#faf9f6", text: "#25231f", accent: "#345e91" };
  if (preferences.paper === "sepia")
    return { bg: "#f1e5cd", text: "#443829", accent: "#6b481f" };
  if (preferences.paper === "night")
    return { bg: "#181a20", text: "#d5d8df", accent: "#a6c6ff" };
  return palette;
}

async function epubDocument(
  book: Book,
  chapter: number,
  preferences: ReadingPreferences,
  palette: ReturnType<typeof usePalette>,
) {
  const item = book.asset.chapters[chapter];
  if (!item) throw new Error("This chapter is unavailable.");
  const colors = readerPaper(preferences, palette);
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(item.path)) {
    const image = await readFile(`${book.id}/content/${item.path}`);
    if (!image)
      throw new Error("This illustrated page is not stored in this browser.");
    const url = URL.createObjectURL(image);
    return {
      urls: [url],
      html: `<!doctype html><html><body style="margin:0;background:${colors.bg};display:grid;place-items:center;min-height:100vh"><img src="${url}" alt="Illustrated page" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>`,
    };
  }
  const raw = await readText(`${book.id}/content/${item.path}`);
  const document = new DOMParser().parseFromString(raw, "text/html");
  document
    .querySelectorAll("script, iframe, object, embed, form, base")
    .forEach((node) => node.remove());
  document.querySelectorAll<HTMLElement>("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.name.toLowerCase().startsWith("on"))
        node.removeAttribute(attribute.name);
      if (attribute.name === "style")
        node.setAttribute("style", cleanCSS(attribute.value));
    }
  });
  document.querySelectorAll("style").forEach((node) => {
    node.textContent = cleanCSS(node.textContent ?? "");
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
      styles.push(cleanCSS(css));
    } catch {
      // An absent publisher stylesheet should not block a readable chapter.
    }
  }
  const direction = book.direction === "rtl" ? "rtl" : "ltr";
  const font =
    preferences.font === "sans"
      ? "system-ui, sans-serif"
      : preferences.font === "publisher"
        ? "inherit"
        : "Georgia, serif";
  return {
    urls,
    html: `<!doctype html><html dir="${direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; style-src 'unsafe-inline'"><style>
      :root { color-scheme: ${preferences.paper === "night" ? "dark" : "light"}; } ${styles.join("\n")} body { max-width: 48rem; margin: 0 auto; padding: 2.5rem ${preferences.margin}px 6rem; color: ${colors.text}; background: ${colors.bg}; font-family: ${font}; font-size: ${preferences.size}px; line-height: ${preferences.lineHeight}; text-align: ${preferences.align}; overflow-wrap: break-word; } img, svg, video { max-width: 100%; height: auto; } a { color: ${colors.accent}; } pre { overflow: auto; }
    </style></head><body>${document.body.innerHTML}</body></html>`,
  };
}

function HTMLFrame({
  source,
  initialFraction,
  onProgress,
  background,
}: {
  source: string;
  initialFraction: number;
  onProgress: (value: number) => void;
  background: string;
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
        background,
      }}
    />
  );
}

function EpubReader({
  book,
  page,
  preferences,
  palette,
  fraction,
  onProgress,
  onError,
}: {
  book: Book;
  page: number;
  preferences: ReadingPreferences;
  palette: ReturnType<typeof usePalette>;
  fraction: number;
  onProgress: (value: number) => void;
  onError: (message: string) => void;
}) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let active = true;
    let urls: string[] = [];
    void epubDocument(book, page, preferences, palette)
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
  }, [book, page, preferences, palette, onError]);
  return source ? (
    <HTMLFrame
      source={source}
      initialFraction={fraction}
      onProgress={onProgress}
      background={readerPaper(preferences, palette).bg}
    />
  ) : (
    <Box flex={1} alignItems="center" justifyContent="center">
      <Text>Opening chapter…</Text>
    </Box>
  );
}

GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

function PDFReader({
  book,
  page,
  onPageCount,
  onError,
  background,
}: {
  book: Book;
  page: number;
  onPageCount: (count: number) => void;
  onError: (message: string) => void;
  background: string;
}) {
  const [document, setDocument] = useState<Awaited<
    ReturnType<typeof getDocument>["promise"]
  > | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    let task: ReturnType<typeof getDocument> | undefined;
    void readFile(book.asset.path)
      .then(async (file) => {
        if (!file) throw new Error("This PDF is not stored in this browser.");
        task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        const value = await task.promise;
        if (!active) {
          await value.destroy();
          return;
        }
        onPageCount(value.numPages);
        setDocument(value);
      })
      .catch((error) =>
        onError(error instanceof Error ? error.message : String(error)),
      );
    return () => {
      active = false;
      task?.destroy();
    };
  }, [book.asset.path, onError, onPageCount]);
  useEffect(() => {
    if (!document) return;
    let active = true;
    let renderTask:
      { cancel: () => void; promise: Promise<unknown> } | undefined;
    const render = async () => {
      try {
        const pdfPage = await document.getPage(
          Math.min(page + 1, document.numPages),
        );
        if (!active || !canvas.current || !host.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const width = Math.max(host.current.clientWidth - 24, 1);
        const viewport = pdfPage.getViewport({ scale: width / base.width });
        const pixelRatio = window.devicePixelRatio || 1;
        const element = canvas.current;
        element.width = Math.ceil(viewport.width * pixelRatio);
        element.height = Math.ceil(viewport.height * pixelRatio);
        element.style.width = `${Math.ceil(viewport.width)}px`;
        element.style.height = `${Math.ceil(viewport.height)}px`;
        const context = element.getContext("2d");
        if (!context) throw new Error("This browser cannot draw PDF pages.");
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        renderTask = pdfPage.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch (error) {
        if (
          active &&
          (error as { name?: string }).name !== "RenderingCancelledException"
        )
          onError(error instanceof Error ? error.message : String(error));
      }
    };
    void render();
    const observer = new ResizeObserver(() => void render());
    if (host.current) observer.observe(host.current);
    return () => {
      active = false;
      observer.disconnect();
      renderTask?.cancel();
    };
  }, [document, onError, page]);
  return document ? (
    <div
      ref={host}
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        background,
        padding: 12,
        textAlign: "center",
      }}
    >
      <canvas ref={canvas} aria-label={`${book.title}, page ${page + 1}`} />
    </div>
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
  const [preferences, setPreferences] = useState(() =>
    readingPreferencesSchema.parse({}),
  );
  const [appearance, setAppearance] = useState(false);
  const [pdfPages, setPdfPages] = useState(1);
  const [contents, setContents] = useState(false);
  const [error, setError] = useState("");
  const count =
    book.format === "epub"
      ? book.asset.chapters.length
      : book.format === "pdf"
        ? pdfPages
        : book.asset.pages.length || 1;
  const updatePreferences = useCallback(
    (next: ReadingPreferences) => {
      setPreferences(next);
      void repo
        .setSetting("reading-preferences", JSON.stringify(next))
        .catch((value) => setError(String(value)));
    },
    [repo],
  );
  useEffect(() => {
    let active = true;
    void Promise.all([
      repo.setting("reading-preferences"),
      repo.setting("reader-size"),
    ])
      .then(([stored, legacy]) => {
        const parsed = readingPreferencesSchema.safeParse(
          stored ? JSON.parse(stored) : { size: Number(legacy) || 20 },
        );
        if (active && parsed.success) setPreferences(parsed.data);
      })
      .catch((value) => active && setError(String(value)));
    return () => {
      active = false;
    };
  }, [repo]);
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
              onPress={() =>
                updatePreferences({
                  ...preferences,
                  size: Math.max(14, preferences.size - 2),
                })
              }
            />
            <Text variant="caption">{preferences.size}</Text>
            <IconButton
              icon={ChevronRight}
              label="Larger text"
              onPress={() =>
                updatePreferences({
                  ...preferences,
                  size: Math.min(34, preferences.size + 2),
                })
              }
            />
          </Box>
        )}
        {book.format === "epub" && (
          <IconButton
            icon={Settings2}
            label="Reading appearance"
            onPress={() => setAppearance(true)}
          />
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
            preferences={preferences}
            palette={c}
            fraction={fraction}
            onProgress={setFraction}
            onError={setError}
          />
        ) : book.format === "pdf" ? (
          <PDFReader
            book={book}
            page={page}
            onPageCount={setPdfPages}
            onError={setError}
            background={readerPaper(preferences, c).bg}
          />
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
                : Array.from(
                    {
                      length:
                        book.format === "pdf" ? count : book.asset.pages.length,
                    },
                    (_, index) => (
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
                    ),
                  )}
            </ScrollView>
          </Box>
        </View>
      )}
      {appearance && (
        <Sheet title="Reading appearance" onClose={() => setAppearance(false)}>
          <ReadingAppearance value={preferences} onChange={updatePreferences} />
        </Sheet>
      )}
    </Box>
  );
}
