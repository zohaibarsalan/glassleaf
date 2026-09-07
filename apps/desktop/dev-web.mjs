import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL(".", import.meta.url));
const env = { ...process.env };
delete env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

const child = spawn("pnpm", ["--dir", "../mobile", "web"], {
  cwd,
  env,
  stdio: "inherit",
});

const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
