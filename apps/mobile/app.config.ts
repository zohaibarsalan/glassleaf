import type { ExpoConfig } from "expo/config";
import app from "./app.json";
const iosClient = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const config: ExpoConfig = {
  ...app.expo,
  web: {
    ...app.expo.web,
    bundler: "metro",
    output: "single",
  },
  orientation: "default",
  userInterfaceStyle: "automatic",
  plugins: [
    ...app.expo.plugins,
    ...(iosClient
      ? [
          [
            "@react-native-google-signin/google-signin",
            { iosUrlScheme: iosClient.split(".").reverse().join(".") },
          ] as [string, Record<string, string>],
        ]
      : []),
  ],
};
export default config;
