#!/bin/zsh

set -euo pipefail

glassleaf_root=${0:A:h:h}
cd "$glassleaf_root"

command -v swift >/dev/null
command -v xcrun >/dev/null
command -v xcodegen >/dev/null

echo "Checking provider-neutral domain…"
swift test --package-path packages/domain
swift run --package-path packages/domain GlassleafDomainChecks

echo "Checking EPUB import and local storage…"
./scripts/check-local-library.sh

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

if xcodebuild -version >/dev/null 2>&1; then
    derived_data="$glassleaf_root/.build/DerivedData-check"
    echo "Building the macOS application…"
    xcodebuild \
        -project apps/apple/Glassleaf.xcodeproj \
        -scheme Glassleaf \
        -configuration Debug \
        -destination "generic/platform=macOS" \
        -derivedDataPath "$derived_data" \
        CODE_SIGNING_ALLOWED=NO \
        build >/dev/null

    echo "Building the iPhone and iPad simulator application…"
    xcodebuild \
        -project apps/apple/Glassleaf.xcodeproj \
        -scheme Glassleaf \
        -configuration Debug \
        -destination "generic/platform=iOS Simulator" \
        -derivedDataPath "$derived_data" \
        CODE_SIGNING_ALLOWED=NO \
        build >/dev/null
fi

echo "Glassleaf checks passed."
