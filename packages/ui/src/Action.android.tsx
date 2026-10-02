import {
  Button,
  FilledTonalButton,
  Host,
  Text,
} from "@expo/ui/jetpack-compose";
import { fillMaxWidth, semantics } from "@expo/ui/jetpack-compose/modifiers";
import type { ActionProps } from "./Action.types";
import { Action as Fallback } from "./Action.fallback";
export function Action(props: ActionProps) {
  const {
    children,
    onPress,
    secondary,
    disabled,
    colors: c,
    appearance,
  } = props;
  if (typeof children !== "string") return <Fallback {...props} />;
  const NativeButton = secondary ? FilledTonalButton : Button;
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={appearance}
      seedColor={c.accent}
      style={{ width: "100%", minHeight: 48 }}
    >
      <NativeButton
        onClick={onPress}
        enabled={!disabled}
        contentPadding={{ start: 20, end: 20, top: 14, bottom: 14 }}
        colors={{
          containerColor: secondary ? c.muted : c.accent,
          contentColor: secondary ? c.text : c.onAccent,
        }}
        modifiers={[
          fillMaxWidth(),
          semantics({
            contentDescription: props.accessibilityLabel ?? children,
          }),
        ]}
      >
        <Text style={{ fontSize: 14 }} color={secondary ? c.text : c.onAccent}>
          {children}
        </Text>
      </NativeButton>
    </Host>
  );
}
