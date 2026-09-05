import type { Book } from "@glassleaf/library";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator } from "react-native";
import WebView from "react-native-webview";
import sanitizeHtml from "sanitize-html";
import { fileURI, readText } from "../data/files";
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
    setHtml("");
    setError("");
    if (!path) {
      setError("This chapter is missing.");
      return;
    }
    void readText(`${book.id}/content/${path}`)
      .then((source) => {
        if (cancelled) return;
        const clean = sanitizeHtml(source, {
          allowedTags: [
            ...sanitizeHtml.defaults.allowedTags,
            "img",
            "h1",
            "h2",
            "ruby",
            "rt",
            "rp",
            "style",
          ],
          allowedAttributes: {
            "*": ["id", "class", "lang", "dir", "style"],
            img: ["src", "alt", "width", "height"],
            a: ["href"],
          },
          allowedSchemes: ["file", "data"],
          nonTextTags: ["script", "textarea", "option", "title"],
          allowProtocolRelative: false,
          allowVulnerableTags: true,
          transformTags: {
            img: (_, attributes) => {
              const src = attributes.src ?? "";
              const base = fileURI(
                `${book.id}/content/${path.slice(0, path.lastIndexOf("/") + 1)}`,
              );
              try {
                const resolved = new URL(src, base).href;
                if (
                  !resolved.startsWith(fileURI(`${book.id}/content/`)) &&
                  !resolved.startsWith("data:image/")
                )
                  delete attributes.src;
                else attributes.src = resolved;
              } catch {
                delete attributes.src;
              }
              return { tagName: "img", attribs: attributes };
            },
          },
        });
        const paginated = book.layout === "pages";
        const pageCSS = paginated
          ? "html{height:100%;overflow:hidden;}body{height:100vh;max-width:none;padding:24px;column-width:calc(100vw - 48px);column-gap:48px;column-fill:auto;}"
          : "";
        setHtml(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; style-src 'unsafe-inline'; script-src 'nonce-glassleaf';"><style>
          html{background:${c.bg};color:${c.text};}body{box-sizing:border-box;margin:0 auto;padding:24px 26px 50px;max-width:740px;font-family:Georgia,serif;font-size:${size}px;line-height:1.75;overflow-wrap:break-word;}
          h1,h2{font-weight:400;line-height:1.3;margin:0.6em 0 1em;}p{margin:0 0 1em;}img{max-width:100%;height:auto;}a{color:${c.accent};}::selection{background:#dce2ac;}${pageCSS}
        </style></head><body>${clean}<script nonce="glassleaf">
          const send=(type,value)=>window.ReactNativeWebView.postMessage(JSON.stringify({type,value}));
          const paginated=${paginated};const root=document.documentElement;
          const extent=()=>Math.max(paginated?root.scrollWidth-innerWidth:root.scrollHeight-innerHeight,0);
          const position=()=>paginated?scrollX:scrollY;
          window.glassleafSeek=f=>{const offset=Math.max(Math.min(f,1),0)*extent();scrollTo(paginated?Math.round(offset/innerWidth)*innerWidth:0,paginated?0:offset)};
          window.glassleafTurn=delta=>{if((delta>0&&position()>=extent()-2)||(delta<0&&position()<=2)){send('edge',delta);return;}scrollBy(paginated?delta*innerWidth:0,paginated?0:delta*(innerHeight-60))};
          let timer;addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>send('progress',extent()?position()/extent():1),180)},{passive:true});
          addEventListener('load',()=>window.glassleafSeek(${Math.min(Math.max(initialRef.current, 0), 1)}));
          document.addEventListener('selectionchange',()=>send('selection',String(getSelection()).slice(0,5000)));
          document.addEventListener('click',e=>{const a=e.target.closest('a');if(a){e.preventDefault();const href=a.getAttribute('href')||'';if(href.startsWith('#'))document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView();else send('link',href);}else if(!String(getSelection()))send('tap',true)});
        </script></body></html>`);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
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
      source={{ html, baseUrl: fileURI(`${book.id}/content/`) }}
      style={{ backgroundColor: c.bg }}
      originWhitelist={["file://*", "about:*"]}
      allowingReadAccessToURL={fileURI(`${book.id}/content/`)}
      allowFileAccess
      javaScriptEnabled
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(r) =>
        r.url === "about:blank" ||
        r.url.startsWith(fileURI(`${book.id}/content/`))
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
