import { Action } from "./Action";
import {
  builtinThemes,
  contrast,
  type Palette,
  type ThemeDefinition,
} from "./themeDefinition";
import type { LucideIcon } from "lucide-react-native";
import { X } from "lucide-react-native";
import {
  createContext,
  useContext,
  useLayoutEffect,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { Uniwind } from "uniwind";
import {
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text as NativeText,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
  type TextStyle,
  type ViewProps,
  type TextProps as NativeTextProps,
} from "react-native";
import { paletteVariables } from "./tokens";

export type ThemeName = string;
const PaletteContext = createContext(builtinThemes[0]!);
export const usePalette = () => useContext(PaletteContext).colors;
export const useAppearance = () => useContext(PaletteContext).mode;
export const themeNames = Object.fromEntries(
  builtinThemes.map((theme) => [theme.id, theme.name]),
);
export function ThemeProvider({
  definition,
  children,
}: PropsWithChildren<{ definition: ThemeDefinition }>) {
  useLayoutEffect(() => {
    Uniwind.updateCSSVariables("library", paletteVariables(definition.colors));
    Uniwind.setTheme("library");
  }, [definition]);
  return <PaletteContext value={definition}>{children}</PaletteContext>;
}

const spacing = {
  none: 0,
  xs: 4,
  s: 8,
  m: 12,
  l: 20,
  xl: 28,
  xxl: 40,
} as const;
const radii = { s: 10, m: 16, l: 24, pill: 999 } as const;
type Space = number | keyof typeof spacing;
type SpacingKey =
  | "padding"
  | "paddingHorizontal"
  | "paddingVertical"
  | "paddingTop"
  | "paddingBottom"
  | "paddingLeft"
  | "paddingRight"
  | "margin"
  | "marginHorizontal"
  | "marginVertical"
  | "marginTop"
  | "marginBottom"
  | "marginLeft"
  | "marginRight"
  | "gap"
  | "rowGap"
  | "columnGap";
type ColorKey =
  | "backgroundColor"
  | "borderColor"
  | "borderTopColor"
  | "borderBottomColor"
  | "borderLeftColor"
  | "borderRightColor";
type TokenStyles = { [K in SpacingKey]?: Space } & {
  [K in ColorKey]?: keyof Palette;
} & { borderRadius?: number | keyof typeof radii };
type BoxProps = ViewProps &
  Omit<ViewStyle, SpacingKey | ColorKey | "borderRadius"> &
  TokenStyles;
type Variant = "title" | "heading" | "body" | "label" | "caption" | "eyebrow";
type TextProps = NativeTextProps &
  Omit<TextStyle, SpacingKey | ColorKey | "borderRadius" | "color"> &
  TokenStyles & { color?: keyof Palette; variant?: Variant };
const spaceKeys = new Set<string>([
  "padding",
  "paddingHorizontal",
  "paddingVertical",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "margin",
  "marginHorizontal",
  "marginVertical",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "gap",
  "rowGap",
  "columnGap",
]);
const styleKeys = new Set<string>([
  ...spaceKeys,
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderRightColor",
  "borderRadius",
  "borderWidth",
  "borderTopWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderRightWidth",
  "flex",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "flexDirection",
  "flexWrap",
  "alignItems",
  "alignSelf",
  "alignContent",
  "justifyContent",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "overflow",
  "opacity",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "zIndex",
  "display",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textDecorationLine",
  "textTransform",
  "color",
]);
function splitStyles(props: Record<string, unknown>, colors: Palette) {
  const native: Record<string, unknown> = {},
    style: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!styleKeys.has(key)) {
      native[key] = value;
      continue;
    }
    if (value === undefined) continue;
    style[key] =
      typeof value === "string" && spaceKeys.has(key) && value in spacing
        ? spacing[value as keyof typeof spacing]
        : key === "borderRadius" && typeof value === "string" && value in radii
          ? radii[value as keyof typeof radii]
          : key.endsWith("Color") || key === "color"
            ? typeof value === "string" && value in colors
              ? colors[value as keyof Palette]
              : value
            : value;
  }
  return { native, style };
}
/** Token props preserve existing screens during migration; new layouts use Uniwind className. */
export function Box({ style, ...props }: BoxProps) {
  const resolved = splitStyles(props, usePalette());
  return (
    <View {...resolved.native} style={[resolved.style as ViewStyle, style]} />
  );
}
const typography: Record<Variant, TextStyle> = {
  title: {
    fontFamily: "Lora",
    fontSize: 30,
    lineHeight: 39,
    letterSpacing: -0.8,
  },
  heading: {
    fontFamily: "DMBold",
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  body: { fontSize: 15, lineHeight: 23 },
  label: { fontFamily: "DMMedium", fontSize: 13, lineHeight: 19 },
  caption: { fontSize: 12, lineHeight: 18 },
  eyebrow: {
    fontFamily: "DMBold",
    fontSize: 10,
    lineHeight: 16,
    letterSpacing: 1.8,
  },
};
export function Text({ variant = "body", style, ...props }: TextProps) {
  const colors = usePalette();
  const resolved = splitStyles(props, colors);
  return (
    <NativeText
      {...resolved.native}
      style={[
        { fontFamily: "DM", color: colors.text },
        typography[variant],
        resolved.style as TextStyle,
        style,
      ]}
    />
  );
}

/**
 * A semantic content surface shared by the library, organization and settings
 * flows. It deliberately only relies on palette roles so imported community
 * themes keep the same hierarchy as the built-in palettes.
 */
export function Surface({
  children,
  subtle,
  style,
}: PropsWithChildren<{
  subtle?: boolean;
  style?: StyleProp<ViewStyle>;
}>) {
  const c = usePalette();
  return (
    <View
      style={[
        {
          backgroundColor: subtle ? c.muted : c.surface,
          borderColor: c.line,
          borderWidth: 1,
          borderRadius: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <Box flexDirection="row" alignItems="center" gap="m">
      <Text variant="eyebrow" flex={1}>
        {title}
      </Text>
      {action}
    </Box>
  );
}
export function IconButton({
  icon: Icon,
  label,
  onPress,
  active,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        backgroundColor: active
          ? c.accentSoft
          : pressed
            ? c.muted
            : "transparent",
        opacity: disabled ? 0.35 : 1,
        transform: [{ scale: pressed && !disabled ? 0.96 : 1 }],
      })}
    >
      <Icon size={21} color={active ? c.accent : c.text} strokeWidth={1.7} />
    </Pressable>
  );
}
export function Button({
  children,
  onPress,
  icon: Icon,
  secondary,
  disabled,
  accessibilityLabel,
}: PropsWithChildren<{
  onPress: () => void;
  icon?: LucideIcon;
  secondary?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}>) {
  const colors = usePalette();
  const appearance = useAppearance();
  return (
    <Action
      {...{
        onPress,
        icon: Icon,
        secondary,
        disabled,
        accessibilityLabel,
        colors,
        appearance,
      }}
    >
      {children}
    </Action>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={{
        minHeight: 40,
        paddingHorizontal: 15,
        justifyContent: "center",
        borderRadius: 12,
        backgroundColor: active ? c.accent : c.muted,
      }}
    >
      <Text
        variant="label"
        style={{ color: active ? c.onAccent : c.secondary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const c = usePalette();
  return (
    <Box gap="s">
      <Text variant="label">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        testID={`field-${label}`}
        keyboardAppearance={
          contrast(c.bg, "#FFFFFF") > contrast(c.bg, "#000000")
            ? "dark"
            : "light"
        }
        placeholderTextColor={c.secondary}
        {...props}
        style={[
          {
            backgroundColor: c.muted,
            color: c.text,
            fontFamily: "DM",
            fontSize: 16,
            borderRadius: 12,
            padding: 14,
            minHeight: 48,
          },
          props.style,
        ]}
      />
    </Box>
  );
}
export function Sheet({
  title,
  onClose,
  children,
  footer,
}: PropsWithChildren<{
  title: string;
  onClose: () => void;
  footer?: ReactNode;
}>) {
  const { width } = useWindowDimensions();
  const c = usePalette();
  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          backgroundColor: "#00000066",
          justifyContent: width > 700 ? "center" : "flex-end",
          alignItems: "center",
          padding: width > 700 ? 24 : 0,
        }}
      >
        <Pressable
          accessibilityLabel="Close dialog"
          onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            width: "100%",
            maxWidth: 560,
            maxHeight: "90%",
            flexShrink: 1,
            backgroundColor: c.bg,
            borderColor: c.line,
            borderWidth: 1,
            borderRadius: 24,
            paddingBottom: width > 700 ? 20 : 34,
          }}
        >
          <Box flexDirection="row" alignItems="center" padding="l">
            <Text variant="heading" flex={1}>
              {title}
            </Text>
            <IconButton icon={X} label="Close" onPress={onClose} />
          </Box>
          <ScrollView
            style={{ flexGrow: 0, flexShrink: 1, minHeight: 0 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 20,
              gap: 20,
            }}
          >
            {children}
          </ScrollView>
          {footer && <Box paddingHorizontal="l">{footer}</Box>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
