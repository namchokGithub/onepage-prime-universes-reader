import { CSSProperties, useEffect, useMemo, useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-markdown-preview/markdown.css";
import { Moon, Plus, Settings2, Sun, X } from "lucide-react";
import remarkBreaks from "remark-breaks";
import { useOutletContext, useParams } from "react-router-dom";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchChapter } from "@/utils/fetchChapter";
import { getChapterHeader } from "@/utils/contentRepository";
import {
  ReaderFontSize,
  ReaderLineHeight,
  useReaderStore,
} from "@/store/useReaderStore";
import { cn } from "@/lib/utils";
import type { AppLayoutOutletContext } from "@/components/AppLayout";

const fontSizeClass: Record<ReaderFontSize, string> = {
  small: "text-base",
  medium: "text-lg",
  large: "text-xl",
  "x-large": "text-2xl",
  "xx-large": "text-3xl",
  "xxx-large": "text-4xl",
};

const markdownFontSize: Record<ReaderFontSize, CSSProperties["fontSize"]> = {
  small: "1rem",
  medium: "1.125rem",
  large: "1.25rem",
  "x-large": "1.5rem",
  "xx-large": "1.875rem",
  "xxx-large": "2.25rem",
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

const fontSizeOptions: ReaderFontSize[] = [
  "small",
  "medium",
  "large",
  "x-large",
  "xx-large",
  "xxx-large",
];

type ReaderPreferencesProps = {
  fontSize: ReaderFontSize;
  lineHeight: ReaderLineHeight;
  theme: "light" | "dark";
  setFontSize: (fontSize: ReaderFontSize) => void;
  setLineHeight: (lineHeight: ReaderLineHeight) => void;
  setTheme: (theme: "light" | "dark") => void;
};

function ReaderPreferences({
  fontSize,
  lineHeight,
  theme,
  setFontSize,
  setLineHeight,
  setTheme,
}: ReaderPreferencesProps) {
  const nextFontSize =
    fontSizeOptions[
      (fontSizeOptions.indexOf(fontSize) + 1) % fontSizeOptions.length
    ];

  return (
    <div className="grid w-full items-end gap-3 md:w-auto md:grid-cols-[max-content_max-content_max-content]">
      <div className="grid gap-2">
        <Label>Font size</Label>
        <div className="rounded-md border p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-full justify-center px-4 md:w-40"
            onClick={() => setFontSize(nextFontSize)}
            title={`Next: ${nextFontSize}`}>
            <Plus className="h-4 w-4" />
            {fontSize}
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
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

      <div className="grid gap-2">
        <Label>Theme</Label>
        <div className="grid grid-cols-2 rounded-md border p-1">
          <Button
            type="button"
            variant={theme === "light" ? "secondary" : "ghost"}
            size="sm"
            className="px-3"
            onClick={() => setTheme("light")}>
            <Sun className="h-4 w-4" />
            Light
          </Button>
          <Button
            type="button"
            variant={theme === "dark" ? "secondary" : "ghost"}
            size="sm"
            className="px-3"
            onClick={() => setTheme("dark")}>
            <Moon className="h-4 w-4" />
            Dark
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ReaderPage() {
  const { vol = "vol-1", arc = "arc-1", chapter = "chapter-1" } = useParams();
  const { catalog } = useOutletContext<AppLayoutOutletContext>();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fontSize = useReaderStore((state) => state.fontSize);
  const lineHeight = useReaderStore((state) => state.lineHeight);
  const setFontSize = useReaderStore((state) => state.setFontSize);
  const setLineHeight = useReaderStore((state) => state.setLineHeight);
  const setTheme = useReaderStore((state) => state.setTheme);
  const theme = useReaderStore((state) => state.theme);
  const [isPreferencePanelOpen, setIsPreferencePanelOpen] = useState(false);
  const [hasScrolledPastHeader, setHasScrolledPastHeader] = useState(false);

  const scrollKey = useMemo(
    () => `reader-scroll:${vol}/${arc}/${chapter}`,
    [vol, arc, chapter],
  );
  const readerHeader = useMemo(() => {
    return getChapterHeader(catalog, vol, arc, chapter);
  }, [arc, catalog, chapter, vol]);

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

  useEffect(() => {
    const updatePreferenceBubbleVisibility = () => {
      setHasScrolledPastHeader(window.scrollY > 180);
    };

    updatePreferenceBubbleVisibility();
    window.addEventListener("scroll", updatePreferenceBubbleVisibility, {
      passive: true,
    });

    return () =>
      window.removeEventListener("scroll", updatePreferenceBubbleVisibility);
  }, []);

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

        <div className="hidden md:block">
          <ReaderPreferences
            fontSize={fontSize}
            lineHeight={lineHeight}
            theme={theme}
            setFontSize={setFontSize}
            setLineHeight={setLineHeight}
            setTheme={setTheme}
          />
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
          remarkPlugins={[remarkBreaks]}
          style={{
            backgroundColor: "transparent",
            fontSize: markdownFontSize[fontSize],
            lineHeight: markdownLineHeight[lineHeight],
          }}
        />
      </article>

      <div
        className={cn(
          "fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3 md:bottom-6 md:right-6",
          hasScrolledPastHeader ? "md:flex" : "md:hidden",
        )}>
        {isPreferencePanelOpen ? (
          <div className="w-[min(560px,calc(100vw-2.5rem))] rounded-md border bg-card p-4 text-card-foreground shadow-xl md:w-[min(760px,calc(100vw-3rem))]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Reader preferences</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsPreferencePanelOpen(false)}
                aria-label="Close reader preferences">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ReaderPreferences
              fontSize={fontSize}
              lineHeight={lineHeight}
              theme={theme}
              setFontSize={setFontSize}
              setLineHeight={setLineHeight}
              setTheme={setTheme}
            />
          </div>
        ) : null}

        <Button
          type="button"
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg"
          onClick={() => setIsPreferencePanelOpen((isOpen) => !isOpen)}
          aria-label="Open reader preferences">
          {isPreferencePanelOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Settings2 className="h-5 w-5" />
          )}
        </Button>
      </div>
    </section>
  );
}
