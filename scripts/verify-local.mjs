import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const steps = [
  "themes:check",
  "typecheck",
  "test",
  "format:check",
  "web:build",
  "test:pwa",
];
const evidence = {
  startedAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  node: process.version,
  platform: process.platform,
  dirty: Boolean(
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  ),
  steps: [],
};
mkdirSync("outputs/app-system", { recursive: true });
try {
  for (const step of steps) {
    const start = Date.now();
    console.log(`\nLocal verification: ${step}`);
    try {
      execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [step], {
        stdio: "inherit",
        shell: process.platform === "win32",
      });
    } catch (error) {
      evidence.passed = false;
      evidence.steps.push({
        step,
        passed: false,
        durationMs: Date.now() - start,
      });
      throw error;
    }
    evidence.steps.push({ step, passed: true, durationMs: Date.now() - start });
  }
  evidence.passed = true;
} finally {
  evidence.completedAt = new Date().toISOString();
  writeFileSync(
    "outputs/app-system/local-verification.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
}
