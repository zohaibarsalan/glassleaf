const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm', 'epub', 'cbz', 'pdf');
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'sqlite3-worker1.mjs' || moduleName === 'sqlite3-opfs-async-proxy.js')
    return {
      type: 'sourceFile',
      filePath: path.join(
        path.dirname(require.resolve('@sqlite.org/sqlite-wasm/package.json')),
        `dist/${moduleName}`,
      ),
    };
  return resolveRequest?.(context, moduleName, platform) ?? context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
