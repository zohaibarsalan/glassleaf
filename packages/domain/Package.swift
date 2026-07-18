// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "GlassleafDomain",
    platforms: [
        .iOS("26.0"),
        .macOS("26.0"),
    ],
    products: [
        .library(name: "GlassleafDomain", targets: ["GlassleafDomain"]),
        .executable(name: "GlassleafDomainChecks", targets: ["GlassleafDomainChecks"]),
    ],
    targets: [
        .target(name: "GlassleafDomain"),
        .executableTarget(
            name: "GlassleafDomainChecks",
            dependencies: ["GlassleafDomain"]
        ),
        .testTarget(
            name: "GlassleafDomainTests",
            dependencies: ["GlassleafDomain"]
        ),
    ]
)
