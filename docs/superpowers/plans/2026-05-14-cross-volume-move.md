# Cross-Volume Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow arcs and chapters to be moved across volumes/arcs via a "Move to..." picker button in the Arrange dialog.

**Architecture:** New `moveEntry` export in `contentRepository.ts` rewrites Firestore document IDs using batch writes + backup copy (same pattern as `renameEntry`). AppLayout gets a `moveDialog` state, a `handleMoveEntry` handler, Move buttons per arc/chapter row, and a picker overlay that lists valid targets.

**Tech Stack:** React 19, TypeScript, Firebase Firestore (batch writes), lucide-react icons, Tailwind CSS.

> **No test runner configured.** Verification steps use `npm run build` for type-checking and manual browser testing via `npm run dev`.

---

### Task 1: Add `moveEntry` to `contentRepository.ts`

**Files:**
- Modify: `src/utils/contentRepository.ts` (append after `reorderEntry` at line 916)

- [ ] **Step 1: Add the `moveEntry` function**

Append after the closing `}` of `reorderEntry` (end of file, line 916):

```typescript
export async function moveEntry(
  catalog: Catalog,
  type: "arc" | "chapter",
  source: { vol: string; arc: string; chapter?: string },
  target: { vol: string; arc?: string },
): Promise<{ vol: string; arc: string; chapter: string }> {
  const db = getFirebaseDb();

  if (type === "chapter") {
    if (!source.chapter || !target.arc) {
      throw new Error("Missing chapter or target arc");
    }

    const sourceRef = chapterReference(source.vol, source.arc, source.chapter);
    const snapshot = await getDoc(sourceRef);
    if (!snapshot.exists()) throw new Error("Chapter not found");

    const current = normalizeChapterDocument(
      snapshot.data() as Partial<ChapterDocument>,
    );

    // Query actual chapterOrder values from target arc to avoid stale catalog order
    const targetArcSnapshot = await getDocs(
      query(
        collection(db, CHAPTERS_COLLECTION),
        where("volId", "==", target.vol),
        where("arcId", "==", target.arc),
        orderBy("chapterOrder", "desc"),
        limit(1),
      ),
    );
    const maxChapterOrder = targetArcSnapshot.empty
      ? 0
      : Number(
          (targetArcSnapshot.docs[0].data() as Partial<ChapterDocument>)
            .chapterOrder ?? 0,
        );
    const newChapterOrder = maxChapterOrder + 1;

    const targetVolume = catalog.volumes.find((v) => v.id === target.vol);
    const targetArc = targetVolume?.arcs.find((a) => a.id === target.arc);
    const targetVolTitle =
      targetVolume?.title ?? titleFromSegment(target.vol, "Volume");
    const targetArcTitle =
      targetArc?.title ?? titleFromSegment(target.arc, "Arc");

    const batch = writeBatch(db);
    batch.set(
      doc(
        db,
        CHAPTERS_COLLECTION,
        documentId(target.vol, target.arc, source.chapter),
      ),
      {
        ...current,
        volId: target.vol,
        volTitle: targetVolTitle,
        volOrder: parseOrder(target.vol, "vol"),
        arcId: target.arc,
        arcTitle: targetArcTitle,
        arcOrder: parseOrder(target.arc, "arc"),
        chapterOrder: newChapterOrder,
        updatedAt: serverTimestamp(),
      },
    );
    await copyChapterBackups(
      batch,
      { vol: source.vol, arc: source.arc, chapter: source.chapter },
      { vol: target.vol, arc: target.arc, chapter: source.chapter },
    );
    batch.delete(sourceRef);
    await batch.commit();

    return { vol: target.vol, arc: target.arc, chapter: source.chapter };
  }

  // type === "arc": move all chapters in source arc to target volume
  const targetVolume = catalog.volumes.find((v) => v.id === target.vol);

  // Query actual arcOrder values from target volume to avoid stale catalog order
  const targetVolSnapshot = await getDocs(
    query(
      collection(db, CHAPTERS_COLLECTION),
      where("volId", "==", target.vol),
      orderBy("arcOrder", "desc"),
      limit(1),
    ),
  );
  const maxArcOrder = targetVolSnapshot.empty
    ? 0
    : Number(
        (targetVolSnapshot.docs[0].data() as Partial<ChapterDocument>)
          .arcOrder ?? 0,
      );
  const newArcOrder = maxArcOrder + 1;

  const targetVolTitle =
    targetVolume?.title ?? titleFromSegment(target.vol, "Volume");
  const targetVolOrder = parseOrder(target.vol, "vol");

  const arcSnapshot = await getDocs(
    query(
      collection(db, CHAPTERS_COLLECTION),
      where("volId", "==", source.vol),
      where("arcId", "==", source.arc),
    ),
  );

  if (arcSnapshot.empty) throw new Error("Arc has no chapters");

  const batch = writeBatch(db);
  for (const chapterSnapshot of arcSnapshot.docs) {
    const current = normalizeChapterDocument(
      chapterSnapshot.data() as Partial<ChapterDocument>,
    );
    batch.set(
      doc(
        db,
        CHAPTERS_COLLECTION,
        documentId(target.vol, source.arc, current.chapterId),
      ),
      {
        ...current,
        volId: target.vol,
        volTitle: targetVolTitle,
        volOrder: targetVolOrder,
        arcOrder: newArcOrder,
        updatedAt: serverTimestamp(),
      },
    );
    await copyChapterBackups(
      batch,
      { vol: source.vol, arc: source.arc, chapter: current.chapterId },
      { vol: target.vol, arc: source.arc, chapter: current.chapterId },
    );
    batch.delete(chapterSnapshot.ref);
  }
  await batch.commit();

  const firstChapterId = normalizeChapterDocument(
    arcSnapshot.docs[0].data() as Partial<ChapterDocument>,
  ).chapterId;

  return { vol: target.vol, arc: source.arc, chapter: firstChapterId };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: build succeeds, no type errors. Fix any errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/utils/contentRepository.ts
git commit -m "feat(content): add moveEntry for cross-volume arc and chapter moves"
```

