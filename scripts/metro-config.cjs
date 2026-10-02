const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
module.exports = (appRoot) => {
  const config = getDefaultConfig(appRoot);
  const { withUniwindConfig } = require(
    require.resolve("uniwind/metro", { paths: [appRoot] }),
  );
  config.resolver.assetExts.push("wasm", "epub", "cbz", "pdf");
  const resolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (
      moduleName === "sqlite3-worker1.mjs" ||
      moduleName === "sqlite3-opfs-async-proxy.js"
    )
      return {
        type: "sourceFile",
        filePath: path.join(
          path.dirname(require.resolve("@sqlite.org/sqlite-wasm/package.json")),
          `dist/${moduleName}`,
        ),
      };
    return (
      resolveRequest?.(context, moduleName, platform) ??
      context.resolveRequest(context, moduleName, platform)
    );
  };
  return withUniwindConfig(config, {
    cssEntryFile: "./global.css",
    dtsFile: "./.expo/uniwind-types.d.ts",
    extraThemes: require("../packages/ui/theme-names.json"),
    polyfills: { rem: 16 },
  });
};
