# Product Progress

## Session — 2026-05-14

### Work Done

**`CLAUDE.md` initialized** via `/init`

Analyzed full codebase and wrote `CLAUDE.md` to document:
- Dev/build/preview commands (`npm run dev`, `npm run build`, `npm run preview`)
- Firebase env setup (6 × `VITE_FIREBASE_*` vars from `.env.example`)
- Firestore data model — `chapters` collection, document ID format, backup subcollection
- Content data flow: catalog scan on mount → outlet context → per-chapter `getDoc`
- `AppLayout` role: shell, sidebar, all modals, Firebase Auth + PIN gate
- Zustand reader store: what persists, how theme applies to DOM
- Route table
- Deployment target: GitHub Pages + `firestore.rules`

---

## Implemented Features (from git log)

| Feature | Branch/Commit |
|---------|--------------|
| Bookmark system | `feat/bookmark` |
| Reading progress tracking + continue reading | committed to main |
| Chapter navigation (prev/next buttons) | committed to main |
| Theme presets (paper / night / mint) | committed to main |

---

## Architecture Decisions

| Decision | Detail |
|----------|--------|
| Single Firestore collection for all chapters | `chapters` collection; no sub-collections for volumes/arcs — hierarchy inferred from `volId`/`arcId` fields on each document |
| Document ID = encoded path segments | `encodeURIComponent(vol) + '__' + encodeURIComponent(arc) + '__' + encodeURIComponent(chapter)` — enables direct lookup without query |
| Order stored on every document | `volOrder`, `arcOrder`, `chapterOrder` fields written on create/reorder — catalog sort done client-side after full scan |
| Backups as subcollection, capped at 10 | `chapters/{id}/backups`, pruned on every save; `knownBackups` param avoids extra read when editor already has the list |
| Auth = Firebase Auth (email+password, verified) + hardcoded 6-digit PIN | Two-factor gate: cloud identity verifies who, PIN gates local access. PIN auth stored in `localStorage` with 24h expiry |
| Reader state in Zustand with `persist` | Bookmarks, progress, theme, font, line-height — all local, no cloud sync for reader preferences |
| Theme applied via `data-theme` + `.dark` on `<html>` | `useApplyTheme()` hook; Tailwind `dark:` variant responds to `.dark` class |
| Scroll position stored in `localStorage` per chapter | Key `reader-scroll:{vol}/{arc}/{chapter}` — avoids URL pollution while still resuming position |
| Chapter navigation resets saved scroll to 0 | Intentional: prev/next buttons always open destination from top, independent of any prior resume position |
| Rename = new Firestore document + delete old | No Firestore document rename API; rename copies data + backups to new ID then deletes old. Local bookmarks synced to new path by `syncLocalBookmarksAfterRename` |
| No test runner configured | Project is a personal/small-team reader; no unit/integration tests exist |

---

## Session — 2026-05-15

### Work Done

**`AGENT.md` created** — AI agent reference doc for this codebase covering purpose, stack, folder structure, architecture (catalog flow, read/edit/auth flows), coding conventions, environment setup, UI/UX principles, Firebase security, Git workflow, and 10 rules for AI agents.

**Cross-volume move feature implemented** (uncommitted, pending manual review)

Added ability to move arcs between volumes and chapters between arcs via a "Move to..." picker button in the Arrange library dialog.

Files changed:
- `src/utils/contentRepository.ts` — new `moveEntry(catalog, type, source, target)` export
- `src/components/AppLayout.tsx` — `MoveDialog` type, `moveDialog` state, `handleMoveEntry` handler, Move buttons in arc/chapter rows, Move picker overlay UI

### Decisions Made

| Decision | Detail |
|----------|--------|
| Move via picker, not drag-and-drop | "Move to..." button + target list chosen over HTML5 drag events — simpler, same result, fits existing arrow-button pattern |
| `moveEntry` is a new function, not extending `reorderEntry` | Cross-parent semantics are different from up/down swap; separate function keeps `reorderEntry` clean |
| Moved item appends to end of target | `chapterOrder` / `arcOrder` = Firestore-queried max + 1; no insert-at-position. Avoids order collision without extra complexity |
| Fresh Firestore query for max order (not catalog) | Catalog `chapterOrder`/`arcOrder` can be stale after reorders (segment encodes original order, not current). One extra read per move is worth correctness |
| Move picker uses `z-[60]`, stays on top of Arrange dialog | Arrange dialog is `z-50`; move picker overlays it so user can cancel and return — no close-arrange-then-open-picker round-trip |
| Arc move preserves `arcId` segment | Only `volId`/`volTitle`/`volOrder`/`arcOrder` change; arc segment and title carry over unchanged |
| Redirect on active content moved | If active chapter (or its arc) was moved, URL updates to new path using same reader/editor prefix |
| Batch size limit not chunked | Pre-existing pattern from `renameEntry`/`deleteEntry`; arcs in this project stay small (< 20 chapters). Noted as known limitation |

### Artifacts

- Spec: `docs/superpowers/specs/2026-05-14-cross-volume-move-design.md`
- Plan: `docs/superpowers/plans/2026-05-14-cross-volume-move.md`

---

## Roadmap Status (from README)

- [x] Bookmark system
- [x] Reading progress tracking
- [x] Continue reading
- [x] Chapter navigation UX
- [x] Theme presets
- [ ] ~~Search (client-side index)~~ — removed from roadmap
