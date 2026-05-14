# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start Vite dev server
npm run build      # tsc -b && vite build (output to dist/)
npm run preview    # preview the production build
```

No test runner is configured.

## Environment

Copy `.env.example` to `.env.local` and fill in the six `VITE_FIREBASE_*` values from the Firebase console. Without them, `isFirebaseConfigured` in [src/lib/firebase.ts](src/lib/firebase.ts) returns `false` and all Firestore/Auth calls will throw.

## Architecture

This is a two-mode SPA: **Reader** (`/read/:vol/:arc/:chapter`) and **Editor** (`/editor/:vol/:arc/:chapter`).

### Data model (Firestore)

All content lives in the `chapters` Firestore collection. Document IDs are `encodeURIComponent(vol) + '__' + encodeURIComponent(arc) + '__' + encodeURIComponent(chapter)`.

Each document stores `volId`, `arcId`, `chapterId` (the URL segments), `*Title` display strings, `*Order` sort numbers, and `content` (Markdown). Backups live in the `chapters/{id}/backups` subcollection, capped at 10 per chapter.

Segment format: `vol-{N}-{slug}`, `arc-{N}-{slug}`, `ch-{N}[-{slug}]`. The numeric `N` drives sort order; titles are derived from the slug via `titleFromSegment()` in [src/utils/contentRepository.ts](src/utils/contentRepository.ts).

### Content data flow

1. `App.tsx` calls `getCatalog()` on mount → builds the `Catalog` tree (volumes → arcs → chapters) from a full Firestore collection scan.
2. `Catalog` is passed as a prop to `AppLayout`, which passes `{ catalog, refreshCatalog, setEditorNavigationGuard }` to child pages via React Router outlet context (`AppLayoutOutletContext`).
3. `ReaderPage` calls `fetchChapter(vol, arc, chapter)` → `getChapterContent()` → single Firestore `getDoc`.
4. `EditorPage` reads and writes chapter content plus manages the backup subcollection.

All Firestore operations are in [src/utils/contentRepository.ts](src/utils/contentRepository.ts): `getCatalog`, `getChapterContent`, `saveChapterContent`, `createEntry`, `deleteEntry`, `renameEntry`, `reorderEntry`, `getBackups`, `saveBackup`.

### AppLayout

`AppLayout.tsx` owns the entire shell: sticky header with Reader/Editor nav and theme toggle, collapsible sidebar (library tree + bookmarks + continue-reading widget), and four modal dialogs (editor PIN/auth, create/delete/rename/reorder, save-before-navigate prompt). It also handles Firebase Auth state and the local PIN gate.

**Editor auth**: accessing `/editor` requires a verified Firebase Auth user **and** a 6-digit PIN. The PIN is hardcoded in `AppLayout.tsx` (`EDITOR_PIN`). PIN auth is stored in `localStorage` with a 24-hour expiry. After 3 wrong PINs a cooldown is applied.

### Reader store (Zustand)

[src/store/useReaderStore.ts](src/store/useReaderStore.ts) — persisted to `localStorage` under key `onepage-reader-preferences`. Stores:
- `theme`: `"paper" | "night" | "mint"` (applied as `data-theme` on `<html>` + `.dark` class)
- `fontSize` / `lineHeight`: reader typography settings
- `bookmarks`: local bookmark list with `scrollY`, `percent`, optional `note`, and display titles
- `readingProgress`: single last-known position used for the "Continue reading" feature

`useApplyTheme()` hook syncs the store's `theme` to the DOM.

### Routing

| Path | Component | Notes |
|------|-----------|-------|
| `/` | → redirect | to first chapter reader path |
| `/read/:vol/:arc/:chapter` | `ReaderPage` | public |
| `/editor/:vol/:arc/:chapter` | `EditorPage` | PIN + Firebase Auth gated |
| `/editor` | `EditorPage` | redirected to first chapter if catalog non-empty |
| `*` | → redirect | to first reader path |

### Path/URL utilities

[src/utils/publicPath.ts](src/utils/publicPath.ts) — helpers for resolving public asset paths in the Vite build. [src/lib/utils.ts](src/lib/utils.ts) — `cn()` (clsx + tailwind-merge).

### UI components

shadcn/ui primitives live in [src/components/ui/](src/components/ui/). The project uses Tailwind CSS with the animate plugin. Fonts are Google Sans (Latin) and Noto Sans Thai, served from `public/fonts/`.

## Deployment

Builds to `dist/`. Designed for GitHub Pages (static hosting). The deploy workflow is at [.github/workflows/deploy.yml](.github/workflows/deploy.yml). Firestore security rules are in `firestore.rules` — deploy them with the Firebase CLI when changing access rules.
