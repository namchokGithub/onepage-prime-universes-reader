# Cross-Volume Move — Design Spec

**Date:** 2026-05-14  
**Scope:** Allow arcs and chapters to be moved across volumes and arcs in the Arrange dialog.

---

## Problem

Current Arrange dialog supports only same-parent reordering via ArrowUp/ArrowDown buttons. Chapters cannot move between arcs; arcs cannot move between volumes.

---

## Solution Overview

Add a "Move to..." picker button per arc row and per chapter row in the Arrange dialog. A new `moveEntry` function in `contentRepository.ts` handles cross-parent document rewrites using the same batch-write + backup-copy pattern already used by `renameEntry`.

---

## Backend: `moveEntry` (`src/utils/contentRepository.ts`)

### Signature

```typescript
export async function moveEntry(
  catalog: Catalog,
  type: 'arc' | 'chapter',
  source: { vol: string; arc: string; chapter?: string },
  target: { vol: string; arc?: string },
): Promise<{ vol: string; arc: string; chapter: string }>
```

### Chapter move (`type === 'chapter'`)

1. Read source chapter document from Firestore.
2. Compute `newChapterOrder = max(chapterOrder across target arc chapters in catalog) + 1`. If target arc is empty, use `1`.
3. Batch:
   - `set` new document at ID `documentId(target.vol, target.arc, source.chapter)`
   - Payload: all existing fields with `volId`, `volTitle`, `volOrder`, `arcId`, `arcTitle`, `arcOrder`, `chapterOrder` updated to target values + `updatedAt: serverTimestamp()`
   - `copyChapterBackups(batch, source, { vol: target.vol, arc: target.arc!, chapter: source.chapter! })`
   - `delete` old document
4. Return `{ vol: target.vol, arc: target.arc!, chapter: source.chapter! }`.

### Arc move (`type === 'arc'`)

1. Query all chapter documents where `volId == source.vol && arcId == source.arc`.
2. Compute `newArcOrder = max(arcOrder across target vol arcs in catalog) + 1`. If target volume has no arcs, use `1`.
3. For each chapter document, batch:
   - `set` new document at ID `documentId(target.vol, source.arc, chapterId)`
   - Payload: all existing fields with `volId`, `volTitle`, `volOrder`, `arcOrder` updated + `updatedAt: serverTimestamp()`
   - `copyChapterBackups(batch, { vol: source.vol, arc: source.arc, chapter: chapterId }, { vol: target.vol, arc: source.arc, chapter: chapterId })`
   - `delete` old document
4. `batch.commit()`
5. Return `{ vol: target.vol, arc: source.arc, chapter: first chapter id }`.

### Order assignment rules

- Moved item always appends to end of target parent (no insert-at-position).
- No gaps or duplicates created — target items keep their existing order; moved item gets `max + 1`.

---

## UI: `AppLayout.tsx`

### New state

```typescript
type MoveDialog = {
  type: 'arc' | 'chapter';
  source: { vol: string; arc: string; chapter?: string };
  label: string;
} | null;

const [moveDialog, setMoveDialog] = useState<MoveDialog>(null);
```

### New handler

```typescript
const moveEntry = async (
  type: 'arc' | 'chapter',
  source: { vol: string; arc: string; chapter?: string },
  target: { vol: string; arc?: string },
) => {
  setIsReordering(true);
  try {
    const result = await moveContentEntry(catalog, type, source, target);
    await refreshCatalog();
    // if active chapter was moved, redirect to new path
    if (activeVol === source.vol && activeArc === source.arc &&
        (type === 'arc' || activeChapter === source.chapter)) {
      navigate(`/editor/${result.vol}/${result.arc}/${result.chapter}`);
    }
  } catch (error) {
    showMessage('Unable to move', (error as Error).message);
  } finally {
    setIsReordering(false);
    setMoveDialog(null);
  }
};
```

### Arrange dialog changes

- Add `FolderInput` icon button (from lucide-react) to each **arc row** and each **chapter row**, after existing ArrowDown button and before Pencil.
- `onClick`: `setMoveDialog({ type, source, label })` — does NOT close the Arrange dialog.
- Button disabled when `isReordering`.

### Move picker overlay

Rendered as a fixed overlay panel (same stacking/backdrop pattern as management dialogs) when `moveDialog !== null`.

**Chapter picker** — lists all arcs grouped by volume, excluding `source.arc`:

```
Move "Chapter 1" to:
  Vol. I: The End of Reality
    Arc 2: Nothing Changed      [Move here]
    Arc 3: The Change           [Move here]
  Vol. II: Chaos
    Arc 1: Visitor              [Move here]
```

**Arc picker** — lists all volumes, excluding `source.vol`:

```
Move "Arc 1: World Never Same" to:
  Vol. II: Chaos                [Move here]
```

- Each row has a "Move here" button that calls `moveEntry(...)` then closes.
- If no valid targets exist, show: *"No other volumes/arcs available."*
- Close (X) button returns to Arrange dialog without action.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Moving only arc out of a volume | Volume disappears from catalog after `refreshCatalog` |
| Moving to a volume with no existing arcs | `arcOrder = 1` |
| Moving to an arc with no chapters (impossible in current model — arcs require ≥1 chapter) | `chapterOrder = 1` |
| Active chapter is in moved arc | Redirect to new path after move |
| Source and target are the same | Button for current parent is not shown |

---

## Files Changed

| File | Change |
|------|--------|
| `src/utils/contentRepository.ts` | Add `moveEntry` export |
| `src/components/AppLayout.tsx` | Add `moveDialog` state, `moveEntry` handler, picker UI, Move buttons in Arrange dialog |

No new files. No changes to routing, store, or Firebase rules.

---

## Out of Scope

- Insert-at-position (drag to specific index)
- Moving volumes (not needed; volumes have no parent to move between)
- Undo/redo
