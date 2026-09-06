import { Box, Button, Chip, IconButton, Text } from "../ui/theme";
import { Minus, Plus } from "lucide-react-native";
import { readingPresets, type ReadingPreferences } from "./preferences";

export function ReadingAppearance({
  value,
  onChange,
}: {
  value: ReadingPreferences;
  onChange: (value: ReadingPreferences) => void;
}) {
  const patch = (next: Partial<ReadingPreferences>) =>
    onChange({ ...value, ...next });
  return (
    <Box gap="l">
      <Box gap="s">
        <Text variant="label">Start with a preset</Text>
        <Box flexDirection="row" flexWrap="wrap" gap="s">
          {readingPresets.map(({ name, preferences }) => (
            <Button key={name} secondary onPress={() => onChange(preferences)}>
              {name}
            </Button>
          ))}
        </Box>
      </Box>
      <Box gap="s">
        <Text variant="label">Paper</Text>
        <Box flexDirection="row" flexWrap="wrap" gap="s">
          {(
            [
              ["theme", "App theme"],
              ["white", "White"],
              ["sepia", "Sepia"],
              ["night", "Night"],
            ] as const
          ).map(([paper, label]) => (
            <Chip
              key={paper}
              label={label}
              active={value.paper === paper}
              onPress={() => patch({ paper })}
            />
          ))}
        </Box>
      </Box>
      <Box gap="s">
        <Text variant="label">Typeface</Text>
        <Box flexDirection="row" flexWrap="wrap" gap="s">
          {(
            [
              ["serif", "Serif"],
              ["sans", "Sans serif"],
              ["publisher", "Publisher"],
            ] as const
          ).map(([font, label]) => (
            <Chip
              key={font}
              label={label}
              active={value.font === font}
              onPress={() => patch({ font })}
            />
          ))}
        </Box>
      </Box>
      {(
        [
          { key: "size", label: "Text size", step: 2, min: 14, max: 34 },
          {
            key: "lineHeight",
            label: "Line spacing",
            step: 0.1,
            min: 1.2,
            max: 2.2,
          },
          { key: "margin", label: "Margins", step: 4, min: 12, max: 48 },
        ] as const
      ).map(({ key, label, step, min, max }) => (
        <Box
          key={key}
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Text>{label}</Text>
          <Box flexDirection="row" alignItems="center" gap="s">
            <IconButton
              icon={Minus}
              label={`Decrease ${label.toLowerCase()}`}
              onPress={() =>
                patch({
                  [key]: Math.max(min, Number((value[key] - step).toFixed(1))),
                })
              }
            />
            <Text>{value[key]}</Text>
            <IconButton
              icon={Plus}
              label={`Increase ${label.toLowerCase()}`}
              onPress={() =>
                patch({
                  [key]: Math.min(max, Number((value[key] + step).toFixed(1))),
                })
              }
            />
          </Box>
        </Box>
      ))}
      <Box gap="s">
        <Text variant="label">Alignment</Text>
        <Box flexDirection="row" gap="s">
          <Chip
            label="Natural"
            active={value.align === "start"}
            onPress={() => patch({ align: "start" })}
          />
          <Chip
            label="Justified"
            active={value.align === "justify"}
            onPress={() => patch({ align: "justify" })}
          />
        </Box>
      </Box>
      <Text variant="caption">
        Saved for future reading. Publisher typeface uses the book's font rules
        when available.
      </Text>
    </Box>
  );
}
