#!/bin/zsh

set -euo pipefail

glassleaf_root=${0:A:h:h}
cd "$glassleaf_root"

command -v swift >/dev/null
command -v xcrun >/dev/null
command -v xcodegen >/dev/null

echo "Checking provider-neutral domain…"
swift run --package-path packages/domain GlassleafDomainChecks

echo "Regenerating the Apple project…"
xcodegen generate --spec apps/apple/project.yml --project apps/apple

domain_bin_path=$(swift build --package-path packages/domain --show-bin-path)
app_swift_sources=(${(f)"$(rg --files apps/apple/Sources -g '*.swift')"})

echo "Type-checking macOS Debug sources…"
xcrun --sdk macosx swiftc \
    -D DEBUG \
    -typecheck \
    -parse-as-library \
    -target "$(uname -m)-apple-macosx26.0" \
    -I "$domain_bin_path/Modules" \
    $app_swift_sources

echo "Type-checking macOS Release sources…"
xcrun --sdk macosx swiftc \
    -typecheck \
    -parse-as-library \
    -target "$(uname -m)-apple-macosx26.0" \
    -I "$domain_bin_path/Modules" \
    $app_swift_sources

echo "Glassleaf checks passed."
