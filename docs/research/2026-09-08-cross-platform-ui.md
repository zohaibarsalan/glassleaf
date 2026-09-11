# Glassleaf cross-platform UI direction

Research and implementation direction, 2026-09-08.

## Recommendation

Keep Glassleaf's existing, owned UI layer built on Shopify Restyle and extend it into a small set of semantic, cross-platform primitives. Do not add PanelUI, gluestack, HeroUI Native, React Native Reusables, or shadcn/ui as a second component system.

This is the lowest-risk route for the current branch: the app already uses Expo 57 / React Native 0.86, `react-native-web`, Restyle, FlashList, Lucide, and a working theme provider. Replacing Restyle would require moving every screen to a Tailwind or class-name styling model while still leaving reader-specific surfaces and the web/PWA shell to build. It would also create two competing token and interaction contracts during the most important product work.

The recommended direction is an owned Glassleaf skin with a portable semantic token contract:

```text
semantic Glassleaf tokens
        ├── Restyle theme + React Native primitives (iOS / Android / RN Web)
        ├── CSS variables for the future web/PWA shell
        └── the same RN Web shell at desktop widths
```

The library comparison is useful as design input. React Native Reusables has the closest philosophy because it treats components as source code that a team owns, but adopting its NativeWind/Uniwind and RN-primitives stack would still be a styling migration. Use that approach as a design principle, not as a new dependency today.

## Current Glassleaf evidence

- `apps/mobile/package.json` already pins Expo `~57.0.20`, React Native `0.86.3`, React Native Web, Restyle, Reanimated, gesture handler, safe-area context, and Lucide.
- `apps/mobile/src/ui/theme.tsx` owns `Box`, `Text`, `Button`, `IconButton`, `Chip`, `Field`, and `Sheet`; `LibraryComponents.tsx` owns `Brand`, `NavRow`, and `BookTile`.
- The theme schema currently has eleven semantic roles (`bg`, `surface`, `muted`, `line`, `text`, `secondary`, `accent`, `accentSoft`, `onAccent`, `danger`, `gold`), contrast validation, DM Sans/Lora typography, and 4/8/12/20/28/40 spacing with 8/14/22/pill radii.
- Paper, Midnight, Forest, Tokyo Night, and community themes are already user-facing. Custom palettes are validated and persisted, so any new design system must preserve the versioned theme import/export contract.
- The active implementation is a mobile Expo app. React Native Web is installed, but a finished web/PWA shell and the shared desktop-width RN Web shell are future work; no candidate should be described as having already solved those surfaces for Glassleaf. The existing SwiftUI app remains a separate native client unless a later decision gives it an explicit sharing boundary.

## Product lessons from the references

