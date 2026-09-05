import { useRecyclingState } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useEffect } from "react";
import { useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

export function ComicCanvas({
  uris,
  zoom,
  onTap,
  onError,
}: {
  uris: string[];
  zoom: number;
  onTap: () => void;
  onError: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const baseScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const baseX = useSharedValue(0);
  const baseY = useSharedValue(0);
  const identity = uris.join("|");
  useEffect(() => {
    scale.value = zoom;
    baseScale.value = zoom;
    x.value = 0;
    y.value = 0;
  }, [zoom, identity, scale, baseScale, x, y]);
  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(Math.max(baseScale.value * event.scale, 1), 5);
    })
    .onEnd(() => {
      baseScale.value = scale.value;
      if (scale.value <= 1) {
        x.value = 0;
        y.value = 0;
      }
    });
  const pan = Gesture.Pan()
    .minDistance(8)
    .onStart(() => {
      baseX.value = x.value;
      baseY.value = y.value;
    })
    .onUpdate((event) => {
      const limitX = (width * (scale.value - 1)) / 2;
      const limitY = (height * (scale.value - 1)) / 2;
      x.value = Math.min(
        Math.max(baseX.value + event.translationX, -limitX),
        limitX,
      );
      y.value = Math.min(
        Math.max(baseY.value + event.translationY, -limitY),
        limitY,
      );
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = scale.value > 1 ? 1 : 2;
      baseScale.value = scale.value;
      x.value = 0;
      y.value = 0;
    });
  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(onTap)();
  });
  const gesture = Gesture.Simultaneous(
    pinch,
    pan,
    Gesture.Exclusive(doubleTap, tap),
  );
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
    ],
  }));
  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flex: 1, overflow: "hidden" }}>
        <Animated.View style={[{ flex: 1, flexDirection: "row" }, style]}>
          {uris.map((uri) => (
            <Image
              key={uri}
              source={uri}
              style={{ flex: 1 }}
              contentFit="contain"
              cachePolicy="disk"
              recyclingKey={uri}
              onError={onError}
            />
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
export function ComicStripPage({ uri, width }: { uri: string; width: number }) {
  const [ratio, setRatio] = useRecyclingState(1.5, [uri]);
  return (
    <Image
      source={uri}
      style={{ width, height: width * ratio }}
      contentFit="contain"
      cachePolicy="disk"
      recyclingKey={uri}
      onLoad={(event) => {
        if (event.source.width > 0)
          setRatio(event.source.height / event.source.width);
      }}
    />
  );
}