---

### Task 2: Add imports, state, and handler to `AppLayout.tsx`

**Files:**
- Modify: `src/components/AppLayout.tsx`

- [ ] **Step 1: Add `FolderInput` to the lucide-react import block**

Find this line (around line 28):
```typescript
  Trash2,
  X,
} from "lucide-react";
```

Replace with:
```typescript
  Trash2,
  X,
  FolderInput,
} from "lucide-react";
```

- [ ] **Step 2: Add `moveEntry` to the contentRepository import block**

Find (around line 43–51):
```typescript
  reorderEntry as reorderContentEntry,
  ReorderDirection,
} from "@/utils/contentRepository";
```

Replace with:
```typescript
  reorderEntry as reorderContentEntry,
  moveEntry as moveContentEntry,
  ReorderDirection,
} from "@/utils/contentRepository";
```

- [ ] **Step 3: Add `MoveDialog` type above the component function**

Find this block (around line 54):
```typescript
type EditorNavigationGuard = {
  hasUnsavedChanges: boolean;
  save: () => Promise<boolean>;
};
```

Replace with:
```typescript
type EditorNavigationGuard = {
  hasUnsavedChanges: boolean;
  save: () => Promise<boolean>;
};

type MoveDialog = {
  type: "arc" | "chapter";
  source: { vol: string; arc: string; chapter?: string };
  label: string;
} | null;
```

- [ ] **Step 4: Add `moveDialog` state inside the component**

Find (around line 285):
```typescript
  const [isArrangeDialogOpen, setIsArrangeDialogOpen] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
```

Replace with:
```typescript
  const [isArrangeDialogOpen, setIsArrangeDialogOpen] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [moveDialog, setMoveDialog] = useState<MoveDialog>(null);
```

- [ ] **Step 5: Add `handleMoveEntry` handler after the existing `reorderEntry` handler**

Find (around line 895):
```typescript
    setIsReordering(false);
    }
  };

  const submitEditorPin = async (event: FormEvent<HTMLFormElement>) => {
```

