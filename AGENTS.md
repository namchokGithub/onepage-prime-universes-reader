# AGENTS.md — Page Prime Universes Reader

AI agent reference for this codebase. Read before making changes.

---

## Purpose

Web reader + editor for serialized Thai fiction. Two modes: **Reader** (public, read-only) and **Editor** (auth-gated, CRUD). Content lives in Firestore; UI is a static SPA deployed to GitHub Pages.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript 5.7 |
| Build | Vite 6 |
| Routing | React Router v7 |
| State (client) | Zustand 5 (persisted to `localStorage`) |
| Backend | Firebase Firestore (content) + Firebase Auth (editor gate) |
| UI primitives | shadcn/ui (Radix-based) + Tailwind CSS 3 |
| Icons | lucide-react |
| Markdown | `@uiw/react-md-editor` + `remark-breaks` |
| Fonts | Google Sans + Noto Sans Thai (self-hosted in `public/fonts/`) |
| Deploy | GitHub Pages via `.github/workflows/deploy.yml` |

---

## Folder Structure

```
src/
  App.tsx                  # Root: loads catalog, sets up Router
  main.tsx                 # Entry point
  components/
    AppLayout.tsx          # Shell: header, sidebar, modals, auth state
    BackupList.tsx         # Backup restore UI (used by EditorPage)
    ui/                    # shadcn/ui primitives (button, label, separator, textarea)
  hooks/
    useApplyTheme.ts       # Syncs Zustand theme → DOM (data-theme + .dark class)
  lib/
    firebase.ts            # Firebase init + isFirebaseConfigured guard
    utils.ts               # cn() helper (clsx + tailwind-merge)
  pages/
    ReaderPage.tsx         # Public reader view
    EditorPage.tsx         # Auth-gated editor view
  store/
    useReaderStore.ts      # Zustand store: theme, fontSize, lineHeight, bookmarks, progress
  styles/
    globals.css            # Tailwind base + CSS custom properties for themes
  utils/
    contentRepository.ts   # All Firestore ops: getCatalog, getChapterContent, CRUD
    fetchChapter.ts        # Thin wrapper: fetchChapter(vol, arc, chapter) → content string
    publicPath.ts          # resolvePublicPath() for Vite base-aware asset URLs
```

---

## Commands

```bash
npm run dev        # start Vite dev server
npm run build      # tsc -b && vite build (output to dist/)
npm run preview    # preview the production build
```

No test runner is configured.

---

## Environment

Copy `.env.example` to `.env.local` and fill in the six `VITE_FIREBASE_*` values from the Firebase console. Without them, `isFirebaseConfigured` in `src/lib/firebase.ts` returns `false` and all Firestore/Auth calls will throw.

---

## Architecture

### Data Model (Firestore)

**Collection:** `chapters`

**Document ID:** `encodeURIComponent(vol) + '__' + encodeURIComponent(arc) + '__' + encodeURIComponent(chapter)`

**Document fields:**
```
volId, volTitle, volOrder
arcId, arcTitle, arcOrder
chapterId, chapterTitle, chapterOrder
content       (Markdown string)
createdAt, updatedAt  (server timestamps)
```

**Subcollection:** `chapters/{id}/backups` — capped at 10 per chapter, ordered by `timestamp desc`.

**Segment format:** `vol-{N}-{slug}`, `arc-{N}-{slug}`, `ch-{N}[-{slug}]`. The numeric `N` drives sort order. `titleFromSegment()` derives display titles from slugs (volumes/arcs → Roman numeral prefix, chapters → "Chapter N: title").

### Content Data Flow

1. `App.tsx` calls `getCatalog()` on mount → builds `Catalog` tree (volumes → arcs → chapters) from full Firestore collection scan.
2. `Catalog` passed as prop to `AppLayout` → passed to child pages via React Router outlet context (`AppLayoutOutletContext`): `{ catalog, refreshCatalog, setEditorNavigationGuard }`.
3. `ReaderPage` calls `fetchChapter(vol, arc, chapter)` → `getChapterContent()` → single Firestore `getDoc` → renders Markdown via MDEditor preview + `remark-breaks`.
4. `EditorPage` reads and writes chapter content, manages backup subcollection → `saveChapterContent()` → Firestore `updateDoc`; `saveBackup()` → writes to backups subcollection, trims to `MAX_BACKUPS=10`.

All Firestore operations live in `src/utils/contentRepository.ts`:
`getCatalog`, `getChapterContent`, `saveChapterContent`, `createEntry`, `deleteEntry`, `renameEntry`, `reorderEntry`, `moveEntry`, `getBackups`, `saveBackup`.

### AppLayout

`AppLayout.tsx` owns the entire shell: sticky header with Reader/Editor nav and theme toggle, collapsible sidebar (library tree + bookmarks + continue-reading widget), and four modal dialogs (editor PIN/auth, create/delete/rename/reorder, save-before-navigate prompt, move picker). It also handles Firebase Auth state and the local PIN gate.

### Auth / PIN Gate

