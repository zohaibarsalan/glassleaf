import type { Book } from "@glassleaf/library";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator } from "react-native";
import WebView from "react-native-webview";
import sanitizeHtml from "sanitize-html";
import { fileURI, readText, nativeFile, readExternal } from "../data/files";
import { Box, Text, usePalette } from "../ui/theme";
export type EPUBPosition = { chapter: number; fraction: number };
export function EPUBPage({
  book,
  chapter,
  size,
  initial,
  onProgress,
  onSelection,
  onTap,
  command,
  onEdge,
  onChapter,
}: {
  book: Book;
  chapter: number;
  size: number;
  initial: number;
  onProgress: (fraction: number) => void;
  onSelection: (text: string) => void;
  onTap: () => void;
  command?: { id: number; delta?: number; fraction?: number };
  onEdge: (delta: number) => void;
  onChapter: (index: number) => void;
}) {
  const c = usePalette();
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const web = useRef<WebView>(null);
  const initialRef = useRef(initial);
  const path = book.asset.chapters[chapter]?.path;
  initialRef.current = initial;
  useEffect(() => {
    let cancelled = false;
    let renderedFile: ReturnType<typeof nativeFile> | undefined;
    setHtml("");
    setError("");
    if (!path) {
      setError("This chapter is missing.");
      return;
    }
    const imageChapter = /\.(jpe?g|png|gif|webp|svg)$/i.test(path);
    const base =
      fileURI(
        `${book.id}/content/${path.slice(0, path.lastIndexOf("/") + 1)}`,
      ) + "/";
    const localResource = (value: string) => {
      try {
        const url = new URL(value, base).href;
        return url.startsWith(fileURI(`${book.id}/content/`) + "/") ||
          url.startsWith("data:image/")
          ? url
          : "";
      } catch {
        return "";
      }
    };
    void (
      imageChapter
        ? Promise.resolve(
            `<img src="${localResource(path.split("/").pop()!)}" alt="Comic page" />`,
          )
        : readText(`${book.id}/content/${path}`)
    )
      .then(async (source) => {
        if (cancelled) return;
        let clean = sanitizeHtml(source, {
          allowedTags: [
            ...sanitizeHtml.defaults.allowedTags,
            "img",
            "h1",
            "h2",
            "ruby",
            "rt",
            "rp",
            "style",
            "link",
          ],
          allowedAttributes: {
            "*": ["id", "class", "lang", "dir", "style"],
            img: ["src", "alt", "width", "height"],
            a: ["href"],
            link: ["href", "rel", "type"],
          },
          allowedSchemes: ["file", "data"],
          nonTextTags: ["script", "textarea", "option", "title"],
          allowProtocolRelative: false,
          allowVulnerableTags: true,
          transformTags: {
            image: (_, attributes) => ({
              tagName: "img",
              attribs: {
                src: localResource(
                  attributes["xlink:href"] ?? attributes.href ?? "",
                ),
                alt: "Cover",
              },
            }),
            link: (_, attributes) => ({
              tagName: "link",
              attribs: {
                rel: "stylesheet",
                href:
                  attributes.rel === "stylesheet"
                    ? localResource(attributes.href ?? "")
                    : "",
              },
            }),
            img: (_, attributes) => ({
              tagName: "img",
              attribs: {
                ...attributes,
                src: localResource(attributes.src ?? ""),
              },
            }),
          },
        });
        // EPUB 3 samples use legacy -epub properties that WebKit does not interpret.
        for (const match of [
          ...clean.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*>/g),
        ]) {
          const uri = match[1]!.replaceAll("&amp;", "&");
          if (!uri.startsWith(fileURI(`${book.id}/content/`) + "/")) continue;
          let stylesheet: string;
          try {
            stylesheet = await readExternal(uri);
          } catch {
            continue;
          }
          const css = stylesheet
            .replace(/-epub-writing-mode/g, "writing-mode")
            .replace(/-epub-text-emphasis/g, "text-emphasis")
            .replace(
              /url\(\s*["']?([^"')]+)["']?\s*\)/g,
              (_, value: string) => {
                const resolved = new URL(value.trim(), uri).href;
                return `url("${resolved.startsWith(fileURI(`${book.id}/content/`) + "/") ? resolved : ""}")`;
              },
            );
          clean = clean.replace(
            match[0],
            `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`,
          );
        }
        if (cancelled) return;
        const paginated = book.layout === "pages";
        const pageCSS = paginated
          ? "html{height:100%;overflow:hidden;}body{height:100vh;max-width:none;padding:24px;column-width:calc(100vw - 48px);column-gap:48px;column-fill:auto;}"
          : "";
        const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; style-src file: 'unsafe-inline'; font-src file: data:; script-src 'nonce-glassleaf';"><style>
          html{background:${c.bg};color:${c.text};}body{box-sizing:border-box;margin:0 auto;padding:24px 26px 50px;max-width:740px;font-family:Georgia,serif;font-size:${size}px;line-height:1.75;overflow-wrap:break-word;}
          h1,h2{font-weight:400;line-height:1.3;margin:0.6em 0 1em;}p{margin:0 0 1em;}img{max-width:100%;height:auto;}a{color:${c.accent};}::selection{background:#dce2ac;}${pageCSS}
        </style></head><body>${clean}<style>
          html,body{background:${c.bg};color:${c.text};}
          body{box-sizing:border-box;margin:0 auto;padding:24px 26px 50px;max-width:740px;font-size:${size}px;}
          a:link,a:visited{color:${c.accent};}strong{color:inherit!important;text-emphasis-color:currentColor!important;}
          ${pageCSS}
        </style><script nonce="glassleaf">
          const send=(type,value)=>window.ReactNativeWebView.postMessage(JSON.stringify({type,value}));
          const root=document.documentElement;root.style.background='${c.bg}';root.style.color='${c.text}';
          const vertical=getComputedStyle(document.body).writingMode.startsWith('vertical');
          const rtlVertical=vertical&&getComputedStyle(document.body).writingMode==='vertical-rl';
          const paginated=${paginated}&&!vertical;
          const horizontal=paginated||vertical;
          if(vertical){root.style.maxHeight='none';root.style.margin='0';root.style.padding='0';document.body.style.height='calc(100vh - 48px)';document.body.style.maxWidth='none';document.body.style.margin='0';document.body.style.columnWidth='auto';}
          const extent=()=>Math.max(horizontal?root.scrollWidth-innerWidth:root.scrollHeight-innerHeight,0);
          const position=()=>horizontal?Math.abs(scrollX):scrollY;
          window.glassleafSeek=f=>{const offset=Math.max(Math.min(f,1),0)*extent();scrollTo(horizontal?(rtlVertical?-1:1)*(paginated?Math.round(offset/innerWidth)*innerWidth:offset):0,horizontal?0:offset)};
          window.glassleafTurn=delta=>{if((delta>0&&position()>=extent()-2)||(delta<0&&position()<=2)){send('edge',delta);return;}scrollBy(horizontal?delta*(rtlVertical?-1:1)*(vertical?Math.max(innerWidth-60,1):innerWidth):0,horizontal?0:delta*(innerHeight-60))};
          let timer;addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>send('progress',extent()?position()/extent():1),180)},{passive:true});
          addEventListener('load',()=>window.glassleafSeek(${Math.min(Math.max(initialRef.current, 0), 1)}));
          document.addEventListener('selectionchange',()=>send('selection',String(getSelection()).slice(0,5000)));
          document.addEventListener('click',e=>{const a=e.target.closest('a');if(a){e.preventDefault();const href=a.getAttribute('href')||'';if(href.startsWith('#'))document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView();else send('link',href);}else if(!String(getSelection()))send('tap',true)});
        </script></body></html>`;
        const rendered = nativeFile(
          `${book.id}/content/${path.slice(0, path.lastIndexOf("/") + 1)}.glassleaf-reader-${Date.now()}.html`,
        );
        rendered.write(document);
        renderedFile = rendered;
        setHtml(rendered.uri);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
      if (renderedFile?.exists) renderedFile.delete();
    };
  }, [path, book.id, book.layout, size, c.bg, c.text, c.accent]);
  useEffect(() => {
    if (!command) return;
    if (command.delta !== undefined)
      web.current?.injectJavaScript(
        `window.glassleafTurn?.(${command.delta});true;`,
      );
    if (command.fraction !== undefined)
      web.current?.injectJavaScript(
        `window.glassleafSeek?.(${command.fraction});true;`,
      );
  }, [command]);
  if (error)
    return (
      <Box padding="xl">
        <Text color="danger">{error}</Text>
      </Box>
    );
  if (!html)
    return (
      <Box flex={1} justifyContent="center">
        <ActivityIndicator color={c.accent} />
      </Box>
    );
  return (
    <WebView
      ref={web}
      source={{ uri: html }}
      style={{ backgroundColor: c.bg }}
      originWhitelist={["file://*", "about:*"]}
      allowingReadAccessToURL={fileURI(`${book.id}/content/`)}
      allowFileAccess
      javaScriptEnabled
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(r) =>
        r.url === "about:blank" ||
        r.url.startsWith(fileURI(`${book.id}/content/`) + "/")
      }
      onError={(event) => setError(event.nativeEvent.description)}
      onMessage={(event) => {
        try {
          const data: unknown = JSON.parse(event.nativeEvent.data);
          if (
            !data ||
            typeof data !== "object" ||
            !("type" in data) ||
            !("value" in data)
          )
            return;
          if (
            data.type === "progress" &&
            typeof data.value === "number" &&
            Number.isFinite(data.value)
          )
            onProgress(Math.min(Math.max(data.value, 0), 1));
          if (data.type === "selection" && typeof data.value === "string")
            onSelection(data.value);
          if (data.type === "tap") onTap();
          if (data.type === "edge" && (data.value === 1 || data.value === -1))
            onEdge(data.value);
          if (data.type === "link" && typeof data.value === "string" && path) {
            const resolved = new URL(data.value, `https://publication/${path}`);
            const index = book.asset.chapters.findIndex(
              (ch) =>
                decodeURIComponent(ch.path) ===
                decodeURIComponent(resolved.pathname.slice(1)),
            );
            if (resolved.origin === "https://publication" && index >= 0)
              onChapter(index);
          }
        } catch {
          /* Ignore messages that do not match the reader protocol. */
        }
      }}
    />
  );
}
