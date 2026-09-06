import type { Book } from "@glassleaf/library";
import { View, StyleSheet } from "react-native";
import Pdf from "react-native-pdf";
import { fileURI } from "../data/files";
export function PDFPages({
  book,
  page,
  onPage,
  onError,
}: {
  book: Book;
  page: number;
  onPage: (page: number, count: number) => void;
  onError: (message: string) => void;
}) {
  return (
    <View style={{ flex: 1, isolation: "isolate", backgroundColor: "#171717" }}>
      <Pdf
        source={{ uri: fileURI(book.asset.path) }}
        page={page + 1}
        style={{ flex: 1 }}
        horizontal={book.layout !== "scroll"}
        enablePaging={book.layout !== "scroll"}
        enableRTL={book.direction === "rtl"}
        minScale={1}
        maxScale={5}
        trustAllCerts={false}
        onPageChanged={(current, count) => onPage(current - 1, count)}
        onLoadComplete={(count) => onPage(page, count)}
        onError={(error) => onError(String(error))}
      />
      {book.pdfNightMode && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "#e0e0e0", mixBlendMode: "difference" },
          ]}
        />
      )}
    </View>
  );
}
