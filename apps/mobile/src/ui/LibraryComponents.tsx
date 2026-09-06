import type { Book } from "@glassleaf/library";
import { Image } from "expo-image";
import {
  Check,
  Heart,
  Leaf,
  Library,
  MoreHorizontal,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { fileURI } from "../data/files";
import { Box, Text, usePalette } from "./theme";
export function Brand() {
  const c = usePalette();
  return (
    <Box flexDirection="row" alignItems="center" gap="s">
      <Leaf color={c.accent} size={22} strokeWidth={1.6} />
      <Text fontFamily="DMBold" fontSize={18} letterSpacing={-0.4}>
        glassleaf
      </Text>
    </Box>
  );
}
export function NavRow({
  icon: Icon,
  title,
  count,
  active,
  onPress,
}: {
  icon: typeof Library;
  title: string;
  count?: number;
  active?: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: active ? c.accentSoft : "transparent",
      }}
    >
      <Icon
        size={19}
        color={active ? c.accent : c.secondary}
        strokeWidth={1.7}
      />
      <Text
        variant="label"
        flex={1}
        color={active ? "accent" : "secondary"}
        numberOfLines={1}
      >
        {title}
      </Text>
      {count !== undefined && <Text variant="caption">{count}</Text>}
    </Pressable>
  );
}
export function BookTile({
  book,
  list,
  onOpen,
  onMenu,
  selected,
}: {
  book: Book;
  list: boolean;
  onOpen: () => void;
  onMenu?: () => void;
  selected?: boolean;
}) {
  const c = usePalette();
  return (
    <Box flex={1} paddingHorizontal="xs" paddingBottom="l">
      <Pressable
        onPress={onOpen}
        onLongPress={onMenu}
        accessibilityRole="button"
        accessibilityLabel={`${selected !== undefined ? "Select" : "Read"} ${book.title}, ${book.author}`}
        accessibilityState={{ selected }}
        style={{
          flexDirection: list ? "row" : "column",
          gap: list ? 16 : 0,
          padding: 2,
        }}
      >
        <View
          style={{
            width: list ? 64 : "100%",
            aspectRatio: 0.67,
            borderRadius: 7,
            overflow: "hidden",
            backgroundColor: c.accentSoft,
            borderWidth: 1,
            borderColor: "#00000012",
          }}
        >
          {book.asset.cover ? (
            <Image
              source={fileURI(book.asset.cover)}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
              }}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={book.id}
              transition={0}
            />
          ) : list ? (
            <Box flex={1} alignItems="center" justifyContent="center">
              <Library size={24} color={c.accent} />
            </Box>
          ) : (
            <Box flex={1} padding="m" justifyContent="space-between">
              <Text variant="eyebrow" color="accent">
                GLASSLEAF
              </Text>
              <Text
                fontFamily="Lora"
                fontSize={list ? 12 : 21}
                lineHeight={list ? 16 : 28}
                color="accent"
                numberOfLines={5}
              >
                {book.title}
              </Text>
              <Text variant="caption" color="accent">
                {book.format.toUpperCase()}
              </Text>
            </Box>
          )}
          {selected !== undefined && (
            <View
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: selected ? c.accent : c.surface,
                borderWidth: 1,
                borderColor: c.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {selected && <Check size={16} color={c.onAccent} />}
            </View>
          )}
          {book.favorite && (
            <Box
              position="absolute"
              top={8}
              right={8}
              padding="xs"
              borderRadius="pill"
              backgroundColor="surface"
            >
              <Heart size={12} color={c.accent} fill={c.accent} />
            </Box>
          )}
          {book.progress > 0 && (
            <View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: `${book.progress * 100}%`,
                height: 3,
                backgroundColor: c.gold,
              }}
            />
          )}
        </View>
        <Box flex={list ? 1 : undefined} paddingTop={list ? "s" : "m"}>
          <Text variant="label" fontFamily="DMBold" numberOfLines={2}>
            {book.title}
          </Text>
          <Text variant="caption" numberOfLines={1} marginTop="xs">
            {book.author}
          </Text>
          <Box flexDirection="row" alignItems="center" marginTop="xs">
            <Text variant="eyebrow" flex={1} fontSize={9} letterSpacing={0.8}>
              {book.format.toUpperCase()}{" "}
              {book.progress > 0
                ? ` · ${Math.round(book.progress * 100)}%`
                : ""}
            </Text>
            {onMenu && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Options for ${book.title}`}
                onPress={(e) => {
                  e.stopPropagation();
                  onMenu();
                }}
                hitSlop={10}
                style={{
                  width: 32,
                  height: 28,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MoreHorizontal size={18} color={c.secondary} />
              </Pressable>
            )}
          </Box>
        </Box>
      </Pressable>
    </Box>
  );
}
