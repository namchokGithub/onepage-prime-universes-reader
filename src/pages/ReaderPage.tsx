import { CSSProperties, useEffect, useMemo, useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-markdown-preview/markdown.css";
import {
  Bookmark,
  Moon,
  Pencil,
  Plus,
  Settings2,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import remarkBreaks from "remark-breaks";
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { fetchChapter } from "@/utils/fetchChapter";
import { getChapterHeader } from "@/utils/contentRepository";
import {
  ReaderBookmark,
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

type BookmarkNavigationState = {
  bookmarkScrollY?: number;
};

function readerScrollKey(vol: string, arc: string, chapter: string) {
  return `reader-scroll:${vol}/${arc}/${chapter}`;
}

function getCurrentReadingPosition() {
  const scrollY = Math.max(0, Math.round(window.scrollY));
  const maxScroll = Math.max(
    1,
    document.documentElement.scrollHeight - window.innerHeight,
  );

  return {
    scrollY,
    percent: Math.min(
      100,
      Math.max(0, Math.round((scrollY / maxScroll) * 100)),
    ),
  };
}

function formatBookmarkPercent(percent: number) {
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
}

function formatBookmarkDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

type ReaderPreferencesProps = {
  fontSize: ReaderFontSize;
  lineHeight: ReaderLineHeight;
  theme: "light" | "dark";
  setFontSize: (fontSize: ReaderFontSize) => void;
  setLineHeight: (lineHeight: ReaderLineHeight) => void;
  setTheme: (theme: "light" | "dark") => void;
  onAddBookmark: () => void;
};

function ReaderPreferences({
  fontSize,
  lineHeight,
  theme,
  setFontSize,
  setLineHeight,
  setTheme,
  onAddBookmark,
}: ReaderPreferencesProps) {
  const nextFontSize =
    fontSizeOptions[
      (fontSizeOptions.indexOf(fontSize) + 1) % fontSizeOptions.length
    ];

  return (
    <div className="grid w-full items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(8.5rem,1fr)_minmax(14rem,1.4fr)_minmax(10rem,1fr)_minmax(8rem,0.85fr)]">
      <div className="grid gap-2">
        <Label>Font size</Label>
        <div className="rounded-md border p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-full justify-center px-3"
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
              className="min-w-0 px-2 text-xs sm:text-sm"
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
            className="min-w-0 px-2"
            onClick={() => setTheme("light")}>
            <Sun className="h-4 w-4" />
            Light
          </Button>
          <Button
            type="button"
            variant={theme === "dark" ? "secondary" : "ghost"}
            size="sm"
            className="min-w-0 px-2"
            onClick={() => setTheme("dark")}>
            <Moon className="h-4 w-4" />
            Dark
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Bookmark</Label>
        <div className="rounded-md border p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-full justify-center px-3"
            onClick={onAddBookmark}>
            <Bookmark className="h-4 w-4" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ReaderPage() {
  const { vol = "vol-1", arc = "arc-1", chapter = "chapter-1" } = useParams();
  const { catalog } = useOutletContext<AppLayoutOutletContext>();
  const location = useLocation();
  const navigate = useNavigate();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fontSize = useReaderStore((state) => state.fontSize);
  const lineHeight = useReaderStore((state) => state.lineHeight);
  const setFontSize = useReaderStore((state) => state.setFontSize);
  const setLineHeight = useReaderStore((state) => state.setLineHeight);
  const setTheme = useReaderStore((state) => state.setTheme);
  const theme = useReaderStore((state) => state.theme);
  const bookmarks = useReaderStore((state) => state.bookmarks);
  const addBookmark = useReaderStore((state) => state.addBookmark);
  const updateBookmark = useReaderStore((state) => state.updateBookmark);
  const removeBookmark = useReaderStore((state) => state.removeBookmark);
  const [isPreferencePanelOpen, setIsPreferencePanelOpen] = useState(false);
  const [isBookmarkPanelOpen, setIsBookmarkPanelOpen] = useState(false);
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(
    null,
  );
  const [bookmarkNote, setBookmarkNote] = useState("");
  const [hasScrolledPastHeader, setHasScrolledPastHeader] = useState(false);
  const [readingPercent, setReadingPercent] = useState(0);

  const scrollKey = useMemo(
    () => readerScrollKey(vol, arc, chapter),
    [vol, arc, chapter],
  );
  const bookmarkScrollY = useMemo(() => {
    const state = location.state as BookmarkNavigationState | null;
    const stateScrollY = Number(state?.bookmarkScrollY);

    return Number.isFinite(stateScrollY) && stateScrollY >= 0
      ? stateScrollY
      : null;
  }, [location.state]);
  const readerHeader = useMemo(() => {
    return getChapterHeader(catalog, vol, arc, chapter);
  }, [arc, catalog, chapter, vol]);
  const chapterBookmarks = useMemo(
    () =>
      bookmarks
        .filter(
          (bookmark) =>
            bookmark.vol === vol &&
            bookmark.arc === arc &&
            bookmark.chapter === chapter,
        )
        .sort((a, b) => a.scrollY - b.scrollY),
    [arc, bookmarks, chapter, vol],
  );
  const editingBookmark = useMemo(
    () =>
      chapterBookmarks.find((bookmark) => bookmark.id === editingBookmarkId) ??
      null,
    [chapterBookmarks, editingBookmarkId],
  );

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
    const targetScroll = bookmarkScrollY ?? savedScroll;

    requestAnimationFrame(() =>
      window.scrollTo({ top: targetScroll, behavior: "smooth" }),
    );

    if (bookmarkScrollY !== null) {
      navigate(location.pathname, { replace: true, state: null });
    }

    const saveScroll = () =>
      localStorage.setItem(scrollKey, String(window.scrollY));
    window.addEventListener("beforeunload", saveScroll);
    window.addEventListener("pagehide", saveScroll);

    return () => {
      saveScroll();
      window.removeEventListener("beforeunload", saveScroll);
      window.removeEventListener("pagehide", saveScroll);
    };
  }, [bookmarkScrollY, loading, location.pathname, navigate, scrollKey]);

  useEffect(() => {
    const updateReadingProgress = () => {
      const currentPosition = getCurrentReadingPosition();

      // The same scroll measurement drives bookmarks and the progress bar, so
      // saved positions and visible progress stay aligned.
      setReadingPercent(currentPosition.percent);
      setHasScrolledPastHeader(window.scrollY > 180);
    };

    updateReadingProgress();
    window.addEventListener("scroll", updateReadingProgress, {
      passive: true,
    });
    window.addEventListener("resize", updateReadingProgress);

    return () => {
      window.removeEventListener("scroll", updateReadingProgress);
      window.removeEventListener("resize", updateReadingProgress);
    };
  }, []);

  const openAddBookmark = () => {
    setEditingBookmarkId(null);
    setBookmarkNote("");
    setIsBookmarkPanelOpen(true);
  };

  const openEditBookmark = (bookmark: ReaderBookmark) => {
    setEditingBookmarkId(bookmark.id);
    setBookmarkNote(bookmark.note);
    setIsBookmarkPanelOpen(true);
  };

  const saveBookmark = () => {
    const note = bookmarkNote.trim();

    if (editingBookmark) {
      updateBookmark(editingBookmark.id, { note });
      setEditingBookmarkId(null);
      setBookmarkNote("");
      return;
    }

    const currentPosition = getCurrentReadingPosition();

    // Store the display titles with the bookmark so the local list still reads
    // well if the catalog changes or temporarily fails to load.
    addBookmark({
      vol,
      arc,
      chapter,
      volumeTitle: readerHeader.volumeTitle,
      arcTitle: readerHeader.arcTitle,
      chapterTitle: readerHeader.chapterTitle,
      scrollY: currentPosition.scrollY,
      percent: currentPosition.percent,
      note,
    });
    setBookmarkNote("");
  };

  const jumpToBookmark = (bookmark: ReaderBookmark) => {
    const path = `/read/${bookmark.vol}/${bookmark.arc}/${bookmark.chapter}`;

    if (location.pathname === path) {
      window.scrollTo({ top: bookmark.scrollY, behavior: "smooth" });
      localStorage.setItem(
        readerScrollKey(bookmark.vol, bookmark.arc, bookmark.chapter),
        String(bookmark.scrollY),
      );
      return;
    }

    navigate(path, { state: { bookmarkScrollY: bookmark.scrollY } });
  };

  return (
    <section className="w-full max-w-none animate-in fade-in duration-300">
      <div
        className="fixed left-0 right-0 top-16 z-40 h-1 bg-background/70 md:h-0.5"
        role="progressbar"
        aria-label="Reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={readingPercent}>
        <div
          className="h-full origin-left bg-[linear-gradient(90deg,#ef4444,#f97316,#eab308,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899)] shadow-[0_0_14px_rgba(236,72,153,0.45)] transition-transform duration-150 ease-out"
          style={{ transform: `scaleX(${readingPercent / 100})` }}
        />
      </div>

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
            onAddBookmark={openAddBookmark}
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
        data-reader-article
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

      {isBookmarkPanelOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:px-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="bookmark-dialog-title"
            className="flex max-h-[100dvh] w-full flex-col rounded-t-md border bg-card text-card-foreground shadow-xl sm:max-h-[min(640px,calc(100vh-2rem))] sm:max-w-xl sm:rounded-md">
            <div className="flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <h2
                  id="bookmark-dialog-title"
                  className="text-lg font-semibold">
                  {editingBookmark ? "Edit bookmark" : "Add bookmark"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {readerHeader.chapterTitle}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setIsBookmarkPanelOpen(false)}
                aria-label="Close bookmarks">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <label className="block text-sm">
                <span className="font-medium">Note</span>
                <textarea
                  value={bookmarkNote}
                  onChange={(event) => setBookmarkNote(event.target.value)}
                  className="mt-2 min-h-24 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  maxLength={300}
                  placeholder="Optional note for this bookmark"
                />
              </label>

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {editingBookmark ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingBookmarkId(null);
                      setBookmarkNote("");
                    }}>
                    Cancel edit
                  </Button>
                ) : null}
                <Button type="button" onClick={saveBookmark}>
                  {editingBookmark ? "Save note" : "Save bookmark"}
                </Button>
              </div>

              <Separator className="my-5" />

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  This chapter
                </p>
                {chapterBookmarks.length === 0 ? (
                  <p className="rounded-md border p-3 text-sm text-muted-foreground">
                    No bookmarks in this chapter yet.
                  </p>
                ) : (
                  chapterBookmarks.map((bookmark) => (
                    <div
                      key={bookmark.id}
                      className="rounded-md border bg-background p-3">
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => jumpToBookmark(bookmark)}>
                          <p className="text-sm font-medium">
                            {formatBookmarkPercent(bookmark.percent)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatBookmarkDate(bookmark.updatedAt)}
                          </p>
                          {bookmark.note ? (
                            <p className="mt-2 text-sm">{bookmark.note}</p>
                          ) : null}
                        </button>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => openEditBookmark(bookmark)}
                            aria-label="Edit bookmark">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeBookmark(bookmark.id)}
                            aria-label="Delete bookmark">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <div
        className={cn(
          "fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3 md:bottom-6 md:right-6",
          hasScrolledPastHeader ? "md:flex" : "md:hidden",
        )}>
        {isPreferencePanelOpen ? (
          <div className="max-h-[calc(100dvh-6rem)] w-[min(420px,calc(100vw-2.5rem))] overflow-y-auto rounded-md border bg-card p-4 text-card-foreground shadow-xl sm:w-[min(560px,calc(100vw-3rem))] xl:w-[min(880px,calc(100vw-3rem))]">
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
              onAddBookmark={openAddBookmark}
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
