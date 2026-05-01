import { FormEvent, MouseEvent, useEffect, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FilePenLine,
  KeyRound,
  Menu,
  Moon,
  Pencil,
  Plus,
  Save,
  Sun,
  Trash2,
} from "lucide-react";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useApplyTheme } from "@/hooks/useApplyTheme";
import { useReaderStore } from "@/store/useReaderStore";
import { cn } from "@/lib/utils";
import {
  getCatalog,
  getFirstEditorPath,
  getFirstReaderPath,
} from "@/utils/contentCatalog";

type EditorNavigationGuard = {
  hasUnsavedChanges: boolean;
  save: () => Promise<boolean>;
};

type CreateEntryType = "volume" | "arc" | "chapter";

type DeleteEntryType = CreateEntryType;

type CreatedEntry = {
  vol: string;
  arc: string;
  chapter: string;
};

type CreateEntryContext = {
  vol?: string;
  arc?: string;
};

type DeleteEntryContext = CreateEntryContext & {
  chapter?: string;
  label: string;
};

type RenameEntryContext = DeleteEntryContext;

type ManagementDialog =
  | {
      type: "create";
      entryType: CreateEntryType;
      context: CreateEntryContext;
      title: string;
      value: string;
    }
  | {
      type: "delete";
      entryType: DeleteEntryType;
      context: DeleteEntryContext;
    }
  | {
      type: "rename";
      entryType: DeleteEntryType;
      context: RenameEntryContext;
      value: string;
    }
  | {
      type: "message";
      title: string;
      message: string;
    };

type EditorPinState = {
  failedAttempts: number;
  lockouts: number;
  cooldownUntil: number;
};

const EDITOR_PIN = "885522";
const EDITOR_PIN_AUTH_KEY = "onepage-editor-pin-auth";
const EDITOR_PIN_STATE_KEY = "onepage-editor-pin-state";
const PIN_ATTEMPTS_BEFORE_COOLDOWN = 3;
const FIRST_PIN_COOLDOWN_MS = 3 * 60 * 1000;
const NEXT_PIN_COOLDOWN_MS = 5 * 60 * 1000;
const EDITOR_PIN_AUTH_MS = 24 * 60 * 60 * 1000;
const CAN_USE_LOCAL_EDITOR = import.meta.env.DEV;

function getStoredEditorPinAuth() {
  try {
    const rawAuth = localStorage.getItem(EDITOR_PIN_AUTH_KEY);
    if (!rawAuth) return false;

    const parsed = JSON.parse(rawAuth) as { expiresAt?: number };
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(EDITOR_PIN_AUTH_KEY);
      return false;
    }

    return true;
  } catch {
    localStorage.removeItem(EDITOR_PIN_AUTH_KEY);
    return false;
  }
}

function setStoredEditorPinAuth() {
  localStorage.setItem(
    EDITOR_PIN_AUTH_KEY,
    JSON.stringify({ expiresAt: Date.now() + EDITOR_PIN_AUTH_MS }),
  );
}

function getStoredEditorPinState(): EditorPinState {
  const fallback = {
    failedAttempts: 0,
    lockouts: 0,
    cooldownUntil: 0,
  };

  try {
    const rawState = localStorage.getItem(EDITOR_PIN_STATE_KEY);
    if (!rawState) return fallback;

    const parsed = JSON.parse(rawState) as Partial<EditorPinState>;
    return {
      failedAttempts: Number(parsed.failedAttempts) || 0,
      lockouts: Number(parsed.lockouts) || 0,
      cooldownUntil: Number(parsed.cooldownUntil) || 0,
    };
  } catch {
    return fallback;
  }
}

function setStoredEditorPinState(state: EditorPinState) {
  localStorage.setItem(EDITOR_PIN_STATE_KEY, JSON.stringify(state));
}

function formatCooldown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getEditableTitle(label: string) {
  return label
    .replace(/^[IVXLCDM]+\.\s+/i, "")
    .replace(/^Chapter\s+\d+:\s*/i, "")
    .replace(/^Chapter\s+\d+$/i, "")
    .trim();
}

