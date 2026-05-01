import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import remarkBreaks from "remark-breaks";
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileText,
  RotateCcw,
  Save,
  Upload,
  XCircle,
} from "lucide-react";
import { useOutletContext, useParams } from "react-router-dom";
import { BackupList } from "@/components/BackupList";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useReaderStore } from "@/store/useReaderStore";
import { Backup, getBackups, restoreBackup, saveBackup } from "@/utils/backup";
import {
  getChapterContent,
  getChapterTitle,
  saveChapterContent,
} from "@/utils/contentRepository";
import type { AppLayoutOutletContext } from "@/components/AppLayout";

type MarkdownFileHandle = {
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<{
    write: (data: BlobPart) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type FilePickerWindow = Window &
  typeof globalThis & {
    showOpenFilePicker?: (options?: unknown) => Promise<MarkdownFileHandle[]>;
  };

type SaveNotice = {
  type: "success" | "error";
  message: string;
};

type BackupConfirm = {
  index: number;
  content: string;
};

type WordSegment = {
  segment: string;
  isWordLike?: boolean;
};

type IntlWordSegmenter = {
  segment: (input: string) => Iterable<WordSegment>;
};

const IntlWithSegmenter = Intl as typeof Intl & {
  Segmenter?: new (
    locales?: string | string[],
    options?: { granularity?: "word" },
  ) => IntlWordSegmenter;
};

function countWords(text: string) {
  const trimmedText = text.trim();

  if (!trimmedText) return 0;

  if (IntlWithSegmenter.Segmenter) {
    const segmenter = new IntlWithSegmenter.Segmenter(["th", "en"], {
      granularity: "word",
    });

    return Array.from(segmenter.segment(trimmedText)).filter(
      (segment) => segment.isWordLike,
    ).length;
  }

  return trimmedText.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

export function EditorPage() {
  const { vol, arc, chapter } = useParams();
  const { catalog, refreshCatalog, setEditorNavigationGuard } =
    useOutletContext<AppLayoutOutletContext>();
  const theme = useReaderStore((state) => state.theme);
  const [value, setValue] = useState<string>("");
  const [fileName, setFileName] = useState("Untitled chapter");
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasWritableFile, setHasWritableFile] = useState(false);
  const [saveNotice, setSaveNotice] = useState<SaveNotice | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [selectedBackupIndex, setSelectedBackupIndex] = useState(0);
  const [pendingBackupConfirm, setPendingBackupConfirm] =
    useState<BackupConfirm | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileHandleRef = useRef<MarkdownFileHandle | null>(null);
  const savedValueRef = useRef("");

  const fileKey = useMemo(() => {
    if (vol && arc && chapter) return `${vol}/${arc}/${chapter}`;

    return fileName ? `file:${fileName}` : undefined;
  }, [arc, chapter, fileName, vol]);

  useEffect(() => {
    setBackups(getBackups(fileKey));
    setSelectedBackupIndex(0);
  }, [fileKey]);

  useEffect(() => {
    if (!vol || !arc || !chapter) return;

    let active = true;
    setLoadError(null);

    getChapterContent(vol, arc, chapter)
      .then((content) => {
        if (!active) return;
        fileHandleRef.current = null;
        setHasWritableFile(false);
        setFileName(`${getChapterTitle(catalog, vol, arc, chapter)}.md`);
        savedValueRef.current = content;
        setValue(content);
      })
      .catch((error: Error) => {
        if (!active) return;
        fileHandleRef.current = null;
        setHasWritableFile(false);
        setLoadError(error.message);
        setFileName("Untitled chapter");
        savedValueRef.current = "";
        setValue("");
      });

    return () => {
      active = false;
    };
  }, [arc, catalog, chapter, vol]);

  useEffect(() => {
    if (!saveNotice) return;

    const noticeTimer = window.setTimeout(() => {
      setSaveNotice(null);
    }, 3200);

    return () => window.clearTimeout(noticeTimer);
  }, [saveNotice]);

  const wordCount = useMemo(
    () => countWords(value),
    [value],
  );

  const handleFileLoad = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".md")) {
      window.alert("Please upload a .md file.");
      event.target.value = "";
      return;
    }

    fileHandleRef.current = null;
    setHasWritableFile(false);
    const reader = new FileReader();
    reader.onload = () => {
      const nextValue = typeof reader.result === "string" ? reader.result : "";
      setFileName(file.name);
      savedValueRef.current = nextValue;
      setValue(nextValue);
    };
    reader.readAsText(file);
  };

  const handleLoadFileClick = async () => {
    const pickerWindow = window as FilePickerWindow;

    if (!pickerWindow.showOpenFilePicker) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const [fileHandle] = await pickerWindow.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Markdown files",
            accept: { "text/markdown": [".md"] },
          },
        ],
      });

      const file = await fileHandle.getFile();
      fileHandleRef.current = fileHandle;
      setHasWritableFile(true);
      setFileName(file.name);
      const nextValue = await file.text();
      savedValueRef.current = nextValue;
      setValue(nextValue);
      setLoadError(null);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        setLoadError("Unable to open the selected file.");
      }
    }
  };

  const handleSaveToFile = useCallback(async () => {
    try {
      const fileHandle = fileHandleRef.current;

      if (fileHandle) {
        const writable = await fileHandle.createWritable();
        await writable.write(value);
        await writable.close();
        setBackups(saveBackup(fileKey, value));
        savedValueRef.current = value;
        setLoadError(null);
        setSaveNotice({ type: "success", message: `Saved ${fileName}` });
        return true;
      }

      if (vol && arc && chapter) {
        await saveChapterContent(vol, arc, chapter, value);
        await refreshCatalog();
        savedValueRef.current = value;
        setBackups(saveBackup(fileKey, value));
        setLoadError(null);
        setSaveNotice({ type: "success", message: `Saved ${fileName}` });
        return true;
      }

      const message =
        "Open a Firebase chapter before saving, or use Download to export.";
      setLoadError(message);
      setSaveNotice({ type: "error", message });
      return false;
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        const message = "Unable to save the file.";
        setLoadError(message);
        setSaveNotice({ type: "error", message });
      }
      return false;
    }
  }, [arc, chapter, fileKey, fileName, refreshCatalog, value, vol]);

  const handleDownloadFile = () => {
    const blob = new Blob([value], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `chapter-${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const applyBackupContent = (content: string, index: number) => {
    setValue(content);
    setSelectedBackupIndex(index);
  };

  const handleSelectBackup = (index: number) => {
    const restoredContent = restoreBackup(fileKey, index);

    if (restoredContent === null) return;

    if (value !== savedValueRef.current) {
      setPendingBackupConfirm({ index, content: restoredContent });
      return;
    }

    applyBackupContent(restoredContent, index);
  };

  const handleRestoreBackup = (index: number) => {
    const restoredContent = restoreBackup(fileKey, index);

    if (restoredContent === null) return;

    if (value !== savedValueRef.current) {
      setPendingBackupConfirm({
        index,
        content: restoredContent,
      });
      return;
    }

    applyBackupContent(restoredContent, index);
  };

  const confirmBackupChange = () => {
    if (!pendingBackupConfirm) return;

    applyBackupContent(pendingBackupConfirm.content, pendingBackupConfirm.index);
    setPendingBackupConfirm(null);
  };

  useEffect(() => {
    setEditorNavigationGuard({
      hasUnsavedChanges: value !== savedValueRef.current,
      save: handleSaveToFile,
    });

    return () => setEditorNavigationGuard(null);
  }, [handleSaveToFile, setEditorNavigationGuard, value]);

  return (
    <section className="w-full animate-in fade-in duration-300">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-md border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              Browser-only Markdown editor
            </p>
            <h1 className="truncate text-2xl font-semibold">{fileName}</h1>
            {vol && arc && chapter ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {vol} / {arc} / {chapter}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              id="markdown-file"
              type="file"
              accept=".md"
              onChange={handleFileLoad}
              className="sr-only"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleLoadFileClick}>
              <Upload className="h-4 w-4" />
              Import .md
            </Button>
            <Button
              type="button"
              onClick={handleSaveToFile}
              title={
                hasWritableFile
                  ? "Save changes to the opened file"
                  : "Save changes to the current Firebase chapter"
              }>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadFile}>
              <Download className="h-4 w-4" />
              Download
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPreview((isVisible) => !isVisible)}
              title={showPreview ? "Hide preview" : "Show preview"}>
              {showPreview ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              {showPreview ? "Hide Preview" : "Show Preview"}
            </Button>
            <BackupList
              backups={backups}
              selectedIndex={selectedBackupIndex}
              onSelect={handleSelectBackup}
              onRestore={handleRestoreBackup}
            />
          </div>
        </div>
        {pendingBackupConfirm ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="backup-confirm-title"
              className="w-full max-w-md rounded-md border bg-card p-5 text-card-foreground shadow-xl">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2
                    id="backup-confirm-title"
                    className="text-lg font-semibold">
                    Load backup version?
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    You have unsaved changes. Loading this backup will replace
                    the current editor content.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPendingBackupConfirm(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={confirmBackupChange}>
                  Load Backup
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {loadError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </p>
        ) : null}
        <div className={cn("grid gap-5", showPreview ? "lg:grid-cols-2" : "")}>
          <div className="min-w-0 overflow-hidden rounded-md border bg-card">
            <div className="flex min-h-12 items-center justify-between gap-3 border-b px-4 py-3">
              <Label
                htmlFor="markdown-editor"
                className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Editing... {fileName}
              </Label>
              <span className="text-sm text-muted-foreground">
                {wordCount} words
              </span>
            </div>

            <div data-color-mode={theme}>
              <MDEditor
                id="markdown-editor"
                value={value}
                onChange={(nextValue) => setValue(nextValue ?? "")}
                commandsFilter={(command) =>
                  command.keyCommand === "image" ? false : command
                }
                preview="edit"
                height={680}
                textareaProps={{
                  placeholder: "Open a Firebase chapter or start writing Markdown...",
                }}
              />
            </div>
          </div>

          {showPreview ? (
            <div className="min-w-0 overflow-hidden rounded-md border bg-card">
              <div className="flex min-h-12 items-center border-b px-4 py-3">
                <Label>Preview</Label>
              </div>
              <div
                data-color-mode={theme}
                className={cn(
                  "min-h-[680px] p-6",
                  theme === "dark" ? "bg-[#0d1117]" : "bg-white",
                )}>
                {value.trim() ? (
                  <MDEditor.Markdown
                    source={value}
                    remarkPlugins={[remarkBreaks]}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Preview will appear here.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>
        {saveNotice ? (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "fixed right-5 top-5 z-50 flex w-[min(420px,calc(100vw-2.5rem))] items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-lg",
              saveNotice.type === "success"
                ? "border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}>
            {saveNotice.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0 break-words">{saveNotice.message}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
