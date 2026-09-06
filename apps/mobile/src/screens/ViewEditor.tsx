import {
  kinds,
  kindLabels,
  ruleFields,
  type Rule,
  type Rules,
  type SavedView,
  type Sort,
  type Stats,
} from "@glassleaf/library";
import { randomUUID } from "expo-crypto";
import { Check, ChevronRight, Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable } from "react-native";
import {
  Box,
  Button,
  Chip,
  Field,
  IconButton,
  Sheet,
  Text,
  usePalette,
} from "../ui/theme";
export const fieldLabels: Record<Rule["field"], string> = {
  kind: "Story type",
  format: "File format",
  tag: "Tag",
  collection: "Collection",
  author: "Author",
  series: "Series",
  language: "Language",
  status: "Reading status",
  favorite: "Favorite",
};
export const sortLabels: Record<Sort, string> = {
  "last-read": "Last read",
  "list-order": "Reading list order",
  added: "Recently added",
  updated: "Recently updated",
  title: "Title A–Z",
  author: "Author",
  series: "Series & volume",
  progress: "Reading progress",
};
export function ViewEditor({
  initial,
  stats,
  onClose,
  onApply,
  onSave,
}: {
  initial: {
    rules: Rules;
    sort: Sort;
    id?: string;
    name?: string;
    pinned?: boolean;
    scope?: SavedView["scope"];
    revision?: number;
  };
  stats: Stats;
  onClose: () => void;
  onApply: (rules: Rules, sort: Sort) => void;
  onSave: (view: SavedView, expectedRevision: number | null) => Promise<void>;
}) {
  const [expectedRevision] = useState(initial.revision ?? null);
  const [rules, setRules] = useState(initial.rules),
    [sort, setSort] = useState(initial.sort),
    [name, setName] = useState(initial.name ?? ""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [picker, setPicker] = useState<"field" | "sort" | Rule["field"]>();
  const [groupPath, setGroupPath] = useState<number[]>([]);
  const [pinned, setPinned] = useState(initial.pinned ?? false);
  const [value, setValue] = useState("");
  const [exclude, setExclude] = useState(false);
  const c = usePalette();
  function add(field: Rule["field"], value: string) {
    if (!value.trim()) return;
    setRules((tree) =>
      updateGroup(tree, groupPath, (r) => ({
        ...r,
        conditions: [
          ...r.conditions,
          { field, operator: exclude ? "is-not" : "is", value: value.trim() },
        ],
      })),
    );
    setPicker(undefined);
    setValue("");
    setExclude(false);
  }
  const values =
    picker === "kind"
      ? kinds.map((k) => ({ label: kindLabels[k], value: k }))
      : picker === "format"
        ? ["epub", "pdf", "cbz"].map((v) => ({
            label: v.toUpperCase(),
            value: v,
          }))
        : picker === "status"
          ? ["unread", "reading", "finished"].map((v) => ({
              label: v,
              value: v,
            }))
          : picker === "favorite"
            ? [
                { label: "Yes", value: "true" },
                { label: "No", value: "false" },
              ]
            : picker === "tag"
              ? stats.tags.map((v) => ({ label: v, value: v }))
              : picker === "collection"
                ? stats.collections.map((v) => ({ label: v, value: v }))
                : [];
  return (
    <Sheet
      title="View options"
      onClose={onClose}
      footer={
        name.trim() ? (
          <Button
            disabled={!name.trim() || saving}
            onPress={() => {
              setSaving(true);
              void onSave(
                {
                  id: initial.id ?? randomUUID(),
                  name,
                  rules,
                  sort,
                  pinned,
                  scope: initial.scope,
                },
                expectedRevision,
              )
                .then(() => onApply(rules, sort))
                .catch((e) => setError(String(e)))
                .finally(() => setSaving(false));
            }}
          >
            Save view
          </Button>
        ) : (
          <Button onPress={() => onApply(rules, sort)}>Show books</Button>
        )
      }
    >
      <Text variant="caption">
        Choose what belongs here. Save the rules to return to this view later.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change sort order"
        onPress={() => setPicker("sort")}
      >
        <Box
          paddingVertical="m"
          flexDirection="row"
          justifyContent="space-between"
        >
          <Text variant="label">{sortLabels[sort]}</Text>
          <ChevronRight color={c.secondary} size={20} />
        </Box>
      </Pressable>
      <RuleGroup
        rules={rules}
        path={[]}
        onChange={(fn) => setRules(fn)}
        onAdd={(path) => {
          setGroupPath(path);
          setPicker("field");
        }}
      />
      {!!rules.conditions.length && (
        <Button
          secondary
          onPress={() => setRules({ match: "all", conditions: [] })}
        >
          Clear conditions
        </Button>
      )}
      <Box marginTop="l" gap="m">
        <Text variant="eyebrow">KEEP THIS VIEW</Text>
        <Field
          label="View name"
          value={name}
          onChangeText={setName}
          placeholder="Japanese fantasy, Weekend reading…"
        />
        <Chip
          label="Pin to Home"
          active={pinned}
          onPress={() => setPinned((v) => !v)}
        />
        {!!error && <Text color="danger">{error}</Text>}
      </Box>
      {picker && (
        <Sheet
          title={
            picker === "field"
              ? "Add condition"
              : picker === "sort"
                ? "Sort by"
                : fieldLabels[picker]
          }
          onClose={() => {
            setPicker(undefined);
            setValue("");
            setExclude(false);
          }}
        >
          {picker === "field" ? (
            ruleFields.map((f) => (
              <Button key={f} secondary onPress={() => setPicker(f)}>
                {fieldLabels[f]}
              </Button>
            ))
          ) : picker === "sort" ? (
            Object.entries(sortLabels).map(([key, label]) => (
              <Button
                key={key}
                secondary
                icon={key === sort ? Check : undefined}
                onPress={() => {
                  setSort(key as Sort);
                  setPicker(undefined);
                }}
              >
                {label}
              </Button>
            ))
          ) : (
            <>
              <Box flexDirection="row" gap="s">
                <Chip
                  label="Is"
                  active={!exclude}
                  onPress={() => setExclude(false)}
                />
                <Chip
                  label="Is not"
                  active={exclude}
                  onPress={() => setExclude(true)}
                />
              </Box>
              <Field
                label="Condition value"
                value={value}
                onChangeText={setValue}
                placeholder="Find or enter a value"
              />
              {values
                .filter((v) =>
                  v.label.toLowerCase().includes(value.toLowerCase()),
                )
                .slice(0, 40)
                .map((v) => (
                  <Button
                    key={v.value}
                    secondary
                    onPress={() => add(picker, v.value)}
                  >
                    {v.label}
                  </Button>
                ))}
              {!["kind", "format", "status", "favorite"].includes(picker) && (
                <Button
                  disabled={!value.trim()}
                  onPress={() => add(picker, value)}
                >
                  Use this value
                </Button>
              )}
            </>
          )}
        </Sheet>
      )}
    </Sheet>
  );
}

function updateGroup(
  tree: Rules,
  path: number[],
  change: (group: Rules) => Rules,
): Rules {
  if (!path.length) return change(tree);
  const [head, ...tail] = path;
  return {
    ...tree,
    conditions: tree.conditions.map((node, i) =>
      i === head && !("field" in node) ? updateGroup(node, tail, change) : node,
    ),
  };
}
function RuleGroup({
  rules,
  path,
  onChange,
  onAdd,
}: {
  rules: Rules;
  path: number[];
  onChange: (fn: (root: Rules) => Rules) => void;
  onAdd: (path: number[]) => void;
}) {
  const change = (fn: (group: Rules) => Rules) =>
    onChange((root) => updateGroup(root, path, fn));
  return (
    <Box
      gap="m"
      paddingLeft={path.length ? "m" : "xs"}
      borderLeftWidth={path.length ? 1 : 0}
      borderLeftColor="line"
    >
      <Box flexDirection="row" gap="s">
        <Chip
          label="Match all"
          active={rules.match === "all"}
          onPress={() => change((r) => ({ ...r, match: "all" }))}
        />
        <Chip
          label="Match any"
          active={rules.match === "any"}
          onPress={() => change((r) => ({ ...r, match: "any" }))}
        />
      </Box>
      {rules.conditions.map((node, i) => (
        <Box key={i} gap="s">
          {"field" in node ? (
            <Box
              flexDirection="row"
              backgroundColor="surface"
              padding="m"
              borderRadius="m"
              alignItems="center"
            >
              <Box flex={1}>
                <Text variant="caption">
                  {fieldLabels[node.field]}{" "}
                  {node.operator === "is" ? "is" : "is not"}
                </Text>
                <Text variant="label">{node.value}</Text>
              </Box>
              <IconButton
                icon={X}
                label={`Remove condition ${[...path, i + 1].join(".")}`}
                onPress={() =>
                  change((r) => ({
                    ...r,
                    conditions: r.conditions.filter((_, j) => i !== j),
                  }))
                }
              />
            </Box>
          ) : (
            <>
              <Box flexDirection="row" alignItems="center">
                <Text variant="eyebrow" flex={1}>
                  GROUP {i + 1}
                </Text>
                <IconButton
                  icon={X}
                  label="Remove group"
                  onPress={() =>
                    change((r) => ({
                      ...r,
                      conditions: r.conditions.filter((_, j) => i !== j),
                    }))
                  }
                />
              </Box>
              <RuleGroup
                rules={node}
                path={[...path, i]}
                onChange={onChange}
                onAdd={onAdd}
              />
            </>
          )}
        </Box>
      ))}
      <Button
        secondary
        icon={Plus}
        disabled={rules.conditions.length >= 30}
        onPress={() => onAdd(path)}
      >
        {path.length ? "Add to group" : "Add condition"}
      </Button>
      {path.length < 3 && (
        <Button
          secondary
          disabled={rules.conditions.length >= 30}
          onPress={() =>
            change((r) => ({
              ...r,
              conditions: [...r.conditions, { match: "any", conditions: [] }],
            }))
          }
        >
          Add group
        </Button>
      )}
    </Box>
  );
}
