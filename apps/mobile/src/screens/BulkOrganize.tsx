import {
  kindLabels,
  kinds,
  type Book,
  type LibraryRepository,
} from "@glassleaf/library";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { Box, Button, Chip, Field, Sheet, Text } from "../ui/theme";
export function BulkOrganize({
  books,
  repo,
  onClose,
  onSaved,
}: {
  books: Book[];
  repo: LibraryRepository;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tags, setTags] = useState("");
  const [collections, setCollections] = useState("");
  const [kind, setKind] = useState<Book["kind"]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const split = (value: string) =>
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await repo.applyPlan({
        version: 1,
        id: randomUUID(),
        title: `Organize ${books.length} books`,
        changes: books.map((book) => ({
          bookId: book.id,
          expectedRevision: book.revision,
          patch: {
            ...(kind ? { kind } : {}),
            ...(tags.trim()
              ? { tags: [...new Set([...book.tags, ...split(tags)])] }
              : {}),
            ...(collections.trim()
              ? {
                  collections: [
                    ...new Set([...book.collections, ...split(collections)]),
                  ],
                }
              : {}),
          },
        })),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not organize books.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={`Organize ${books.length} books`}
      onClose={onClose}
      footer={
        <Button
          disabled={busy || (!tags.trim() && !collections.trim() && !kind)}
          onPress={() => void save()}
        >
          Apply to {books.length} books
        </Button>
      }
    >
      <Text variant="caption">
        Add tags and collections to every selected book. Existing values are
        kept. Undo is available in Settings.
      </Text>
      <Field
        label="Add tags"
        placeholder="Adventure, Japanese, To discuss"
        value={tags}
        onChangeText={setTags}
      />
      <Field
        label="Add to collections"
        placeholder="Summer reading, Favorites"
        value={collections}
        onChangeText={setCollections}
      />
      <Text variant="label">Story type</Text>
      <Box flexDirection="row" flexWrap="wrap" gap="s">
        <Chip
          label="Keep existing"
          active={!kind}
          onPress={() => setKind(undefined)}
        />
        {kinds.map((k) => (
          <Chip
            key={k}
            label={kindLabels[k]}
            active={kind === k}
            onPress={() => setKind(k)}
          />
        ))}
      </Box>
      {!!error && <Text color="danger">{error}</Text>}
    </Sheet>
  );
}
