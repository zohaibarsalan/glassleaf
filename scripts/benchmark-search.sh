#!/bin/zsh

set -euo pipefail

glassleaf_root=${0:A:h:h}
cd "$glassleaf_root"

benchmark_root="$glassleaf_root/.build/search-benchmark-run"
mkdir -p "$benchmark_root"
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
    -emit-module-path "$benchmark_root/GlassleafDomain.swiftmodule" \
    -o "$benchmark_root/libGlassleafDomain.a"

xcrun --sdk macosx swiftc \
    -O \
    -target "$(uname -m)-apple-macosx26.0" \
    -I "$benchmark_root" \
    apps/apple/Sources/Services/LocalLibraryRepository.swift \
    scripts/benchmark-search.swift \
    "$benchmark_root/libGlassleafDomain.a" \
    -lsqlite3 \
    -o "$benchmark_root/benchmark"

"$benchmark_root/benchmark"
