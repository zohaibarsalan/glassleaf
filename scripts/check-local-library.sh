#!/bin/zsh

set -euo pipefail

glassleaf_root=${0:A:h:h}
cd "$glassleaf_root"

check_root=$(mktemp -d "${TMPDIR:-/tmp}/glassleaf-local-check.XXXXXX")
trap 'rm -rf "$check_root"' EXIT
fixture_root="$glassleaf_root/scripts/fixtures/generated-epub"
fixture_epub="$check_root/Generated_Fixture.epub"
library_root="$check_root/library"
module_root="$check_root/module"
mkdir -p "$module_root" "$library_root"

(
    cd "$fixture_root"
    zip -X -q -0 "$fixture_epub" mimetype
    zip -X -q -r "$fixture_epub" META-INF OEBPS
)

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
    -emit-module-path "$module_root/GlassleafDomain.swiftmodule" \
    -o "$module_root/libGlassleafDomain.a"

xcrun --sdk macosx swiftc \
    -O \
    -target "$(uname -m)-apple-macosx26.0" \
    -I "$module_root" \
    apps/apple/Sources/Services/ZIPArchive.swift \
    apps/apple/Sources/Services/EPUBParser.swift \
    apps/apple/Sources/Services/LocalBookImporter.swift \
    apps/apple/Sources/Services/LocalLibraryRepository.swift \
    apps/apple/Sources/Services/PortableLibraryArchiveService.swift \
    scripts/check-local-library.swift \
    "$module_root/libGlassleafDomain.a" \
    -lsqlite3 \
    -lz \
    -framework ImageIO \
    -framework UniformTypeIdentifiers \
    -o "$check_root/check-local-library"

"$check_root/check-local-library" "$fixture_epub" "$library_root"
