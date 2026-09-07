import type {
  Book,
  LibraryRepository,
  OrganizationPlan,
} from "@glassleaf/library";
import { useEffect, useState } from "react";
import { Box, Button, Chip, Sheet, Text } from "../ui/theme";
export function PlanReview({
  plan,
  repo,
  onClose,
  onApply,
}: {
  plan: OrganizationPlan;
  repo: LibraryRepository;
  onClose: () => void;
  onApply: (plan: OrganizationPlan) => void;
}) {
  const [page, setPage] = useState(0);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const selectedCount = plan.changes.length - excluded.size;
  const [books, setBooks] = useState<Map<string, Book>>(new Map());
  const [error, setError] = useState("");
  const size = 40;
  const visible = plan.changes.slice(page * size, (page + 1) * size);
  useEffect(() => {
    let current = true;
    void Promise.all(
      plan.changes
        .slice(page * size, (page + 1) * size)
        .map((change) => repo.get(change.bookId)),
    )
      .then((rows) => {
        if (current)
          setBooks(
            new Map(
              rows
                .filter((book): book is Book => !!book)
                .map((book) => [book.id, book]),
            ),
          );
      })
      .catch((e) => setError(String(e)));
    return () => {
      current = false;
    };
  }, [page, plan, repo]);
  const display = (value: unknown) =>
    Array.isArray(value)
      ? value.join(", ") || "None"
      : value === null || value === ""
        ? "None"
        : String(value);
  return (
    <Sheet
      title={plan.title}
      onClose={onClose}
      footer={
        <Button
          disabled={!selectedCount}
          onPress={() =>
            onApply({
              ...plan,
              changes: plan.changes.filter(
                (change) => !excluded.has(change.bookId),
              ),
            })
          }
        >
          Apply {selectedCount} changes
        </Button>
      }
    >
      <Text color="secondary">
        Review the proposed metadata changes. The entire batch is checked for
        stale revisions before saving, and can be undone in Settings.
      </Text>
      <Text variant="caption">
        {page * size + 1}–{Math.min((page + 1) * size, plan.changes.length)} of{" "}
        {plan.changes.length} books
      </Text>
      {!!error && <Text color="danger">{error}</Text>}
      {visible.map((change) => {
        const before = books.get(change.bookId);
        return (
          <Box
            key={change.bookId}
            backgroundColor="muted"
            padding="m"
            borderRadius="m"
            gap="s"
          >
            <Text variant="label">{before?.title ?? "Loading book…"}</Text>
            {before && before.revision !== change.expectedRevision && (
              <Text color="danger" variant="caption">
                This book changed after the plan was created.
              </Text>
            )}
            <Chip
              label={excluded.has(change.bookId) ? "Excluded" : "Included"}
              active={!excluded.has(change.bookId)}
              onPress={() =>
                setExcluded((current) => {
                  const next = new Set(current);
                  if (next.has(change.bookId)) next.delete(change.bookId);
                  else next.add(change.bookId);
                  return next;
                })
              }
            />
            {change.evidence && (
              <Box gap="xs">
                <Text variant="eyebrow">WHY THIS CHANGE</Text>
                <Text>{change.evidence.reason}</Text>
                {change.evidence.confidence !== undefined && (
                  <Text variant="caption">
                    Agent confidence:{" "}
                    {Math.round(change.evidence.confidence * 100)}% · Not
                    independently verified
                  </Text>
                )}
                {change.evidence.sources.map((source, index) => (
                  <Text key={index} variant="caption">
                    Source: {source}
                  </Text>
                ))}
              </Box>
            )}
            {Object.entries(change.patch).map(([field, value]) => (
              <Box key={field} gap="xs">
                <Text variant="eyebrow">{field}</Text>
                <Text variant="caption">
                  {before ? display(before[field as keyof Book]) : "…"}
                </Text>
                <Text>→ {display(value)}</Text>
              </Box>
            ))}
          </Box>
        );
      })}
      <Box flexDirection="row" gap="s">
        <Button
          secondary
          disabled={page === 0}
          onPress={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <Button
          secondary
          disabled={(page + 1) * size >= plan.changes.length}
          onPress={() => setPage((p) => p + 1)}
        >
          Next {size}
        </Button>
      </Box>
    </Sheet>
  );
}
