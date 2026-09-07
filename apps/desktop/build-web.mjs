import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL(".", import.meta.url));
const env = { ...process.env };

// Google Identity Services does not support the installed Tauri origin. Keep
// Drive hidden in this bundle until a native PKCE flow exists.
delete env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

execFileSync(
  "pnpm",
  [
    "--dir",
    "../mobile",
    "exec",
    "expo",
    "export",
    "--platform",
    "web",
    "--output-dir",
    "dist",
  ],
  {
    cwd,
    env,
    stdio: "inherit",
  },
);
