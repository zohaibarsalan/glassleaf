# Community palettes

Source: https://github.com/tinted-theming/schemes/tree/spec-0.11/base16
Retrieved 2026-09-06. Original YAML and MIT license are preserved here; catalog.json is the same palette data serialized as JSON for Metro. Authors are recorded in each scheme.

Glassleaf adapts Base16/Base24 palette roles into its semantic UI tokens. Background and source hues are preserved. If a secondary text color is too faint, the adapter selects another readable source color. Surfaces can fall back to the background where needed. Schemes without readable combinations are rejected. These are Glassleaf adaptations, not editor syntax-highlighting themes.

Import accepts modern nested Base16/Base24 YAML or JSON and legacy flat Base16 (scheme, base00–base0F). All required colors must be six-digit hex strings, with an optional #. Base24 requires base00–base17; its extra colors are available as contrast fallbacks. YAML aliases, duplicate keys, unsupported tags and files over 64 KB are rejected. Existing Glassleaf v1 JSON remains supported. Saved/exported themes contain the resulting editable semantic colors; exports are Glassleaf JSON, not reverse-converted Base16 files.

There is no universal theme-file format. VS Code extensions, terminal configuration files, and arbitrary Catppuccin application ports are not directly importable; use their Base16/Base24 scheme equivalents. No network access is needed to select a built-in or import a downloaded file.
