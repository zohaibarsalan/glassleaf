import { Button, Host } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled as isDisabled,
  frame,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import type { ActionProps } from "./Action.types";
import { Action as Fallback } from "./Action.fallback";
export function Action(props: ActionProps) {
  const { children, onPress, secondary, disabled, colors, appearance } = props;
  if (typeof children !== "string") return <Fallback {...props} />;
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={appearance}
      seedColor={colors.accent}
      style={{ width: "100%", minHeight: 48 }}
    >
      <Button
        label={children}
        onPress={onPress}
        modifiers={[
          frame({ maxWidth: Infinity, minHeight: 48 }),
          controlSize("large"),
          buttonBorderShape("roundedRectangle"),
          buttonStyle(secondary ? "bordered" : "borderedProminent"),
          tint(colors.accent),
          isDisabled(!!disabled),
          accessibilityLabel(props.accessibilityLabel ?? children),
        ]}
      />
    </Host>
  );
}
