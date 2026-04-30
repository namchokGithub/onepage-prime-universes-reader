import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { Download, FileText, Upload } from "lucide-react";
import { useParams } from "react-router-dom";
import { BackupList } from "@/components/BackupList";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useReaderStore } from "@/store/useReaderStore";
import { Backup, getBackups, restoreBackup, saveBackup } from "@/utils/backup";
import { getChapterContent, getChapterTitle } from "@/utils/contentCatalog";

export function EditorPage() {
  const { vol, arc, chapter } = useParams();
  const theme = useReaderStore((state) => state.theme);
  const [value, setValue] = useState<string>("");
  const [fileName, setFileName] = useState("Untitled chapter");
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasEditorChangedRef = useRef(false);

  useEffect(() => {
    setBackups(getBackups());
  }, []);

  useEffect(() => {
    if (!vol || !arc || !chapter) return;

    let active = true;
    setLoadError(null);

    getChapterContent(vol, arc, chapter)
      .then((content) => {
        if (!active) return;
        setFileName(`${getChapterTitle(vol, arc, chapter)}.md`);
        setValue(content);
      })
      .catch((error: Error) => {
        if (!active) return;
        setLoadError(error.message);
        setFileName("Untitled chapter");
        setValue("");
      });

    return () => {
      active = false;
    };
  }, [arc, chapter, vol]);

  useEffect(() => {
    if (!hasEditorChangedRef.current) {
      hasEditorChangedRef.current = true;
      return;
    }

    const backupTimer = window.setTimeout(() => {
      setBackups(saveBackup(value));
    }, 1000);

    return () => window.clearTimeout(backupTimer);
  }, [value]);

  const wordCount = useMemo(
    () => value.trim().split(/\s+/).filter(Boolean).length,
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

    const reader = new FileReader();
    reader.onload = () => {
      setFileName(file.name);
      setValue(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsText(file);
  };

  const handleSaveFile = () => {
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

  const handleRestoreBackup = (index: number) => {
    const restoredContent = restoreBackup(index);

    if (restoredContent === null) return;
    setValue(restoredContent);
  };

  return (
    <section className="w-full animate-in fade-in duration-300">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-md border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Browser-only Markdown editor</p>
            <h1 className="truncate text-2xl font-semibold">{fileName}</h1>
            {vol && arc && chapter ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {vol} / {arc} / {chapter}.md
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
              onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Load .md
            </Button>
            <Button type="button" onClick={handleSaveFile}>
              <Download className="h-4 w-4" />
              Save
            </Button>
            <BackupList backups={backups} onRestore={handleRestoreBackup} />
          </div>
        </div>

        {loadError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="min-w-0 overflow-hidden rounded-md border bg-card">
            <div className="flex min-h-12 items-center justify-between gap-3 border-b px-4 py-3">
              <Label htmlFor="markdown-editor" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Editor
              </Label>
              <span className="text-sm text-muted-foreground">{wordCount} words</span>
            </div>

            <div data-color-mode={theme}>
              <MDEditor
                id="markdown-editor"
                value={value}
                onChange={(nextValue) => setValue(nextValue ?? "")}
                preview="edit"
                height={680}
                textareaProps={{
                  placeholder: "Load a .md file or start writing Markdown...",
                }}
              />
            </div>
          </div>

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
                <MDEditor.Markdown source={value} />
              ) : (
                <p className="text-sm text-muted-foreground">Preview will appear here.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