function getTitleValidation(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.length < 2) {
    return "This field should be at least 2 characters.";
  }

  if (trimmedValue.length > 80) {
    return "Its length should be <= 80.";
  }

  if (/[\\/:*?"<>|]/.test(trimmedValue)) {
    return 'Avoid these characters: \\ / : * ? " < > |';
  }

  return null;
}

function getDialogDescription(dialog: ManagementDialog) {
  if (dialog.type === "create") {
    if (dialog.entryType === "volume") {
      return "Create a new volume folder with its first arc and Chapter 1.";
    }

    return "Create a new arc folder inside the current volume with Chapter 1.";
  }

  if (dialog.type === "rename") {
    if (dialog.entryType === "chapter") {
      return "Rename this chapter file. The chapter number stays the same.";
    }

    return `Rename this ${dialog.entryType} folder and keep its contents.`;
  }

  return "";
}

function getDialogGuide(dialog: ManagementDialog) {
  if (dialog.type !== "create" && dialog.type !== "rename") return [];

  const examples =
    dialog.entryType === "volume"
      ? "Example: The End of Truth"
      : dialog.entryType === "arc"
        ? "Example: The World Changed"
        : "Example: A Quiet Beginning";

  return [
    examples,
    "Use a readable title only; numbering is handled automatically.",
    'Avoid: \\ / : * ? " < > |',
  ];
}

export type AppLayoutOutletContext = {
  setEditorNavigationGuard: (guard: EditorNavigationGuard | null) => void;
};

