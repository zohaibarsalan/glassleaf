export type OutlineEntry = { title: string; page: number; depth: number };

// Native PDFKit returns string page indexes, while Android returns numbers.
export function pdfOutline(value: unknown, pageCount: number): OutlineEntry[] {
  const result: OutlineEntry[] = [];
  const visit = (items: unknown, depth: number) => {
    if (!Array.isArray(items) || depth > 12) return;
    for (const item of items.slice(0, 1000)) {
      if (result.length >= 1000) return;
      if (!item || typeof item !== "object") continue;
      const page =
        typeof item.pageIdx === "string" || typeof item.pageIdx === "number"
          ? Number(item.pageIdx)
          : NaN;
      if (
        typeof item.title === "string" &&
        item.title.trim() &&
        Number.isInteger(page) &&
        page >= 0 &&
        page < pageCount
      )
        result.push({ title: item.title.trim(), page, depth });
      visit(item.children, depth + 1);
    }
  };
  visit(value, 0);
  return result;
}
