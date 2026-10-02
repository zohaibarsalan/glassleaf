import type {} from "uniwind/types";
import { Pressable, Text } from "react-native";
import type { ActionProps } from "./Action.types";
export function Action({
  children,
  onPress,
  icon: Icon,
  secondary,
  disabled,
  accessibilityLabel,
  colors: c,
}: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl px-5 py-3"
      style={({ pressed }) => ({
        backgroundColor: secondary ? c.muted : c.accent,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {Icon && <Icon size={18} color={secondary ? c.text : c.onAccent} />}
      <Text
        style={{
          fontFamily: "DMMedium",
          fontSize: 14,
          lineHeight: 20,
          color: secondary ? c.text : c.onAccent,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
