import type { LucideIcon } from "lucide-react-native";
import type { PropsWithChildren } from "react";
import type { Palette } from "./themeDefinition";
export type ActionProps = PropsWithChildren<{
  onPress: () => void;
  icon?: LucideIcon;
  secondary?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  colors: Palette;
  appearance: "light" | "dark";
}>;