Editor requires:
1. Firebase Auth user with verified email (`isEditor()` in `firestore.rules`)
2. 6-digit PIN hardcoded in `AppLayout.tsx` as `EDITOR_PIN`

PIN state stored in `localStorage` with 24h expiry. 3 wrong PINs → cooldown.

### Routing

| Path | Component | Access |
|------|-----------|--------|
| `/` | redirect → first chapter reader path | public |
| `/read/:vol/:arc/:chapter` | `ReaderPage` | public |
| `/editor/:vol/:arc/:chapter` | `EditorPage` | PIN + Firebase Auth |
| `/editor` | `EditorPage` | redirected to first chapter |
| `*` | redirect → first reader path | public |

Base path: `/page-prime-universes-reader/` (Vite `base` config, GitHub Pages).

---

## Coding Conventions

- **No test runner** — verify correctness by running the dev server and testing in browser.
- **Path alias:** `@/` maps to `src/`. Always use it for imports, never relative `../../`.
- **Component co-location:** self-contained components go in `src/components/`. Page-specific logic stays in `src/pages/`.
- **No comments for obvious code.** Only comment non-obvious invariants or workarounds.
- **TypeScript strict mode** — no `any` unless unavoidable; use `satisfies` where type narrowing helps.
- **Tailwind + cn():** compose class names with `cn()` from `@/lib/utils`. Never inline style unless CSS vars or dynamic values require it.
- **shadcn/ui first:** use primitives from `src/components/ui/` before reaching for anything new.
- **Zustand actions in store:** all state mutations go through store actions, not direct `set()` calls from components.
- **Firestore ops in contentRepository only:** all reads/writes go through `src/utils/contentRepository.ts`. Pages and components call those exports; they do not import `firebase/firestore` directly.

---

## UI / UX Principles

- **Three themes:** `paper` (light), `night` (dark), `mint` (green tint). Applied as `data-theme` on `<html>` + `.dark` class. Theme persisted in Zustand store.
- **Typography controls:** fontSize (6 steps) and lineHeight (3 steps) in reader. Map to Tailwind classes defined in `ReaderPage.tsx`.
- **Sidebar:** collapsible. Contains library tree, bookmarks list, continue-reading widget. State local to `AppLayout`.
- **Mobile-first layout.** Sidebar overlays on small screens. Header is sticky.
- **No unnecessary animations.** Use `tailwindcss-animate` only for modal transitions.
- **Accessible button labels** — use lucide icons with `aria-label` when icon-only.

---

## Firebase / Security

**Firestore rules** (`firestore.rules`):
- `chapters`: read = public, write = verified Firebase Auth user only
- `chapters/*/backups`: read + write = verified Firebase Auth user only

Deploy rule changes: `firebase deploy --only firestore:rules`

---

## Git / GitHub Workflow

- **Main branch:** `main` — production. Direct pushes for small fixes OK; PRs preferred for features.
- **Branch naming:** `feat/`, `fix/`, `chore/` prefixes.
- **Deploy:** push to `main` triggers `.github/workflows/deploy.yml` → builds → publishes to GitHub Pages.
- **No secrets in commits.** `.env.local` is gitignored; `.env.example` has placeholder keys only.

---

## Rules for AI Agents

1. **Preserve architecture.** `contentRepository.ts` owns all Firestore ops. `AppLayout.tsx` owns shell + auth state. `useReaderStore` owns client preferences. Do not scatter these responsibilities.

2. **No unnecessary refactors.** Fix the specific thing asked. Leave surrounding code unchanged unless it directly causes the problem.

3. **Reuse before creating.** Check `src/components/ui/`, `src/utils/`, `src/lib/utils.ts`, and `useReaderStore` before writing new abstractions.

4. **Keep Firestore calls in contentRepository.** Adding a new Firestore operation? It goes in `contentRepository.ts` as an exported async function. Pages call it; they do not import `firebase/firestore` directly.

5. **Segment format is load-bearing.** Document IDs encode vol/arc/chapter with `encodeURIComponent` + `__` separator. Sort order comes from the numeric `N` in segment prefixes. Do not change this scheme without updating all dependent code.

6. **Catalog is derived, not persisted.** `getCatalog()` scans Firestore on mount. It is not cached between page loads. Mutations (create/rename/reorder/delete/move) must call `refreshCatalog()` from outlet context afterward.

7. **Theme is a three-way cycle:** `paper → night → mint → paper`. `toggleTheme()` in the store. Do not add themes without updating `globals.css`, `useApplyTheme.ts`, and the store's `normalizeTheme()`.

8. **Backup cap is MAX_BACKUPS=10.** `saveBackup()` trims stale entries. Do not change this without considering Firestore write costs.

9. **Update this file** when adding routes, changing the Firestore data model, introducing new utilities, or altering the auth flow.

10. **No WebSockets.** This app uses Firestore one-shot reads (`getDoc`/`getDocs`), not realtime listeners. Do not add `onSnapshot` unless there is a clear UX requirement.