export function AppLayout() {
  useApplyTheme();

  const theme = useReaderStore((state) => state.theme);
  const toggleTheme = useReaderStore((state) => state.toggleTheme);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editorNavigationGuard, setEditorNavigationGuard] =
    useState<EditorNavigationGuard | null>(null);
  const [pendingReadPath, setPendingReadPath] = useState<string | null>(null);
  const [isSavingBeforeRead, setIsSavingBeforeRead] = useState(false);
  const [managementDialog, setManagementDialog] =
    useState<ManagementDialog | null>(null);
  const [isManagementBusy, setIsManagementBusy] = useState(false);
  const [isEditorUnlocked, setIsEditorUnlocked] = useState(
    getStoredEditorPinAuth,
  );
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinState, setPinState] = useState(getStoredEditorPinState);
  const [pinNow, setPinNow] = useState(Date.now());
  const [collapsedVolumeIds, setCollapsedVolumeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const location = useLocation();
  const navigate = useNavigate();
  const {
    vol: activeVol,
    arc: activeArc,
    chapter: activeChapter,
  } = useParams();
  const isReadRoute = location.pathname.startsWith("/read/");
  const isEditorRoute = location.pathname.startsWith("/editor");
  const shouldLockEditor =
    isEditorRoute && CAN_USE_LOCAL_EDITOR && !isEditorUnlocked;
  const canUseEditorControls =
    isEditorRoute && isEditorUnlocked && CAN_USE_LOCAL_EDITOR;
  const pinCooldownMs = Math.max(0, pinState.cooldownUntil - pinNow);
  const catalog = getCatalog();
  const firstReaderPath = getFirstReaderPath();
  const firstEditorPath = getFirstEditorPath();
  const currentVolume =
    catalog.volumes.find((volume) => volume.id === activeVol) ??
    catalog.volumes[0];
  const currentArc =
    currentVolume?.arcs.find((arc) => arc.id === activeArc) ??
    currentVolume?.arcs[0];

  useEffect(() => {
    if (isEditorRoute) {
      setIsEditorUnlocked(getStoredEditorPinAuth());
      return;
    }

    setPinValue("");
    setPinError("");
  }, [isEditorRoute]);

  useEffect(() => {
    if (!shouldLockEditor || pinCooldownMs <= 0) return;

    const interval = window.setInterval(() => {
      setPinNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [pinCooldownMs, shouldLockEditor]);

  useEffect(() => {
    if (!activeVol) return;

    setCollapsedVolumeIds((currentIds) => {
      if (!currentIds.has(activeVol)) return currentIds;

      const nextIds = new Set(currentIds);
      nextIds.delete(activeVol);
      return nextIds;
    });
  }, [activeVol]);

  const topNavClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "border border-transparent",
      isActive &&
        "border-primary/30 bg-accent text-accent-foreground shadow-sm",
    );

  const reloadToEditorPath = async (path: string) => {
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    window.location.assign(
      `${window.location.pathname}?t=${Date.now()}#${path}`,
    );
  };

  const showMessage = (title: string, message: string) => {
    setManagementDialog({ type: "message", title, message });
  };

  const isActiveEntryDeleted = (
    type: DeleteEntryType,
    context: DeleteEntryContext,
  ) => {
    if (type === "volume") return activeVol === context.vol;
    if (type === "arc") {
      return activeVol === context.vol && activeArc === context.arc;
    }

    return (
      activeVol === context.vol &&
      activeArc === context.arc &&
      activeChapter === context.chapter
    );
  };

  const getClientNextPathAfterDelete = (
    type: DeleteEntryType,
    context: DeleteEntryContext,
  ) => {
    const chapters = catalog.volumes.flatMap((volume) =>
      volume.arcs.flatMap((arc) => arc.chapters),
    );
    const remainingChapter = chapters.find((chapter) => {
      if (type === "volume") return chapter.vol !== context.vol;
      if (type === "arc") {
        return chapter.vol !== context.vol || chapter.arc !== context.arc;
      }

      return (
        chapter.vol !== context.vol ||
        chapter.arc !== context.arc ||
        chapter.chapter !== context.chapter
      );
    });

    return "/editor";
  };

  const getFirstChapterPathInSameArcAfterDelete = (
    context: DeleteEntryContext,
  ) => {
    const arc = catalog.volumes
      .find((volume) => volume.id === context.vol)
      ?.arcs.find((catalogArc) => catalogArc.id === context.arc);
    const firstChapter = arc?.chapters.find(
      (chapter) => chapter.chapter !== context.chapter,
    );

    return firstChapter
      ? `/editor/${firstChapter.vol}/${firstChapter.arc}/${firstChapter.chapter}`
      : null;
  };

  const requestReadNavigation = (
    event: MouseEvent<HTMLAnchorElement>,
    path: string,
  ) => {
    if (!isEditorRoute || !editorNavigationGuard?.hasUnsavedChanges) return;

    event.preventDefault();
    setPendingReadPath(path);
  };

  const continueWithoutSaving = () => {
    if (!pendingReadPath) return;

    setPendingReadPath(null);
    navigate(pendingReadPath);
  };

  const saveAndContinue = async () => {
    if (!pendingReadPath || !editorNavigationGuard) return;

    setIsSavingBeforeRead(true);
    const didSave = await editorNavigationGuard.save();
    setIsSavingBeforeRead(false);

    if (!didSave) return;

    const nextPath = pendingReadPath;
    setPendingReadPath(null);
    navigate(nextPath);
  };

  const requestCreateEntry = (
    type: CreateEntryType,
    context: CreateEntryContext = {},
  ) => {
    if (type === "chapter") {
      void createEntry(type, context);
      return;
    }

    setManagementDialog({
      type: "create",
      entryType: type,
      context,
      title: type === "volume" ? "New Volume" : "New Arc",
      value: type === "volume" ? "New volume" : "New arc",
    });
  };

  const createEntry = async (
    type: CreateEntryType,
    context: CreateEntryContext = {},
    title?: string,
  ) => {
    if (editorNavigationGuard?.hasUnsavedChanges) {
      const didSave = await editorNavigationGuard.save();

      if (!didSave) {
        showMessage(
          "Unable to save",
          "Save the current chapter before creating.",
        );
        return;
      }
    }

    if (type !== "chapter" && !title?.trim()) return;

    const selectedVol = context.vol ?? currentVolume?.id;
    const selectedArc = context.arc ?? currentArc?.id;

    if (type === "arc" && !selectedVol) {
      showMessage("Missing volume", "Create a volume before adding an arc.");
      return;
    }

    if (type === "chapter" && (!selectedVol || !selectedArc)) {
      showMessage("Missing arc", "Create an arc before adding a chapter.");
      return;
    }

    try {
      const response = await fetch("/__editor/create-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title,
          vol: selectedVol,
          arc: selectedArc,
        }),
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(error?.message ?? "Unable to create entry.");
      }

      const created = (await response.json()) as CreatedEntry;
      await reloadToEditorPath(
        `/editor/${created.vol}/${created.arc}/${created.chapter}`,
      );
    } catch (error) {
      showMessage("Unable to create", (error as Error).message);
    }
  };

  const requestDeleteEntry = (
    type: DeleteEntryType,
    context: DeleteEntryContext,
  ) => {
    setManagementDialog({ type: "delete", entryType: type, context });
  };

  const deleteEntry = async (
    type: DeleteEntryType,
    context: DeleteEntryContext,
  ) => {
    try {
      const response = await fetch("/__editor/delete-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          vol: context.vol,
          arc: context.arc,
          chapter: context.chapter,
        }),
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(error?.message ?? "Unable to delete entry.");
      }

      const result = (await response.json().catch(() => null)) as {
        nextEditorPath?: string;
      } | null;
      const currentPath =
        activeVol && activeArc && activeChapter
          ? `/editor/${activeVol}/${activeArc}/${activeChapter}`
          : firstEditorPath;
      const nextPath =
        type === "chapter"
          ? (getFirstChapterPathInSameArcAfterDelete(context) ??
            result?.nextEditorPath ??
            getClientNextPathAfterDelete(type, context))
          : isActiveEntryDeleted(type, context)
            ? (result?.nextEditorPath ??
              getClientNextPathAfterDelete(type, context))
            : currentPath;

      await reloadToEditorPath(nextPath);
    } catch (error) {
      showMessage("Unable to delete", (error as Error).message);
    }
  };

  const requestRenameEntry = (
    type: DeleteEntryType,
    context: RenameEntryContext,
  ) => {
    setManagementDialog({
      type: "rename",
      entryType: type,
      context,
      value: getEditableTitle(context.label),
    });
  };

  const renameEntry = async (
    type: DeleteEntryType,
    context: RenameEntryContext,
    title: string,
  ) => {
    if (editorNavigationGuard?.hasUnsavedChanges) {
      const didSave = await editorNavigationGuard.save();

      if (!didSave) {
        showMessage(
          "Unable to save",
          "Save the current chapter before renaming.",
        );
        return;
      }
    }

    if (!title.trim()) return;

    try {
      const response = await fetch("/__editor/rename-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title,
          vol: context.vol,
          arc: context.arc,
          chapter: context.chapter,
        }),
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(error?.message ?? "Unable to rename entry.");
      }

      const renamed = (await response.json()) as CreatedEntry;
      await reloadToEditorPath(
        renamed.vol && renamed.arc && renamed.chapter
          ? `/editor/${renamed.vol}/${renamed.arc}/${renamed.chapter}`
          : "/editor",
      );
    } catch (error) {
      showMessage("Unable to rename", (error as Error).message);
    }
  };

  const submitManagementDialog = async () => {
    if (!managementDialog || managementDialog.type === "message") {
      setManagementDialog(null);
      return;
    }

    if (
      (managementDialog.type === "create" ||
        managementDialog.type === "rename") &&
      getTitleValidation(managementDialog.value)
    ) {
      return;
    }

    setIsManagementBusy(true);

    if (managementDialog.type === "create") {
      await createEntry(
        managementDialog.entryType,
        managementDialog.context,
        managementDialog.value,
      );
    } else if (managementDialog.type === "delete") {
      await deleteEntry(managementDialog.entryType, managementDialog.context);
    } else {
      await renameEntry(
        managementDialog.entryType,
        managementDialog.context,
        managementDialog.value,
      );
    }

    setIsManagementBusy(false);
  };

  const submitEditorPin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (pinCooldownMs > 0) return;

    if (pinValue === EDITOR_PIN) {
      setStoredEditorPinAuth();
      localStorage.removeItem(EDITOR_PIN_STATE_KEY);
      setIsEditorUnlocked(true);
      setPinValue("");
      setPinError("");
      setPinState({
        failedAttempts: 0,
        lockouts: 0,
        cooldownUntil: 0,
      });
      return;
    }

    const failedAttempts = pinState.failedAttempts + 1;

    if (failedAttempts >= PIN_ATTEMPTS_BEFORE_COOLDOWN) {
      const lockouts = pinState.lockouts + 1;
      const cooldownMs =
        lockouts === 1 ? FIRST_PIN_COOLDOWN_MS : NEXT_PIN_COOLDOWN_MS;
      const nextState = {
        failedAttempts: 0,
        lockouts,
        cooldownUntil: Date.now() + cooldownMs,
      };

      setStoredEditorPinState(nextState);
      setPinState(nextState);
      setPinNow(Date.now());
      setPinError(
        `Wrong PIN 3 times. Try again in ${formatCooldown(cooldownMs)}.`,
      );
    } else {
      const nextState = {
        ...pinState,
        failedAttempts,
      };
      const attemptsLeft = PIN_ATTEMPTS_BEFORE_COOLDOWN - failedAttempts;

      setStoredEditorPinState(nextState);
      setPinState(nextState);
      setPinError(
        `Wrong PIN. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left.`,
      );
    }

    setPinValue("");
  };

  const toggleVolumeCollapsed = (volumeId: string) => {
    setCollapsedVolumeIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(volumeId)) {
        nextIds.delete(volumeId);
      } else {
        nextIds.add(volumeId);
      }

      return nextIds;
    });
  };

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div
          className={cn(
            "mx-auto flex h-16 w-full items-center justify-between px-4",
            isEditorRoute ? "max-w-[1600px]" : "max-w-screen-2xl",
          )}>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen((value) => !value)}
              aria-label="Toggle navigation">
              <Menu className="h-5 w-5" />
            </Button>
            <NavLink
              to={firstReaderPath}
              onClick={(event) => requestReadNavigation(event, firstReaderPath)}
              className="text-lg font-semibold">
              One Page Universe
            </NavLink>
          </div>

          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <NavLink
                to={firstReaderPath}
                onClick={(event) =>
                  requestReadNavigation(event, firstReaderPath)
                }
                className={isReadRoute ? topNavClass : "disabled"}>
                <BookOpen className="h-4 w-4" />
                Reader
              </NavLink>
            </Button>
            {CAN_USE_LOCAL_EDITOR ? (
              <Button asChild variant="ghost" size="sm">
                <NavLink
                  to={firstEditorPath}
                  className={!isReadRoute ? topNavClass : "disabled"}>
                  <FilePenLine className="h-4 w-4" />
                  Editor
                </NavLink>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme">
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </nav>
        </div>
      </header>

      <div
        className={cn(
          "mx-auto grid w-full grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]",
          isEditorRoute ? "max-w-[1600px]" : "max-w-screen-2xl",
        )}>
        <aside
          className={cn(
            "border-b bg-background px-4 py-4 md:sticky md:top-16 md:block md:max-h-[calc(100vh-4rem)] md:overflow-y-auto md:border-b-0 md:border-r",
            sidebarOpen ? "block" : "hidden",
          )}>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Library
                </p>
                {canUseEditorControls ? (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => requestCreateEntry("volume")}
                      title="Add volume">
                      <Plus className="h-3.5 w-3.5" />
                      Vol
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => requestCreateEntry("arc")}
                      title="Add arc">
                      <Plus className="h-3.5 w-3.5" />
                      Arc
                    </Button>
                  </div>
                ) : null}
              </div>
              <Separator className="mt-3" />
            </div>
            {catalog.volumes.length === 0 ? (
              <p className="rounded-md border p-3 text-sm text-muted-foreground">
                Add .md files under src/content/vol-1/arc-1.
              </p>
            ) : null}
            {catalog.volumes.map((volume) => {
              const isCollapsed = collapsedVolumeIds.has(volume.id);

              return (
              <div key={volume.id} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1 rounded-md py-1 pr-2 text-left font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => toggleVolumeCollapsed(volume.id)}
                    aria-expanded={!isCollapsed}
                    aria-controls={`volume-${volume.id}-items`}>
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">{volume.title}</span>
                  </button>
                  {canUseEditorControls ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        onClick={() =>
                          requestRenameEntry("volume", {
                            vol: volume.id,
                            arc:
                              volume.id === activeVol
                                ? activeArc
                                : volume.arcs[0]?.id,
                            chapter:
                              volume.id === activeVol
                                ? activeChapter
                                : volume.arcs[0]?.chapters[0]?.chapter,
                            label: volume.title,
                          })
                        }
                        title="Rename volume">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          requestDeleteEntry("volume", {
                            vol: volume.id,
                            label: volume.title,
                          })
                        }
                        title="Delete volume">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div
                  id={`volume-${volume.id}-items`}
                  className={cn("space-y-3", isCollapsed && "hidden")}>
                  {volume.arcs.map((arc) => (
                    <div key={arc.id} className="space-y-2 pl-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 text-sm text-muted-foreground">
                        {arc.title}
                      </p>
                      {canUseEditorControls ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() =>
                              requestRenameEntry("arc", {
                                vol: volume.id,
                                arc: arc.id,
                                chapter:
                                  volume.id === activeVol &&
                                  arc.id === activeArc
                                    ? activeChapter
                                    : arc.chapters[0]?.chapter,
                                label: arc.title,
                              })
                            }
                            title="Rename arc">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              requestDeleteEntry("arc", {
                                vol: volume.id,
                                arc: arc.id,
                                label: arc.title,
                              })
                            }
                            title="Delete arc">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      {arc.chapters.map((chapter) => (
                        <div
                          key={`${chapter.vol}-${chapter.arc}-${chapter.chapter}`}
                          className="flex items-center gap-1">
                          <NavLink
                            to={
                              isEditorRoute
                                ? `/editor/${chapter.vol}/${chapter.arc}/${chapter.chapter}`
                                : `/read/${chapter.vol}/${chapter.arc}/${chapter.chapter}`
                            }
                            onClick={() => setSidebarOpen(false)}
                            className={({ isActive }) =>
                              cn(
                                "min-w-0 flex-1 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
                                isActive && "bg-accent text-accent-foreground",
                              )
                            }>
                            {chapter.title}
                          </NavLink>
                          {canUseEditorControls ? (
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                onClick={() =>
                                  requestRenameEntry("chapter", {
                                    vol: chapter.vol,
                                    arc: chapter.arc,
                                    chapter: chapter.chapter,
                                    label: chapter.title,
                                  })
                                }
                                title="Rename chapter">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  requestDeleteEntry("chapter", {
                                    vol: chapter.vol,
                                    arc: chapter.arc,
                                    chapter: chapter.chapter,
                                    label: chapter.title,
                                  })
                                }
                                title="Delete chapter">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {canUseEditorControls ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-full justify-start px-3 text-muted-foreground"
                          onClick={() =>
                            requestCreateEntry("chapter", {
                              vol: volume.id,
                              arc: arc.id,
                            })
                          }>
                          <Plus className="h-3.5 w-3.5" />
                          Chapter
                        </Button>
                      ) : null}
                    </div>
                    </div>
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        </aside>

        <main
          className={cn(
            "min-w-0 px-4 py-8",
            isEditorRoute ? "md:px-6" : "md:px-8",
          )}>
          {shouldLockEditor ? (
            <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Enter the editor PIN to continue.
            </div>
          ) : (
            <Outlet context={{ setEditorNavigationGuard }} />
          )}
        </main>
      </div>
      {shouldLockEditor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-pin-title"
            className="w-full max-w-sm rounded-md border bg-card p-5 text-card-foreground shadow-xl"
            onSubmit={submitEditorPin}>
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <KeyRound className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="editor-pin-title" className="text-lg font-semibold">
                  Editor PIN
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enter the 6 digit PIN to edit content.
                </p>
              </div>
            </div>

            <label className="mt-5 block">
              <span className="sr-only">Editor PIN</span>
              <div className="relative">
                <div className="grid grid-cols-6 gap-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className={cn(
                        "flex aspect-square items-center justify-center rounded-md border bg-background text-lg font-semibold",
                        pinValue.length === index &&
                          pinCooldownMs <= 0 &&
                          "border-primary ring-2 ring-ring",
                      )}>
                      {pinValue[index] ? "•" : ""}
                    </div>
                  ))}
                </div>
                <input
                  value={pinValue}
                  onChange={(event) => {
                    setPinValue(
                      event.target.value.replace(/\D/g, "").slice(0, 6),
                    );
                    setPinError("");
                  }}
                  className="absolute inset-0 h-full w-full cursor-text opacity-0"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  disabled={pinCooldownMs > 0}
                />
              </div>
            </label>

            {pinCooldownMs > 0 ? (
              <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Try again in {formatCooldown(pinCooldownMs)}.
              </p>
            ) : pinError ? (
              <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {pinError}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(firstReaderPath)}>
                Back to Reader
              </Button>
              <Button
                type="submit"
                disabled={pinValue.length < 6 || pinCooldownMs > 0}>
                Unlock
              </Button>
            </div>
          </form>
        </div>
      ) : null}
      {managementDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="management-dialog-title"
            className="w-full max-w-xl rounded-md border bg-card p-6 text-card-foreground shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              void submitManagementDialog();
            }}>
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "rounded-md p-2",
                  managementDialog.type === "delete"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary",
                )}>
                {managementDialog.type === "delete" ? (
                  <Trash2 className="h-5 w-5" />
                ) : managementDialog.type === "rename" ? (
                  <Pencil className="h-5 w-5" />
                ) : managementDialog.type === "create" ? (
                  <Plus className="h-5 w-5" />
                ) : (
                  <Save className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="management-dialog-title"
                  className="text-lg font-semibold">
                  {managementDialog.type === "create"
                    ? managementDialog.title
                    : managementDialog.type === "rename"
                      ? `Rename ${managementDialog.entryType}`
                      : managementDialog.type === "delete"
                        ? `Delete ${managementDialog.entryType}`
                        : managementDialog.title}
                </h2>
                {managementDialog.type !== "message" &&
                managementDialog.type !== "delete" ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {getDialogDescription(managementDialog)}
                  </p>
                ) : null}
                {managementDialog.type === "message" ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {managementDialog.message}
                  </p>
                ) : managementDialog.type === "delete" ? (
                  <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                    <p>
                      Delete "{managementDialog.context.label}" from
                      src/content?
                    </p>
                    {editorNavigationGuard?.hasUnsavedChanges ? (
                      <p className="text-destructive">
                        Unsaved editor changes will be discarded.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <label className="mt-4 block text-sm">
                    <span className="font-medium">
                      {managementDialog.type === "create"
                        ? "Title"
                        : "New name"}
                    </span>
                    <input
                      value={managementDialog.value}
                      onChange={(event) =>
                        setManagementDialog({
                          ...managementDialog,
                          value: event.target.value,
                        })
                      }
                      className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                      autoFocus
                    />
                    <div className="mt-3 space-y-1 text-xs">
                      {getDialogGuide(managementDialog).map((guide) => (
                        <p
                          key={guide}
                          className="text-muted-foreground before:mr-1 before:content-['>']">
                          {guide}
                        </p>
                      ))}
                      {getTitleValidation(managementDialog.value) ? (
                        <p className="text-destructive before:mr-1 before:content-['>']">
                          {getTitleValidation(managementDialog.value)}
                        </p>
                      ) : null}
                    </div>
                  </label>
                )}
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {managementDialog.type !== "message" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setManagementDialog(null)}
                  disabled={isManagementBusy}>
                  Cancel
                </Button>
              ) : null}
              <Button
                type={managementDialog.type === "message" ? "button" : "submit"}
                variant={
                  managementDialog.type === "delete" ? "destructive" : "default"
                }
                onClick={
                  managementDialog.type === "message"
                    ? () => setManagementDialog(null)
                    : undefined
                }
                disabled={
                  isManagementBusy ||
                  (managementDialog.type !== "delete" &&
                    managementDialog.type !== "message" &&
                    Boolean(getTitleValidation(managementDialog.value)))
                }>
                {isManagementBusy
                  ? "Working..."
                  : managementDialog.type === "delete"
                    ? "Delete"
                    : managementDialog.type === "rename"
                      ? "Rename"
                      : managementDialog.type === "create"
                        ? "Create"
                        : "OK"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
      {pendingReadPath ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-before-read-title"
            className="w-full max-w-md rounded-md border bg-card p-5 text-card-foreground shadow-xl">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Save className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="save-before-read-title"
                  className="text-lg font-semibold">
                  Save before reading?
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  You have unsaved changes in the editor. Save them before
                  switching to Reader?
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={continueWithoutSaving}
                disabled={isSavingBeforeRead}>
                No
              </Button>
              <Button
                type="button"
                onClick={saveAndContinue}
                disabled={isSavingBeforeRead}>
                {isSavingBeforeRead ? "Saving..." : "Yes, save"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
