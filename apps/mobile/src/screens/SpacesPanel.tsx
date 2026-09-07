import {
  kinds,
  kindLabels,
  type LibraryRepository,
  type LibraryQuery,
  type SavedView,
  type Stats,
  type OrganizationRecord,
} from "@glassleaf/library";
import {
  BookOpen,
  Folder,
  MoreHorizontal,
  Plus,
  Star,
  Tag,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, ScrollView } from "react-native";
import { NavRow } from "../ui/LibraryComponents";
import { Box, Button, Chip, Field, IconButton, Sheet, Text } from "../ui/theme";
export function SpacesPanel({
  stats,
  views,
  repo,
  revision,
  onBrowse,
  onCreate,
  onRemove,
  onEditList,
  onManageFacet,
  onChanged,
}: {
  stats: Stats;
  views: SavedView[];
  repo: LibraryRepository;
  revision: number;
  onBrowse: (q: LibraryQuery) => void;
  onCreate: () => void;
  onRemove: (id: string) => void;
  onEditList: (record?: OrganizationRecord) => void;
  onManageFacet: (field: "tag" | "collection", value: string) => void;
  onChanged: () => void;
}) {
  const [section, setSection] = useState<
      "series" | "collections" | "lists" | "views" | "tags" | "types"
    >("series"),
    [term, setTerm] = useState(""),
    [records, setRecords] = useState<OrganizationRecord[]>([]),
    [series, setSeries] = useState<
      { name: string; count: number; finished: number }[]
    >([]),
    [menu, setMenu] = useState<OrganizationRecord>(),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void Promise.all([repo.organization(), repo.series()])
      .then(([a, b]) => {
        if (live) {
          setRecords(a);
          setSeries(b);
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [repo, revision, views]);
  type Row = {
    id: string;
    name: string;
    detail?: string;
    query: LibraryQuery;
    record?: OrganizationRecord;
  };
  const rows: Row[] =
    section === "series"
      ? series.map((s) => ({
          id: s.name,
          name: s.name,
          detail: `${s.count} volumes · ${s.finished} finished`,
          query: { series: s.name, sort: "series" },
        }))
      : section === "types"
        ? kinds.map((k) => ({
            id: k,
            name: kindLabels[k],
            detail: `${stats.kinds[k]} stories`,
            query: { kind: k },
          }))
        : section === "tags"
          ? stats.tags.map((tag) => ({ id: tag, name: tag, query: { tag } }))
          : section === "views"
            ? views.map((v) => ({
                id: v.id,
                name: v.name,
                detail: v.pinned ? "Pinned to Home" : "Smart view",
                query: { ...v.scope, rules: v.rules, sort: v.sort },
                record: records.find((r) => r.id === v.id),
              }))
            : records.flatMap((r) =>
                r.value.kind ===
                (section === "lists" ? "reading-list" : "collection")
                  ? [
                      {
                        id: r.id,
                        name: r.value.name,
                        detail:
                          r.value.kind === "reading-list"
                            ? `${r.value.bookIds.length} books · reading order`
                            : "Collection",
                        query:
                          r.value.kind === "reading-list"
                            ? {
                                readingListId: r.id,
                                sort: "list-order" as const,
                              }
                            : { collectionId: r.id },
                        record: r,
                      },
                    ]
                  : [],
              );
  async function pin(record: OrganizationRecord) {
    if (record.value.kind !== "view") return;
    try {
      await repo.saveOrganization(
        record.id,
        {
          kind: "view",
          view: { ...record.value.view, pinned: !record.value.view.pinned },
        },
        record.revision,
      );
      setMenu(undefined);
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <Box flex={1} paddingHorizontal="l" gap="m">
      <ScrollView
        horizontal
        style={{ flexGrow: 0 }}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {(
          [
            ["series", "Series"],
            ["collections", "Collections"],
            ["lists", "Reading lists"],
            ["views", "Smart views"],
            ["tags", "Tags"],
            ["types", "Story types"],
          ] as const
        ).map(([id, label]) => (
          <Chip
            key={id}
            label={label}
            active={section === id}
            onPress={() => {
              setSection(id);
              setTerm("");
            }}
          />
        ))}
      </ScrollView>
      <Field label="Find a group" value={term} onChangeText={setTerm} />
      {!!error && <Text color="danger">{error}</Text>}
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={rows.filter((r) =>
          r.name.toLowerCase().includes(term.toLowerCase()),
        )}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <Box flexDirection="row" alignItems="center" paddingVertical="s">
            <Box flex={1}>
              <NavRow
                icon={
                  section === "tags"
                    ? Tag
                    : section === "series"
                      ? BookOpen
                      : Folder
                }
                title={item.name}
                onPress={() => onBrowse(item.query)}
              />
              {item.detail && (
                <Text variant="caption" paddingLeft="m">
                  {item.detail}
                </Text>
              )}
            </Box>
            {(item.record || section === "tags") && (
              <IconButton
                icon={MoreHorizontal}
                label={`Options for ${item.name}`}
                onPress={() =>
                  section === "tags"
                    ? onManageFacet("tag", item.name)
                    : setMenu(item.record)
                }
              />
            )}
          </Box>
        )}
        ListEmptyComponent={
          <Text color="secondary" paddingVertical="xl">
            {term
              ? "No matching groups."
              : section === "series"
                ? "Add series and volume details to your books to see them together."
                : "Keep a collection, create a reading order, or save a set of rules."}
          </Text>
        }
      />
      <Box paddingBottom="l" gap="s">
        <Button
          secondary
          icon={Plus}
          onPress={() => (section === "lists" ? onEditList() : onCreate())}
        >
          {section === "lists" ? "New reading list" : "Create smart view"}
        </Button>
        <Button secondary onPress={() => onBrowse({ unfiled: true })}>
          Unfiled books
        </Button>
      </Box>
      {menu && (
        <Sheet
          title={
            menu.value.kind === "view" ? menu.value.view.name : menu.value.name
          }
          onClose={() => setMenu(undefined)}
        >
          {menu.value.kind === "view" ? (
            <>
              <Button secondary icon={Star} onPress={() => void pin(menu)}>
                {menu.value.view.pinned ? "Unpin from Home" : "Pin to Home"}
              </Button>
              <Button
                secondary
                onPress={() => {
                  onRemove(menu.id);
                  setMenu(undefined);
                }}
              >
                Remove view
              </Button>
            </>
          ) : menu.value.kind === "reading-list" ? (
            <>
              <Button
                secondary
                onPress={() => {
                  onEditList(menu);
                  setMenu(undefined);
                }}
              >
                Edit reading order
              </Button>
              <Button
                secondary
                onPress={() => {
                  void repo
                    .applyStructurePlan({
                      version: 2,
                      id: `remove-${menu.id}-${menu.revision}`,
                      title: "Remove reading list",
                      changes: [
                        {
                          id: menu.id,
                          value: menu.value,
                          expectedRevision: menu.revision,
                          deleted: true,
                        },
                      ],
                    })
                    .then(() => {
                      setMenu(undefined);
                      onChanged();
                    })
                    .catch((e) => setError(String(e)));
                }}
              >
                Remove list, keep books
              </Button>
            </>
          ) : (
            <Button
              secondary
              onPress={() => {
                if (menu.value.kind === "collection")
                  onManageFacet("collection", menu.value.name);
                setMenu(undefined);
              }}
            >
              Rename or merge collection
            </Button>
          )}
        </Sheet>
      )}
    </Box>
  );
}
