import {
  kindLabels,
  kinds,
  type Book,
  type MetadataPatch,
} from "@glassleaf/library";
import { useState } from "react";
import { ScrollView } from "react-native";
import { Box, Button, Chip, Field, Sheet, Text } from "../ui/theme";
export function BookEditor({
  book,
  onClose,
  onSave,
}: {
  book: Book;
  onClose: () => void;
  onSave: (patch: MetadataPatch) => Promise<void>;
}) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [kind, setKind] = useState(book.kind);
  const [direction, setDirection] = useState(book.direction);
  const [tags, setTags] = useState(book.tags.join(", "));
  const [collections, setCollections] = useState(book.collections.join(", "));
  const [series, setSeries] = useState(book.series);
  const [volume, setVolume] = useState(book.volume?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const split = (s: string) => [
    ...new Set(
      s
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
  async function save() {
    setBusy(true);
    setError("");
    try {
      const n = volume.trim() ? Number(volume) : null;
      if (n !== null && (!Number.isFinite(n) || n < 0))
        throw new Error("Use a valid volume number, such as 1 or 1.5.");
      await onSave({
        title: title.trim(),
        author: author.trim(),
        kind,
        direction,
        tags: split(tags),
        collections: split(collections),
        series: series.trim(),
        volume: n,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Changes could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title="Edit book"
      onClose={onClose}
      footer={
        <Button disabled={busy || !title.trim()} onPress={() => void save()}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      }
    >
      <Field label="Title" value={title} onChangeText={setTitle} />
      <Field label="Author" value={author} onChangeText={setAuthor} />
      <Box gap="s">
        <Text variant="label">Story type</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {kinds.map((k) => (
            <Chip
              key={k}
              label={kindLabels[k]}
              active={kind === k}
              onPress={() => setKind(k)}
            />
          ))}
        </ScrollView>
      </Box>
      <Box gap="s">
        <Text variant="label">Reading direction</Text>
        <Box flexDirection="row" gap="s">
          <Chip
            label="Left to right"
            active={direction === "ltr"}
            onPress={() => setDirection("ltr")}
          />
          <Chip
            label="Right to left"
            active={direction === "rtl"}
            onPress={() => setDirection("rtl")}
          />
        </Box>
      </Box>
      <Field
        label="Series"
        value={series}
        onChangeText={setSeries}
        placeholder="Connect stories in the same series"
      />
      <Field
        label="Volume"
        value={volume}
        onChangeText={setVolume}
        keyboardType="decimal-pad"
        placeholder="1, 2, 2.5…"
      />
      <Field
        label="Collections"
        value={collections}
        onChangeText={setCollections}
        placeholder="Shared universe, Research"
      />
      <Field
        label="Tags"
        value={tags}
        onChangeText={setTags}
        placeholder="Fantasy, Adventure"
      />
      <Text variant="caption">
        Separate names with commas. Collections and tags connect stories across
        every story type.
      </Text>
      {!!error && <Text color="danger">{error}</Text>}
    </Sheet>
  );
}
