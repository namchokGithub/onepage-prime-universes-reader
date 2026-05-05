import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ReaderTheme = "light" | "dark";
export type ReaderFontSize =
  | "small"
  | "medium"
  | "large"
  | "x-large"
  | "xx-large"
  | "xxx-large";
export type ReaderLineHeight = "compact" | "normal" | "relaxed";

export type ReaderBookmark = {
  id: string;
  vol: string;
  arc: string;
  chapter: string;
  volumeTitle: string;
  arcTitle: string;
  chapterTitle: string;
  scrollY: number;
  percent: number;
  note: string;
  createdAt: number;
  updatedAt: number;
};

// Drafts are used when creating a bookmark. The store owns ids and timestamps
// so callers cannot accidentally duplicate persisted records.
export type ReaderBookmarkDraft = Omit<
  ReaderBookmark,
  "id" | "createdAt" | "updatedAt"
>;

export type ReaderProgress = {
  vol: string;
  arc: string;
  chapter: string;
  volumeTitle: string;
  arcTitle: string;
  chapterTitle: string;
  scrollY: number;
  percent: number;
  updatedAt: number;
};

export type ReaderProgressDraft = Omit<ReaderProgress, "updatedAt">;

type ReaderState = {
  theme: ReaderTheme;
  fontSize: ReaderFontSize;
  lineHeight: ReaderLineHeight;
  bookmarks: ReaderBookmark[];
  readingProgress: ReaderProgress | null;
  setTheme: (theme: ReaderTheme) => void;
  toggleTheme: () => void;
  setFontSize: (fontSize: ReaderFontSize) => void;
  setLineHeight: (lineHeight: ReaderLineHeight) => void;
  updateReadingProgress: (progress: ReaderProgressDraft) => void;
  clearReadingProgress: () => void;
  addBookmark: (bookmark: ReaderBookmarkDraft) => string;
  updateBookmark: (
    id: string,
    updates: Partial<Omit<ReaderBookmark, "id" | "createdAt">>,
  ) => void;
  removeBookmark: (id: string) => void;
};

function createBookmarkId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `bookmark-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const useReaderStore = create<ReaderState>()(
  persist(
    (set) => ({
      theme: "light",
      fontSize: "medium",
      lineHeight: "normal",
      bookmarks: [],
      readingProgress: null,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === "light" ? "dark" : "light",
        })),
      setFontSize: (fontSize) => set({ fontSize }),
      setLineHeight: (lineHeight) => set({ lineHeight }),
      updateReadingProgress: (progress) => {
        set({
          readingProgress: {
            ...progress,
            updatedAt: Date.now(),
          },
        });
      },
      clearReadingProgress: () => set({ readingProgress: null }),
      addBookmark: (bookmark) => {
        const now = Date.now();
        const id = createBookmarkId();

        set((state) => ({
          bookmarks: [
            {
              ...bookmark,
              id,
              createdAt: now,
              updatedAt: now,
            },
            ...state.bookmarks,
          ],
        }));

        return id;
      },
      updateBookmark: (id, updates) => {
        set((state) => ({
          bookmarks: state.bookmarks.map((bookmark) =>
            bookmark.id === id
              ? {
                  ...bookmark,
                  ...updates,
                  updatedAt: Date.now(),
                }
              : bookmark,
          ),
        }));
      },
      removeBookmark: (id) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter((bookmark) => bookmark.id !== id),
        }));
      },
    }),
    {
      name: "onepage-reader-preferences",
    },
  ),
);
