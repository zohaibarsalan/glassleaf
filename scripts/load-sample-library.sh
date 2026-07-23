#!/bin/zsh

set -euo pipefail

glassleaf_root=${0:A:h:h}
cd "$glassleaf_root"

loader_root=$(mktemp -d "${TMPDIR:-/tmp}/glassleaf-sample-loader.XXXXXX")
trap 'rm -rf "$loader_root"' EXIT

domain_sources=(${(f)"$(rg --files packages/domain/Sources/GlassleafDomain -g '*.swift')"})
xcrun --sdk macosx swiftc \
    -O \
    -parse-as-library \
    -emit-module \
    -emit-library \
    -static \
    -module-name GlassleafDomain \
    -target "$(uname -m)-apple-macosx26.0" \
    $domain_sources \
    -emit-module-path "$loader_root/GlassleafDomain.swiftmodule" \
    -o "$loader_root/libGlassleafDomain.a"

xcrun --sdk macosx swiftc \
    -O \
    -target "$(uname -m)-apple-macosx26.0" \
    -I "$loader_root" \
    apps/apple/Sources/Services/ZIPArchive.swift \
    apps/apple/Sources/Services/EPUBParser.swift \
    apps/apple/Sources/Services/LocalBookImporter.swift \
    apps/apple/Sources/Services/LocalLibraryRepository.swift \
    scripts/load-sample-library.swift \
    "$loader_root/libGlassleafDomain.a" \
    -lsqlite3 \
    -lz \
    -framework ImageIO \
    -framework UniformTypeIdentifiers \
    -o "$loader_root/load-sample-library"

"$loader_root/load-sample-library" "$glassleaf_root/samples/epubs"
