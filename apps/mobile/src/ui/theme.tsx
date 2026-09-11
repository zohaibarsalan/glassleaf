import { builtinThemes, contrast } from "./themeDefinition";
import { createBox, createText, createTheme, useTheme } from "@shopify/restyle";
import type { LucideIcon } from "lucide-react-native";
import { X } from "lucide-react-native";
import type { PropsWithChildren, ReactNode } from "react";
import {
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

const paper = builtinThemes[0]!.colors;
export const base = createTheme({
  colors: paper,
  spacing: { none: 0, xs: 4, s: 8, m: 12, l: 20, xl: 28, xxl: 40 },
  borderRadii: { s: 10, m: 16, l: 24, pill: 999 },
  textVariants: {
    defaults: { fontFamily: "DM", fontSize: 15, lineHeight: 22, color: "text" },
    title: { fontFamily: "Lora", fontSize: 27, lineHeight: 35, color: "text" },
    heading: {
      fontFamily: "DMBold",
      fontSize: 19,
      lineHeight: 26,
      color: "text",
    },
    body: { fontFamily: "DM", fontSize: 15, lineHeight: 23, color: "text" },
    label: {
      fontFamily: "DMMedium",
      fontSize: 13,
      lineHeight: 19,
      color: "text",
    },
    caption: {
      fontFamily: "DM",
      fontSize: 12,
      lineHeight: 18,
      color: "secondary",
    },
    eyebrow: {
      fontFamily: "DMBold",
      fontSize: 10,
      lineHeight: 16,
      letterSpacing: 1.8,
      color: "secondary",
    },
  },
  breakpoints: { phone: 0, tablet: 700, desktop: 1000 },
});
export type Theme = typeof base;
export type ThemeName = string;
export const themes: Record<string, Theme> = Object.fromEntries(
  builtinThemes.map((t) => [t.id, { ...base, colors: t.colors }]),
);
export const themeNames: Record<string, string> = Object.fromEntries(
  builtinThemes.map((t) => [t.id, t.name]),
);
export const Box = createBox<Theme>();
export const Text = createText<Theme>();
export const usePalette = () => useTheme<Theme>().colors;

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
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: 46,
        paddingHorizontal: 18,
        paddingVertical: 11,
        borderRadius: 14,
        flexDirection: "row",
        gap: 9,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: secondary ? c.muted : c.accent,
        opacity: disabled ? 0.45 : 1,
        transform: [{ scale: pressed && !disabled ? 0.96 : 1 }],
      })}
    >
      {Icon && <Icon size={18} color={secondary ? c.text : c.onAccent} />}
      <Text variant="label" style={{ color: secondary ? c.text : c.onAccent }}>
        {children}
      </Text>
    </Pressable>
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