Replace with:
```typescript
    setIsReordering(false);
    }
  };

  const handleMoveEntry = async (
    type: "arc" | "chapter",
    source: { vol: string; arc: string; chapter?: string },
    target: { vol: string; arc?: string },
  ) => {
    if (editorNavigationGuard?.hasUnsavedChanges) {
      const didSave = await editorNavigationGuard.save();

      if (!didSave) {
        showMessage(
          "Unable to save",
          "Save the current chapter before moving.",
        );
        return;
      }
    }

    setIsReordering(true);
    try {
      const result = await moveContentEntry(catalog, type, source, target);
      await refreshCatalog();

      const affectsActiveContent =
        activeVol === source.vol &&
        activeArc === source.arc &&
        (type === "arc" || activeChapter === source.chapter);

      if (affectsActiveContent) {
        const prefix = isEditorRoute ? "/editor" : "/read";
        navigate(`${prefix}/${result.vol}/${result.arc}/${result.chapter}`);
      }
    } catch (error) {
      showMessage("Unable to move", (error as Error).message);
    } finally {
      setIsReordering(false);
      setMoveDialog(null);
    }
  };

  const submitEditorPin = async (event: FormEvent<HTMLFormElement>) => {
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npm run build
```

Expected: build succeeds. Fix any errors before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/components/AppLayout.tsx
git commit -m "feat(layout): add moveDialog state and handleMoveEntry handler"
```

---

### Task 3: Add Move buttons to arc and chapter rows in the Arrange dialog

**Files:**
- Modify: `src/components/AppLayout.tsx`

- [ ] **Step 1: Add Move button to each arc row**

Find this exact block (around line 1827 — the Pencil/rename button for arcs):
```typescript
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground"
                                  onClick={() => {
                                    setIsArrangeDialogOpen(false);
                                    requestRenameEntry("arc", {
                                      vol: volume.id,
                                      arc: arc.id,
```

Insert this block BEFORE it (between the ArrowDown button's closing tag and the Pencil button):
```typescript
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground"
                                  onClick={() =>
                                    setMoveDialog({
                                      type: "arc",
                                      source: {
                                        vol: volume.id,
                                        arc: arc.id,
                                      },
                                      label: arc.title,
                                    })
                                  }
                                  disabled={
                                    isReordering ||
                                    catalog.volumes.length < 2
                                  }
                                  title="Move arc to another volume">
                                  <FolderInput className="h-3.5 w-3.5" />
                                </Button>
```

The surrounding context to make the insertion unambiguous — this goes between `</Button>` (ArrowDown) and `<Button` (Pencil/rename) for arcs:

Replace:
```typescript
                                  title="Move arc down">
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground"
                                  onClick={() => {
                                    setIsArrangeDialogOpen(false);
                                    requestRenameEntry("arc", {
```

With:
```typescript
                                  title="Move arc down">
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground"
                                  onClick={() =>
                                    setMoveDialog({
                                      type: "arc",
                                      source: {
                                        vol: volume.id,
                                        arc: arc.id,
                                      },
                                      label: arc.title,
                                    })
                                  }
                                  disabled={
                                    isReordering ||
                                    catalog.volumes.length < 2
                                  }
                                  title="Move arc to another volume">
                                  <FolderInput className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground"
                                  onClick={() => {
                                    setIsArrangeDialogOpen(false);
                                    requestRenameEntry("arc", {
```

- [ ] **Step 2: Add Move button to each chapter row**

Find this exact block (around line 1927 — the Pencil/rename button for chapters):

Replace:
```typescript
                                      title="Move chapter down">
                                      <ArrowDown className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground"
                                      onClick={() => {
                                        setIsArrangeDialogOpen(false);
                                        requestRenameEntry("chapter", {
```

With:
```typescript
                                      title="Move chapter down">
                                      <ArrowDown className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground"
                                      onClick={() =>
                                        setMoveDialog({
                                          type: "chapter",
                                          source: {
                                            vol: chapter.vol,
                                            arc: chapter.arc,
                                            chapter: chapter.chapter,
                                          },
                                          label: chapter.title,
                                        })
                                      }
                                      disabled={
                                        isReordering ||
                                        catalog.volumes.flatMap((v) => v.arcs)
                                          .length < 2
                                      }
                                      title="Move chapter to another arc">
                                      <FolderInput className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground"
                                      onClick={() => {
                                        setIsArrangeDialogOpen(false);
                                        requestRenameEntry("chapter", {
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppLayout.tsx
git commit -m "feat(layout): add Move buttons to arc and chapter rows in Arrange dialog"
```

---

### Task 4: Add Move picker overlay UI

**Files:**
- Modify: `src/components/AppLayout.tsx`

- [ ] **Step 1: Add the move picker overlay between the Arrange dialog and management dialog**

Find (around line 1984–1985):
```typescript
      ) : null}
      {managementDialog ? (
```

Replace with:
```typescript
      ) : null}
      {moveDialog ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:px-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-dialog-title"
            className="flex max-h-[70dvh] w-full flex-col rounded-t-md border bg-card text-card-foreground shadow-xl sm:max-h-[min(500px,calc(100vh-2rem))] sm:max-w-md sm:rounded-md">
            <div className="flex items-start justify-between gap-4 border-b px-4 py-4">
              <div className="min-w-0">
                <h2
                  id="move-dialog-title"
                  className="text-lg font-semibold capitalize">
                  Move {moveDialog.type}
                </h2>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {moveDialog.label}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setMoveDialog(null)}
                aria-label="Close move dialog">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {moveDialog.type === "arc" ? (
                (() => {
                  const targets = catalog.volumes.filter(
                    (v) => v.id !== moveDialog.source.vol,
                  );

                  if (targets.length === 0) {
                    return (
                      <p className="text-sm text-muted-foreground">
                        No other volumes available.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-1">
                      {targets.map((vol) => (
                        <button
                          key={vol.id}
                          type="button"
                          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                          disabled={isReordering}
                          onClick={() =>
                            void handleMoveEntry(
                              "arc",
                              moveDialog.source,
                              { vol: vol.id },
                            )
                          }>
                          <span className="font-medium">{vol.title}</span>
                          <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                            Move here
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })()
              ) : (
                (() => {
                  const groups = catalog.volumes
                    .map((vol) => ({
                      vol,
                      arcs: vol.arcs.filter(
                        (a) =>
                          !(
                            a.id === moveDialog.source.arc &&
                            vol.id === moveDialog.source.vol
                          ),
                      ),
                    }))
                    .filter((g) => g.arcs.length > 0);

                  if (groups.length === 0) {
                    return (
                      <p className="text-sm text-muted-foreground">
                        No other arcs available.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {groups.map(({ vol, arcs }) => (
                        <div key={vol.id}>
                          <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {vol.title}
                          </p>
                          <div className="space-y-1">
                            {arcs.map((arc) => (
                              <button
                                key={arc.id}
                                type="button"
                                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                                disabled={isReordering}
                                onClick={() =>
                                  void handleMoveEntry(
                                    "chapter",
                                    moveDialog.source,
                                    { vol: vol.id, arc: arc.id },
                                  )
                                }>
                                <span>{arc.title}</span>
                                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                                  Move here
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
          </section>
        </div>
      ) : null}
      {managementDialog ? (
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/AppLayout.tsx
git commit -m "feat(layout): add Move picker overlay for cross-volume arc and chapter moves"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open Arrange dialog and verify Move buttons appear**

Open the editor, click the Arrange button. Confirm:
- Each arc row now has a `FolderInput` icon button between ArrowDown and Pencil
- Each chapter row now has a `FolderInput` icon button between ArrowDown and Pencil
- Arc Move button is disabled when only one volume exists
- Chapter Move button is disabled when only one arc exists across all volumes

- [ ] **Step 3: Test chapter move**

With ≥2 arcs available:
1. Click Move on a chapter
2. Verify picker opens listing all arcs except the current one, grouped by volume
3. Click "Move here" on a target arc
4. Verify picker closes, catalog refreshes, chapter appears at end of target arc
5. Verify original arc no longer contains the chapter
6. If moved chapter was active in editor: verify URL updates to new path

- [ ] **Step 4: Test arc move**

With ≥2 volumes available:
1. Click Move on an arc
2. Verify picker opens listing all volumes except current
3. Click "Move here" on a target volume
4. Verify picker closes, catalog refreshes, arc appears in target volume
5. Verify original volume no longer contains the arc
6. If original volume had only that one arc: verify the volume disappears from catalog

- [ ] **Step 5: Test edge cases**

- Cancel (X) dismisses picker, no changes made
- Moving while unsaved editor changes prompts save first
- Moving last arc out of a volume removes that volume from the sidebar

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add src/utils/contentRepository.ts src/components/AppLayout.tsx
git commit -m "fix: address issues found during manual move feature verification"
```

---

## File Change Summary

| File | What changes |
|------|-------------|
| `src/utils/contentRepository.ts` | Add `moveEntry` export (~80 lines) |
| `src/components/AppLayout.tsx` | Add `FolderInput` import, `moveEntry` import, `MoveDialog` type, `moveDialog` state, `handleMoveEntry` handler, Move buttons in arc/chapter rows, move picker overlay |
