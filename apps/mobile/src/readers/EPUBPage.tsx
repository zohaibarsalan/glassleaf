import type { Book } from "@glassleaf/library";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator } from "react-native";
import WebView from "react-native-webview";
import sanitizeHtml from "sanitize-html";
import { fileURI, readText, nativeFile, readExternal } from "../data/files";
import { Box, Text, usePalette } from "../ui/theme";
import { textAnchorSchema, type TextAnchor } from "./location";
import type { ReadingPreferences } from "./preferences";
export type EPUBPosition = { chapter: number; fraction: number };
export function EPUBPage({
  book,
  chapter,
  size,
  preferences,
  initial,
  initialAnchor,
  onAnchor,
  onProgress,
  onSelection,
  onFootnote,
  onTap,
  command,
  onEdge,
  onChapter,
}: {
  book: Book;
  chapter: number;
  size: number;
  preferences: ReadingPreferences;
  initial: number;
  initialAnchor?: TextAnchor;
  onAnchor: (value: TextAnchor) => void;
  onProgress: (fraction: number) => void;
  onSelection: (text: string, start?: TextAnchor, end?: TextAnchor) => void;
  onFootnote: (text: string) => void;
  onTap: () => void;
  command?: {
    id: number;
    delta?: number;
    fraction?: number;
    anchor?: TextAnchor;
  };
  onEdge: (delta: number) => void;
  onChapter: (index: number) => void;
}) {
  const palette = usePalette();
  const paper =
    preferences.paper === "white"
      ? { bg: "#faf9f6", text: "#25231f", accent: "#345e91" }
      : preferences.paper === "sepia"
        ? { bg: "#f1e5cd", text: "#443829", accent: "#6b481f" }
        : preferences.paper === "night"
          ? { bg: "#181a20", text: "#d5d8df", accent: "#a6c6ff" }
          : palette;
  const c = paper;
  const font =
    preferences.font === "sans" ? "system-ui,sans-serif" : "Georgia,serif";
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const web = useRef<WebView>(null);
  const initialRef = useRef(initial);
  const anchorRef = useRef(initialAnchor);
  anchorRef.current = initialAnchor;
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
            a: ["href", "epub:type", "role"],
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
          ? `html{height:100%;overflow:hidden;}body{height:100vh;max-width:none;padding:24px ${preferences.margin}px;column-width:calc(100vw - ${preferences.margin * 2}px);column-gap:${preferences.margin * 2}px;column-fill:auto;}`
          : "";
        const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; style-src file: 'unsafe-inline'; font-src file: data:; script-src 'nonce-glassleaf';"><style>
          html{background:${c.bg};color:${c.text};}body{box-sizing:border-box;margin:0 auto;padding:24px ${preferences.margin}px 50px;max-width:740px;${preferences.font === "publisher" ? "" : `font-family:${font};`}font-size:${size}px;line-height:${preferences.lineHeight};overflow-wrap:break-word;}
          h1,h2{font-weight:400;line-height:1.3;margin:0.6em 0 1em;}p{margin:0 0 1em;}img{max-width:100%;height:auto;}a{color:${c.accent};}::selection{background:#dce2ac;}${pageCSS}
        </style></head><body>${clean}<style>
          html,body{background:${c.bg};color:${c.text};}
          body{box-sizing:border-box;margin:0 auto;padding:24px ${preferences.margin}px 50px;max-width:740px;font-size:${size}px;${preferences.font === "publisher" ? "" : `font-family:${font};`}}
          p{line-height:${preferences.lineHeight}!important;text-align:${preferences.align};}
          a:link,a:visited{color:${c.accent};}strong{color:inherit!important;text-emphasis-color:currentColor!important;}
          ::highlight(glassleaf){background:#e6c56b66;color:inherit;}
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
          let cachedTextNodes;const textNodes=()=>{if(cachedTextNodes)return cachedTextNodes;const result=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.textContent.trim()&&!n.parentElement.closest('style,script')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});let n;while(n=walker.nextNode())result.push(n);return cachedTextNodes=result};
          const captureAnchor=()=>{const nodes=textNodes();const range=document.caretRangeFromPoint?.(vertical?innerWidth-30:30,vertical?30:30);if(!range)return;const node=nodes.indexOf(range.startContainer);if(node<0)return;send('anchor',{node,text:range.startContainer.textContent.slice(0,240),offset:range.startOffset})};
          const restoreAnchor=anchor=>{if(!anchor)return false;const nodes=textNodes();const node=nodes[anchor.node]?.textContent.startsWith(anchor.text)?nodes[anchor.node]:nodes.find(n=>n.textContent.startsWith(anchor.text));if(!node)return false;const range=document.createRange();range.setStart(node,Math.min(anchor.offset,node.length));range.setEnd(node,Math.min(anchor.offset+1,node.length));const rect=range.getBoundingClientRect();scrollBy(horizontal?rect.left-(rtlVertical?innerWidth-40:30):0,horizontal?0:rect.top-30);return true};
          window.glassleafRestore=(anchor,fraction)=>{if(!restoreAnchor(anchor))window.glassleafSeek(fraction);captureAnchor();};
          let timer;addEventListener('scroll' ,()=>{clearTimeout(timer);timer=setTimeout(()=>{captureAnchor();send('progress',extent()?position()/extent():1)},180)},{passive:true});
          addEventListener('load',()=>{if(!restoreAnchor(${JSON.stringify(anchorRef.current ?? null).replace(/</g, "\\u003c")}))window.glassleafSeek(${Math.min(Math.max(initialRef.current, 0), 1)});captureAnchor();});
          const anchorFor=(node,offset)=>({node:textNodes().indexOf(node),text:node.textContent.slice(0,240),offset});
          const rangeNode=anchor=>{const nodes=textNodes();return nodes[anchor.node]?.textContent.startsWith(anchor.text)?nodes[anchor.node]:nodes.find(n=>n.textContent.startsWith(anchor.text))};
          const marks=${JSON.stringify(book.notes.filter((note) => note.quote && note.endAnchor).map((note) => ({ locator: note.locator, end: note.endAnchor }))).replace(/</g, "\\u003c")};
          if(globalThis.Highlight&&CSS.highlights){const ranges=[];for(const mark of marks){try{const location=JSON.parse(mark.locator);if(location.href!==${JSON.stringify(path)})continue;const start=rangeNode(location.anchor),end=rangeNode(mark.end);if(!start||!end)continue;const range=document.createRange();range.setStart(start,Math.min(location.anchor.offset,start.length));range.setEnd(end,Math.min(mark.end.offset,end.length));ranges.push(range)}catch{}}CSS.highlights.set('glassleaf',new Highlight(...ranges));}
          document.addEventListener('selectionchange',()=>{const selection=getSelection();if(!selection?.rangeCount){send('selection',{text:''});return;}const range=selection.getRangeAt(0);send('selection',{text:String(selection).slice(0,5000),start:anchorFor(range.startContainer,range.startOffset),end:anchorFor(range.endContainer,range.endOffset)})});
          document.addEventListener('click',e=>{const a=e.target.closest('a');if(a){e.preventDefault();const href=a.getAttribute('href')||'';if(href.startsWith('#')){const target=document.getElementById(decodeURIComponent(href.slice(1)));if((a.getAttribute('epub:type')||'').split(/\\s+/).includes('noteref')||a.getAttribute('role')==='doc-noteref')send('footnote',target?.textContent?.slice(0,10000)||'Footnote unavailable.');else target?.scrollIntoView();}else send('link',href);}else if(!String(getSelection()))send('tap',true)});
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
  }, [
    path,
    book.id,
    book.layout,
    size,
    c.bg,
    c.text,
    c.accent,
    preferences,
    font,
    book.notes,
  ]);
  useEffect(() => {
    if (!command) return;
    web.current?.injectJavaScript(
      "window.getSelection()?.removeAllRanges();true;",
    );
    if (command.delta !== undefined)
      web.current?.injectJavaScript(
        `window.glassleafTurn?.(${command.delta});true;`,
      );
    if (command.fraction !== undefined)
      web.current?.injectJavaScript(
        `window.glassleafRestore?.(${JSON.stringify(command.anchor ?? null).replace(/</g, "\\u003c")},${command.fraction});true;`,
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
          if (data.type === "anchor") {
            const anchor = textAnchorSchema.safeParse(data.value);
            if (anchor.success) onAnchor(anchor.data);
          }
          if (data.type === "footnote" && typeof data.value === "string")
            onFootnote(data.value);
          if (
            data.type === "selection" &&
            data.value &&
            typeof data.value === "object" &&
            "text" in data.value &&
            typeof data.value.text === "string"
          ) {
            const start = textAnchorSchema.safeParse(
              "start" in data.value ? data.value.start : undefined,
            );
            const end = textAnchorSchema.safeParse(
              "end" in data.value ? data.value.end : undefined,
            );
            onSelection(
              data.value.text,
              start.success ? start.data : undefined,
              end.success ? end.data : undefined,
            );
          }
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
