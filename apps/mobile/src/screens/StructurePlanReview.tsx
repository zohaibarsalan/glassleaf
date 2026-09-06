import { type LibraryRepository, type StructurePlan } from "@glassleaf/library";
import { useEffect, useState } from "react";
import { Box, Button, Sheet, Text } from "../ui/theme";
import { fieldLabels } from "./ViewEditor";
import type { Rules } from "@glassleaf/library";
function describe(rules: Rules): string {
  return rules.conditions.length
    ? `(${rules.conditions.map((r) => ("field" in r ? `${fieldLabels[r.field]} ${r.operator === "is" ? "is" : "is not"} ${r.value}` : describe(r))).join(rules.match === "all" ? " AND " : " OR ")})`
    : "All books";
}
export function StructurePlanReview({
  plan,
  repo,
  onClose,
  onApply,
}: {
  plan: StructurePlan;
  repo: LibraryRepository;
  onClose: () => void;
  onApply: () => void;
}) {
  const [index, setIndex] = useState(0),
    [page, setPage] = useState(0),
    [titles, setTitles] = useState<Record<string, string>>({});
  const change = plan.changes[index]!;
  const ids = change.value.kind === "reading-list" ? change.value.bookIds : [];
  useEffect(() => {
    let live = true;
    void Promise.all(
      ids
        .slice(page * 20, page * 20 + 20)
        .map(
          async (id) =>
            [
              id,
              (await repo.get(id))?.title ?? `Unavailable book (${id})`,
            ] as const,
        ),
    )
      .then((rows) => {
        if (live) setTitles(Object.fromEntries(rows));
      })
      .catch(() => {
        if (live) setTitles({});
      });
    return () => {
      live = false;
    };
  }, [repo, change, page]);
  return (
    <Sheet
      title={plan.title}
      onClose={onClose}
      footer={
        <Button onPress={onApply}>Apply {plan.changes.length} changes</Button>
      }
    >
      <Text color="secondary">
        Review the proposed changes. Nothing is applied until you choose Apply.
        The whole batch can be undone in Settings.
      </Text>
      <Text variant="eyebrow">
        CHANGE {index + 1} OF {plan.changes.length} ·{" "}
        {change.deleted
          ? "REMOVE"
          : change.expectedRevision === null
            ? "CREATE"
            : "UPDATE"}
      </Text>
      <Text variant="heading">
        {change.value.kind === "view"
          ? change.value.view.name
          : change.value.name}
      </Text>
      {change.value.kind === "reading-list" ? (
        <>
          <Text variant="label">{ids.length} books in reading order</Text>
          {ids.slice(page * 20, page * 20 + 20).map((id, i) => (
            <Text key={id}>
              {page * 20 + i + 1}. {titles[id] ?? id}
            </Text>
          ))}
          {ids.length > 20 && (
            <Box flexDirection="row" gap="s">
              <Button
                secondary
                disabled={!page}
                onPress={() => setPage((p) => p - 1)}
              >
                Previous books
              </Button>
              <Button
                secondary
                disabled={(page + 1) * 20 >= ids.length}
                onPress={() => setPage((p) => p + 1)}
              >
                Next books
              </Button>
            </Box>
          )}
        </>
      ) : change.value.kind === "view" ? (
        <>
          <Text>{describe(change.value.view.rules)}</Text>
          <Text variant="caption">
            {change.value.view.pinned
              ? "Pinned to Home"
              : "Available in Organize"}
          </Text>
          {change.value.view.scope && (
            <Text variant="caption">
              Scope:{" "}
              {Object.entries(change.value.view.scope)
                .map(([key, value]) => `${key}: ${value}`)
                .join(", ")}
            </Text>
          )}
        </>
      ) : (
        <Text variant="caption">Collection · shared book membership</Text>
      )}
      {plan.changes.length > 1 && (
        <Box flexDirection="row" gap="s">
          <Button
            secondary
            disabled={!index}
            onPress={() => {
              setIndex((i) => i - 1);
              setPage(0);
            }}
          >
            Previous change
          </Button>
          <Button
            secondary
            disabled={index + 1 === plan.changes.length}
            onPress={() => {
              setIndex((i) => i + 1);
              setPage(0);
            }}
          >
            Next change
          </Button>
        </Box>
      )}
    </Sheet>
  );
}
