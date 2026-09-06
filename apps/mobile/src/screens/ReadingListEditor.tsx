import {
  type Book,
  type LibraryRepository,
  type OrganizationRecord,
} from "@glassleaf/library";
import { randomUUID } from "expo-crypto";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Keyboard } from "react-native";
import { Box, Button, Field, IconButton, Sheet, Text } from "../ui/theme";
export function ReadingListEditor({
  repo,
  record,
  selected = [],
  onClose,
  onSaved,
}: {
  repo: LibraryRepository;
  record?: OrganizationRecord;
  selected?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(
      record?.value.kind === "reading-list" ? record.value.name : "",
    ),
    [ids, setIds] = useState(
      record?.value.kind === "reading-list" ? record.value.bookIds : selected,
    ),
    [term, setTerm] = useState(""),
    [results, setResults] = useState<Book[]>([]),
    [titles, setTitles] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void repo
        .list({ search: term, limit: term.trim() ? 20 : 5 })
        .then((rows) => {
          if (live) setResults(rows);
        })
        .catch((e) => {
          if (live) setError(String(e));
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [repo, term]);
  useEffect(() => {
    let live = true;
    void Promise.all(
      ids.slice(page * 30, page * 30 + 30).map((id) => repo.get(id)),
    )
      .then((rows) => {
        if (live)
          setTitles((old) => ({
            ...old,
            ...Object.fromEntries(
              rows.filter((b): b is Book => !!b).map((b) => [b.id, b.title]),
            ),
          }));
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [repo, ids, page]);
  function move(index: number, delta: number) {
    setIds((old) => {
      const next = [...old];
      const target = index + delta;
      if (target < 0 || target >= next.length) return old;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }
  return (
    <Sheet
      title={record ? "Edit reading list" : "New reading list"}
      onClose={onClose}
      footer={
        <Button
          disabled={busy || !name.trim()}
          onPress={() => {
            setBusy(true);
            void repo
              .saveOrganization(
                record?.id ?? randomUUID(),
                { kind: "reading-list", name, bookIds: ids },
                record?.revision ?? null,
              )
              .then(onSaved)
              .catch((e) => setError(String(e)))
              .finally(() => setBusy(false));
          }}
        >
          Save reading list
        </Button>
      }
    >
      <Field
        label="Reading list name"
        value={name}
        onChangeText={setName}
        placeholder="A universe in reading order"
      />
      <Text variant="caption">
        Books can appear in multiple lists. Their files and reading progress
        stay shared.
      </Text>
      <Text variant="eyebrow">READING ORDER · {ids.length} BOOKS</Text>
      {ids.slice(page * 30, page * 30 + 30).map((id, offset) => {
        const index = page * 30 + offset;
        return (
          <Box key={id} flexDirection="row" alignItems="center" gap="s">
            <Text flex={1}>
              {index + 1}. {titles[id] ?? "Unavailable book"}
            </Text>
            <IconButton
              icon={ArrowUp}
              label={`Move book ${index + 1} up`}
              onPress={() => move(index, -1)}
            />
            <IconButton
              icon={ArrowDown}
              label={`Move book ${index + 1} down`}
              onPress={() => move(index, 1)}
            />
            <IconButton
              icon={X}
              label={`Remove book ${index + 1} from list`}
              onPress={() => setIds((old) => old.filter((v) => v !== id))}
            />
          </Box>
        );
      })}
      {ids.length > 30 && (
        <Box flexDirection="row" gap="m">
          <Button
            secondary
            disabled={!page}
            onPress={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            secondary
            disabled={(page + 1) * 30 >= ids.length}
            onPress={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </Box>
      )}
      <Field
        label="Add books"
        value={term}
        onChangeText={setTerm}
        placeholder="Find a title or author"
      />
      {results
        .filter((b) => !ids.includes(b.id))
        .map((book) => (
          <Button
            key={book.id}
            secondary
            icon={Plus}
            onPress={() => {
              Keyboard.dismiss();
              setIds((old) => [...old, book.id]);
            }}
          >
            {book.title}
          </Button>
        ))}
      {!!error && <Text color="danger">{error}</Text>}
    </Sheet>
  );
}