Yomu is a strong visual reference for calm, content-first navigation. Its documented library flow puts import in a bottom sheet, offers title/author search, exposes document information and context actions, and keeps sort, layout, folders, tags, and collections in a sidebar. It also explicitly calls itself a simple reader rather than an ebook manager. Glassleaf should borrow the restrained hierarchy and contextual actions while keeping the deeper organizer that Yomu intentionally omits. [Yomu library and sidebar guide](https://www.yomu-reader.com/support/guide/get-started/)

BookFusion is the closer product reference for breadth: its documentation describes books, PDFs, comics, notes, cross-device sync, rule-based Smart Queries/Smart Shelves, and one-click Calibre integration. This supports a library UI where retrieval and organization are powerful, but the default surface stays simple. [BookFusion docs](https://docs.bookfusion.com/docs/) · [Smart Queries and Smart Shelves](https://docs.bookfusion.com/docs/smart-queries-%26-smart-shelves/overview)

Calibre supplies the management model. A Virtual Library is a saved subset of one canonical library; it changes both the visible books and the available facets in the tag browser, while searches can intersect multiple virtual libraries. This maps well to Glassleaf's existing independent format/story-type dimensions, overlapping tags and collections, and saved views. [Calibre Virtual Libraries](https://manual.calibre-ebook.com/virtual_libraries.html)

The resulting interaction rule is progressive disclosure: Home and Library show the next useful reading action; one compact toolbar exposes search, view, sort, and filters; advanced all/any/exclusion rules open in a sheet or dedicated editor; selection mode reveals bulk actions; long-press/right-click reveals item actions. This preserves Yomu's calm first impression while retaining BookFusion/Calibre-level retrieval power.

## Visual inspection: five decisions to carry into Glassleaf

I inspected the official Yomu library and sidebar assets and the official BookFusion library screenshot, rather than inferring visual details from product copy: [Yomu library screenshot](https://cdn.yomu-reader.com/support/guide/app-library.png), [Yomu sidebar screenshot](https://cdn.yomu-reader.com/support/guide/app-sidebar.png), [Yomu tag editor screenshot](https://cdn.yomu-reader.com/support/guide/app-tags.png), and [BookFusion library browser screenshot](https://support.bookfusion.com/hc/article_attachments/4407346518797/mceclip0.png). These are visual observations from the linked images, followed by Glassleaf-specific recommendations.

1. **Covers stay portrait and carry the row.** Yomu’s library uses a portrait cover as the visual anchor of each list row, with author above a strong title and little surrounding decoration. Keep Glassleaf’s existing approximately 2:3 cover geometry, use a consistent 8px image radius and a low-contrast image outline, and let metadata sit beside the cover in list mode or below it in grid mode. Avoid putting every book inside a second heavy card.
2. **The sidebar is dense, grouped, and count-aware.** Yomu’s sidebar uses a few section headers (Folder, Tags, Collection), collapsible groups, one selected rounded row, simple line icons, and counts aligned to the trailing edge. At tablet/desktop widths, Glassleaf should use a 240–280px sidebar with 40–44px rows and contextual facets; keep the full tag universe behind an expandable section or search instead of showing a wall of chips.
3. **Search and primary actions live in the top reading path.** Yomu puts the large library title and search field together at the top, while BookFusion’s desktop capture uses a shallow global nav and a single “Browse Libraries” entry point before the cards. Glassleaf should keep a top title/search/primary-action band, with only one or two high-value actions visible. View, sort, filters, and import can share a compact trailing toolbar.
4. **Sheets and editors use one clear task surface.** Yomu’s tag editor is a plain, full-width task surface with Cancel/Title/Done at the top, a selected tag pill with an inline remove control, and simple rows beneath it. Glassleaf sheets should follow that shape: one title, one close/done path, one vertically scrolling content region, and grouped rows. Do not nest each option in a rounded card or turn a simple tag edit into a multi-step wizard.
5. **Selection is tonal and local.** Yomu marks a selected sidebar row with a soft gray rounded fill, selected tags with a green pill and inline remove affordance, and action controls with light outlined circular buttons. BookFusion uses small green/yellow status pills and roomy white surfaces on a pale background. Glassleaf should use `accentSoft` plus a check for selected books/rows, tonal status badges, and a contextual selection toolbar that appears only after selection; reserve strong `accent` fills for the primary action.

## Candidate comparison

| Option | Official evidence | Fit for Glassleaf | Decision |
| --- | --- | --- | --- |
| Existing Restyle + owned primitives | Already integrated in the app; current components and theme validation are working | Zero migration, keeps RN/Web-compatible React Native layout, preserves custom themes and reader-specific UI | **Choose** |
| [PanelUI](https://panelui.dev/docs) | Expo library with 126 typed modules, Tailwind/Uniwind styling, Reanimated UI-thread animation, and no native code; its install guide targets Expo 57 and RN 0.86 | Good mobile fit and strong sheets/forms, but introduces Uniwind/Tailwind plus peer dependencies and a provider. It would duplicate the existing Restyle layer; the docs do not establish a complete desktop/web strategy | Do not add now |
| [gluestack UI v2](https://v2.gluestack.io/ui/docs/home/overview/introduction) | Copy-in components for React, Next.js, and React Native; token config, accessibility goals, and NativeWind class-name styling | The best documented web/native story among the full libraries, and its source ownership is attractive. Still requires moving from Restyle props to NativeWind/compound APIs and maintaining a second visual migration | Keep as a future migration candidate only |
| [HeroUI Native](https://heroui.com/en/docs/native/getting-started/quick-start) | Expo scaffold, Uniwind/Tailwind, provider, granular imports, and optional portal/bottom-sheet dependencies | The official guide explicitly says HeroUI Native is not recommended for Expo web and focuses on iOS/Android. That conflicts with the web/PWA requirement | Reject for the shared layer |
| [React Native Reusables](https://reactnativereusables.com/docs) | “How you build your component library,” with NativeWind or Uniwind, RN primitives, Reanimated, and explicit adaptations for portals, state, and no cascading styles | Excellent source-owned composition model and close to shadcn's workflow. It is not a drop-in library, and adopting it now still replaces Restyle styling and introduces NativeWind/Uniwind decisions | Borrow the philosophy; do not install now |
| [shadcn/ui](https://ui.shadcn.com/docs) | Open component source, composable interfaces, a distribution schema, semantic CSS-variable tokens, and a radius scale | Strong web/PWA design vocabulary and good token conventions, but its official components target web React. It cannot be the RN implementation layer | Use as a future web token/reference vocabulary only |

PanelUI is the only option whose official install page matches the current Expo/RN versions exactly, but version alignment alone does not justify a wholesale styling migration. HeroUI's explicit web limitation and the extra Tailwind/provider stack make it unsuitable as the one shared direction. gluestack and Reusables are credible if Glassleaf later commits to a NativeWind/Uniwind rewrite; that is a separate decision with measurable benefits, not a prerequisite for the current reader and organizer work.

## Glassleaf skin and primitives

Keep the current palette values and aliases for backwards-compatible imports, then add semantic names that can map to web CSS variables and the shared RN Web desktop shell:

```text
background / foreground
surface / surface-foreground
muted / muted-foreground
border / focus
primary / primary-foreground
secondary / secondary-foreground
danger / danger-foreground
warning / warning-foreground
sidebar / sidebar-foreground / sidebar-active
reader / reader-foreground
progress
```

`accent` remains the Glassleaf green/blue theme choice behind `primary`; `gold` becomes the progress/warm emphasis role. Keep DM Sans for application UI and Lora for book titles/reading surfaces. Use a small radius scale (8, 12, 16, 22, pill) and the existing spacing rhythm; add 16 and 24 only when a measured layout gap needs them. Preserve 44–48 point minimum targets, visible pressed/selected/focus states, and contrast validation for every theme. Replace raw colors such as the image outline in `BookTile` with a semantic image-outline token.

The owned component inventory should stay deliberately small:

- Shell: `AppShell`, `Sidebar`, `BottomNav`, `ContentColumn`, `SectionHeader`.
- Content: `Surface`, `BookTile`, `BookRow`, `ProgressBar`, `Badge`, `EmptyState`.
- Controls: `Button`, `IconButton`, `TextField`, `SearchField`, `Chip`, `FilterChip`, `MenuRow`.
- Overlays: `Sheet`, `Dialog`, `PopoverMenu`, `SelectionToolbar`.
- Organization: `FacetList`, `SavedViewRow`, `RuleGroup`, `DragHandleRow`.

Each primitive should accept semantic variants and state, rather than callers assembling color, radius, and pressed behavior ad hoc. Keep reader chrome content-first: typography, page controls, appearance controls, and annotations should share tokens but can use reader-specific density and surfaces.

## Actionable implementation sequence

1. Add a typed token adapter beside `themeSchema.ts`. Keep the existing JSON format and aliases; expose semantic roles and a function that emits the same values for Restyle and future CSS variables. Add tests for every built-in/community/custom theme and the contrast pairs.
2. Move raw surface, border, and text values in `LibraryComponents.tsx` and the screens behind the existing primitives. Add `Surface`, `SearchField`, `FilterChip`, `ProgressBar`, and `SectionHeader` before adding any larger component.
3. Normalize the adaptive shell: phone uses bottom navigation and sheets; tablet/web uses a persistent sidebar plus a bounded content column; wide desktop uses the same RN Web shell and can reveal an inspector/details column only when context exists. Keep one navigation model and change placement at breakpoints.
4. Make organization progressive: default Library shows view/layout/sort and a compact filter entry point; filter sheets expose common facets first; an “Advanced rules” route exposes all/any/is-not groups; selection mode owns bulk actions; item menus own edit/tag/folder/delete. Keep saved views and manual collections visibly distinct.
5. Add web/PWA rendering only after the shared primitives work at 390, 768, and 1280 CSS pixels. Validate keyboard focus and context menus on web, VoiceOver/TalkBack labels on native, reduced motion, dark/light/community themes, and the Home → Library → Search → Organize → Reader flows. Measure cold launch, scroll, and search on release builds before considering a library swap.

## Evidence boundaries

The product observations above come from each product's public documentation. They describe visible workflows and stated capabilities, not hands-on performance or visual pixel comparisons. The candidate-library claims come from the linked official documentation. The recommendation to retain Restyle, the token mapping, component inventory, breakpoints, and implementation order are Glassleaf-specific inferences from the current repository and product requirements.
