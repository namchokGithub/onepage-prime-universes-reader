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

type ReaderState = {
  theme: ReaderTheme;
  fontSize: ReaderFontSize;
  lineHeight: ReaderLineHeight;
  setTheme: (theme: ReaderTheme) => void;
  toggleTheme: () => void;
  setFontSize: (fontSize: ReaderFontSize) => void;
  setLineHeight: (lineHeight: ReaderLineHeight) => void;
};

export const useReaderStore = create<ReaderState>()(
  persist(
    (set) => ({
      theme: "light",
      fontSize: "medium",
      lineHeight: "normal",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
      setFontSize: (fontSize) => set({ fontSize }),
      setLineHeight: (lineHeight) => set({ lineHeight }),
    }),
    {
      name: "onepage-reader-preferences",
    },
  ),
);
