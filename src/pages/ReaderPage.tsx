import { CSSProperties, useEffect, useMemo, useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-markdown-preview/markdown.css";
import { useParams } from "react-router-dom";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchChapter } from "@/utils/fetchChapter";
import { getCatalog } from "@/utils/contentCatalog";
import {
  ReaderFontSize,
  ReaderLineHeight,
  useReaderStore,
} from "@/store/useReaderStore";
import { cn } from "@/lib/utils";

const fontSizeClass: Record<ReaderFontSize, string> = {
  small: "text-base",
  medium: "text-lg",
  large: "text-xl",
};

const markdownFontSize: Record<ReaderFontSize, CSSProperties["fontSize"]> = {
  small: "1rem",
  medium: "1.125rem",
  large: "1.25rem",
};

const lineHeightClass: Record<ReaderLineHeight, string> = {
  compact: "leading-7",
  normal: "leading-8",
  relaxed: "leading-10",
};

const markdownLineHeight: Record<
  ReaderLineHeight,
  CSSProperties["lineHeight"]
> = {
  compact: "1.75rem",
  normal: "2rem",
  relaxed: "2.5rem",
};

export function ReaderPage() {
  const { vol = "vol-1", arc = "arc-1", chapter = "chapter-1" } = useParams();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fontSize = useReaderStore((state) => state.fontSize);
  const lineHeight = useReaderStore((state) => state.lineHeight);
  const setFontSize = useReaderStore((state) => state.setFontSize);
  const setLineHeight = useReaderStore((state) => state.setLineHeight);
  const theme = useReaderStore((state) => state.theme);

  const scrollKey = useMemo(
    () => `reader-scroll:${vol}/${arc}/${chapter}`,
    [vol, arc, chapter],
  );
  const readerHeader = useMemo(() => {
    const catalog = getCatalog();
    const catalogVolume = catalog.volumes.find((volume) => volume.id === vol);
    const catalogArc = catalogVolume?.arcs.find(
      (catalogArc) => catalogArc.id === arc,
    );
    const catalogChapter = catalogArc?.chapters.find(
      (catalogChapter) => catalogChapter.chapter === chapter,
    );

    return {
      volumeTitle: catalogVolume?.title ?? vol.replace(/[-_]+/g, " "),
      arcTitle: catalogArc?.title ?? arc.replace(/[-_]+/g, " "),
      chapterTitle: catalogChapter?.title ?? chapter.replace(/[-_]+/g, " "),
    };
  }, [arc, chapter, vol]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchChapter(vol, arc, chapter)
      .then((text) => {
        if (!active) return;
        setContent(text);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
        setContent("");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [vol, arc, chapter]);

  useEffect(() => {
    if (loading) return;
    const savedScroll = Number(localStorage.getItem(scrollKey) ?? "0");
    requestAnimationFrame(() =>
      window.scrollTo({ top: savedScroll, behavior: "smooth" }),
    );

    const saveScroll = () =>
      localStorage.setItem(scrollKey, String(window.scrollY));
    window.addEventListener("beforeunload", saveScroll);
    window.addEventListener("pagehide", saveScroll);

    return () => {
      saveScroll();
      window.removeEventListener("beforeunload", saveScroll);
      window.removeEventListener("pagehide", saveScroll);
    };
  }, [loading, scrollKey]);

  return (
    <section className="w-full max-w-none animate-in fade-in duration-300">
      <div className="mb-8 flex flex-col gap-4 rounded-md border bg-card p-4 text-card-foreground sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {readerHeader.volumeTitle} / {readerHeader.arcTitle}
          </p>
          <h1 className="text-2xl font-semibold">
            {readerHeader.chapterTitle}
          </h1>
        </div>

        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-[max-content_max-content]">
          <div className="space-y-2">
            <Label>Font size</Label>
            <div className="grid grid-cols-3 rounded-md border p-1">
              {(["small", "medium", "large"] as const).map((size) => (
                <Button
                  key={size}
                  variant={fontSize === size ? "secondary" : "ghost"}
                  size="sm"
                  className="px-3"
                  onClick={() => setFontSize(size)}>
                  {size}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Line height</Label>
            <div className="grid grid-cols-3 rounded-md border p-1">
              {(["compact", "normal", "relaxed"] as const).map((height) => (
                <Button
                  key={height}
                  variant={lineHeight === height ? "secondary" : "ghost"}
                  size="sm"
                  className="px-3"
                  onClick={() => setLineHeight(height)}>
                  {height}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading chapter...</p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          {error}
        </p>
      ) : null}

      <article
        data-color-mode={theme}
        className={cn(
          "transition-all",
          fontSizeClass[fontSize],
          lineHeightClass[lineHeight],
        )}>
        <MDEditor.Markdown
          source={content}
          style={{
            backgroundColor: "transparent",
            fontSize: markdownFontSize[fontSize],
            lineHeight: markdownLineHeight[lineHeight],
          }}
        />
      </article>
    </section>
  );
}
