import { createHash } from "node:crypto";

/**
 * Produces a cache namespace that changes whenever the worker or a precached
 * resource changes. Paths are included so a renamed asset cannot collide with
 * the same bytes at its previous URL.
 */
export function pwaCacheId(workerSource, assets) {
  const digest = createHash("sha256");
  digest.update(workerSource);
  for (const { path, bytes } of assets) {
    digest.update("\0");
    digest.update(path);
    digest.update("\0");
    digest.update(bytes);
  }
  return `glassleaf-shell-${digest.digest("hex").slice(0, 16)}`;
}
