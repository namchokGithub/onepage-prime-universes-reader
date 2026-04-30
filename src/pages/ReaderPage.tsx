import { useEffect, useMemo, useState } from "react";
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

const lineHeightClass: Record<ReaderLineHeight, string> = {
  compact: "leading-7",
  normal: "leading-8",
  relaxed: "leading-10",
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

  const scrollKey = useMemo(() => `reader-scroll:${vol}/${arc}/${chapter}`, [vol, arc, chapter]);
  const chapterTitle = useMemo(() => {
    const catalog = getCatalog();
    const catalogChapter = catalog.volumes
      .find((volume) => volume.id === vol)
      ?.arcs.find((catalogArc) => catalogArc.id === arc)
      ?.chapters.find((catalogChapter) => catalogChapter.chapter === chapter);

    return catalogChapter?.title ?? chapter.replace(/[-_]+/g, " ");
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
    requestAnimationFrame(() => window.scrollTo({ top: savedScroll, behavior: "smooth" }));

    const saveScroll = () => localStorage.setItem(scrollKey, String(window.scrollY));
    window.addEventListener("beforeunload", saveScroll);
    window.addEventListener("pagehide", saveScroll);

    return () => {
      saveScroll();
      window.removeEventListener("beforeunload", saveScroll);
      window.removeEventListener("pagehide", saveScroll);
    };
  }, [loading, scrollKey]);

  return (
    <section className="mx-auto max-w-[700px] animate-in fade-in duration-300">
      <div className="mb-8 flex flex-col gap-4 rounded-md border bg-card p-4 text-card-foreground sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {vol} / {arc}
          </p>
          <h1 className="text-2xl font-semibold">{chapterTitle}</h1>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Font size</Label>
            <div className="flex rounded-md border p-1">
              {(["small", "medium", "large"] as const).map((size) => (
                <Button
                  key={size}
                  variant={fontSize === size ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setFontSize(size)}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Line height</Label>
            <div className="flex rounded-md border p-1">
              {(["compact", "normal", "relaxed"] as const).map((height) => (
                <Button
                  key={height}
                  variant={lineHeight === height ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setLineHeight(height)}
                >
                  {height}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading ? <p className="text-muted-foreground">Loading chapter...</p> : null}
      {error ? <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-destructive">{error}</p> : null}

      <article
        data-color-mode={theme}
        className={cn("transition-all", fontSizeClass[fontSize], lineHeightClass[lineHeight])}>
        <MDEditor.Markdown source={content} />
      </article>
    </section>
  );
}
